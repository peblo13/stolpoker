const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.BIND_ADDR || '0.0.0.0';

// Game state
let players = [];
let gameState = {
  players: [],
  communityCards: [],
  pot: 0,
  currentPlayer: 0,
  phase: 'waiting', // waiting, pre-flop, flop, turn, river, showdown
  dealerPosition: 0,
  smallBlind: 10,
  bigBlind: 20,
  currentBet: 0,
  turnTime: 30, // seconds per player turn
  deck: [],
  gameStarted: false
};

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(rank + suit);
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function dealCards() {
  gameState.deck = createDeck();
  // Deal hole cards
  for (let i = 0; i < players.length; i++) {
    players[i].cards = [gameState.deck.shift(), gameState.deck.shift()];
  }
  // Reset community cards and keep deck for later reveals
  gameState.communityCards = [];
}

function revealFlop() {
  // burn one
  gameState.deck.shift();
  // reveal three
  gameState.communityCards.push(gameState.deck.shift());
  gameState.communityCards.push(gameState.deck.shift());
  gameState.communityCards.push(gameState.deck.shift());
}

function revealTurn() {
  gameState.deck.shift(); // burn
  gameState.communityCards.push(gameState.deck.shift());
}

function revealRiver() {
  gameState.deck.shift(); // burn
  gameState.communityCards.push(gameState.deck.shift());
}

function startNewHand() {
  if (players.length < 2) return;

  gameState.gameStarted = true;
  gameState.phase = 'pre-flop';
  gameState.pot = 0;
  gameState.currentBet = 0;
  gameState.dealerPosition = (gameState.dealerPosition + 1) % players.length;
  gameState.currentPlayer = (gameState.dealerPosition + 1) % players.length; // start from small blind by default

  // Assign blinds
  const smallBlindPos = (gameState.dealerPosition + 1) % players.length;
  const bigBlindPos = (gameState.dealerPosition + 2) % players.length;

  players.forEach((player, index) => {
    player.isDealer = index === gameState.dealerPosition;
    player.isSmallBlind = index === smallBlindPos;
    player.isBigBlind = index === bigBlindPos;
    player.isActive = true;
    player.bet = 0;
  });

  // Post blinds
  players[smallBlindPos].chips -= gameState.smallBlind;
  players[smallBlindPos].bet = gameState.smallBlind;
  players[bigBlindPos].chips -= gameState.bigBlind;
  players[bigBlindPos].bet = gameState.bigBlind;
  gameState.pot = gameState.smallBlind + gameState.bigBlind;
  gameState.currentBet = gameState.bigBlind;
  dealCards();
  // current player starts after big blind
  gameState.currentPlayer = (bigBlindPos + 1) % players.length;
  startPlayerTurn(gameState.currentPlayer);

  broadcastGameState();
}

function broadcastGameState() {
  const publicState = {
    ...gameState,
    players: players.map(player => ({
      id: player.id,
      name: player.name,
      chips: player.chips,
      position: player.position,
      isActive: player.isActive,
      isDealer: player.isDealer,
      isSmallBlind: player.isSmallBlind,
      isBigBlind: player.isBigBlind,
      bet: player.bet,
      cards: player.socketId === player.id ? player.cards : [] // Only show own cards
    }))
  };

  io.emit('gameState', publicState);
}

let currentTurnInterval = null;
let currentTurnTimeout = null;
let timeLeft = 0;

function startPlayerTurn(index) {
  // clear previous timers
  if (currentTurnInterval) clearInterval(currentTurnInterval);
  if (currentTurnTimeout) clearTimeout(currentTurnTimeout);

  // skip inactive players
  if (!players[index] || !players[index].isActive) {
    // find next active
    let next = index;
    do {
      next = (next + 1) % players.length;
    } while (players[next] && !players[next].isActive && next !== index);
    index = next;
  }

  gameState.currentPlayer = index;
  timeLeft = gameState.turnTime;
  io.emit('turnTimer', { playerId: players[index].id, timeLeft });

  currentTurnInterval = setInterval(() => {
    timeLeft -= 1;
    if (timeLeft <= 0) {
      clearInterval(currentTurnInterval);
    }
    io.emit('turnTimer', { playerId: players[index].id, timeLeft });
  }, 1000);

  currentTurnTimeout = setTimeout(() => {
    // auto fold on timeout
    const player = players.find(p => p.id === players[index].id);
    if (player) {
      player.isActive = false;
    }
    // advance turn
    advanceToNextPlayer();
    broadcastGameState();
  }, gameState.turnTime * 1000);
}

