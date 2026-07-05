const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

const TYPES = ['cukur', 'radar', 'kaza', 'cakil', 'engel', 'buz'];

// Son 6 saatteki tehlikeler
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT h.id, h.type, h.lat, h.lng, h.note, h.created_at AS createdAt, u.display_name AS displayName
       FROM hazards h JOIN users u ON u.id = h.user_id
       WHERE h.created_at > datetime('now', '-6 hours')
       ORDER BY h.created_at DESC LIMIT 300`,
    )
    .all();
  res.json({ hazards: rows });
});

router.post('/', (req, res) => {
  const { type, lat, lng, note } = req.body || {};
  if (!TYPES.includes(type) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Geçersiz tehlike verisi' });
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO hazards (id, user_id, type, lat, lng, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.userId, type, lat, lng, note ? String(note).slice(0, 120) : null);
  const row = db
    .prepare(
      `SELECT h.id, h.type, h.lat, h.lng, h.note, h.created_at AS createdAt, u.display_name AS displayName
       FROM hazards h JOIN users u ON u.id = h.user_id WHERE h.id = ?`,
    )
    .get(id);
  const io = req.app.get('io');
  if (io) io.emit('hazard:new', row);
  res.status(201).json({ hazard: row });
});

module.exports = router;
