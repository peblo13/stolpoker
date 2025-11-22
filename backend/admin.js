function handleSetBlindLevel(socket, level, gameState) {
  if (!socket || !socket.isAdmin) return { ok: false, error: 'not admin' };
  const lvl = Number(level);
  const BLIND_LEVELS = [1,2,3,4,6,8,10];
  if (isNaN(lvl) || lvl < 0 || lvl >= BLIND_LEVELS.length) {
    return { ok: false, error: 'invalid level' };
  }
  gameState.blindLevel = lvl;
  gameState.smallBlind = 10 * BLIND_LEVELS[lvl];
  gameState.bigBlind = 20 * BLIND_LEVELS[lvl];
  return { ok: true };
}

function handleToggleAutoBlinds(socket, val, gameState) {
  if (!socket || !socket.isAdmin) return { ok: false, error: 'not admin' };
  gameState.autoIncreaseBlinds = !!val;
  return { ok: true };
}

module.exports = { handleSetBlindLevel, handleToggleAutoBlinds };
