const fs = require('fs');
const path = require('path');
const { updateRecordsForWinner, getRecords } = require('../records');

const RECORDS_FILE = path.join(__dirname, '..', '..', 'records.json');

const { resetRecords } = require('../records');
beforeEach(() => {
  // reset records file & memory
  if (fs.existsSync(RECORDS_FILE)) fs.unlinkSync(RECORDS_FILE);
  resetRecords();
});

test('update record for a single winner increases biggestWin/highestPot and mostWins', () => {
  const r = updateRecordsForWinner('TestPlayer', 500);
  expect(r.biggestWin).toBe(500);
  expect(r.highestPot).toBe(500);
  expect(r.mostWins['TestPlayer']).toBe(1);
  // call again should increment mostWins
  const r2 = updateRecordsForWinner('TestPlayer', 200);
  expect(r2.mostWins['TestPlayer']).toBe(2);
});

