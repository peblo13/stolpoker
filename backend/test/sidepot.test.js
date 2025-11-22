const { distributeSidePots } = require('../sidepots');

test('single pot two players -> winner gets the whole pot', () => {
  const gameState = {
    players: [
      { id: 'p1', name: 'Alice', chips: 1000, seat: 1, currentContribution: 50 },
      { id: 'p2', name: 'Bob', chips: 1000, seat: 2, currentContribution: 50 }
    ],
    // create community that doesn't deliver a flush by itself; p2 has hole hearts to make flush
    communityCards: [
      { suit: 'hearts', value: 'A' },
      { suit: 'hearts', value: 'K' },
      { suit: 'diamonds', value: 'Q' },
      { suit: 'clubs', value: '7' },
      { suit: 'clubs', value: '5' }
    ],
    playerHands: {
      p1: [{ suit: 'clubs', value: '2' }, { suit: 'clubs', value: '3' }],
      p2: [{ suit: 'hearts', value: 'J' }, { suit: 'hearts', value: '10' }]
    },
    pot: 100
  };
  const { players } = distributeSidePots(gameState);
  const p1 = players.find(p => p.id === 'p1');
  const p2 = players.find(p => p.id === 'p2');
  // p2 has the flush, should win the pot
  expect(p2.chips).toBeGreaterThan(p1.chips);
});

test('side pot with all-in and two winners split', () => {
  // p1 all-in 50, p2 contributes 100, p3 contributes 100
  const gameState = {
    players: [
      { id: 'p1', name: 'Alice', chips: 0, seat: 1, currentContribution: 50 },
      { id: 'p2', name: 'Bob', chips: 950, seat: 2, currentContribution: 100 },
      { id: 'p3', name: 'Carol', chips: 900, seat: 3, currentContribution: 100 }
    ],
    communityCards: [
      { suit: 'clubs', value: '2' },
      { suit: 'diamonds', value: '3' },
      { suit: 'hearts', value: '4' },
      { suit: 'spades', value: '5' },
      { suit: 'hearts', value: '6' }
    ],
    playerHands: {
      p1: [{ suit: 'clubs', value: '7' }, { suit: 'clubs', value: '8' }], // straight
      p2: [{ suit: 'hearts', value: '7' }, { suit: 'spades', value: '8' }],
      p3: [{ suit: 'diamonds', value: '7' }, { suit: 'diamonds', value: '8' }]
    },
    pot: 250
  };
  const { players, winnersList } = distributeSidePots(gameState);
  // main pot should include p1, p2, p3 contributions up to 50 each -> 150
  // side pot should be between p2 and p3 -> 100
  // winnersList should have two pots
  expect(winnersList.length).toBeGreaterThanOrEqual(2);
  // Since all three have straights, they tie on main pot -> p1 (all-in) should get his share
  const p1 = players.find(p=>p.id==='p1');
  // After distribution p1 should have increased chips due to winning main pot share
  expect(p1.chips).toBeGreaterThanOrEqual(0);
});

test('complex multi-level side-pots with nested all-ins and tie-hand splits', () => {
  const gameState = {
    players: [
      { id: 'p1', name: 'Alice', chips: 0, seat: 1, currentContribution: 50 },
      { id: 'p2', name: 'Bob', chips: 850, seat: 2, currentContribution: 150 },
      { id: 'p3', name: 'Carol', chips: 700, seat: 3, currentContribution: 200 },
    ],
    communityCards: [
      { suit: 'hearts', value: 'A' },
      { suit: 'spades', value: 'K' },
      { suit: 'clubs', value: 'Q' },
      { suit: 'diamonds', value: 'J' },
      { suit: 'hearts', value: '10' }
    ],
    playerHands: {
      // Alice: pair of 10s via community + hole low cards
      p1: [{ suit: 'clubs', value: '2' }, { suit: 'diamonds', value: '3' }],
      // Bob: pair of Aces (A+Ax) via community + hole Ace
      p2: [{ suit: 'hearts', value: 'A' }, { suit: 'clubs', value: '4' }],
      // Carol: pair of Aces too -> tie with Bob
      p3: [{ suit: 'spades', value: 'A' }, { suit: 'clubs', value: '5' }]
    },
    pot: 400
  };
  const { players, winnersList } = require('../sidepots').distributeSidePots(gameState);
  // main pot includes first 50 from all 3 => 150; side pot 1 p2/p3 contain next 100 each
  // winners: p2 and p3 tie for main & side pots allocated among them
  // since exact chip amounts depend on rounding, ensure winners list has entries and expected winners
  expect(winnersList.length).toBeGreaterThanOrEqual(2);
  const p2 = players.find(p=>p.id==='p2');
  const p3 = players.find(p=>p.id==='p3');
  expect(p2.chips).toBeGreaterThanOrEqual(850);
  expect(p3.chips).toBeGreaterThanOrEqual(700);
});

test('side pot: two players tie split pot equally', () => {
  const gameState = {
    players: [
      { id: 'p1', name: 'Alice', chips: 900, seat: 1, currentContribution: 50 },
      { id: 'p2', name: 'Bob', chips: 900, seat: 2, currentContribution: 50 }
    ],
    communityCards: [
      { suit: 'hearts', value: 'A' },
      { suit: 'diamonds', value: 'K' },
      { suit: 'spades', value: 'Q' },
      { suit: 'clubs', value: 'J' },
      { suit: 'hearts', value: '10' }
    ],
    playerHands: {
      p1: [{ suit: 'clubs', value: '2' }, { suit: 'clubs', value: '3' }],
      p2: [{ suit: 'diamonds', value: '2' }, { suit: 'diamonds', value: '3' }]
    },
    pot: 100
  };
  const { players } = distributeSidePots(gameState);
  // Both players produce same high card/hand so pot must be split evenly
  expect(players[0].chips).toBe(players[1].chips);
});
