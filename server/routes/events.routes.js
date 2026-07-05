const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

function isMember(groupId, userId) {
  return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

router.post('/:id/rsvp', (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Etkinlik bulunamadı' });
  if (!isMember(ev.group_id, req.userId)) return res.status(403).json({ error: 'Gruba üye değilsin' });
  const has = db.prepare('SELECT 1 FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(ev.id, req.userId);
  if (has) db.prepare('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?').run(ev.id, req.userId);
  else db.prepare('INSERT INTO event_rsvps (event_id, user_id) VALUES (?, ?)').run(ev.id, req.userId);
  const going = db.prepare('SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ?').get(ev.id).n;
  res.json({ mine: !has, going });
});

module.exports = router;
