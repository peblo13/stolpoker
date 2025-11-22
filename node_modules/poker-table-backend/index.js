const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const { evaluatePokerHand } = require('./pokerEvaluator');

console.log('Starting server...');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Enable debug API in non-production environments or when explicitly enabled
function isDebugApiEnabled() {
  // Only enable debug API when DEBUG_API env var is explicitly set to '1'
  return process.env.DEBUG_API === '1';
}

// Helper wrapper to emit gameUpdate with consistent logging so we can trace state
function emitGameUpdate(reason) {
  try {
    console.log('EMIT gameUpdate - reason:', reason || 'none', 'pot:', gameState.pot, 'currentBet:', gameState.currentBet, 'currentPlayer:', gameState.currentPlayer, 'players:', (gameState.players || []).map(p => ({ seat: p.seat, id: p.id, chips: p.chips, currentContribution: p.currentContribution })), 'time:', new Date().toISOString());
  } catch (e) { console.log('EMIT gameUpdate - log prepare failed', e && e.message); }
  try { io.emit('gameUpdate', gameState); } catch (e) { console.error('Failed to emit gameUpdate:', e && e.message); }
}

// Serve static frontend if artifact exists
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  console.log('Frontend dist found - serving static files from', frontendDist);
  app.use(express.static(frontendDist));
  // All other requests return the index file, letting the client-side router handle routing
  // Ensure API routes are not overridden by client-side routing
  // forcibly register API routes via debug gating later, not inside static serve block
  // Serve index for all routes except /api/* so API routes remain reachable
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.get('/', (req, res) => {
  res.send('Poker backend działa');
});

// Health check endpoint for readiness
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/records', (req, res) => {
  res.json(records);
});

// Debug route for tests: return internal game state (only enabled in dev/test)
  // Always register debug route but guard at runtime so `DEBUG_API` can be toggled between restarts
  app.get('/debug/state', (req, res) => {
    if (!isDebugApiEnabled()) return res.status(404).send('Not Found');
    res.json({ gameState });
  });

// Provide `api` debug state which Playwright uses - register independently
app.get('/api/debug/state', (req, res) => {
  if (!isDebugApiEnabled()) return res.status(404).send('Not Found');
  res.json({ gameState });
});

