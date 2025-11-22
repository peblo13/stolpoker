// For the integration test we use programmatic start/stop
const path = require('path');
const io = require('socket.io-client');

jest.setTimeout(20000);

function waitFor(conditionFn, timeout = 5000, interval = 100) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function loop() {
      if (conditionFn()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('timeout'));
      setTimeout(loop, interval);
    })();
  });
}

const serverModule = require('../index');
let serverHandle;

beforeAll(async () => {
  const port = 9091;
  serverHandle = await serverModule.startServer({ port, bindAddr: '127.0.0.1', adminCode: 'testadmin' });
});

afterAll(async () => {
  if (serverHandle) await serverModule.stopServer();
});

test('admin socket can set blind level and verify update', async () => {
  const socketUrl = 'http://127.0.0.1:9091';
  const socket = io(socketUrl, { transports: ['polling', 'websocket'], reconnectionAttempts: 5 });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
      socket.on('connect', () => { clearTimeout(timer); resolve(); });
      socket.on('connect_error', (err) => { console.error('Client connect_error', err && err.message); /* ignore to allow reconnection attempts */ });
    });

    const adminResponse = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no adminSet event')), 5000);
      socket.emit('setAdmin', 'testadmin');
      socket.on('adminSet', (data) => { clearTimeout(timer); resolve(data); });
    });
    expect(adminResponse.ok).toBe(true);

    // now set blind level and wait for update
    const updateResp = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no update received')), 5000);
      const onUpdate = (state) => {
        if (state.blindLevel === 3) { clearTimeout(timer); socket.off('gameUpdate', onUpdate); resolve(state); }
      };
      // server emits 'gameUpdate' event for game state changes (also sometimes uses 'update')
      socket.on('gameUpdate', onUpdate);
      socket.emit('setBlindLevel', 3);
    });
    expect(updateResp.blindLevel).toBe(3);
  } finally {
    socket.close();
  }
});
