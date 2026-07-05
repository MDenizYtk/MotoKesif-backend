const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

// Paylaşımı başlat → token üret
router.post('/start', (req, res) => {
  const token = crypto.randomBytes(6).toString('hex');
  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.userId);
  db.prepare(
    "INSERT INTO live_shares (token, user_id, display_name, updated_at) VALUES (?, ?, ?, datetime('now'))",
  ).run(token, req.userId, user ? user.display_name : null);
  res.status(201).json({ token });
});

// Konumu güncelle
router.post('/loc', (req, res) => {
  const { token, lat, lng } = req.body || {};
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Geçersiz' });
  const row = db.prepare('SELECT user_id FROM live_shares WHERE token = ?').get(token);
  if (!row || row.user_id !== req.userId) return res.status(403).json({ error: 'Yetkisiz' });
  db.prepare("UPDATE live_shares SET lat = ?, lng = ?, updated_at = datetime('now') WHERE token = ?").run(lat, lng, token);
  res.json({ ok: true });
});

// Paylaşımı durdur
router.post('/stop', (req, res) => {
  const { token } = req.body || {};
  if (token) db.prepare('DELETE FROM live_shares WHERE token = ? AND user_id = ?').run(token, req.userId);
  res.json({ ok: true });
});

module.exports = router;