// Debug: allow test code to trigger game actions directly (ONLY if DEBUG_API is enabled)
app.post('/api/debug/action', (req, res) => {
  if (!isDebugApiEnabled()) return res.status(404).send('Not Found');
  console.log('Debug action request:', req.method, req.path, 'body:', req.body, 'time:', new Date().toISOString());
  const { action, seat, playerId, amount } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });
  // Find the player by seat or playerId
  let player = null;
  if (playerId) player = gameState.players.find(p => p.id === playerId);
  if (!player && seat) player = gameState.players.find(p => p.seat === seat);
  // If no player found and no seat specified, but players exist, pick the first occupied seat
  if (!player && !seat && gameState.players && gameState.players.length > 0) {
    const fallbackPlayer = gameState.players[0];
    player = fallbackPlayer;
    console.log('Debug action: no seat/player specified - using fallback player at seat', fallbackPlayer.seat);
  }
  let createdTemp = null;
  if (!player) {
    if (!gameState.players || gameState.players.length === 0) {
      // Create a temporary debug player to allow test debug actions to proceed
      const tempId = '__debug_temp_' + (Math.floor(Math.random() * 1000000));
      const tempSeat = 1;
      const tempPlayer = { id: tempId, name: 'DEBUG_TEMP', chips: 1000000, seat: tempSeat, currentContribution: 0, __isTemp: true };
      gameState.players.push(tempPlayer);
      player = tempPlayer;
      createdTemp = tempPlayer;
      console.log('Debug action: created temporary player for action', tempPlayer);
    } else {
      return res.status(409).json({ error: 'Player not found or no players present in game' });
    }
  }

  try {
    switch (action) {
            case 'kick': {
              // Remove a player by seat or playerId
              const seatToKick = seat || (player && player.seat) || null;
              if (!seatToKick) return res.status(400).json({ error: 'Missing seat to kick' });
              const idx = gameState.players.findIndex(p => p.seat === seatToKick);
              if (idx === -1) return res.status(404).json({ error: 'Seat not found' });
              const removed = gameState.players.splice(idx, 1)[0];
              console.log('Debug action: kicked player', removed && removed.id, 'seat', seatToKick);
              // If current player was removed, advance deterministically
              if (gameState.players.length > 0) {
                const nextIdx = idx % gameState.players.length;
                gameState.currentPlayer = gameState.players[nextIdx].seat;
                gameState.timer = 30;
              } else {
                gameState.phase = 'waiting';
                gameState.currentPlayer = 0;
              }
              emitGameUpdate('debug-action:kick');
              return res.json({ gameState, chosenSeat: seatToKick });
            }
      case 'bet': {
        const amt = Number(amount || 0);
        if (player && player.chips >= amt && amt >= 10) {
          player.chips -= amt;
          player.currentContribution = (player.currentContribution || 0) + amt;
          gameState.pot += amt;
          gameState.currentBet = amt;
          const idx = gameState.players.findIndex(p => p.id === player.id);
          const nextIdx = (idx + 1) % gameState.players.length;
          gameState.currentPlayer = gameState.players[nextIdx].seat;
          gameState.timer = 30;
          emitGameUpdate('debug-action:bet');
        }
        break;
      }
      case 'raise': {
        const amt = Number(amount || 0);
        if (player && amt > gameState.currentBet) {
          const increase = amt - (player.currentContribution || 0);
          if (player.chips >= increase) {
            player.chips -= increase;
            player.currentContribution = (player.currentContribution || 0) + increase;
            gameState.pot += increase;
            gameState.currentBet = amt;
            const idx = gameState.players.findIndex(p => p.id === player.id);
            const nextIdx = (idx + 1) % gameState.players.length;
            gameState.currentPlayer = gameState.players[nextIdx].seat;
            gameState.timer = 30;
            emitGameUpdate('debug-action:raise');
          }
        }
        break;
      }
      case 'call': {
        const toCall = gameState.currentBet - (player.currentContribution || 0);
        if (toCall > 0 && player.chips >= toCall) {
          player.chips -= toCall;
          player.currentContribution = (player.currentContribution || 0) + toCall;
          gameState.pot += toCall;
        }
        const idx = gameState.players.findIndex(p => p.id === player.id);
        const nextIdx = (idx + 1) % gameState.players.length;
        gameState.currentPlayer = gameState.players[nextIdx].seat;
        gameState.timer = 30;
        emitGameUpdate('debug-action:call');
        break;
      }
      case 'allIn': {
        if (player && player.chips > 0) {
          const toAdd = player.chips;
          player.currentContribution = (player.currentContribution || 0) + toAdd;
          gameState.pot += toAdd;
          player.chips = 0;
          if (player.currentContribution > gameState.currentBet) gameState.currentBet = player.currentContribution;
          const idx = gameState.players.findIndex(p => p.id === player.id);
          const nextIdx = (idx + 1) % gameState.players.length;
          gameState.currentPlayer = gameState.players[nextIdx].seat;
          gameState.timer = 30;
          emitGameUpdate('debug-action:allIn');
        }
        break;
      }
      case 'fold': {
        const playerIndex = gameState.players.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          const removed = gameState.players.splice(playerIndex, 1)[0];
          if (gameState.players.length > 0) {
            const nextIndex = playerIndex % gameState.players.length;
            gameState.currentPlayer = gameState.players[nextIndex].seat;
            gameState.timer = 30;
          }
          emitGameUpdate('debug-action:fold');
        }
        break;
      }
      case 'check': {
        const playerIndex = gameState.players.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          const nextIndex = (playerIndex + 1) % gameState.players.length;
          gameState.currentPlayer = gameState.players[nextIndex].seat;
          gameState.timer = 30;
          emitGameUpdate('debug-action:check');
        }
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    // Return chosen seat info to aid debugging/fallback confirmation
    const chosenSeat = player && player.seat ? player.seat : null;
    // If we created a temporary player for the action, schedule its removal shortly after
    if (createdTemp) {
      setTimeout(() => {
        try {
          const idx = gameState.players.findIndex(p => p && p.id === createdTemp.id);
          if (idx !== -1) {
            gameState.players.splice(idx, 1);
            console.log('Removed temporary debug player:', createdTemp.id);
            io.emit('gameUpdate', gameState);
          }
        } catch (e) { console.error('Failed to remove temp debug player:', e && e.message); }
      }, 1500);
    }
    return res.json({ gameState, chosenSeat });
  } catch (err) {
    console.error('Debug action failed:', err && err.message);
    return res.status(500).json({ error: 'Action failed' });
  }
});

