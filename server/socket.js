const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET } = require('./auth');

function isMember(groupId, userId) {
  return !!db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
}

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Yetkisiz'));
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.userId = payload.sub;
      next();
    } catch (_) {
      next(new Error('Geçersiz oturum'));
    }
  });

  io.on('connection', socket => {
    socket.on('group:join', ({ groupId }) => {
      if (groupId && isMember(groupId, socket.userId)) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on('group:leave', ({ groupId }) => {
      if (groupId) socket.leave(`group:${groupId}`);
    });
  });
}

module.exports = { setupSocket };
