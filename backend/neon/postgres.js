const { Pool, Client } = require('pg');
const env = require('./env');
const bcrypt = require('bcryptjs');

// Format connection string for pg with verify-full to eliminate warnings
function formatPgUrl(url) {
  if (!url) return url;
  return url.replace('sslmode=require', 'sslmode=verify-full');
}

// 1. Connection Pool for application queries (using pooled DATABASE_URL)
const pool = new Pool({
  connectionString: formatPgUrl(env.DATABASE_URL || env.DATABASE_URL_UNPOOLED),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[Neon Postgres Pool Error]', err.message);
});

// Helper for queries
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_NEON_SQL) {
    console.log(`[Neon Postgres] executed query in ${duration}ms, rows: ${res.rowCount}`);
  }
  return res;
}

// 2. Initialize Database Tables and Schema (using direct unpooled connection for DDL)
async function initNeonDatabase(sqliteDb = null) {
  const directUrl = formatPgUrl(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL);
  if (!directUrl) {
    console.warn('[Neon Postgres] No connection string provided. Skipping initialization.');
    return;
  }

  const client = new Client({ connectionString: directUrl });
  try {
    await client.connect();
    console.log('[Neon Postgres] Connected for schema initialization...');

    // Create Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        usn TEXT UNIQUE NOT NULL,
        department TEXT NOT NULL,
        year INTEGER NOT NULL,
        cycle TEXT,
        mobile TEXT NOT NULL,
        student_id TEXT UNIQUE NOT NULL,
        is_registered INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        subject_name TEXT NOT NULL,
        subject_code TEXT,
        hour_number INTEGER DEFAULT 1,
        started_by TEXT DEFAULT 'admin',
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMPTZ,
        is_active INTEGER DEFAULT 1,
        geo_fence_enabled INTEGER DEFAULT 0,
        geo_lat DOUBLE PRECISION,
        geo_lng DOUBLE PRECISION,
        geo_radius_m INTEGER DEFAULT 100,
        geo_corners TEXT,
        pin_required INTEGER DEFAULT 1,
        static_qr_mode INTEGER DEFAULT 0,
        geo_type TEXT DEFAULT 'circle'
      );

      CREATE TABLE IF NOT EXISTS venue_configs (
        id SERIAL PRIMARY KEY,
        venue_name TEXT NOT NULL DEFAULT 'MVJCE Central Auditorium',
        geo_type TEXT NOT NULL DEFAULT 'circle',
        geo_lat DOUBLE PRECISION NOT NULL DEFAULT 12.985300,
        geo_lng DOUBLE PRECISION NOT NULL DEFAULT 77.762465,
        geo_radius_m INTEGER NOT NULL DEFAULT 100,
        geo_corners TEXT,
        mappls_api_key TEXT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS saved_locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'circle',
        geo_lat DOUBLE PRECISION,
        geo_lng DOUBLE PRECISION,
        geo_radius_m INTEGER DEFAULT 100,
        geo_corners TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS qr_tokens (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        unique_pin TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        duration_ms INTEGER DEFAULT 30000,
        issued_at BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL,
        marked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        geo_verified INTEGER DEFAULT 0,
        token_used TEXT,
        is_manual INTEGER DEFAULT 0,
        remarks TEXT,
        marked_by TEXT DEFAULT 'admin',
        UNIQUE(session_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      );

      -- Indexes for fast query performance
      CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_token ON qr_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
      CREATE INDEX IF NOT EXISTS idx_students_usn ON students(usn);
      CREATE INDEX IF NOT EXISTS idx_students_is_registered ON students(is_registered);
    `);

    // Seed default admin if empty
    const adminRes = await client.query('SELECT id FROM admins LIMIT 1');
    if (adminRes.rowCount === 0) {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || '22Mon08Aug2005';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(adminPassword, salt);
      await client.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [adminUsername, hash]);
      console.log(`[Neon Postgres] Default admin seeded: '${adminUsername}'`);
    }

    // Seed default venue if empty
    const venueRes = await client.query('SELECT id FROM venue_configs LIMIT 1');
    if (venueRes.rowCount === 0) {
      await client.query(`
        INSERT INTO venue_configs (venue_name, geo_type, geo_lat, geo_lng, geo_radius_m)
        VALUES ($1, $2, $3, $4, $5)
      `, ['MVJCE Central Auditorium', 'circle', 12.985300, 77.762465, 100]);
      console.log('[Neon Postgres] Default venue configuration seeded');
    }

    // Seed default locations if empty
    const locRes = await client.query('SELECT COUNT(*) as count FROM saved_locations');
    if (parseInt(locRes.rows[0].count, 10) === 0) {
      const campusPolygon = JSON.stringify([
        { name: 'NW Corner', lat: 12.986200, lng: 77.761800 },
        { name: 'NE Corner', lat: 12.986200, lng: 77.763400 },
        { name: 'SE Corner', lat: 12.984400, lng: 77.763400 },
        { name: 'SW Corner', lat: 12.984400, lng: 77.761800 }
      ]);
      await client.query(`
        INSERT INTO saved_locations (name, type, geo_lat, geo_lng, geo_radius_m, geo_corners, is_default)
        VALUES 
          ('MVJCE Central Auditorium', 'circle', 12.985300, 77.762465, 100, NULL, 1),
          ('MVJCE Seminar Hall 1 (Admin Block)', 'circle', 12.985100, 77.762200, 65, NULL, 0),
          ('MVJCE Main Academic Block', 'circle', 12.985450, 77.762600, 120, NULL, 0),
          ('MVJCE CSE & IT Department Labs', 'circle', 12.985600, 77.762300, 80, NULL, 0),
          ('MVJCE Campus Boundary (Polygon)', 'polygon', 12.985300, 77.762465, 250, $1, 0)
      `, [campusPolygon]);
      console.log('[Neon Postgres] Initialized 5 accurate MVJCE saved locations');
    }

    // Sync from SQLite if provided and Neon tables are empty
    if (sqliteDb) {
      await syncFromSqlite(client, sqliteDb);
    }

    console.log('[Neon Postgres] Schema verification and migrations complete.');
  } catch (err) {
    console.error('[Neon Postgres Init Error]', err);
    throw err;
  } finally {
    await client.end();
  }
}

// Sync existing SQLite data to Neon Postgres
async function syncFromSqlite(pgClient, sqliteDb) {
  try {
    const studentCountRes = await pgClient.query('SELECT COUNT(*) as count FROM students');
    const pgStudentCount = parseInt(studentCountRes.rows[0].count, 10);

    if (pgStudentCount === 0) {
      const sqliteStudents = sqliteDb.prepare('SELECT * FROM students').all();
      if (sqliteStudents.length > 0) {
        console.log(`[Neon Postgres Sync] Migrating ${sqliteStudents.length} students from SQLite...`);
        for (const s of sqliteStudents) {
          await pgClient.query(`
            INSERT INTO students (id, name, usn, department, year, cycle, mobile, student_id, is_registered, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (student_id) DO NOTHING
          `, [s.id, s.name, s.usn, s.department, s.year, s.cycle, s.mobile, s.student_id, s.is_registered, s.created_at || new Date().toISOString()]);
        }
        await pgClient.query(`SELECT setval('students_id_seq', (SELECT COALESCE(MAX(id), 1) FROM students))`);
        console.log('[Neon Postgres Sync] Students migration complete.');
      }
    }

    // Sessions
    const sessionCountRes = await pgClient.query('SELECT COUNT(*) as count FROM sessions');
    if (parseInt(sessionCountRes.rows[0].count, 10) === 0) {
      const sqliteSessions = sqliteDb.prepare('SELECT * FROM sessions').all();
      if (sqliteSessions.length > 0) {
        console.log(`[Neon Postgres Sync] Migrating ${sqliteSessions.length} sessions from SQLite...`);
        for (const s of sqliteSessions) {
          await pgClient.query(`
            INSERT INTO sessions (id, subject_name, subject_code, hour_number, started_by, started_at, ended_at, is_active, geo_fence_enabled, geo_lat, geo_lng, geo_radius_m, geo_corners, pin_required, static_qr_mode, geo_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO NOTHING
          `, [s.id, s.subject_name, s.subject_code, s.hour_number, s.started_by, s.started_at, s.ended_at, s.is_active, s.geo_fence_enabled, s.geo_lat, s.geo_lng, s.geo_radius_m, s.geo_corners, s.pin_required, s.static_qr_mode, s.geo_type || 'circle']);
        }
        await pgClient.query(`SELECT setval('sessions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sessions))`);
      }
    }

    // Attendance
    const attCountRes = await pgClient.query('SELECT COUNT(*) as count FROM attendance');
    if (parseInt(attCountRes.rows[0].count, 10) === 0) {
      const sqliteAtt = sqliteDb.prepare('SELECT * FROM attendance').all();
      if (sqliteAtt.length > 0) {
        console.log(`[Neon Postgres Sync] Migrating ${sqliteAtt.length} attendance records from SQLite...`);
        for (const a of sqliteAtt) {
          await pgClient.query(`
            INSERT INTO attendance (id, session_id, student_id, marked_at, lat, lng, geo_verified, token_used, is_manual, remarks, marked_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (session_id, student_id) DO NOTHING
          `, [a.id, a.session_id, a.student_id, a.marked_at, a.lat, a.lng, a.geo_verified, a.token_used, a.is_manual, a.remarks, a.marked_by]);
        }
        await pgClient.query(`SELECT setval('attendance_id_seq', (SELECT COALESCE(MAX(id), 1) FROM attendance))`);
      }
    }
  } catch (err) {
    console.error('[Neon Postgres Sync Error]', err.message);
  }
}

// Status check function
async function getPostgresStatus() {
  const result = await pool.query(`
    SELECT 
      current_database() as database,
      version() as version,
      NOW() as server_time,
      (SELECT COUNT(*) FROM students) as students_count,
      (SELECT COUNT(*) FROM sessions) as sessions_count,
      (SELECT COUNT(*) FROM attendance) as attendance_count,
      (SELECT COUNT(*) FROM admins) as admins_count
  `);
  return result.rows[0];
}

module.exports = {
  pool,
  query,
  initNeonDatabase,
  getPostgresStatus,
  syncFromSqlite
};
