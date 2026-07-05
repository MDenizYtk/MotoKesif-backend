const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth.routes');
const groupsRoutes = require('./routes/groups.routes');
const postsRoutes = require('./routes/posts.routes');
const hazardsRoutes = require('./routes/hazards.routes');
const eventsRoutes = require('./routes/events.routes');
const shareRoutes = require('./routes/share.routes');
const db = require('./db');
const { setupSocket } = require('./socket');
const { sharePageHtml } = require('./sharepage');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // fotoğraflı gönderiler için

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'MotoKesif API', docs: '/api/health' });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/hazards', hazardsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/share', shareRoutes);

// Herkese açık canlı konum (aile takip linki için, auth yok)
app.get('/api/public/share/:token', (req, res) => {
  const row = db
    .prepare('SELECT display_name AS displayName, lat, lng, updated_at AS updatedAt FROM live_shares WHERE token = ?')
    .get(req.params.token);
  if (!row) return res.status(404).json({ error: 'Takip bulunamadı' });
  res.json(row);
});

// Herkese açık takip sayfası (uygulaması olmayanlar için)
app.get('/t/:token', (req, res) => {
  res.type('html').send(sharePageHtml(req.params.token));
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Geçersiz JSON gövdesi' });
  }
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatası' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);
setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ MotoKesif sunucu çalışıyor: http://localhost:${PORT}`);
});