const DEFAULT_PORT = 8086;
// BIND_ADDR environment variable allows choosing which interface to bind to
// Default to 0.0.0.0 to make the backend reachable on local network for testing
const BIND_ADDR = process.env.BIND_ADDR || '0.0.0.0';

// Find an available port starting from DEFAULT_PORT up to DEFAULT_PORT+10
const net = require('net');

const portFromEnv = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;

// Symulacja gry pokerowej
let gameState = {
  players: [], // {id, name, chips, seat}
  communityCards: [],
  pot: 0,
  currentPlayer: 0,
  phase: 'waiting', // waiting, pre-flop, flop, turn, river
  deck: [],
  playerHands: {},
  timer: 0,
  currentBet: 0,
  deckId: null
};

// Default blinds
const DEFAULT_SMALL_BLIND = 10;
const DEFAULT_BIG_BLIND = 20;
// Add blinds to game state for visibility
gameState.smallBlind = DEFAULT_SMALL_BLIND;
gameState.bigBlind = DEFAULT_BIG_BLIND;
gameState.smallBlindSeat = null;
gameState.bigBlindSeat = null;
// blind level settings
gameState.blindLevel = 0; // level 0 -> default
gameState.autoIncreaseBlinds = false;
// Blind levels array (smallBlind multiplier relative to DEFAULT_SMALL_BLIND)
const BLIND_LEVELS = [1, 2, 3, 4, 6, 8, 10];

// Dealer seat (null means not set), will be a seat number 1-10
gameState.dealerSeat = null;

// Rekordy gry
let records = {
  highestPot: 0,
  biggestWin: 0,
  mostWins: {} // {playerName: count}
};

// Wczytaj rekordy z pliku jeśli istnieje
if (fs.existsSync('../records.json')) {
  records = JSON.parse(fs.readFileSync('../records.json'));
}

