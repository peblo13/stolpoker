const ioClient = require('socket.io-client');
const { startServer, stopServer } = require('../index');
const axios = require('axios');

describe('deal order', () => {
  let serverInfo;
  beforeAll(async () => {
    process.env.DEBUG_API = '1';
    // Mock axios to avoid hitting external API
    let drawCount = 0;
    jest.spyOn(axios, 'get').mockImplementation((url) => {
      if (url.includes('/deck/new')) {
        return Promise.resolve({ data: { deck_id: 'testdeck' } });
      }
      if (url.includes('/shuffle')) {
        return Promise.resolve({});
      }
      if (url.includes('/draw')) {
        // Return unique cards each time for test
        drawCount++;
        return Promise.resolve({ data: { cards: [{ code: 'C' + drawCount, value: 'X', suit: 'X' }] } });
      }
      return Promise.resolve({});
    });
    serverInfo = await startServer({ port: 9300 + Math.floor(Math.random() * 100), bindAddr: '127.0.0.1', adminCode: 'testadmin' });
  }, 15000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await stopServer();
  });

  test('deals in correct order starting after dealer', async () => {
    const url = `http://127.0.0.1:${serverInfo.port}`;
    const sockets = [];
    const orders = [];
    // Create 3 clients
    for (let s = 1; s <= 3; s++) {
      const sock = ioClient(url, { transports: ['websocket'], forceNew: true });
      sockets.push(sock);
    }
    // Join with specific seats
    await Promise.all(sockets.map((sock, i) => new Promise((resolve) => {
      sock.on('connect', () => {
        sock.emit('joinSeat', { name: `P${i+1}`, seat: i + 1 });
        sock.on('joined', () => resolve());
      });
    })));

    // Listen for cardDealt to capture order
    sockets.forEach((sock, i) => {
      sock.on('cardDealt', (data) => {
        orders.push({ seat: data.seat });
      });
    });

    // Start the game (this charges blinds and triggers deal)
    // Use first socket to send startGame
    sockets[0].emit('startGame');
    // Wait for events or up to a timeout
    // Also listen for a gameUpdate to capture server state (dealerSeat)
    let lastState = null;
    const stateListener = (s) => { lastState = s; };
    sockets[0].on('gameUpdate', stateListener);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      // Expect at least 6 cardDealt events (3 players * 2 rounds)
      expect(orders.length).toBeGreaterThanOrEqual(6);
      // Use lastState captured from gameUpdate to compute expected order
      if (!lastState) {
        throw new Error('Did not receive gameUpdate with state');
      }
      const dealer = lastState.dealerSeat || lastState.gameState?.dealerSeat || lastState.gameState || lastState.dealer;
      const playersState = lastState.players || lastState.gameState?.players || (lastState.gameState && lastState.gameState.players);
      if (!playersState) throw new Error('No players from gameUpdate');
      const seatsSorted = playersState.map(p => p.seat).sort((a,b)=>a-b);
      const dIdx = seatsSorted.findIndex(s => s === dealer);
      const startIdx = (dIdx + 1) % seatsSorted.length;
      const expected = [];
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < seatsSorted.length; i++) {
          expected.push(seatsSorted[(startIdx + i) % seatsSorted.length]);
        }
      }
      const observedSeats = orders.slice(0,6).map(o => o.seat);
      expect(observedSeats).toEqual(expected);
    } finally {
      sockets.forEach(s => s.close());
      sockets[0].off('gameUpdate', stateListener);
    }
  }, 15000);
});
