const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

/* Yönetici erişimi: X-Admin-Key başlığı ADMIN_KEY ortam değişkeniyle eşleşmeli.
   Anahtar deploy scriptinde /opt/motokesif/admin.key dosyasından üretilip verilir. */
const ADMIN_KEY = process.env.ADMIN_KEY || '';

function safeEq(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

router.use((req, res, next) => {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'ADMIN_KEY tanımlı değil — deploy scriptini güncelle' });
  const k = req.headers['x-admin-key'] || '';
  if (!safeEq(k, ADMIN_KEY)) return res.status(401).json({ error: 'Yetkisiz' });
  next();
});

// Genel bakış — sayılar + son 7 günün yeni üyeleri
router.get('/overview', (req, res) => {
  const c = (sql) => db.prepare(sql).get().n;
  res.json({
    users: c('SELECT COUNT(*) n FROM users'),
    newUsers7d: c("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now','-7 days')"),
    groups: c('SELECT COUNT(*) n FROM groups'),
    posts: c('SELECT COUNT(*) n FROM posts'),
    likes: c('SELECT COUNT(*) n FROM post_likes'),
    messages: c('SELECT COUNT(*) n FROM group_messages'),
    sharedRoutes: c('SELECT COUNT(*) n FROM group_shared_routes'),
    hazards: c('SELECT COUNT(*) n FROM hazards'),
    events: c('SELECT COUNT(*) n FROM events'),
    liveShares: c('SELECT COUNT(*) n FROM live_shares'),
  });
});

// Kullanıcı listesi — üyelik, içerik sayıları ve son etkinlik zamanı
router.get('/users', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.display_name AS displayName, u.created_at AS createdAt,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS postCount,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.user_id = u.id) AS groupCount,
              (SELECT COUNT(*) FROM group_shared_routes r WHERE r.user_id = u.id) AS routeCount,
              (SELECT COUNT(*) FROM hazards h WHERE h.user_id = u.id) AS hazardCount,
              (SELECT MAX(t) FROM (
                 SELECT MAX(created_at) t FROM posts WHERE user_id = u.id
                 UNION ALL SELECT MAX(created_at) FROM group_messages WHERE user_id = u.id
                 UNION ALL SELECT MAX(created_at) FROM hazards WHERE user_id = u.id
                 UNION ALL SELECT MAX(created_at) FROM group_shared_routes WHERE user_id = u.id
              )) AS lastActivity
       FROM users u ORDER BY u.created_at DESC LIMIT 500`,
    )
    .all();
  res.json({ users: rows });
});

// Gruplar — üye sayısı ve kurucu adıyla
router.get('/groups', (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.invite_code AS inviteCode, g.created_at AS createdAt,
              u.display_name AS creatorName,
              (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS memberCount,
              (SELECT COUNT(*) FROM group_messages ms WHERE ms.group_id = g.id) AS messageCount
       FROM groups g LEFT JOIN users u ON u.id = g.creator_id
       ORDER BY g.created_at DESC LIMIT 200`,
    )
    .all();
  res.json({ groups: rows });
});

// Son gönderiler — moderasyon görünümü (fotoğrafın kendisi değil, var/yok bilgisi)
router.get('/posts', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.text, p.place_name AS placeName, p.created_at AS createdAt,
              (p.photo IS NOT NULL) AS hasPhoto, (p.route IS NOT NULL) AS hasRoute,
              u.display_name AS displayName, u.email,
              (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likeCount
       FROM posts p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 50`,
    )
    .all();
  res.json({ posts: rows.map((r) => ({ ...r, hasPhoto: !!r.hasPhoto, hasRoute: !!r.hasRoute })) });
});

// Gönderi sil (moderasyon)
router.delete('/posts/:id', (req, res) => {
  db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(req.params.id);
  const r = db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Gönderi bulunamadı' });
  res.json({ ok: true });
});

module.exports = router;
