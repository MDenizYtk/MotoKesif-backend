const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth.routes');
const groupsRoutes = require('./routes/groups.routes');
const { setupSocket } = require('./socket');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'MotoKesif API', docs: '/api/health' });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);
setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ MotoKesif sunucu çalışıyor: http://localhost:${PORT}`);
});
