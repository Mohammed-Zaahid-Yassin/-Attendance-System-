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

// Fallback mounts in case proxy rewrites strip the /api prefix
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cloud: 'Fly.io (Persistent Volume /data)',
    engine: 'SQLite (better-sqlite3) + node-cron',
    edition: 'sqlite',
    theme: 'MVJCE Spotlight'
  });
});

// Serve Frontend in Production / Container
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

// Start Server in standalone mode
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 Spotlight Attendance System (SQLite Edition) Running on Port ${PORT}`);
    console.log(`📁 Database: SQLite (better-sqlite3 WAL mode)`);
    console.log(`⏰ Cron Engine: node-cron (rotates token/PIN every 30-35s)`);
    console.log(`🔑 Registration Secret Key: ${process.env.REGISTRATION_KEY || 'STATIC_REG_QR_KEY_SECRET_7890'}`);
    console.log(`👤 Default Admin: username='admin'`);
    console.log(`=======================================================`);
  });
}

// Graceful application shutdown
function gracefulShutdown(signal) {
  console.log(`\n[Process] Received ${signal}. Starting graceful shutdown...`);
  try {
    const { stopTokenRotator } = require('./cron/tokenRotator');
    stopTokenRotator();
  } catch {}

  if (server) {
    server.close(() => {
      console.log('[Process] HTTP server closed.');
      try {
        if (db && typeof db.close === 'function') {
          db.close();
          console.log('[Process] SQLite database connection closed.');
        }
      } catch (err) {
        console.warn('[Process] Error closing database:', err.message);
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Process] Forceful shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
