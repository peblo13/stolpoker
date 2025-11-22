const { evaluatePokerHand } = require('./pokerEvaluator');

// Compute side-pots from player contributions
function computeSidePots(players) {
  // players: array of {id, name, seat, chips, currentContribution}
  const contributions = players.map(p => ({ player: p, amount: p.currentContribution || 0 }));
  const uniqAmounts = Array.from(new Set(contributions.map(c => c.amount))).sort((a,b)=>a-b);
  let prev = 0;
  const sidePots = [];
  for (let amt of uniqAmounts) {
    if (amt <= prev) continue;
    const eligible = contributions.filter(c => c.amount >= amt).map(c => c.player);
    const potAmount = (amt - prev) * eligible.length;
    sidePots.push({ amount: potAmount, eligible });
    prev = amt;
  }
  if (sidePots.length === 0) {
    // no contributions -> single pot
    sidePots.push({ amount: contributions.reduce((s,c)=>s+c.amount,0), eligible: players });
  }
  return sidePots;
}

// Distribute side-pots; returns distribution summary
function distributeSidePots(gameState) {
  // Make a shallow copy of players to avoid mutating original unexpectedly
  const players = gameState.players.map(p => ({ ...p }));
  const playerHands = gameState.playerHands || {};
  const community = gameState.communityCards || [];

  const contributions = players.map(p => ({ player: p, amount: p.currentContribution || 0 }));

  // build side pots
  const uniqAmounts = Array.from(new Set(contributions.map(c => c.amount))).sort((a,b)=>a-b);
  let prev = 0;
  const sidePots = [];
  for (let amt of uniqAmounts) {
    if (amt <= prev) continue;
    const eligible = contributions.filter(c => c.amount >= amt).map(c => c.player);
    const potAmount = (amt - prev) * eligible.length;
    sidePots.push({ amount: potAmount, eligible });
    prev = amt;
  }
  if (sidePots.length === 0) {
    sidePots.push({ amount: gameState.pot || 0, eligible: players });
  }

  const winnersList = [];
  for (let sp of sidePots) {
    let best = null;
    let winners = [];
    for (let player of sp.eligible) {
      const holeCards = playerHands[player.id];
      if (!holeCards || holeCards.length !== 2) continue;
      const allCards = [...holeCards, ...community];
      if (allCards.length !== 7) continue; // evaluatePokerHand expects 7
      const hand = evaluatePokerHand(allCards);
      if (!best || hand.rank > best.rank || (hand.rank === best.rank && compareTiebreakers(hand.tiebreaker, best.tiebreaker) > 0)) {
        best = hand;
        winners = [player];
      } else if (hand.rank === best.rank && compareTiebreakers(hand.tiebreaker, best.tiebreaker) === 0) {
        winners.push(player);
      }
    }
    if (winners.length > 0) {
      const perWinner = Math.floor(sp.amount / winners.length);
      for (let w of winners) {
        // Find player in players copy and add chips
        const pl = players.find(p => p.id === w.id);
        if (pl) pl.chips += perWinner;
      }
    }
    winnersList.push({ pot: sp.amount, winners: winners.map(w=>({id:w.id, name:w.name})), perWinner: winners.length>0 ? Math.floor(sp.amount / winners.length) : 0 });
  }

  // reset the pot -- distributed
  const totalDistributed = sidePots.reduce((s,sp)=>s+sp.amount,0);

  return { players, winnersList, totalDistributed };
}

function compareTiebreakers(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

module.exports = { computeSidePots, distributeSidePots };