function advanceToNextPlayer() {
  // find next active
  let next = gameState.currentPlayer;
  let tries = 0;
  do {
    next = (next + 1) % players.length;
    tries += 1;
  } while (players[next] && !players[next].isActive && tries <= players.length);
  gameState.currentPlayer = next;
  startPlayerTurn(gameState.currentPlayer);
}

function allActivePlayersHaveSameBet() {
  const active = players.filter(p => p.isActive);
  if (active.length <= 1) return true;
  return active.every(p => p.bet === gameState.currentBet);
}

function advancePhaseIfNeeded() {
  if (!allActivePlayersHaveSameBet()) return false;

  // reset individual bets for next round
  players.forEach(p => p.bet = 0);
  gameState.currentBet = 0;

  if (gameState.phase === 'pre-flop') {
    revealFlop();
    gameState.phase = 'flop';
  } else if (gameState.phase === 'flop') {
    revealTurn();
    gameState.phase = 'turn';
  } else if (gameState.phase === 'turn') {
    revealRiver();
    gameState.phase = 'river';
  } else if (gameState.phase === 'river') {
    gameState.phase = 'showdown';
    // For now we don't implement full hand evaluation, just broadcast
  }

  // set current player to first active after dealer
  let startIndex = gameState.dealerPosition;
  let next = startIndex;
  do {
    next = (next + 1) % players.length;
  } while (!players[next].isActive && next !== startIndex);
  gameState.currentPlayer = next;
  startPlayerTurn(gameState.currentPlayer);
  broadcastGameState();
  return true;
}

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Futuristic Poker Table API running', players: players.length });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', players: players.length, gameStarted: gameState.gameStarted });
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinGame', (data) => {
    if (players.length >= 10) {
      socket.emit('error', 'Table is full');
      return;
    }

    const position = data.position !== undefined ? data.position : players.length;
    if (players.some(p => p.position === position)) {
      socket.emit('error', 'Position already taken');
      return;
    }

    const player = {
      id: socket.id,
      socketId: socket.id,
      name: data.name || `Player ${players.length + 1}`,
      chips: 1000,
      cards: [],
      position: position,
      isActive: true,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      bet: 0
    };

    players.push(player);
    socket.emit('joined', player);

    if (players.length >= 2 && !gameState.gameStarted) {
      setTimeout(startNewHand, 2000); // Start game after 2 seconds
    }

    broadcastGameState();
  });

  socket.on('placeBet', (data) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || !player.isActive) return;

    const amount = Math.min(data.amount, player.chips);
    player.chips -= amount;
    player.bet += amount;
    gameState.pot += amount;

    if (player.bet > gameState.currentBet) {
      gameState.currentBet = player.bet;
    }

    // Move to next player
    do {
      gameState.currentPlayer = (gameState.currentPlayer + 1) % players.length;
    } while (!players[gameState.currentPlayer].isActive);
    // restart timer for next player
    startPlayerTurn(gameState.currentPlayer);

    // check if betting round complete and advance
    advancePhaseIfNeeded();
    broadcastGameState();
  });

  socket.on('fold', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.isActive = false;
    }
    // Move to next player
    advanceToNextPlayer();
    advancePhaseIfNeeded();
    broadcastGameState();
  });

  socket.on('call', () => {
    const player = players.find(p => p.id === socket.id);
    if (!player || !player.isActive) return;

    const callAmount = gameState.currentBet - player.bet;
    const amount = Math.min(callAmount, player.chips);
    player.chips -= amount;
    player.bet += amount;
    gameState.pot += amount;

    // Move to next player
    advanceToNextPlayer();
    advancePhaseIfNeeded();
    broadcastGameState();
  });

  socket.on('raise', (data) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || !player.isActive) return;

    const raiseAmount = data.amount;
    const totalBet = gameState.currentBet + raiseAmount;
    const amount = Math.min(totalBet - player.bet, player.chips);
    player.chips -= amount;
    player.bet += amount;
    gameState.pot += amount;
    gameState.currentBet = player.bet;

    // Move to next player
    advanceToNextPlayer();
    // after a raise, ensure betting continues; do not auto-advance phase here.
    broadcastGameState();
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    players = players.filter(p => p.id !== socket.id);
    if (players.length < 2) {
      gameState.gameStarted = false;
    }
    broadcastGameState();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Futuristic Poker Server listening on ${HOST}:${PORT}`);
});

module.exports = { app };
