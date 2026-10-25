const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const { startTokenRotator } = require('./cron/tokenRotator');

const authRoutes = require('./routes/auth');
const registrationRoutes = require('./routes/registration');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api')) {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Public endpoint for display screen to view active sessions without admin login
app.get('/api/sessions/active', (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT 
        s.*, 
        (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) as attendance_count
      FROM sessions s 
      WHERE s.is_active = 1
      ORDER BY s.id DESC
    `).all();
    return res.json({ sessions });
  } catch (err) {
    console.error('[Active Sessions Error]', err);
    return res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api', registrationRoutes);
app.use('/api', attendanceRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    engine: 'better-sqlite3 + node-cron',
    theme: 'MVJCE Spotlight'
  });
});

// Serve Frontend in Production / Docker
const fs = require('fs');
const clientDistPath = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '../frontend/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  console.log(`[Static] Serving frontend from: ${clientDistPath}`);
}

// Start Background Cron Engine
startTokenRotator();

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Student Attendance System Backend Running on Port ${PORT}`);
  console.log(`📁 Database: SQLite (better-sqlite3)`);
  console.log(`⏰ Cron Engine: node-cron (rotates token/PIN every 19s)`);
  console.log(`🔑 Registration Secret Key: ${process.env.REGISTRATION_KEY || 'STATIC_REG_QR_KEY_SECRET_7890'}`);
  console.log(`👤 Default Admin: username='admin', password='${process.env.ADMIN_PASSWORD || 'admin123'}'`);
  console.log(`=======================================================`);
});