// Funkcje pomocnicze
function createDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function compareTiebreakers(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

async function dealCards() {
  try {
    console.log('Dealing cards...');
    // Create new deck
    const newDeckRes = await axios.get('https://deckofcardsapi.com/api/deck/new/');
    gameState.deckId = newDeckRes.data.deck_id;
    console.log('New deck:', gameState.deckId);

    // Shuffle deck
    await axios.get(`https://deckofcardsapi.com/api/deck/${gameState.deckId}/shuffle/`);

    gameState.communityCards = [];
    gameState.playerHands = {};
    gameState.phase = 'pre-flop';
    // Do NOT reset pot and currentBet here: blinds are charged in startGame and should be preserved.
    gameState.timer = 30;

    // Deal hole cards deterministically from the position after dealerSeat
    // Snapshot players and sort by seat for deterministic ordering
    const playersSnapshot = [...gameState.players];
    const playersSorted = playersSnapshot.slice().sort((a, b) => a.seat - b.seat);
    // Find dealer index, default to first player if dealerSeat not set
    let dealerIndex = playersSorted.findIndex(p => p.seat === gameState.dealerSeat);
    if (dealerIndex === -1) dealerIndex = 0;
    const startIndex = (dealerIndex + 1) % playersSorted.length;
    // Initialise hands
    for (let p of playersSorted) {
      gameState.playerHands[p.id] = [];
    }
    // Two rounds of dealing, 1 card each round per player, starting after dealer
    const dealDelayMs = Number(process.env.DEAL_DELAY_MS || 0);
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < playersSorted.length; i++) {
        const idx = (startIndex + i) % playersSorted.length;
        const player = playersSorted[idx];
        if (!player) continue; // defensive
          try {
          const drawRes = await axios.get(`https://deckofcardsapi.com/api/deck/${gameState.deckId}/draw/?count=1`);
          const card = drawRes.data.cards[0];
          gameState.playerHands[player.id].push(card);
          // Send private event with card info to the player
          try { io.to(player.id).emit('cardDealtPrivate', { card, seat: player.seat, playerId: player.id }); } catch (e) {}
          // Emit global event that a card was dealt to seat X for animation (without exposing content to others if you choose)
          try { io.emit('cardDealt', { seat: player.seat, playerId: player.id }); } catch (e) {}
          console.log('Dealt to player', player.name, card);
        } catch (e) {
          console.error('Error drawing card for player', player.name, e && e.message);
        }
        if (dealDelayMs > 0) {
          await new Promise((r) => setTimeout(r, dealDelayMs));
        }
        // Optional animation delay between cards (ms)
        const delayMs = Number(process.env.DEAL_ANIMATION_DELAY_MS || 0);
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      }
    }
    console.log('Cards dealt successfully');
  } catch (error) {
    console.error('Error dealing cards:', error.message);
  }
}

async function dealFlop() {
  try {
    const drawRes = await axios.get(`https://deckofcardsapi.com/api/deck/${gameState.deckId}/draw/?count=3`);
    gameState.communityCards = drawRes.data.cards;
    gameState.phase = 'flop';
    gameState.currentBet = 0;
  } catch (error) {
    console.error('Error dealing flop:', error);
  }
}

async function dealTurn() {
  try {
    const drawRes = await axios.get(`https://deckofcardsapi.com/api/deck/${gameState.deckId}/draw/?count=1`);
    gameState.communityCards.push(drawRes.data.cards[0]);
    gameState.phase = 'turn';
    gameState.currentBet = 0;
  } catch (error) {
    console.error('Error dealing turn:', error);
  }
}

