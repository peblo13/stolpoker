const fs = require('fs');
const path = require('path');

const RECORDS_FILE = path.join(__dirname, '..', 'records.json');

const DEFAULT_RECORDS = {
  highestPot: 0,
  biggestWin: 0,
  mostWins: {}
};

let records = { ...DEFAULT_RECORDS };

// Load existing records if present
try {
  if (fs.existsSync(RECORDS_FILE)) {
    const raw = fs.readFileSync(RECORDS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    records = { ...records, ...parsed };
  }
} catch (err) {
  console.warn('Could not load records.json', err);
}

function updateRecordsForWinner(winnerName, winAmount) {
  if (!winnerName || typeof winAmount !== 'number') return;
  if (winAmount > records.biggestWin) {
    records.biggestWin = winAmount;
  }
  if (winAmount > records.highestPot) {
    records.highestPot = winAmount;
  }
  if (!records.mostWins[winnerName]) records.mostWins[winnerName] = 0;
  records.mostWins[winnerName] = (records.mostWins[winnerName] || 0) + 1;
  // persist to disk
  try {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save records:', err);
  }
  return records;
}

function resetRecords() {
  records = { ...DEFAULT_RECORDS };
  try { fs.unlinkSync(RECORDS_FILE); } catch (e) {}
  return records;
}

function getRecords() {
  return { ...records };
}

module.exports = { updateRecordsForWinner, getRecords, resetRecords };
