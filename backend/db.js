const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'attendance.db');
const db = new Database(dbPath);

// Enable WAL mode & high-performance concurrency settings for 1200+ attendees
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB memory cache
db.pragma('temp_store = MEMORY');
db.pragma('foreign_keys = ON');

// Initialize database tables
function initDb() {
  // Students Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      usn TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL,
      year INTEGER NOT NULL,
      cycle TEXT,
      mobile TEXT NOT NULL,
      student_id TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sessions Table (supports 5 subjects / hours, 4-corner polygon geofence, PIN requirement toggle, and static QR mode)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_name TEXT NOT NULL,
      subject_code TEXT,
      hour_number INTEGER DEFAULT 1,
      started_by TEXT DEFAULT 'admin',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      is_active INTEGER DEFAULT 1,
      geo_fence_enabled INTEGER DEFAULT 0,
      geo_lat REAL,
      geo_lng REAL,
      geo_radius_m INTEGER DEFAULT 100,
      geo_corners TEXT,
      pin_required INTEGER DEFAULT 1,
      static_qr_mode INTEGER DEFAULT 0
    );
  `);

  // Run dynamic schema migrations for existing database files
  try {
    const sessionCols = db.prepare(`PRAGMA table_info(sessions)`).all().map(c => c.name);
    if (!sessionCols.includes('hour_number')) {
      db.exec(`ALTER TABLE sessions ADD COLUMN hour_number INTEGER DEFAULT 1`);
    }
    if (!sessionCols.includes('geo_corners')) {
      db.exec(`ALTER TABLE sessions ADD COLUMN geo_corners TEXT`);
    }
    if (!sessionCols.includes('pin_required')) {
      db.exec(`ALTER TABLE sessions ADD COLUMN pin_required INTEGER DEFAULT 1`);
    }
    if (!sessionCols.includes('static_qr_mode')) {
      db.exec(`ALTER TABLE sessions ADD COLUMN static_qr_mode INTEGER DEFAULT 0`);
    }
  } catch (migErr) {
    console.error('[DB Migration]', migErr);
  }

  // Venue Configurations Table (Persistent administrative venue coordinates & radius)
  db.exec(`
    CREATE TABLE IF NOT EXISTS venue_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_name TEXT NOT NULL DEFAULT 'MVJCE Central Auditorium',
      geo_lat REAL NOT NULL DEFAULT 12.9830,
      geo_lng REAL NOT NULL DEFAULT 77.7600,
      geo_radius_m INTEGER NOT NULL DEFAULT 100,
      geo_corners TEXT,
      mappls_api_key TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default venue if none exists
  const existingVenue = db.prepare('SELECT id FROM venue_configs LIMIT 1').get();
  if (!existingVenue) {
    db.prepare(`
      INSERT INTO venue_configs (venue_name, geo_lat, geo_lng, geo_radius_m)
      VALUES (?, ?, ?, ?)
    `).run('MVJCE Central Auditorium', 12.983020, 77.759970, 100);
    console.log('[DB] Default venue configuration initialized: MVJCE Central Auditorium');
  }


  // QR Tokens Table (rotates every 18-20s)
  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      unique_pin TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    );
  `);

  // Attendance Table (UNIQUE constraint per session and student_id prevents double-marking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      lat REAL,
      lng REAL,
      geo_verified INTEGER DEFAULT 0,
      token_used TEXT,
      UNIQUE(session_id, student_id),
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    );
  `);

  // Performance Indexes for fast lookups with 1200+ participants
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_token ON qr_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
    CREATE INDEX IF NOT EXISTS idx_students_usn ON students(usn);
  `);

  // Admins Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  // Create default admin if none exists
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUsername);
  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPassword, salt);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(adminUsername, hash);
    console.log(`[DB] Default admin initialized: username='${adminUsername}'`);
  }
}

initDb();

module.exports = db;
