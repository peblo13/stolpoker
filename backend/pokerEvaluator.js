// Helper function to normalize card formats
function normalizeCard(card) {
  let suit = card.suit.toLowerCase();
  let value = card.value;
  if (value === 'JACK') value = 'J';
  else if (value === 'QUEEN') value = 'Q';
  else if (value === 'KING') value = 'K';
  else if (value === 'ACE') value = 'A';
  return { suit, value };
}

// Value order for sorting and comparison
const valueOrder = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Helper function to sort cards by value (ascending)
function sortCardsByValue(cards) {
  return cards.slice().sort((a, b) => valueOrder[a.value] - valueOrder[b.value]);
}

// Helper function to check if cards are consecutive in value
function isConsecutive(cards) {
  for (let i = 1; i < cards.length; i++) {
    if (valueOrder[cards[i].value] !== valueOrder[cards[i - 1].value] + 1) return false;
  }
  return true;
}

// Helper function to check if values are consecutive
function isConsecutiveValues(values) {
  for (let i = 1; i < values.length; i++) {
    if (valueOrder[values[i]] !== valueOrder[values[i - 1]] + 1) return false;
  }
  return true;
}

// Main function to evaluate poker hand
function evaluatePokerHand(cards) {
  if (cards.length !== 7) {
    throw new Error('Must provide exactly 7 cards');
  }

  console.log('Evaluating hand for', cards.length, 'cards:', cards);

  // Normalize cards
  const normalized = cards.map(normalizeCard);

  // Sort cards by value
  const sorted = sortCardsByValue(normalized);

  // Count suits and values
  const suitCounts = {};
  const valueCounts = {};
  normalized.forEach(card => {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
  });

  // Check for flush and straight flush
  const flushSuit = Object.keys(suitCounts).find(suit => suitCounts[suit] >= 5);
  if (flushSuit) {
    const flushCards = normalized.filter(card => card.suit === flushSuit).sort((a, b) => valueOrder[b.value] - valueOrder[a.value]);

    // Check for royal flush
    const royalValues = ['10', 'J', 'Q', 'K', 'A'];
    if (flushCards.length >= 5 && royalValues.every(v => flushCards.some(c => c.value === v))) {
      return { rank: 9, tiebreaker: [14, 13, 12, 11, 10] }; // Royal Flush
    }

    // Check for straight flush
    for (let i = 0; i <= flushCards.length - 5; i++) {
      const seq = flushCards.slice(i, i + 5);
      if (isConsecutive(seq)) {
        const high = valueOrder[seq[0].value];
        return { rank: 8, tiebreaker: [high, high - 1, high - 2, high - 3, high - 4] }; // Straight Flush
      }
    }
  }

  // Check for four of a kind
  const fourValue = Object.keys(valueCounts).find(v => valueCounts[v] === 4);
  if (fourValue) {
    const fourVal = valueOrder[fourValue];
    const kicker = sorted.find(card => card.value !== fourValue);
    return { rank: 7, tiebreaker: [fourVal, valueOrder[kicker.value]] }; // Four of a Kind
  }

  // Check for full house
  const threeValue = Object.keys(valueCounts).find(v => valueCounts[v] === 3);
  if (threeValue) {
    const pairValue = Object.keys(valueCounts).find(v => valueCounts[v] >= 2 && v !== threeValue);
    if (pairValue) {
      return { rank: 6, tiebreaker: [valueOrder[threeValue], valueOrder[pairValue]] }; // Full House
    }
  }

  // Check for flush
  if (flushSuit) {
    const flushCards = normalized.filter(card => card.suit === flushSuit).sort((a, b) => valueOrder[b.value] - valueOrder[a.value]);
    const top5 = flushCards.slice(0, 5);
    return { rank: 5, tiebreaker: top5.map(c => valueOrder[c.value]) }; // Flush
  }

  // Check for straight
  const uniqueValues = [...new Set(sorted.map(c => c.value))].sort((a, b) => valueOrder[a] - valueOrder[b]);
  for (let i = 0; i <= uniqueValues.length - 5; i++) {
    if (isConsecutiveValues(uniqueValues.slice(i, i + 5))) {
      const high = valueOrder[uniqueValues[i + 4]];
      return { rank: 4, tiebreaker: [high, high - 1, high - 2, high - 3, high - 4] }; // Straight
    }
  }
  // Special case for A-2-3-4-5 straight
  if (uniqueValues.includes('A') && uniqueValues.includes('2') && uniqueValues.includes('3') && uniqueValues.includes('4') && uniqueValues.includes('5')) {
    return { rank: 4, tiebreaker: [5, 4, 3, 2, 14] }; // Straight (5 high)
  }

  // Check for three of a kind
  if (threeValue) {
    const threeVal = valueOrder[threeValue];
    const kickers = sorted.filter(c => c.value !== threeValue).slice(-2).map(c => valueOrder[c.value]).sort((a, b) => b - a);
    return { rank: 3, tiebreaker: [threeVal, ...kickers] }; // Three of a Kind
  }

  // Check for two pair
  const pairs = Object.keys(valueCounts).filter(v => valueCounts[v] === 2).map(v => valueOrder[v]).sort((a, b) => b - a);
  if (pairs.length >= 2) {
    const highPair = pairs[0];
    const lowPair = pairs[1];
    const kicker = sorted.find(c => !pairs.includes(valueOrder[c.value]));
    return { rank: 2, tiebreaker: [highPair, lowPair, valueOrder[kicker.value]] }; // Two Pair
  }

  // Check for one pair
  if (pairs.length === 1) {
    const pairVal = pairs[0];
    const kickers = sorted.filter(c => c.value !== Object.keys(valueCounts).find(v => valueOrder[v] === pairVal)).slice(-3).map(c => valueOrder[c.value]).sort((a, b) => b - a);
    return { rank: 1, tiebreaker: [pairVal, ...kickers] }; // One Pair
  }

  // High card
  const top5 = sorted.slice(-5).map(c => valueOrder[c.value]).sort((a, b) => b - a);
  return { rank: 0, tiebreaker: top5 }; // High Card
}

module.exports = { evaluatePokerHand, sortCardsByValue, normalizeCard };