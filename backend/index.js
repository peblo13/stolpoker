const express = require('express');
const http = require('http');
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

app.get('/', (req, res) => {
  res.send('Poker backend działa');
});

app.get('/records', (req, res) => {
  res.json(records);
});

const DEFAULT_PORT = 8086;

// Find an available port starting from DEFAULT_PORT up to DEFAULT_PORT+10
const net = require('net');

const port = DEFAULT_PORT;

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
    gameState.pot = 0;
    gameState.timer = 30;
    gameState.currentBet = 0;

    // Deal hole cards
    for (let i = 0; i < gameState.players.length; i++) {
      const drawRes = await axios.get(`https://deckofcardsapi.com/api/deck/${gameState.deckId}/draw/?count=2`);
      gameState.playerHands[gameState.players[i].id] = drawRes.data.cards;
      console.log('Dealt to player', gameState.players[i].name, drawRes.data.cards);
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

  socket.on('joinGame', (name) => {
    console.log('Join game received:', name);
    if (!name || !name.trim()) { console.log('Invalid name'); return; } // Require non-empty nickname
    if (gameState.players.find(p => p.id === socket.id)) { console.log('Already joined'); return; } // Prevent re-joining
    // Assign random available seat
    const takenSeats = gameState.players.map(p => p.seat);
    const availableSeats = [];
    for (let i = 1; i <= 6; i++) {
      if (!takenSeats.includes(i)) availableSeats.push(i);
    }
    if (availableSeats.length > 0) {
      const seat = availableSeats[Math.floor(Math.random() * availableSeats.length)];
      gameState.players.push({ id: socket.id, name: name.trim(), chips: 1000, seat });
      console.log('Player added:', name, 'at seat', seat);
      io.emit('gameUpdate', gameState);
    } else {
      console.log('No seats available');
    }
  });

  socket.on('joinSeat', (data) => {
    const { name, seat } = data;
    console.log('Join seat received:', name, 'seat:', seat);
    if (!name || !name.trim()) { console.log('Invalid name'); return; }
    if (gameState.players.find(p => p.id === socket.id)) { console.log('Already joined'); return; }
    if (gameState.players.find(p => p.seat === seat)) { console.log('Seat taken'); return; }
    if (seat < 1 || seat > 6) { console.log('Invalid seat'); return; } // Seats 1-6
    gameState.players.push({ id: socket.id, name: name.trim(), chips: 1000, seat });
    console.log('Player added:', name, 'at seat', seat);
    // io.emit('gameUpdate', gameState);
  });

  socket.on('sendMessage', (data) => {
    io.emit('message', data);
  });

  socket.on('bet', (amount) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.chips >= amount && amount >= 10) {
      player.chips -= amount;
      gameState.pot += amount;
      gameState.currentBet = amount;
      gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
      gameState.timer = 30;
      // io.emit('gameUpdate', gameState);
    }
  });

  socket.on('raise', (amount) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.chips >= amount && amount > gameState.currentBet) {
      player.chips -= amount;
      gameState.pot += amount;
      gameState.currentBet = amount;
      gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
      gameState.timer = 30;
      // io.emit('gameUpdate', gameState);
    }
  });

  socket.on('call', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.chips >= gameState.currentBet) {
      player.chips -= gameState.currentBet;
      gameState.pot += gameState.currentBet;
      gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
      gameState.timer = 30;
      // io.emit('gameUpdate', gameState);
    }
  });

  socket.on('allIn', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.chips > 0) {
      gameState.pot += player.chips;
      player.chips = 0;
      if (player.chips > gameState.currentBet) gameState.currentBet = player.chips;
      gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
      gameState.timer = 30;
      // io.emit('gameUpdate', gameState);
    }
  });

  socket.on('fold', () => {
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      gameState.players.splice(playerIndex, 1);
      if (gameState.players.length > 0) {
        gameState.currentPlayer = gameState.currentPlayer % gameState.players.length;
        gameState.timer = 30;
      }
      // io.emit('gameUpdate', gameState);
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
      await dealCards();
      io.emit('gameUpdate', gameState);
    }
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
      // Determine winner
      let bestHand = null;
      let winner = null;
      for (let player of gameState.players) {
        const holeCards = gameState.playerHands[player.id];
        if (holeCards && holeCards.length === 2) {
          const allCards = [...holeCards, ...gameState.communityCards];
          const hand = evaluatePokerHand(allCards);
          if (!bestHand || hand.rank > bestHand.rank || (hand.rank === bestHand.rank && compareTiebreakers(hand.tiebreaker, bestHand.tiebreaker) > 0)) {
            bestHand = hand;
            winner = player;
          }
        }
      }
      if (winner) {
        const winAmount = gameState.pot;
        winner.chips += winAmount;
        gameState.pot = 0;
        console.log('Winner:', winner.name, 'wins', winAmount);

        // Aktualizuj rekordy
        if (winAmount > records.biggestWin) {
          records.biggestWin = winAmount;
        }
        if (winAmount > records.highestPot) {
          records.highestPot = winAmount;
        }
        if (!records.mostWins[winner.name]) {
          records.mostWins[winner.name] = 0;
        }
        records.mostWins[winner.name]++;
        // Zapisz rekordy do pliku
        fs.writeFileSync('../records.json', JSON.stringify(records, null, 2));
        // Commit i push do GitHub
        const { exec } = require('child_process');
        exec('cd .. && git add records.json && git commit -m "Update poker records" && git push origin master', (err, stdout, stderr) => {
          if (err) {
            console.error('Error committing records:', err);
          } else {
            console.log('Records committed and pushed to GitHub');
          }
        });
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

  socket.on('disconnect', () => {
    try {
      const wasCurrent = gameState.players[gameState.currentPlayer]?.id === socket.id;
      gameState.players = gameState.players.filter(p => p.id !== socket.id);
      if (wasCurrent && gameState.players.length > 0) {
        gameState.currentPlayer = gameState.currentPlayer % gameState.players.length;
      } else if (gameState.players.length === 0) {
        gameState.phase = 'waiting';
        gameState.currentPlayer = 0;
      }
      console.log('Emitting gameUpdate on disconnect');
      // io.emit('gameUpdate', gameState);
      console.log('Player disconnected:', socket.id);
    } catch (err) {
      console.error('Error in disconnect handler:', err);
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

// Determine port and start server (check availability first)
server.listen(port, '127.0.0.1', () => {
  console.log(`Server running on port ${port}`);
  try {
    const addr = server.address();
    console.log('Server address info:', addr);
  } catch (e) {
    console.log('Could not get server address info', e && e.message);
  }
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});


