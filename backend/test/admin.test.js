const { handleSetBlindLevel, handleToggleAutoBlinds } = require('../admin');

const fakeSocket = { isAdmin: false };
const fakeState = { blindLevel: 0, smallBlind: 10, bigBlind: 20, autoIncreaseBlinds: false };

test('non-admin cannot set blind level', () => {
  const r = handleSetBlindLevel(fakeSocket, 1, fakeState);
  expect(r.ok).toBe(false);
});

test('admin can set blind level', () => {
  const sock = { isAdmin: true };
  const state = { blindLevel: 0, smallBlind: 10, bigBlind: 20 };
  const r = handleSetBlindLevel(sock, 2, state);
  expect(r.ok).toBe(true);
  expect(state.blindLevel).toBe(2);
});

test('toggle auto blinds requires admin', () => {
  const r = handleToggleAutoBlinds(fakeSocket, true, fakeState);
  expect(r.ok).toBe(false);
});

test('toggle auto blinds admin success', () => {
  const sock = { isAdmin: true };
  const state = { autoIncreaseBlinds: false };
  const r = handleToggleAutoBlinds(sock, true, state);
  expect(r.ok).toBe(true);
  expect(state.autoIncreaseBlinds).toBe(true);
});
