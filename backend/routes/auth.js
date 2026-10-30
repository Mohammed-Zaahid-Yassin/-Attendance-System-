const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { adminAuth, parsePermissions } = require('../middleware/adminAuth');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secure_jwt_secret_key_2024_xyz';

// Admin Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim());
  if (!admin) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (admin.is_active === 0) {
    return res.status(403).json({ error: 'Account has been deactivated. Please contact the administrator.' });
  }

  const isMatch = bcrypt.compareSync(password, admin.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const permissions = parsePermissions(admin.permissions, admin.role);

  const token = jwt.sign(
    { 
      id: admin.id, 
      username: admin.username,
      display_name: admin.display_name || admin.username,
      role: admin.role || 'super_admin'
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({
    success: true,
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      display_name: admin.display_name || admin.username,
      role: admin.role || 'super_admin',
      permissions
    }
  });
});

// Verify token
router.get('/verify', adminAuth, (req, res) => {
  return res.json({ valid: true, admin: req.admin });
});

// Logout
router.post('/logout', (req, res) => {
  return res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
