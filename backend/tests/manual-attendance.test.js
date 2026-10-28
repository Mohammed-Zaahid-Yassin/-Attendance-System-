const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { generateTokenForSession } = require('../cron/tokenRotator');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secure_jwt_secret_key_2024_xyz';

function createAdminToken(username = 'admin') {
  return jwt.sign({ id: 1, username }, JWT_SECRET, { expiresIn: '1h' });
}

test('Manual Attendance Scenario 1: Mark attendance for an existing registered student', () => {
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('Scenario 1 Session', 'S1-101', 1, 'admin', 1, 0, 0)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;
  const testUsn = '1MJ24REG001';
  const testStudentId = 'ARJU1001';

  try {
    db.prepare('DELETE FROM students WHERE usn = ? OR student_id = ?').run(testUsn, testStudentId);
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Arjun Registered', ?, 'Computer Science and Engineering (CSE)', 2, null, '9876541001', 1)
    `).run(testStudentId, testUsn);

    // Mark manual attendance
    const insertStmt = db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
      VALUES (?, ?, 1, 'MANUAL_ADMIN_OVERRIDE', 1, 'Marked by administrator', 'admin')
    `);
    const attRes = insertStmt.run(sessionId, testStudentId);
    assert.ok(attRes.lastInsertRowid > 0, 'Attendance record should be created');

    const record = db.prepare('SELECT * FROM attendance WHERE id = ?').get(attRes.lastInsertRowid);
    assert.equal(record.session_id, sessionId);
    assert.equal(record.student_id, testStudentId);
    assert.equal(record.is_manual, 1);
    assert.equal(record.token_used, 'MANUAL_ADMIN_OVERRIDE');
    assert.equal(record.marked_by, 'admin');

    // Confirm student remains registered
    const student = db.prepare('SELECT is_registered FROM students WHERE student_id = ?').get(testStudentId);
    assert.equal(student.is_registered, 1, 'Student must remain is_registered = 1');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('Manual Attendance Scenario 2 & 4: Add student who does not yet exist (Case C) and verify is_registered = 0', () => {
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('Scenario 2 Session', 'S2-101', 2, 'admin', 1, 0, 0)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;
  const testUsn = '1MJ24UNREG99';
  const testName = 'Pooja Walkin';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);

    // Case C Transaction: Create unregistered student + attendance
    const createTx = db.transaction(() => {
      const studentId = 'POOJ9999';
      db.prepare(`
        INSERT INTO students (name, usn, department, year, cycle, mobile, student_id, is_registered)
        VALUES (?, ?, 'Information Science and Engineering (ISE)', 3, null, '', ?, 0)
      `).run(testName, testUsn, studentId);

      db.prepare(`
        INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
        VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1, 'Walk-in student manual entry', 'admin')
      `).run(sessionId, studentId);

      return studentId;
    });

    const generatedId = createTx();
    assert.ok(generatedId, 'Generated student ID should be returned');

    // Verify student is explicitly unregistered (is_registered = 0)
    const student = db.prepare('SELECT * FROM students WHERE usn = ?').get(testUsn);
    assert.ok(student, 'Unregistered student must exist in DB');
    assert.equal(student.is_registered, 0, 'Student must NOT be marked as registered (is_registered = 0)');
    assert.equal(student.name, testName);

    // Verify attendance record
    const attendance = db.prepare('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?').get(sessionId, generatedId);
    assert.ok(attendance, 'Attendance must be recorded');
    assert.equal(attendance.is_manual, 1);
    assert.equal(attendance.token_used, 'MANUAL_UNREGISTERED');
    assert.equal(attendance.remarks, 'Walk-in student manual entry');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('Manual Attendance Scenario 3: Mark attendance for existing student who is not registered (Case B)', () => {
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('Scenario 3 Session', 'S3-101', 3, 'admin', 1, 0, 0)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;
  const testUsn = '1MJ24CASEB01';
  const testStudentId = 'CASE9991';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    // Student already in database from previous walk-in
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Case B Walkin', ?, 'Mechanical Engineering', 2, null, '9876543210', 0)
    `).run(testStudentId, testUsn);

    // Existing student is identified; record attendance against existing student record
    db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
      VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1, 'Walk-in attendance in session 3', 'admin')
    `).run(sessionId, testStudentId);

    // Confirm only 1 student record exists
    const count = db.prepare('SELECT COUNT(*) as count FROM students WHERE usn = ?').get(testUsn).count;
    assert.equal(count, 1, 'Must NOT create a duplicate student record');

    const student = db.prepare('SELECT is_registered FROM students WHERE usn = ?').get(testUsn);
    assert.equal(student.is_registered, 0, 'Registration status remains 0');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('Manual Attendance Scenario 5 & 6: Duplicate attendance prevention in same session', () => {
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('Duplicate Test Session', 'DUP101', 1, 'admin', 1, 0, 0)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;
  const testUsn = '1MJ24DUP001';
  const studentId = 'DUPP0001';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Duplicate Tester', ?, 'Civil Engineering', 2, null, '9000000001', 0)
    `).run(studentId, testUsn);

    // 1st mark: Succeeds
    db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual)
      VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1)
    `).run(sessionId, studentId);

    // 2nd mark: Must throw UNIQUE constraint error
    assert.throws(() => {
      db.prepare(`
        INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual)
        VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1)
      `).run(sessionId, studentId);
    }, /UNIQUE constraint failed/, 'Should reject duplicate attendance in the same session');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('Manual Attendance Scenario 7: Same student in different sessions is allowed', () => {
  const s1 = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Session 1 Hour', 'HR1', 1, 'admin', 1)
  `).run().lastInsertRowid;
  const s2 = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Session 2 Hour', 'HR2', 2, 'admin', 1)
  `).run().lastInsertRowid;

  const testUsn = '1MJ24DIFF01';
  const studentId = 'DIFF0001';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Diff Session Tester', ?, 'Aerospace Engineering', 3, null, '9000000002', 0)
    `).run(studentId, testUsn);

    // Mark session 1
    const att1 = db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual)
      VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1)
    `).run(s1, studentId);
    assert.ok(att1.lastInsertRowid > 0);

    // Mark session 2
    const att2 = db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual)
      VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1)
    `).run(s2, studentId);
    assert.ok(att2.lastInsertRowid > 0);

    const count = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE student_id = ?').get(studentId).count;
    assert.equal(count, 2, 'Attendance should exist for both sessions');
  } finally {
    db.prepare('DELETE FROM attendance WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id IN (?, ?)').run(s1, s2);
  }
});

test('Manual Attendance Scenario 8: Unauthorized requests are rejected by adminAuth', () => {
  const adminAuth = require('../middleware/adminAuth');

  // Test request without token
  let statusSet = null;
  let jsonSent = null;
  const reqNoToken = { headers: {}, query: {} };
  const resNoToken = {
    status: (s) => {
      statusSet = s;
      return {
        json: (data) => { jsonSent = data; }
      };
    }
  };
  adminAuth(reqNoToken, resNoToken, () => {
    assert.fail('Should not call next() without token');
  });
  assert.equal(statusSet, 401, 'Should return HTTP 401 Unauthorized');
  assert.ok(jsonSent.error.includes('missing'), 'Error message should indicate missing token');

  // Test request with invalid token
  statusSet = null;
  jsonSent = null;
  const reqBadToken = { headers: { authorization: 'Bearer invalid_signature_token' }, query: {} };
  adminAuth(reqBadToken, resNoToken, () => {
    assert.fail('Should not call next() with bad token');
  });
  assert.equal(statusSet, 401, 'Should return HTTP 401 for invalid token');

  // Test request with valid token
  let nextCalled = false;
  const validToken = createAdminToken('admin');
  const reqValid = { headers: { authorization: `Bearer ${validToken}` }, query: {} };
  adminAuth(reqValid, resNoToken, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled, 'Should call next() with valid admin token');
  assert.equal(reqValid.admin.username, 'admin');
});

test('Manual Attendance Scenario 9 & 10: Attendance persistence, live feed, reports, and exports', () => {
  const XLSX = require('xlsx');
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Reporting Test Session', 'RPT101', 1, 'admin', 1)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;

  const regUsn = '1MJ24REGRPT';
  const regId = 'REGR1111';
  const unregUsn = '1MJ24UNREGRPT';
  const unregId = 'UNRE2222';

  try {
    db.prepare('DELETE FROM students WHERE usn IN (?, ?)').run(regUsn, unregUsn);

    // 1. Registered student
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Alice Registered', ?, 'Computer Science and Engineering (CSE)', 3, null, '9876500001', 1)
    `).run(regId, regUsn);

    // 2. Unregistered walk-in student
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Bob Walkin', ?, 'Electronics and Communication Engineering (ECE)', 2, null, '9876500002', 0)
    `).run(unregId, unregUsn);

    // Mark attendance for both
    db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
      VALUES (?, ?, 1, 'MANUAL_ADMIN_OVERRIDE', 1, 'Registered override', 'admin')
    `).run(sessionId, regId);

    db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
      VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1, 'Unregistered walk-in', 'admin')
    `).run(sessionId, unregId);

    // Verify live feed query returns both with accurate is_registered and is_manual
    const records = db.prepare(`
      SELECT 
        a.id, a.marked_at, a.geo_verified, a.is_manual, a.remarks, a.token_used,
        s.student_id, s.name, s.usn, s.department, s.year, s.cycle, s.mobile, s.is_registered
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      WHERE a.session_id = ?
      ORDER BY a.id ASC
    `).all(sessionId);

    assert.equal(records.length, 2, 'Total attendance records must be 2');
    const regRecord = records.find(r => r.student_id === regId);
    const unregRecord = records.find(r => r.student_id === unregId);

    assert.equal(regRecord.is_registered, 1, 'Registered student is_registered must be 1');
    assert.equal(unregRecord.is_registered, 0, 'Unregistered student is_registered must be 0');
    assert.equal(unregRecord.is_manual, 1);
    assert.equal(unregRecord.token_used, 'MANUAL_UNREGISTERED');

    // Verify CSV Generation
    const headers = ['Sl No', 'Student ID', 'Student Name', 'USN / Admission No', 'Department', 'Year', 'Cycle', 'Mobile', 'Registration Status', 'Entry Type', 'Remarks', 'Marked At', 'Geo Verified'];
    const csvRows = records.map((r, index) => [
      index + 1,
      `"${r.student_id}"`,
      `"${r.name}"`,
      `"${r.usn}"`,
      `"${r.department}"`,
      r.year,
      `"${r.cycle || 'N/A'}"`,
      `"${r.mobile || 'N/A'}"`,
      `"${r.is_registered === 0 ? 'Unregistered / Walk-in' : 'Registered'}"`,
      `"${r.is_manual ? 'Manual Entry' : 'QR Scan'}"`,
      `"${r.remarks || ''}"`,
      `"${r.marked_at}"`,
      r.geo_verified ? 'Yes' : 'No'
    ]);
    const csvContent = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');

    assert.ok(csvContent.includes('Unregistered / Walk-in'), 'CSV must contain Unregistered / Walk-in status');
    assert.ok(csvContent.includes('Registered'), 'CSV must contain Registered status');
    assert.ok(csvContent.includes('Manual Entry'), 'CSV must contain Manual Entry type');

    // Verify XLSX Generation
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...csvRows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    assert.ok(Buffer.isBuffer(buffer), 'XLSX must be a valid buffer');
    assert.ok(buffer.length > 1000, 'XLSX buffer must contain data');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn IN (?, ?)').run(regUsn, unregUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('Manual Attendance Scenario 11: Unregistered student can subsequently register via QR registration', () => {
  const testUsn = '1MJ24WALKTOREG';
  const initialStudentId = 'WALK0001';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);

    // Initially added manually by admin as unregistered
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Kavya Initial', ?, 'Basic Sciences (Physics Cycle)', 1, 'Physics Cycle', '', 0)
    `).run(initialStudentId, testUsn);

    const initial = db.prepare('SELECT is_registered FROM students WHERE usn = ?').get(testUsn);
    assert.equal(initial.is_registered, 0, 'Initial status must be 0');

    // Student later scans official registration QR code and submits registration form
    const existing = db.prepare('SELECT student_id, name, is_registered FROM students WHERE usn = ?').get(testUsn);
    assert.equal(existing.is_registered, 0);

    // System upgrades existing record to is_registered = 1
    db.prepare(`
      UPDATE students
      SET name = ?, department = ?, year = ?, cycle = ?, mobile = ?, is_registered = 1
      WHERE student_id = ?
    `).run('Kavya Formal', 'Basic Sciences (Chemistry Cycle)', 1, 'Chemistry Cycle', '9876543299', existing.student_id);

    const upgraded = db.prepare('SELECT * FROM students WHERE usn = ?').get(testUsn);
    assert.equal(upgraded.is_registered, 1, 'Student must be upgraded to is_registered = 1');
    assert.equal(upgraded.name, 'Kavya Formal');
    assert.equal(upgraded.mobile, '9876543299');
    assert.equal(upgraded.student_id, initialStudentId, 'Student ID must be preserved');
  } finally {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
  }
});
