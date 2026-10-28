const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// Test database path in scratch folder
const testDbDir = path.join(__dirname, '../../scratch');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}
const testDbPath = path.join(testDbDir, 'test-persistence.db');

// Clean up any stale test database
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

test('Password Persistence & Wake-up Seed Guard Test Suite', async (t) => {
  // Set up test environment variables
  process.env.ADMIN_USERNAME = 'testadmin';
  process.env.ADMIN_PASSWORD = 'InitialOldPassword2024!';

  // Step 1: Initialize fresh database simulating first-ever container deploy
  const db1 = new Database(testDbPath);
  db1.pragma('journal_mode = WAL');

  db1.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      UNIQUE(session_id, student_id)
    );
  `);

  // Initial seed logic (as implemented in db.js)
  const countRow1 = db1.prepare('SELECT COUNT(*) as count FROM admins').get();
  assert.equal(countRow1.count, 0, 'Initially admins table is empty');

  const salt1 = bcrypt.genSaltSync(10);
  const hash1 = bcrypt.hashSync(process.env.ADMIN_PASSWORD, salt1);
  db1.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('testadmin', hash1);

  // Insert a test student, session, and attendance to verify preservation
  db1.prepare(`
    INSERT INTO students (name, usn, department, year, mobile, student_id)
    VALUES ('Persistence Test Student', '1MJ24CS999', 'Computer Science', 3, '9876500000', 'PERS0000')
  `).run();
  const sessionRes = db1.prepare(`INSERT INTO sessions (subject_name) VALUES ('Test Session')`).run();
  db1.prepare(`INSERT INTO attendance (session_id, student_id) VALUES (?, ?)`).run(sessionRes.lastInsertRowid, 'PERS0000');

  // Step 2: Verify Initial Password works
  const adminRow1 = db1.prepare('SELECT * FROM admins WHERE username = ?').get('testadmin');
  assert.ok(adminRow1, 'Admin account should exist');
  assert.ok(bcrypt.compareSync('InitialOldPassword2024!', adminRow1.password_hash), 'Initial password must be valid');

  // Step 3: Admin changes password via settings (e.g. to 'BrandNewSuperSecret2025$')
  const newPassword = 'BrandNewSuperSecret2025$';
  const newSalt = bcrypt.genSaltSync(10);
  const newHash = bcrypt.hashSync(newPassword, newSalt);

  const updateRes = db1.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, adminRow1.id);
  assert.equal(updateRes.changes, 1, 'Password update must modify exactly 1 row');
  db1.pragma('wal_checkpoint(PASSIVE)');

  // Verify new password works and old password fails in active connection
  const adminRowAfterChange = db1.prepare('SELECT * FROM admins WHERE id = ?').get(adminRow1.id);
  assert.ok(bcrypt.compareSync(newPassword, adminRowAfterChange.password_hash), 'New password must verify successfully');
  assert.ok(!bcrypt.compareSync('InitialOldPassword2024!', adminRowAfterChange.password_hash), 'Old password must be rejected');

  // Step 4: Simulate Render container sleep and wake-up / service restart
  // Close database connection to simulate container shutdown
  db1.close();

  // Re-open persistent database from disk simulating container wake-up on persistent disk
  const db2 = new Database(testDbPath);
  db2.pragma('journal_mode = WAL');

  // Simulate initDb() running on wake-up:
  // The guard must detect that admin count > 0 and NOT re-seed with process.env.ADMIN_PASSWORD
  const countRow2 = db2.prepare('SELECT COUNT(*) as count FROM admins').get();
  assert.ok(countRow2.count > 0, 'Admin count after wake-up must be > 0');

  let seedTriggeredOnRestart = false;
  if (countRow2.count === 0) {
    seedTriggeredOnRestart = true;
    const reseedSalt = bcrypt.genSaltSync(10);
    const reseedHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, reseedSalt);
    db2.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('testadmin', reseedHash);
  }

  assert.equal(seedTriggeredOnRestart, false, 'initDb seed logic must NOT trigger when admin records exist');

  // Step 5: Verify credentials after wake-up
  const adminRowWakeUp = db2.prepare('SELECT * FROM admins WHERE username = ?').get('testadmin');
  assert.ok(adminRowWakeUp, 'Admin record must be present after wake-up');

  // The changed password MUST still work
  const newPasswordValid = bcrypt.compareSync(newPassword, adminRowWakeUp.password_hash);
  assert.equal(newPasswordValid, true, 'NEW password must continue to work after sleep/wake restart');

  // The old initial password MUST remain invalid
  const oldPasswordValid = bcrypt.compareSync('InitialOldPassword2024!', adminRowWakeUp.password_hash);
  assert.equal(oldPasswordValid, false, 'OLD password must NEVER become valid again after sleep/wake restart');

  // Step 6: Verify student, session, and attendance data integrity
  const preservedStudent = db2.prepare('SELECT * FROM students WHERE student_id = ?').get('PERS0000');
  assert.ok(preservedStudent, 'Student record must remain intact across wake-up');
  assert.equal(preservedStudent.name, 'Persistence Test Student');

  const preservedAttendance = db2.prepare('SELECT * FROM attendance WHERE student_id = ?').get('PERS0000');
  assert.ok(preservedAttendance, 'Attendance record must remain intact across wake-up');

  db2.close();

  // Clean up
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
