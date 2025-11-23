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
  ,
  phaseActionCount: 0
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
  if (gameState.communityCards.length >= 3) return; // already revealed
  console.log('Revealing flop');
  // burn one
  if (gameState.deck.length > 0) gameState.deck.shift();
  // reveal three
  gameState.communityCards.push(gameState.deck.shift());
  gameState.communityCards.push(gameState.deck.shift());
  gameState.communityCards.push(gameState.deck.shift());
}

function revealTurn() {
  if (gameState.communityCards.length >= 4) return; // already revealed
  console.log('Revealing turn');
  if (gameState.deck.length > 0) gameState.deck.shift();
  gameState.communityCards.push(gameState.deck.shift());
}

function revealRiver() {
  if (gameState.communityCards.length >= 5) return; // already revealed
  console.log('Revealing river');
  if (gameState.deck.length > 0) gameState.deck.shift();
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
  console.log(`Starting new hand: dealer=${gameState.dealerPosition}, smallBlind=${smallBlindPos}, bigBlind=${bigBlindPos}`);

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
  // reset action counter for the phase
  gameState.phaseActionCount = 0;
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
    console.log(`Broadcast phase=${gameState.phase}, communityCards=${gameState.communityCards.length}, pot=${gameState.pot}`);
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
  // Don't advance if nobody acted during the phase (avoid auto-revealing)
  if (!gameState.phaseActionCount || gameState.phaseActionCount === 0) return false;

  // reset individual bets for next round
  players.forEach(p => p.bet = 0);
  gameState.currentBet = 0;

  if (gameState.phase === 'pre-flop') {
    revealFlop();
    gameState.phase = 'flop';
    gameState.phaseActionCount = 0;
  } else if (gameState.phase === 'flop') {
    revealTurn();
    gameState.phase = 'turn';
    gameState.phaseActionCount = 0;
  } else if (gameState.phase === 'turn') {
    revealRiver();
    gameState.phase = 'river';
    gameState.phaseActionCount = 0;
  } else if (gameState.phase === 'river') {
    gameState.phase = 'showdown';
    gameState.phaseActionCount = 0;
    // Determine winners and award pot
    const winners = determineWinners();
    if (winners && winners.length > 0) {
      awardPotToWinners(winners);
    }
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

// --- Hand evaluation and pot awarding ---
function parseCard(card) {
  // card like '10♠' or 'A♣' or 'J♦'
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const order = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return { rank, suit, value: order[rank] || 0 };
}

function getCombinations(arr, k) {
  const res = [];
  function helper(start, combo) {
    if (combo.length === k) {
      res.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return res;
}

// Evaluate 5-card hand and return [category, tiebreakers...]
function evaluate5(cards5) {
  // cards5: array of strings like 'A♠'
  const parsed = cards5.map(parseCard);
  const values = parsed.map(c => c.value).sort((a, b) => b - a);
  const suits = parsed.map(c => c.suit);

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const uniqValuesDesc = Object.keys(counts).map(Number).sort((a,b)=>b-a);

  const isFlush = suits.every(s => s === suits[0]);
  // straight detection (handle wheel A-2-3-4-5)
  let isStraight = false;
  let topStraight = 0;
  const vSet = [...new Set(values)];
  if (vSet.length === 5) {
    const max = Math.max(...vSet);
    const min = Math.min(...vSet);
    if (max - min === 4) {
      isStraight = true;
      topStraight = max;
    } else {
      // wheel 14,5,4,3,2 -> 5-high straight
      if (vSet.includes(14) && vSet.includes(2) && vSet.includes(3) && vSet.includes(4) && vSet.includes(5)) {
        isStraight = true;
        topStraight = 5;
      }
    }
  }

  // Count groups
  const countsArr = Object.entries(counts).map(([k,v])=>({v:Number(k),c:v})).sort((a,b)=>b.c - a.c || b.v - a.v);

  // Ranking order: 8 StraightFlush,7 Four,6 FullHouse,5 Flush,4 Straight,3 Trips,2 TwoPair,1 Pair,0 HighCard
  if (isStraight && isFlush) {
    return [8, topStraight, ...values];
  }
  if (countsArr[0].c === 4) {
    const four = countsArr[0].v;
    const kicker = values.find(v => v !== four);
    return [7, four, kicker];
  }
  if (countsArr[0].c === 3 && countsArr[1] && countsArr[1].c === 2) {
    const trips = countsArr[0].v;
    const pair = countsArr[1].v;
    return [6, trips, pair];
  }
  if (isFlush) return [5, ...values];
  if (isStraight) return [4, topStraight];
  if (countsArr[0].c === 3) {
    const trips = countsArr[0].v;
    const kickers = values.filter(v => v !== trips);
    return [3, trips, ...kickers];
  }
  if (countsArr[0].c === 2 && countsArr[1] && countsArr[1].c === 2) {
    const pairHigh = countsArr[0].v;
    const pairLow = countsArr[1].v;
    const kicker = values.find(v => v !== pairHigh && v !== pairLow);
    return [2, pairHigh, pairLow, kicker];
  }
  if (countsArr[0].c === 2) {
    const pair = countsArr[0].v;
    const kickers = values.filter(v => v !== pair);
    return [1, pair, ...kickers];
  }
  return [0, ...values];
}

function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function bestHandForPlayer(player) {
  const cards = [...player.cards, ...gameState.communityCards];
  if (cards.length < 5) return null;
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const score = evaluate5(combo);
    if (!best || compareScore(score, best.score) === 1) {
      best = { combo, score };
    }
  }
  return best;
}

function determineWinners() {
  const active = players.filter(p => p.isActive);
  if (active.length === 0) return [];
  const results = active.map(p => ({ player: p, best: bestHandForPlayer(p) }));
  results.forEach(r => { if (!r.best) r.best = { score: [0] }; });
  let bestScore = null;
  let winners = [];
  for (const r of results) {
    if (!bestScore || compareScore(r.best.score, bestScore) === 1) {
      bestScore = r.best.score;
      winners = [r.player];
    } else if (compareScore(r.best.score, bestScore) === 0) {
      winners.push(r.player);
    }
  }
  return winners;
}

function awardPotToWinners(winners) {
  if (!winners || winners.length === 0) return;
  const share = Math.floor(gameState.pot / winners.length);
  winners.forEach((w, idx) => {
    w.chips += share;
  });
  const remainder = gameState.pot - share * winners.length;
  if (remainder > 0) {
    winners[0].chips += remainder;
  }
  gameState.pot = 0;
  players.forEach(p => p.bet = 0);
  gameState.gameStarted = false;
  if (currentTurnInterval) { clearInterval(currentTurnInterval); currentTurnInterval = null; }
  if (currentTurnTimeout) { clearTimeout(currentTurnTimeout); currentTurnTimeout = null; }
  setTimeout(startNewHand, 2000);
  broadcastGameState();
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

    // count an action in this betting round
    gameState.phaseActionCount = (gameState.phaseActionCount || 0) + 1;
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
    gameState.phaseActionCount = (gameState.phaseActionCount || 0) + 1;
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
    gameState.phaseActionCount = (gameState.phaseActionCount || 0) + 1;
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
    gameState.phaseActionCount = (gameState.phaseActionCount || 0) + 1;
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
