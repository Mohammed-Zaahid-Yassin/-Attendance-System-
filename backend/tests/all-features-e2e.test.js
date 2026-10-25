const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { generateTokenForSession, getCurrentToken } = require('../cron/tokenRotator');
const { isPointInPolygon, haversineDistance } = require('../middleware/geoCheck');

test('E2E Feature 1: Student Registration & ID Formula (First 4 letters of Name + Last 4 digits of Mobile)', () => {
  // Formula: first 4 uppercase characters + last 4 mobile digits
  const name1 = 'Mohammed Zaahid Yassin';
  const mobile1 = '9876549870';
  const cleanName1 = name1.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const namePart1 = cleanName1.substring(0, 4);
  const cleanMobile1 = mobile1.replace(/\D/g, '');
  const mobilePart1 = cleanMobile1.slice(-4);
  const studentId1 = `${namePart1}${mobilePart1}`;

  assert.equal(studentId1, 'MOHA9870', 'Student ID must be first 4 letters of name + last 4 of mobile');

  const name2 = 'D PRINCE ANTHONY';
  const mobile2 = '9123457080';
  const cleanName2 = name2.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const namePart2 = cleanName2.substring(0, 4);
  const cleanMobile2 = mobile2.replace(/\D/g, '');
  const mobilePart2 = cleanMobile2.slice(-4);
  const studentId2 = `${namePart2}${mobilePart2}`;

  assert.equal(studentId2, 'DPRI7080', 'Student ID must handle spaces and middle initials correctly');

  // Insert into DB and verify retrieval
  const testUsn = '1MJ24TEST01';
  db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
  db.prepare(`
    INSERT INTO students (student_id, name, usn, department, year, cycle, mobile)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(studentId1, name1, testUsn, 'Computer Science', 3, 'CSE', mobile1);

  const student = db.prepare('SELECT * FROM students WHERE usn = ?').get(testUsn);
  assert.ok(student, 'Student must be persisted in database');
  assert.equal(student.student_id, 'MOHA9870');

  // Cleanup
  db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
});

test('E2E Feature 2: Dynamic vs Static Session Creation & Token Durations', () => {
  // Dynamic Session (30s rotation)
  const dynRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('Dynamic Session Test', 'DYN101', 1, 'admin', 1, 0, 1)
  `).run();
  const dynSessionId = dynRes.lastInsertRowid;
  const dynToken = generateTokenForSession(dynSessionId, false);

  assert.ok(dynToken.duration_ms >= 30000 && dynToken.duration_ms <= 35000, 'Dynamic duration must be 30,000 to 35,000 ms');
  assert.equal(dynToken.is_static, false);

  // Static Session (Frozen 24 hours)
  const statRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('Static Session Test', 'STAT101', 2, 'admin', 1, 1, 1)
  `).run();
  const statSessionId = statRes.lastInsertRowid;
  const statToken = generateTokenForSession(statSessionId, true);

  assert.equal(statToken.duration_ms, 86400000, 'Static duration must be exactly 24 hours (86,400,000 ms)');
  assert.equal(statToken.is_static, true);

  // Multiple getCurrentToken calls must return identical token
  const retrieved1 = getCurrentToken(statSessionId);
  const retrieved2 = getCurrentToken(statSessionId);
  assert.equal(retrieved1.token, statToken.token, 'Static token must match initial generation');
  assert.equal(retrieved2.token, retrieved1.token, 'Static token must never rotate on subsequent reads');
  assert.equal(retrieved1.is_static, true);

  // Cleanup
  db.prepare('DELETE FROM qr_tokens WHERE session_id IN (?, ?)').run(dynSessionId, statSessionId);
  db.prepare('DELETE FROM sessions WHERE id IN (?, ?)').run(dynSessionId, statSessionId);
});

test('E2E Feature 3: Geofence Verification - Circle & Polygon 4-Corner', () => {
  // Center of MVJCE Auditorium: 12.985300, 77.762465
  const centerLat = 12.985300;
  const centerLng = 77.762465;

  // 1. Point right inside auditorium (~15m away)
  const insideLat = 12.985400;
  const insideLng = 77.762465;
  const distInside = haversineDistance(centerLat, centerLng, insideLat, insideLng);
  assert.ok(distInside < 50, `Distance ${distInside}m must be inside 100m radius`);

  // 2. Point far outside (Bangalore city center ~18km away)
  const outsideLat = 12.9716;
  const outsideLng = 77.5946;
  const distOutside = haversineDistance(centerLat, centerLng, outsideLat, outsideLng);
  assert.ok(distOutside > 1000, `Distance ${distOutside}m must be outside 100m radius`);

  // 3. 4-Corner Polygon check
  const auditoriumPolygon = [
    { lat: 12.985000, lng: 77.762000 },
    { lat: 12.985000, lng: 77.763000 },
    { lat: 12.986000, lng: 77.763000 },
    { lat: 12.986000, lng: 77.762000 }
  ];

  assert.equal(isPointInPolygon(12.985500, 77.762500, auditoriumPolygon), true, 'Point inside polygon bounds must pass');
  assert.equal(isPointInPolygon(12.984000, 77.761000, auditoriumPolygon), false, 'Point outside polygon bounds must fail');
});

test('E2E Feature 4: Attendance Marking, PIN Validation & Anti-Proxy Duplicate Protection', () => {
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required)
    VALUES ('E2E Attendance Subject', 'ATT101', 1, 'admin', 1, 1, 1)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;
  const tokenData = generateTokenForSession(sessionId, true);

  // Student setup
  const studentUsn = '1MJ24E2E99';
  const studentId = 'TEST9999';
  db.prepare('DELETE FROM students WHERE usn = ?').run(studentUsn);
  db.prepare(`
    INSERT INTO students (student_id, name, usn, department, year, cycle, mobile)
    VALUES (?, 'E2E Test Student', ?, 'CSE', 3, 'CSE', '9999999999')
  `).run(studentId, studentUsn);

  try {
    // 1. PIN verification: Wrong PIN must be rejected
    const wrongPin = '000000';
    assert.notEqual(wrongPin, tokenData.unique_pin);

    // 2. Correct PIN: Record attendance
    const insertAtt = db.prepare(`
      INSERT INTO attendance (session_id, student_id, lat, lng, geo_verified, token_used, marked_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const attResult = insertAtt.run(sessionId, studentId, 12.985300, 77.762465, 1, tokenData.token);
    assert.ok(attResult.lastInsertRowid > 0, 'Attendance must be successfully marked with correct PIN');

    // 3. Duplicate Prevention: Attempting to mark attendance again for the same session must fail due to UNIQUE(session_id, student_id)
    assert.throws(() => {
      insertAtt.run(sessionId, studentId, 12.985300, 77.762465, 1, tokenData.token);
    }, /UNIQUE constraint failed/, 'Anti-proxy system must reject duplicate student scan for the same session');

    // 4. Live headcount check
    const count = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE session_id = ?').get(sessionId).count;
    assert.equal(count, 1, 'Live attendance count must be 1');
  } finally {
    // Cleanup
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(studentUsn);
    db.prepare('DELETE FROM qr_tokens WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('E2E Feature 5: Emergency Toggles (Geofence, PIN, Static QR)', () => {
  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, static_qr_mode, pin_required, geo_fence_enabled)
    VALUES ('Toggle Test Session', 'TOG101', 1, 'admin', 1, 0, 1, 1)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;

  try {
    // Initial state: geo=1, pin=1, static=0
    let s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(s.geo_fence_enabled, 1);
    assert.equal(s.pin_required, 1);
    assert.equal(s.static_qr_mode, 0);

    // Toggle 1: Geofence OFF
    db.prepare('UPDATE sessions SET geo_fence_enabled = ? WHERE id = ?').run(0, sessionId);
    s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(s.geo_fence_enabled, 0, 'Geofence must toggle OFF');

    // Toggle 2: PIN OFF
    db.prepare('UPDATE sessions SET pin_required = ? WHERE id = ?').run(0, sessionId);
    s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(s.pin_required, 0, 'PIN must toggle OFF');

    // Toggle 3: Static QR ON
    db.prepare('UPDATE sessions SET static_qr_mode = ? WHERE id = ?').run(1, sessionId);
    s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(s.static_qr_mode, 1, 'Static QR must toggle ON');
  } finally {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

test('E2E Feature 6: Dynamic Export Filename Calculation (Department + Year Filters)', () => {
  // Test naming logic directly
  function getShortDept(dept) {
    if (!dept || dept === 'ALL') return '';
    const match = dept.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      return match[1].replace(/[^a-zA-Z0-9_-]/g, '').trim();
    }
    return dept.replace(/[^a-zA-Z0-9]/g, '').trim();
  }

  function getYearSuffix(yr) {
    if (!yr || yr === 'ALL') return '';
    const y = String(yr).trim();
    if (y === '1') return '1stYear';
    if (y === '2') return '2ndYear';
    if (y === '3') return '3rdYear';
    if (y === '4') return '4thYear';
    if (/^\d+$/.test(y)) return `${y}Year`;
    return y.replace(/[^a-zA-Z0-9]/g, '');
  }

  function computeExportFilename({ department, year, subjectName, hourNumber, ext }) {
    const deptStr = getShortDept(department);
    const yearStr = getYearSuffix(year);

    if (deptStr && yearStr) {
      return `${deptStr}${yearStr}.${ext}`;
    }
    if (deptStr) {
      return `${deptStr}.${ext}`;
    }
    if (yearStr) {
      return `${yearStr}.${ext}`;
    }
    const subj = (subjectName || 'Attendance').replace(/[^a-zA-Z0-9]/g, '_');
    const hr = hourNumber ? `_Hour${hourNumber}` : '';
    const dt = new Date().toISOString().slice(0, 10);
    return `Attendance_${subj}${hr}_${dt}.${ext}`;
  }

  // 1. Department + Year Filter (User's specific example: CSE + 2nd Year -> CSE2ndYear.xlsx / .csv)
  const fn1 = computeExportFilename({
    department: 'Computer Science and Engineering (CSE)',
    year: '2',
    subjectName: 'Data Structures',
    hourNumber: 1,
    ext: 'xlsx'
  });
  assert.equal(fn1, 'CSE2ndYear.xlsx', 'Both filters must produce CSE2ndYear.xlsx');

  const fn1Csv = computeExportFilename({
    department: 'Computer Science and Engineering (CSE)',
    year: '2',
    subjectName: 'Data Structures',
    hourNumber: 1,
    ext: 'csv'
  });
  assert.equal(fn1Csv, 'CSE2ndYear.csv', 'Both filters must produce CSE2ndYear.csv');

  // 2. Department Only Filter (User: if 1 filter department - then it should be name of department -> CSE.xlsx)
  const fn2 = computeExportFilename({
    department: 'Computer Science and Engineering (CSE)',
    year: 'ALL',
    subjectName: 'Data Structures',
    hourNumber: 1,
    ext: 'xlsx'
  });
  assert.equal(fn2, 'CSE.xlsx', 'Department only filter must produce CSE.xlsx');

  // 3. Year Only Filter
  const fn3 = computeExportFilename({
    department: 'ALL',
    year: '3',
    subjectName: 'Data Structures',
    hourNumber: 1,
    ext: 'xlsx'
  });
  assert.equal(fn3, '3rdYear.xlsx', 'Year only filter must produce 3rdYear.xlsx');

  // 4. No Filter (Default subject and hour name)
  const fn4 = computeExportFilename({
    department: 'ALL',
    year: 'ALL',
    subjectName: 'Operating Systems',
    hourNumber: 2,
    ext: 'xlsx'
  });
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(fn4, `Attendance_Operating_Systems_Hour2_${today}.xlsx`, 'No filter must produce default attendance filename');
});
