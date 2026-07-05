const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

// Akış — en yeni 100 gönderi
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.text, p.photo, p.lat, p.lng, p.place_name AS placeName, p.route,
              p.created_at AS createdAt, p.user_id AS userId, u.display_name AS displayName,
              (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likeCount,
              EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
       FROM posts p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 100`,
    )
    .all(req.userId);
  res.json({
    posts: rows.map((r) => ({ ...r, liked: !!r.liked, route: r.route ? JSON.parse(r.route) : null })),
  });
});

// Yeni gönderi
router.post('/', (req, res) => {
  const { text, photo, lat, lng, placeName, route } = req.body || {};
  const hasText = text && String(text).trim();
  if (!hasText && !photo && !route) {
    return res.status(400).json({ error: 'Metin, fotoğraf veya rota gerekli' });
  }
  if (photo && typeof photo === 'string' && photo.length > 3_500_000) {
    return res.status(413).json({ error: 'Fotoğraf çok büyük' });
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO posts (id, user_id, text, photo, lat, lng, place_name, route)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, req.userId, hasText ? String(text).trim() : null, photo || null,
    Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null,
    placeName ? String(placeName).slice(0, 120) : null, route ? JSON.stringify(route) : null,
  );
  res.status(201).json({ id });
});

// Beğen / beğenmekten vazgeç
router.post('/:id/like', (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı' });
  const existing = db
    .prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?')
    .get(post.id, req.userId);
  if (existing) db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(post.id, req.userId);
  else db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(post.id, req.userId);
  const likeCount = db.prepare('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?').get(post.id).n;
  res.json({ liked: !existing, likeCount });
});

// Kendi gönderini sil
router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'Sadece kendi gönderini silebilirsin' });
  db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(post.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ ok: true });
});

module.exports = router;
