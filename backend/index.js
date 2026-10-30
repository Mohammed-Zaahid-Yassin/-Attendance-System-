const express = require('express');
const cors = require('cors');
const path = require('path');
require('./neon/env');
const db = require('./db');
const { startTokenRotator } = require('./cron/tokenRotator');
const { initNeonDatabase } = require('./neon/postgres');

const authRoutes = require('./routes/auth');
const registrationRoutes = require('./routes/registration');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const neonRoutes = require('./neon/routes');

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
app.use('/api/neon', neonRoutes);

// Fallback mounts in case proxy rewrites strip the /api prefix
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/neon', neonRoutes);

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cloud: 'Neon (Postgres, Auth, Storage, Functions, Realtime)',
    engine: 'Neon Postgres + better-sqlite3 + node-cron',
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

// Start Background Cron Engine (only for standalone / Docker long-running processes)
if (!process.env.VERCEL) {
  startTokenRotator();
}

// Initialize Neon Cloud Database asynchronously
if (!process.env.VERCEL) {
  initNeonDatabase(db).catch(err => {
    console.warn('[Neon Postgres] Startup initialization note:', err.message);
  });
}

// Start Server in standalone mode (local dev, Docker)
let server = null;
if (!process.env.VERCEL && require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Student Attendance System Backend Running on Port ${PORT}`);
    console.log(`☁️ Cloud Platform: Neon (Postgres, Auth, Storage, Functions, Realtime)`);
    console.log(`📁 Database: Neon Lakebase Postgres (ep-nameless-mountain-az2j1d5a)`);
    console.log(`⏰ Cron Engine: node-cron (rotates token/PIN every 19s)`);
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

    // Force exit if not closed within 10 seconds
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
