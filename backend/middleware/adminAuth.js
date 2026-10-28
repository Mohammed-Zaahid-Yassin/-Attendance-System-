const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secure_jwt_secret_key_2024_xyz';

function adminAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  // Fallback to query param if not in header (e.g. file export downloads)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing. Please log in as admin.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    return next();
  } catch (err) {
    // If not a valid JWT format (not 3 base64 segments), reject synchronously immediately
    if (typeof token !== 'string' || token.split('.').length !== 3 || err.message === 'jwt malformed') {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    // Attempt verification with Neon Auth JWKS if standard JWT verification fails
    const { verifyNeonToken } = require('../neon/auth');
    verifyNeonToken(token)
      .then((neonRes) => {
        if (neonRes.valid) {
          req.admin = {
            id: neonRes.user.sub || 1,
            username: neonRes.user.email || neonRes.user.username || 'neon_admin',
            neonUser: neonRes.user
          };
          return next();
        }
        return res.status(401).json({ error: 'Invalid or expired session token' });
      })
      .catch(() => {
        return res.status(401).json({ error: 'Invalid or expired session token' });
      });
  }
}

module.exports = adminAuth;
