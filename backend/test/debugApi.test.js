const supertest = require('supertest');
const { startServer, stopServer } = require('../index');

describe('debug API route gating', () => {
  test('debug API is available when DEBUG_API=1', async () => {
    process.env.DEBUG_API = '1';
    const serverInfo = await startServer({ port: 9100 + Math.floor(Math.random() * 100), bindAddr: '127.0.0.1', adminCode: 'testadmin' });
    const res = await supertest(`http://127.0.0.1:${serverInfo.port}`).get('/api/debug/state');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('gameState');
    await stopServer();
  });

  test('debug API is not available when DEBUG_API=0', async () => {
    process.env.DEBUG_API = '0';
    const serverInfo = await startServer({ port: 9200 + Math.floor(Math.random() * 100), bindAddr: '127.0.0.1', adminCode: 'testadmin' });
    const res = await supertest(`http://127.0.0.1:${serverInfo.port}`).get('/api/debug/state');
    expect(res.status).toBe(404);
    await stopServer();
  });

  test('debug kick removes a temporary player created by debug bet', async () => {
    process.env.DEBUG_API = '1';
    const port = 9300 + Math.floor(Math.random() * 100);
    const serverInfo = await startServer({ port, bindAddr: '127.0.0.1', adminCode: 'testadmin' });
    const base = `http://127.0.0.1:${serverInfo.port}`;
    // Ensure no players present initially
    const r0 = await supertest(base).get('/api/debug/state');
    expect(r0.status).toBe(200);
    const j0 = r0.body;
    expect(Array.isArray(j0.gameState.players)).toBeTruthy();
    expect(j0.gameState.players.length).toBe(0);

    // Use bet action to create temporary player
    const r1 = await supertest(base).post('/api/debug/action').send({ action: 'bet', amount: 20 });
    expect(r1.status).toBe(200);
    const j1 = r1.body;
    expect(j1).toHaveProperty('chosenSeat');
    const seat = j1.chosenSeat;
    expect(seat).toBeTruthy();
    // Verify seat is occupied
    const r1s = await supertest(base).get('/api/debug/state');
    expect(r1s.status).toBe(200);
    const j1s = r1s.body;
    const player = (j1s.gameState.players || []).find(p => p.seat === seat);
    expect(player).toBeTruthy();

    // Call kick on seat
    const rk = await supertest(base).post('/api/debug/action').send({ action: 'kick', seat });
    expect(rk.status).toBe(200);
    const jk = rk.body;
    expect(jk).toHaveProperty('chosenSeat');
    expect(jk.chosenSeat).toBe(seat);
    // After kick, seat shouldn't be in list
    const r2 = await supertest(base).get('/api/debug/state');
    const j2 = r2.body;
    const playerAfter = (j2.gameState.players || []).find(p => p.seat === seat);
    expect(playerAfter).toBeFalsy();
    await stopServer();
  });

  test('debug kick returns 404 when seat missing', async () => {
    process.env.DEBUG_API = '1';
    const port = 9400 + Math.floor(Math.random() * 100);
    const serverInfo = await startServer({ port, bindAddr: '127.0.0.1', adminCode: 'testadmin' });
    const base = `http://127.0.0.1:${serverInfo.port}`;
    // Kick non-existent seat
    const res = await supertest(base).post('/api/debug/action').send({ action: 'kick', seat: 999 });
    expect(res.status).toBe(404);
    await stopServer();
  });
});
