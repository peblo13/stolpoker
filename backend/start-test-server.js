#!/usr/bin/env node
// start-test-server.js — Programmatic startup helper for tests
// Usage: node start-test-server.js [port] [bindAddr] [dealDelayMs]
const path = require('path');
const portArg = process.argv[2] ? Number(process.argv[2]) : Number(process.env.PORT || 0);
const bindArg = process.argv[3] || process.env.BIND_ADDR || '127.0.0.1';
const dealDelay = process.argv[4] ? Number(process.argv[4]) : Number(process.env.DEAL_DELAY_MS || 0);
const adminCode = process.env.ADMIN_CODE || 'testadmin';
const startServer = require('./index').startServer;
const stopServer = require('./index').stopServer;
(async () => {
  try {
    if (dealDelay) process.env.DEAL_DELAY_MS = String(dealDelay);
    process.env.ADMIN_CODE = adminCode;
    const p = portArg || 0;
    const bind = bindArg || '127.0.0.1';
    console.log('start-test-server: starting backend programmatically');
    const info = await startServer({ port: p, bindAddr: bind, adminCode });
    console.log('start-test-server: started', info);
    // keep the process alive until signalled to stop
    process.on('SIGINT', async () => {
      console.log('start-test-server: SIGINT — shutting down');
      try { await stopServer(); } catch (e) { console.error('stopServer() failed:', e); }
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      console.log('start-test-server: SIGTERM — shutting down');
      try { await stopServer(); } catch (e) { console.error('stopServer() failed:', e); }
      process.exit(0);
    });
    // also handle unhandled rejections for visibility in logs
    process.on('unhandledRejection', (reason) => console.error('unhandledRejection in start-test-server:', reason));
    process.on('uncaughtException', (err) => console.error('uncaughtException in start-test-server:', err));
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
})();
