const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'motokesif-dev-secret-degistir';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  JWT_SECRET ortam değişkeni ayarlanmamış! Üretimde mutlaka güçlü bir JWT_SECRET tanımlayın.');
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Yetkisiz' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Geçersiz oturum' });
  }
}

module.exports = { signToken, authMiddleware, JWT_SECRET };