async function dealRiver() {
  try {
    const drawRes = await axios.get(`https://deckofcardsapi.com/api/deck/${gameState.deckId}/draw/?count=1`);
    gameState.communityCards.push(drawRes.data.cards[0]);
    gameState.phase = 'river';
    gameState.currentBet = 0;
  } catch (error) {
    console.error('Error dealing river:', error);
  }
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  socket.on('clientError', (payload) => {
    try { console.error('Client error from', socket.id, payload); } catch (e) {}
  });

  socket.on('join', (data) => {
    console.log('Join received:', data);
    const name = data.nickname;
    if (!name || !name.trim()) { console.log('Invalid name'); return; } // Require non-empty nickname
    if (gameState.players.find(p => p.id === socket.id)) { console.log('Already joined'); return; } // Prevent re-joining
    // Assign random available seat
      
    const availableSeats = [];
    for (let i = 1; i <= 10; i++) {
      if (!takenSeats.includes(i)) availableSeats.push(i);
    }
    if (availableSeats.length > 0) {
      const seat = availableSeats[Math.floor(Math.random() * availableSeats.length)];
      const player = { id: socket.id, name: name.trim(), chips: 10000, seat, currentContribution: 0 };
      gameState.players.push(player);
      if (gameState.dealerSeat == null) gameState.dealerSeat = seat;
      console.log('Player added:', name, 'at seat', seat);
      socket.emit('joined', { player, gameState: { ...gameState, players: [...gameState.players] } });
      io.emit('update', { ...gameState, players: [...gameState.players] });
    } else {
      console.log('No seats available');
    }
  });

  socket.on('joinSeat', (data) => {
    const { name, seat } = data;
    console.log('Join seat received:', name, 'seat:', seat);
    if (!name || !name.trim()) { console.log('Invalid name'); return; }
    if (gameState.players.find(p => p.id === socket.id)) { console.log('Already joined'); return; }
    if (gameState.players.find(p => p.seat === seat)) { console.log('Seat taken'); socket.emit('joinError', { error: 'Seat taken' }); return; }
    if (seat < 1 || seat > 10) { console.log('Invalid seat'); socket.emit('joinError', { error: 'Invalid seat' }); return; } // Seats 1-10
    gameState.players.push({ id: socket.id, name: name.trim(), chips: 10000, seat, currentContribution: 0 });
    if (gameState.dealerSeat == null) gameState.dealerSeat = seat;
    console.log('Player added:', name, 'at seat', seat);
    // Emit confirmation to the joining socket and update everyone
    const player = gameState.players.find(p => p.id === socket.id);
    socket.emit('joined', { player, gameState: { ...gameState, players: [...gameState.players] } });
    io.emit('update', { ...gameState, players: [...gameState.players] });
  });

  socket.on('sendMessage', (data) => {
    io.emit('message', data);
  });

  socket.on('bet', (amount) => {
    console.log('Bet event received from', socket.id, 'amount', amount, 'handshake addr:', (socket.handshake && socket.handshake.address), 'handshake time:', (socket.handshake && socket.handshake.time), 'time:', new Date().toISOString());
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.chips >= amount && amount >= 10) {
      player.chips -= amount;
      player.currentContribution = (player.currentContribution || 0) + amount;
      gameState.pot += amount;
      gameState.currentBet = amount;
      const idx = gameState.players.findIndex(p => p.id === socket.id);
      const nextIdx = (idx + 1) % gameState.players.length;
      gameState.currentPlayer = gameState.players[nextIdx].seat;
      gameState.timer = 30;
      console.log('Bet processed: player', socket.id, 'seat:', player.seat, 'newContribution', player.currentContribution, 'pot', gameState.pot, 'currentBet', gameState.currentBet, 'currentPlayer', gameState.currentPlayer, 'time:', new Date().toISOString());
      emitGameUpdate('bet');
    }
  });

  socket.on('raise', (amount) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && amount > gameState.currentBet) {
      const increase = amount - (player.currentContribution || 0);
      if (player.chips >= increase) {
        player.chips -= increase;
        player.currentContribution = (player.currentContribution || 0) + increase;
        gameState.pot += increase;
        gameState.currentBet = amount;
        const idx = gameState.players.findIndex(p => p.id === socket.id);
        const nextIdx = (idx + 1) % gameState.players.length;
        gameState.currentPlayer = gameState.players[nextIdx].seat;
        gameState.timer = 30;
        console.log('Raise processed: player', socket.id, 'seat:', player.seat, 'newContribution', player.currentContribution, 'pot', gameState.pot, 'currentBet', gameState.currentBet, 'currentPlayer', gameState.currentPlayer, 'time:', new Date().toISOString());
        emitGameUpdate('raise');
      }
    }
  });

  socket.on('call', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player) {
      const toCall = gameState.currentBet - (player.currentContribution || 0);
      if (toCall > 0 && player.chips >= toCall) {
        player.chips -= toCall;
        player.currentContribution = (player.currentContribution || 0) + toCall;
        gameState.pot += toCall;
      }
      const idx = gameState.players.findIndex(p => p.id === socket.id);
      const nextIdx = (idx + 1) % gameState.players.length;
      gameState.currentPlayer = gameState.players[nextIdx].seat;
      gameState.timer = 30;
      console.log('Call processed: player', socket.id, 'seat:', player.seat, 'contribution', player.currentContribution, 'pot', gameState.pot, 'currentPlayer', gameState.currentPlayer, 'time:', new Date().toISOString());
      emitGameUpdate('call');
    }
  });

  socket.on('allIn', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.chips > 0) {
      const toAdd = player.chips;
      player.currentContribution = (player.currentContribution || 0) + toAdd;
      gameState.pot += toAdd;
      player.chips = 0;
      if (player.currentContribution > gameState.currentBet) gameState.currentBet = player.currentContribution;
      const idx = gameState.players.findIndex(p => p.id === socket.id);
      const nextIdx = (idx + 1) % gameState.players.length;
      gameState.currentPlayer = gameState.players[nextIdx].seat;
      gameState.timer = 30;
      emitGameUpdate('allIn');
    }
  });

  socket.on('fold', () => {
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
        const removed = gameState.players.splice(playerIndex, 1)[0];
        // folded players: leave their currentContribution in pot (they forfeit it), remove them from contention
      if (gameState.players.length > 0) {
        const nextIndex = playerIndex % gameState.players.length;
        gameState.currentPlayer = gameState.players[nextIndex].seat;
        gameState.timer = 30;
      }
      emitGameUpdate('fold');
    }
  });

  socket.on('check', () => {
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    // Only allow check if currentBet is zero
    if (gameState.currentBet === 0 && gameState.currentPlayer === gameState.players[playerIndex].seat) {
      // find index of this player in players array
      const nextIndex = (playerIndex + 1) % gameState.players.length;
      gameState.currentPlayer = gameState.players[nextIndex].seat;
      gameState.timer = 30;
      emitGameUpdate('check');
    }
  });

  socket.on('resetGame', () => {
    gameState.players = [];
    gameState.communityCards = [];
    gameState.pot = 0;
    gameState.currentPlayer = 0;
    gameState.phase = 'waiting';
    gameState.deck = [];
    gameState.playerHands = {};
    gameState.currentBet = 0;
    gameState.deckId = null;
    // io.emit('gameUpdate', gameState);
    console.log('Game reset');
  });

  socket.on('startGame', async () => {
    if (gameState.players.length >= 2) {
      // rotate dealer to the next occupied seat if one exists, else pick the first player's seat
      const seats = gameState.players.map(p => p.seat).sort((a,b)=>a-b);
      if (gameState.dealerSeat == null && seats.length > 0) {
        gameState.dealerSeat = seats[0];
      } else if (gameState.dealerSeat != null) {
        // find next existing seat greater than current
        const nextSeat = seats.find(s => s > gameState.dealerSeat) || seats[0];
        gameState.dealerSeat = nextSeat;
      }
      // determine small blind and big blind seats (seats after dealer)
      const seatsSorted = gameState.players.map(p => p.seat).sort((a,b) => a - b);
      const dIdx = seatsSorted.findIndex(s => s === gameState.dealerSeat);
      const smallIdx = (dIdx + 1) % seatsSorted.length;
      const bigIdx = (dIdx + 2) % seatsSorted.length;
      gameState.smallBlindSeat = seatsSorted[smallIdx];
      gameState.bigBlindSeat = seatsSorted[bigIdx];
      // recompute blind amounts according to current level
      const level = gameState.blindLevel || 0;
      gameState.smallBlind = DEFAULT_SMALL_BLIND * (BLIND_LEVELS[level] || 1);
      gameState.bigBlind = DEFAULT_BIG_BLIND * (BLIND_LEVELS[level] || 1);
      // charge blinds
      const smallPlayer = gameState.players.find(p => p.seat === gameState.smallBlindSeat);
      const bigPlayer = gameState.players.find(p => p.seat === gameState.bigBlindSeat);
      if (smallPlayer) {
        const smallAmount = Math.min(gameState.smallBlind || DEFAULT_SMALL_BLIND, smallPlayer.chips);
        smallPlayer.chips -= smallAmount;
        smallPlayer.currentContribution = (smallPlayer.currentContribution || 0) + smallAmount;
        gameState.pot += smallAmount;
      }
      if (bigPlayer) {
        const bigAmount = Math.min(gameState.bigBlind || DEFAULT_BIG_BLIND, bigPlayer.chips);
        bigPlayer.chips -= bigAmount;
        bigPlayer.currentContribution = (bigPlayer.currentContribution || 0) + bigAmount;
        gameState.pot += bigAmount;
        gameState.currentBet = bigAmount;
      }
      console.log('Pot after charging blinds:', gameState.pot);
      // set currentPlayer to the seat after big blind
      const nextPlayerSeat = seatsSorted[(bigIdx + 1) % seatsSorted.length];
      gameState.currentPlayer = nextPlayerSeat;
      // optionally auto-increase blind level for next hand
      if (gameState.autoIncreaseBlinds) {
        gameState.blindLevel = Math.min(gameState.blindLevel + 1, BLIND_LEVELS.length - 1);
      }
      await dealCards();
      io.emit('gameUpdate', gameState);
    }
  });

  // admin: set blind level or auto-incrementing on / off
  const { handleSetBlindLevel, handleToggleAutoBlinds } = require('./admin');
  socket.on('setBlindLevel', (level) => {
    const r = handleSetBlindLevel(socket, level, gameState);
    if (!r.ok) {
      socket.emit('adminError', { error: r.error });
    } else {
      io.emit('gameUpdate', gameState);
    }
  });
  socket.on('toggleAutoBlinds', (val) => {
    const r = handleToggleAutoBlinds(socket, val, gameState);
    if (!r.ok) { socket.emit('adminError', { error: r.error }); } else { io.emit('gameUpdate', gameState); }
  });

  socket.on('nextPhase', async () => {
    if (gameState.phase === 'pre-flop') {
      await dealFlop();
      io.emit('gameUpdate', gameState);
    } else if (gameState.phase === 'flop') {
      await dealTurn();
      io.emit('gameUpdate', gameState);
    } else if (gameState.phase === 'turn') {
      await dealRiver();
      io.emit('gameUpdate', gameState);
    } else if (gameState.phase === 'river') {
      // Delegate side-pot evaluation and distribution to sidepots module
      try {
        const { distributeSidePots } = require('./sidepots');
        const { updateRecordsForWinner } = require('./records');
        const result = distributeSidePots(gameState);
        // Apply distributed chips to original player objects in gameState
        for (let pl of result.players) {
          const original = gameState.players.find(p => p.id === pl.id);
          if (original) original.chips = pl.chips;
        }
        gameState.pot = (gameState.pot || 0) - result.totalDistributed;
        // Update records for winners
        for (let w of result.winnersList) {
          if (w.winners && w.winners.length > 0) {
            // distribute equally; each winner wins per pot
            for (let winner of w.winners) {
              updateRecordsForWinner(winner.name, w.perWinner);
            }
          }
        }
      } catch (err) {
        console.error('Error distributing side pots:', err);
      }
      // Reset for next hand
      gameState.phase = 'waiting';
      gameState.communityCards = [];
      gameState.playerHands = {};
      gameState.deckId = null;
      gameState.currentBet = 0;
      gameState.timer = 0;
    }
    io.emit('gameUpdate', gameState);
  });

  socket.on('disconnect', (reason) => {
    try {
      const remoteAddress = socket.handshake && socket.handshake.address;
      const handshakeTime = socket.handshake && socket.handshake.time;
      const transportName = (socket && socket.conn && socket.conn.transport && socket.conn.transport.name) || (socket && socket.io && socket.io.engine && socket.io.engine.transport && socket.io.engine.transport.name) || 'unknown';
      // Capture old players and seat information before filtering
      const oldPlayers = [...gameState.players];
      const player = oldPlayers.find(p => p.id === socket.id);
      const wasCurrent = player ? (player.seat === gameState.currentPlayer) : false;
      // Remove the player
      gameState.players = oldPlayers.filter(p => p.id !== socket.id);
      if (wasCurrent && gameState.players.length > 0) {
        // Determine next seat based on the previous seat ordering to keep turn progression deterministic
        const prevSeats = oldPlayers.map(p => p.seat).sort((a,b) => a - b);
        const removedSeat = player ? player.seat : null;
        // Try finding the next seat after the removed seat in the previous ordering
        let nextSeat = null;
        if (removedSeat !== null) {
          const nextFromPrev = prevSeats.find(s => s > removedSeat);
          nextSeat = nextFromPrev || prevSeats[0];
        }
        // If the computed next seat is no longer present (shouldn't be), fallback to the first remaining seat
        const seatsRemaining = gameState.players.map(p => p.seat).sort((a,b)=>a-b);
        if (!seatsRemaining.includes(nextSeat)) nextSeat = seatsRemaining[0];
        gameState.currentPlayer = nextSeat || 0;
      } else if (gameState.players.length === 0) {
        gameState.phase = 'waiting';
        gameState.currentPlayer = 0;
      }
      console.log('Emitting gameUpdate on disconnect - reason:', reason, 'transport:', transportName, 'remoteAddress:', remoteAddress, 'handshakeTime:', handshakeTime, 'wasCurrent:', wasCurrent);
      io.emit('gameUpdate', gameState);
      console.log('Player disconnected:', socket.id, 'reason:', reason, 'transport:', transportName);
    } catch (err) {
      console.error('Error in disconnect handler:', err);
    }
  });
  // Admin: set admin on socket after validating password
  socket.on('setAdmin', (password) => {
    const ADMIN_CODE = process.env.ADMIN_CODE || 'admin123';
    if (password === ADMIN_CODE) {
      socket.isAdmin = true;
      socket.emit('adminSet', { ok: true });
    } else {
      socket.isAdmin = false;
      socket.emit('adminSet', { ok: false });
    }
  });
});

