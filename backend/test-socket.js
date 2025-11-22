const { io } = require('socket.io-client');

async function testTransport(transport) {
  return new Promise((resolve) => {
    const socket = io('http://127.0.0.1:8086', { transports: [transport], timeout: 3000 });
    socket.on('connect', () => {
      console.log(`TEST: connected via ${transport}`, socket.id);
      socket.close();
      resolve({ ok: true, transport });
    });
    socket.on('connect_error', (err) => {
      console.log(`TEST: connect_error via ${transport}`, err && err.message, err && err.stack);
      resolve({ ok: false, transport, err });
    });
    socket.on('error', (err) => {
      console.log(`TEST: error via ${transport}`, err && err.message, err && err.stack);
      resolve({ ok: false, transport, err });
    });
    // fallback timeout
    setTimeout(() => { console.log(`TEST: timeout via ${transport}`); resolve({ ok: false, transport, err: new Error('timeout') }); }, 4000);
  });
}

(async () => {
  console.log('TEST: starting transport probe');
  const polling = await testTransport('polling');
  const websocket = await testTransport('websocket');
  console.log('TEST: results', { polling, websocket });
  process.exit((polling.ok || websocket.ok) ? 0 : 1);
})();
