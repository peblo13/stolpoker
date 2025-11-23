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
  let cardIndex = 0;

  // Deal hole cards
  for (let i = 0; i < players.length; i++) {
    players[i].cards = [gameState.deck[cardIndex++], gameState.deck[cardIndex++]];
  }

  // Burn and deal community cards
  gameState.communityCards = [];
  cardIndex++; // burn
  gameState.communityCards.push(gameState.deck[cardIndex++]); // flop 1
  gameState.communityCards.push(gameState.deck[cardIndex++]); // flop 2
  gameState.communityCards.push(gameState.deck[cardIndex++]); // flop 3
  cardIndex++; // burn
  gameState.communityCards.push(gameState.deck[cardIndex++]); // turn
  cardIndex++; // burn
  gameState.communityCards.push(gameState.deck[cardIndex++]); // river
}

function startNewHand() {
  if (players.length < 2) return;

  gameState.gameStarted = true;
  gameState.phase = 'pre-flop';
  gameState.pot = 0;
  gameState.currentBet = 0;
  gameState.dealerPosition = (gameState.dealerPosition + 1) % players.length;

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
  gameState.currentPlayer = (bigBlindPos + 1) % players.length;

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

    const player = {
      id: socket.id,
      socketId: socket.id,
      name: data.name || `Player ${players.length + 1}`,
      chips: 1000,
      cards: [],
      position: players.length,
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

    broadcastGameState();
  });

  socket.on('fold', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.isActive = false;
    }
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