// Timer for decisions
// setInterval(() => {
//   if (gameState.phase !== 'waiting' && gameState.players.length > 0) {
//     if (gameState.timer > 0) {
//       gameState.timer--;
//       io.emit('gameUpdate', gameState);
//     } else {
//       // Time out: fold for current player
//       const playerIndex = gameState.currentPlayer;
//       if (gameState.players[playerIndex]) {
//         gameState.players.splice(playerIndex, 1);
//         if (gameState.players.length > 0) {
//           gameState.currentPlayer = gameState.currentPlayer % gameState.players.length;
//           gameState.timer = 30;
//         } else {
//           gameState.phase = 'waiting';
//           gameState.currentPlayer = 0;
//         }
//         io.emit('gameUpdate', gameState);
//       }
//     }
//   }
// }, 1000);

// Provide programmatic start/stop for tests and reuse in CLI
function startServer(opts = {}) {
  const p = opts.port || process.env.PORT || DEFAULT_PORT;
  const bind = opts.bindAddr || process.env.BIND_ADDR || BIND_ADDR;
  if (opts.adminCode) process.env.ADMIN_CODE = opts.adminCode;
  return new Promise((resolve, reject) => {
    server.listen(p, bind, () => {
      console.log(`Server running on port ${p}`);
      try {
        const addr = server.address();
        console.log('Server address info:', addr);
      } catch (e) {
        console.log('Could not get server address info', e && e.message);
      }
      // Print all accessible IPv4 addresses with the port, helpful for mobile devices
      try {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        Object.keys(interfaces).forEach((ifname) => {
          interfaces[ifname].forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
              console.log('Accessible via:', `http://${iface.address}:${p}`);
            }
          });
        });
      } catch (e) {
        // ignore
      }
      resolve({ port: p, bind });
    }).on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    try {
      server.close((err) => (err ? reject(err) : resolve()));
    } catch (e) { reject(e); }
  });
}

if (process.env.DEBUG_API) {
  // In debug mode, avoid killing the process for unhandled errors to keep the server available for tests
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception (DEBUG_API):', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection (DEBUG_API) at:', promise, 'reason:', reason);
  });
} else {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

// Export start/stop for programmatic control (used in tests)
module.exports = { startServer, stopServer };

// If run directly, start server with env-specified or default options
if (require.main === module) {
  (async () => {
    try {
      await startServer({ port: portFromEnv, bindAddr: BIND_ADDR });
    } catch (e) {
      console.error('Server failed to start:', e);
      process.exit(1);
    }
  })();
}


