const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const fs = require('fs');
const isVercel = Boolean(process.env.VERCEL);

let dbPath = process.env.DB_PATH 
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(__dirname, process.env.DB_PATH))
  : (isVercel ? path.join('/tmp', 'attendance.db') : path.join(__dirname, 'attendance.db'));

// On Vercel serverless environment, copy bundled seed DB to /tmp if not already present
if (isVercel && !fs.existsSync(dbPath)) {
  const bundledDbPath = path.join(__dirname, 'attendance.db');
  if (fs.existsSync(bundledDbPath)) {
    try {
      fs.copyFileSync(bundledDbPath, dbPath);
    } catch (e) {
      console.warn('[DB] Could not copy bundled DB to /tmp:', e.message);
    }
  }
}

let db;
try {
  db = new Database(dbPath);
} catch (openErr) {
  console.warn(`[DB] Could not open database at '${dbPath}':`, openErr.message);
  console.log('[DB] Falling back to high-resilience in-memory SQLite database');
  db = new Database(':memory:');
}

// Enable concurrency settings; fallback to DELETE mode if WAL is unsupported (e.g. tmpfs)
try {
  db.pragma('journal_mode = WAL');
} catch (walErr) {
  try { db.pragma('journal_mode = DELETE'); } catch {}
}
try { db.pragma('synchronous = NORMAL'); } catch {}
try { db.pragma('cache_size = -64000'); } catch {} // 64MB memory cache
try { db.pragma('temp_store = MEMORY'); } catch {}
try { db.pragma('foreign_keys = ON'); } catch {}

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
      is_registered INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate students table if missing columns
  try {
    const studentCols = db.prepare(`PRAGMA table_info(students)`).all().map(c => c.name);
    if (!studentCols.includes('is_registered')) {
      db.exec(`ALTER TABLE students ADD COLUMN is_registered INTEGER DEFAULT 1`);
    }
  } catch (migErr) {
    console.error('[DB Migration students]', migErr);
  }

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
    // geo_type: 'circle' | 'polygon' — determines which validation backend uses
    if (!sessionCols.includes('geo_type')) {
      db.exec(`ALTER TABLE sessions ADD COLUMN geo_type TEXT DEFAULT 'circle'`);
    }
  } catch (migErr) {
    console.error('[DB Migration]', migErr);
  }

  // Venue Configurations Table (Persistent administrative venue coordinates & radius)
  db.exec(`
    CREATE TABLE IF NOT EXISTS venue_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_name TEXT NOT NULL DEFAULT 'MVJCE Central Auditorium',
      geo_type TEXT NOT NULL DEFAULT 'circle',
      geo_lat REAL NOT NULL DEFAULT 12.985300,
      geo_lng REAL NOT NULL DEFAULT 77.762465,
      geo_radius_m INTEGER NOT NULL DEFAULT 100,
      geo_corners TEXT,
      mappls_api_key TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate venue_configs if missing columns
  try {
    const venueCols = db.prepare(`PRAGMA table_info(venue_configs)`).all().map(c => c.name);
    if (!venueCols.includes('geo_type')) {
      db.exec(`ALTER TABLE venue_configs ADD COLUMN geo_type TEXT DEFAULT 'circle'`);
    }
    if (!venueCols.includes('geo_corners')) {
      db.exec(`ALTER TABLE venue_configs ADD COLUMN geo_corners TEXT`);
    }
  } catch (migErr) {
    console.error('[DB Migration venue_configs]', migErr);
  }

  // Seed or update default venue to accurate MVJCE campus coordinates
  const existingVenue = db.prepare('SELECT id, geo_lat FROM venue_configs LIMIT 1').get();
  if (!existingVenue) {
    db.prepare(`
      INSERT INTO venue_configs (venue_name, geo_type, geo_lat, geo_lng, geo_radius_m)
      VALUES (?, ?, ?, ?, ?)
    `).run('MVJCE Central Auditorium', 'circle', 12.985300, 77.762465, 100);
    console.log('[DB] Default venue configuration initialized: MVJCE Central Auditorium');
  } else if (existingVenue.geo_lat < 12.9840) {
    // Update legacy inaccurate coordinates to real MVJCE campus coordinates
    db.prepare(`
      UPDATE venue_configs 
      SET geo_lat = 12.985300, geo_lng = 77.762465, geo_radius_m = 100, venue_name = 'MVJCE Central Auditorium', geo_type = 'circle'
      WHERE id = ?
    `).run(existingVenue.id);
  }

  // Saved Locations Table (admin-defined persistent location presets)
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'circle',
      geo_lat REAL,
      geo_lng REAL,
      geo_radius_m INTEGER DEFAULT 100,
      geo_corners TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate saved_locations if missing columns
  try {
    const locCols = db.prepare(`PRAGMA table_info(saved_locations)`).all().map(c => c.name);
    if (!locCols.includes('description')) {
      db.exec(`ALTER TABLE saved_locations ADD COLUMN description TEXT`);
    }
    if (!locCols.includes('updated_at')) {
      // In SQLite ALTER TABLE ADD COLUMN requires constant default or NULL
      db.exec(`ALTER TABLE saved_locations ADD COLUMN updated_at DATETIME`);
    }
  } catch (migErr) {
    console.error('[DB Migration saved_locations]', migErr);
  }

  // Seed 5 accurate MVJ College of Engineering locations if none exist
  const existingLocationsCount = db.prepare('SELECT COUNT(*) as count FROM saved_locations').get().count;
  if (existingLocationsCount === 0) {
    const campusPolygon = JSON.stringify([
      { name: 'NW Corner', lat: 12.986200, lng: 77.761800 },
      { name: 'NE Corner', lat: 12.986200, lng: 77.763400 },
      { name: 'SE Corner', lat: 12.984400, lng: 77.763400 },
      { name: 'SW Corner', lat: 12.984400, lng: 77.761800 }
    ]);

    const seedStmt = db.prepare(`
      INSERT INTO saved_locations (name, type, geo_lat, geo_lng, geo_radius_m, geo_corners, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    seedStmt.run('MVJCE Central Auditorium', 'circle', 12.985300, 77.762465, 100, null, 1);
    seedStmt.run('MVJCE Seminar Hall 1 (Admin Block)', 'circle', 12.985100, 77.762200, 65, null, 0);
    seedStmt.run('MVJCE Main Academic Block', 'circle', 12.985450, 77.762600, 120, null, 0);
    seedStmt.run('MVJCE CSE & IT Department Labs', 'circle', 12.985600, 77.762300, 80, null, 0);
    seedStmt.run('MVJCE Campus Boundary (Polygon)', 'polygon', 12.985300, 77.762465, 250, campusPolygon, 0);
    console.log('[DB] Initialized 5 accurate MVJCE saved locations');
  }


  // QR Tokens Table (rotates every 30-35s)
  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      unique_pin TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      duration_ms INTEGER DEFAULT 30000,
      issued_at INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    );
  `);

  // Migrate qr_tokens if missing duration_ms or issued_at column
  try {
    const tokenCols = db.prepare(`PRAGMA table_info(qr_tokens)`).all().map(c => c.name);
    if (!tokenCols.includes('duration_ms')) {
      db.exec(`ALTER TABLE qr_tokens ADD COLUMN duration_ms INTEGER DEFAULT 30000`);
    }
    if (!tokenCols.includes('issued_at')) {
      db.exec(`ALTER TABLE qr_tokens ADD COLUMN issued_at INTEGER DEFAULT 0`);
      db.exec(`UPDATE qr_tokens SET issued_at = expires_at - duration_ms WHERE issued_at = 0 OR issued_at IS NULL`);
    }
  } catch (migErr) {
    console.error('[DB Migration qr_tokens]', migErr);
  }

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
      is_manual INTEGER DEFAULT 0,
      remarks TEXT,
      marked_by TEXT DEFAULT 'admin',
      UNIQUE(session_id, student_id),
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    );
  `);

  // Migrate attendance table if missing columns
  try {
    const attCols = db.prepare(`PRAGMA table_info(attendance)`).all().map(c => c.name);
    if (!attCols.includes('is_manual')) {
      db.exec(`ALTER TABLE attendance ADD COLUMN is_manual INTEGER DEFAULT 0`);
    }
    if (!attCols.includes('remarks')) {
      db.exec(`ALTER TABLE attendance ADD COLUMN remarks TEXT`);
    }
    if (!attCols.includes('marked_by')) {
      db.exec(`ALTER TABLE attendance ADD COLUMN marked_by TEXT DEFAULT 'admin'`);
    }
  } catch (migErr) {
    console.error('[DB Migration attendance]', migErr);
  }

  // Performance Indexes for fast lookups with 1200+ participants
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_token ON qr_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
    CREATE INDEX IF NOT EXISTS idx_students_usn ON students(usn);
    CREATE INDEX IF NOT EXISTS idx_students_is_registered ON students(is_registered);
  `);

  // Admins Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT 'Administrator',
      role TEXT DEFAULT 'super_admin',
      permissions TEXT DEFAULT '["*"]',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate admins table if missing columns
  try {
    const adminCols = db.prepare(`PRAGMA table_info(admins)`).all().map(c => c.name);
    if (!adminCols.includes('display_name')) {
      db.exec(`ALTER TABLE admins ADD COLUMN display_name TEXT DEFAULT 'Administrator'`);
    }
    if (!adminCols.includes('role')) {
      db.exec(`ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'super_admin'`);
    }
    if (!adminCols.includes('permissions')) {
      db.exec(`ALTER TABLE admins ADD COLUMN permissions TEXT DEFAULT '["*"]'`);
    }
    if (!adminCols.includes('is_active')) {
      db.exec(`ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1`);
    }
    if (!adminCols.includes('created_at')) {
      db.exec(`ALTER TABLE admins ADD COLUMN created_at DATETIME`);
    }
    if (!adminCols.includes('updated_at')) {
      db.exec(`ALTER TABLE admins ADD COLUMN updated_at DATETIME`);
    }
  } catch (migErr) {
    console.error('[DB Migration admins]', migErr);
  }

  // Create default admin if none exists
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || '22Mon08Aug2005';

  const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUsername);
  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPassword, salt);
    db.prepare(`
      INSERT INTO admins (username, password_hash, display_name, role, permissions, is_active) 
      VALUES (?, ?, 'Primary Administrator', 'super_admin', '["*"]', 1)
    `).run(adminUsername, hash);
    console.log(`[DB] Default admin initialized: username='${adminUsername}'`);
  }
}

initDb();

module.exports = db;
