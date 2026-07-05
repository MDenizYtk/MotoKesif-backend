const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function isMember(groupId, userId) {
  return !!db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
}

function requireMembership(req, res, next) {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });
  if (!isMember(group.id, req.userId)) {
    return res.status(403).json({ error: 'Bu gruba üye değilsin' });
  }
  req.group = group;
  next();
}

function publicGroup(group) {
  return {
    id: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    creatorId: group.creator_id,
    createdAt: group.created_at,
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.* FROM groups g
       JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.created_at DESC`,
    )
    .all(req.userId);
  res.json({ groups: rows.map(publicGroup) });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Grup adı gerekli' });
  }
  const id = crypto.randomUUID();
  let inviteCode = generateInviteCode();
  while (db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(inviteCode)) {
    inviteCode = generateInviteCode();
  }
  db.prepare(
    'INSERT INTO groups (id, name, invite_code, creator_id) VALUES (?, ?, ?, ?)',
  ).run(id, name.trim(), inviteCode, req.userId);
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(id, req.userId);

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.status(201).json({ group: publicGroup(group) });
});

router.post('/join', (req, res) => {
  const { inviteCode } = req.body || {};
  if (!inviteCode) {
    return res.status(400).json({ error: 'Davet kodu gerekli' });
  }
  const group = db
    .prepare('SELECT * FROM groups WHERE invite_code = ?')
    .get(String(inviteCode).trim().toUpperCase());
  if (!group) {
    return res.status(404).json({ error: 'Geçersiz davet kodu' });
  }
  if (!isMember(group.id, req.userId)) {
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(
      group.id,
      req.userId,
    );
  }
  res.json({ group: publicGroup(group) });
});

router.get('/:groupId', requireMembership, (req, res) => {
  const members = db
    .prepare(
      `SELECT u.id, u.display_name as displayName FROM group_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?`,
    )
    .all(req.group.id);
  res.json({ group: publicGroup(req.group), members });
});

router.post('/:groupId/leave', requireMembership, (req, res) => {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(
    req.group.id,
    req.userId,
  );
  // Üye kalmadıysa grubu ve içeriğini temizle
  const remaining = db
    .prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?')
    .get(req.group.id).n;
  if (remaining === 0) {
    db.prepare('DELETE FROM group_messages WHERE group_id = ?').run(req.group.id);
    db.prepare('DELETE FROM group_shared_routes WHERE group_id = ?').run(req.group.id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.group.id);
  }
  res.json({ ok: true });
});

router.get('/:groupId/messages', requireMembership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, text, createdAt, userId, displayName FROM (
         SELECT gm.rowid as seq, gm.id, gm.text, gm.created_at as createdAt, gm.user_id as userId, u.display_name as displayName
         FROM group_messages gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?
         ORDER BY gm.rowid DESC
         LIMIT 200
       ) ORDER BY seq ASC`,
    )
    .all(req.group.id);
  res.json({ messages: rows });
});

router.post('/:groupId/messages', requireMembership, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Mesaj boş olamaz' });
  }
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO group_messages (id, group_id, user_id, text) VALUES (?, ?, ?, ?)',
  ).run(id, req.group.id, req.userId, text.trim());
  const row = db
    .prepare(
      `SELECT gm.id, gm.text, gm.created_at as createdAt, gm.user_id as userId, u.display_name as displayName
       FROM group_messages gm JOIN users u ON u.id = gm.user_id WHERE gm.id = ?`,
    )
    .get(id);

  const io = req.app.get('io');
  if (io) io.to(`group:${req.group.id}`).emit('message:new', row);

  res.status(201).json({ message: row });
});

router.get('/:groupId/routes', requireMembership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.name, r.points, r.distance_km as distanceKm, r.profile, r.created_at as createdAt,
              r.user_id as userId, u.display_name as displayName
       FROM group_shared_routes r
       JOIN users u ON u.id = r.user_id
       WHERE r.group_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(req.group.id);
  res.json({
    routes: rows.map(r => ({ ...r, points: JSON.parse(r.points) })),
  });
});

router.post('/:groupId/routes', requireMembership, (req, res) => {
  const { name, points, distanceKm, profile } = req.body || {};
  if (!name || !name.trim() || !Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: 'Geçersiz rota verisi' });
  }
  const validPoints = points.every(
    p => p && Number.isFinite(Number(p.latitude ?? p.lat)) && Number.isFinite(Number(p.longitude ?? p.lng)),
  );
  if (!validPoints) {
    return res.status(400).json({ error: 'Rota noktaları geçersiz' });
  }
  // Rota profili: car/bike/foot — mod izolasyonu için (bilinmeyen değer → car)
  const prof = ['car', 'bike', 'foot'].includes(profile) ? profile : 'car';
  const distance = Number(distanceKm);
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO group_shared_routes (id, group_id, user_id, name, points, distance_km, profile) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, req.group.id, req.userId, name.trim(), JSON.stringify(points), Number.isFinite(distance) ? distance : 0, prof);
  res.status(201).json({ id });
});

// ---- Etkinlikler ----
router.get('/:groupId/events', requireMembership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.id, e.title, e.place_name AS placeName, e.lat, e.lng, e.when_ts AS whenTs,
              e.user_id AS userId, u.display_name AS displayName,
              (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) AS going,
              EXISTS(SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = ?) AS mine
       FROM events e JOIN users u ON u.id = e.user_id
       WHERE e.group_id = ? ORDER BY COALESCE(e.when_ts, e.created_at) ASC`,
    )
    .all(req.userId, req.group.id);
  res.json({ events: rows.map((r) => ({ ...r, mine: !!r.mine })) });
});

router.post('/:groupId/events', requireMembership, (req, res) => {
  const { title, placeName, lat, lng, when } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Başlık gerekli' });
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO events (id, group_id, user_id, title, place_name, lat, lng, when_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, req.group.id, req.userId, String(title).trim(), placeName || null,
    Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null, when || null);
  res.status(201).json({ id });
});

// ---- Lider tablosu ----
router.post('/:groupId/scores', requireMembership, (req, res) => {
  const { maxLean, distanceKm, maxSpeed } = req.body || {};
  db.prepare(
    'INSERT INTO ride_scores (id, group_id, user_id, max_lean, distance_km, max_speed) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(crypto.randomUUID(), req.group.id, req.userId, Number(maxLean) || 0, Number(distanceKm) || 0, Number(maxSpeed) || 0);
  res.status(201).json({ ok: true });
});

router.get('/:groupId/leaderboard', requireMembership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id AS userId, u.display_name AS displayName,
              MAX(s.max_lean) AS maxLean, MAX(s.distance_km) AS maxDistance, MAX(s.max_speed) AS maxSpeed
       FROM ride_scores s JOIN users u ON u.id = s.user_id
       WHERE s.group_id = ?
       GROUP BY s.user_id ORDER BY maxLean DESC LIMIT 100`,
    )
    .all(req.group.id);
  res.json({ leaderboard: rows });
});

module.exports = router;
