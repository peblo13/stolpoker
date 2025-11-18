const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3003,
  path: '/',
  method: 'GET',
  timeout: 3000,
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('BODY:', data);
    process.exit(0);
  });
});

req.on('timeout', () => {
  console.error('Request timed out');
  req.destroy();
  process.exit(2);
});

req.on('error', (err) => {
  console.error('Request error:', err && err.message);
  process.exit(1);
});

req.end();
