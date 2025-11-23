const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.BIND_ADDR || '0.0.0.0';

app.get('/', (req, res) => {
  res.send({ ok: true, message: 'poker-table backend running' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('ping', () => socket.emit('pong'));
  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});

module.exports = { app };
