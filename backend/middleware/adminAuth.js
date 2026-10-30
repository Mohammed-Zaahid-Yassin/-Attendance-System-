const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secure_jwt_secret_key_2024_xyz';

function parsePermissions(rawPerms, role) {
  if (role === 'super_admin') return ['*'];
  if (!rawPerms) {
    if (role === 'attendance_manager') {
      return ['view_dashboard', 'view_live_attendance', 'manage_live_attendance', 'manage_attendance_qr', 'view_students', 'view_reports', 'export_reports'];
    }
    if (role === 'qr_manager') {
      return ['view_dashboard', 'view_registration_qr', 'display_registration_qr', 'manage_attendance_qr'];
    }
    return ['view_dashboard'];
  }
  if (Array.isArray(rawPerms)) return rawPerms;
  try {
    const parsed = JSON.parse(rawPerms);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [rawPerms];
  }
}

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
    // Fetch live user record to verify account exists and is still active
    const user = db.prepare('SELECT id, username, display_name, role, permissions, is_active FROM admins WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account not found or removed.' });
    }
    if (user.is_active === 0) {
      return res.status(403).json({ error: 'Account has been deactivated. Access revoked.' });
    }

    const perms = parsePermissions(user.permissions, user.role);
    req.admin = {
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.username,
      role: user.role || 'super_admin',
      permissions: perms,
      is_active: user.is_active
    };
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
            display_name: 'Neon Administrator',
            role: 'super_admin',
            permissions: ['*'],
            is_active: 1,
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

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.admin.role === 'super_admin') {
      return next();
    }
    const perms = Array.isArray(req.admin.permissions) ? req.admin.permissions : [];
    if (perms.includes('*') || perms.includes(perm)) {
      return next();
    }
    // Role-specific baseline fallbacks
    if (req.admin.role === 'attendance_manager') {
      const allowed = ['view_dashboard', 'view_live_attendance', 'manage_live_attendance', 'manage_attendance_qr', 'view_students', 'view_reports', 'export_reports'];
      if (allowed.includes(perm)) return next();
    }
    if (req.admin.role === 'qr_manager') {
      const allowed = ['view_dashboard', 'view_registration_qr', 'display_registration_qr', 'manage_attendance_qr'];
      if (allowed.includes(perm)) return next();
    }
    return res.status(403).json({ error: `Forbidden: requires permission '${perm}'` });
  };
}

module.exports = adminAuth;
module.exports.adminAuth = adminAuth;
module.exports.requirePermission = requirePermission;
module.exports.parsePermissions = parsePermissions;
