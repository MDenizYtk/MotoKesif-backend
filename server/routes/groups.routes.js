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

router.get('/:groupId/messages', requireMembership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT gm.id, gm.text, gm.created_at as createdAt, gm.user_id as userId, u.display_name as displayName
       FROM group_messages gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.created_at ASC
       LIMIT 200`,
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
      `SELECT r.id, r.name, r.points, r.distance_km as distanceKm, r.created_at as createdAt,
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
  const { name, points, distanceKm } = req.body || {};
  if (!name || !Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: 'Geçersiz rota verisi' });
  }
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO group_shared_routes (id, group_id, user_id, name, points, distance_km) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, req.group.id, req.userId, name.trim(), JSON.stringify(points), distanceKm || 0);
  res.status(201).json({ id });
});

module.exports = router;
