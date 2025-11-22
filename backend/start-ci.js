const { startServer } = require('./index');

const port = process.env.PORT || 8086;
const bindAddr = process.env.BIND_ADDR || '127.0.0.1';
const adminCode = process.env.ADMIN_CODE || 'testadmin';
process.env.DEBUG_API = process.env.DEBUG_API || '1';

startServer({ port, bindAddr, adminCode }).then(({ port: p }) => {
  console.log(`Server started on ${bindAddr}:${p}`);
}).catch((e) => {
  console.error('Failed to start server in CI mode:', e);
  process.exit(1);
});
