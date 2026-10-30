const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const db = require('../db');
const adminRoutes = require('../routes/admin');
const attendanceRoutes = require('../routes/attendance');
const registrationRoutes = require('../routes/registration');
const { generateTokenForSession } = require('../cron/tokenRotator');

const JWT_SECRET = process.env.JWT_SECRET || 'spotlight_mvjce_production_secret_key_2026';

function createAdminToken(username = 'admin') {
  return jwt.sign({ id: 1, username }, JWT_SECRET, { expiresIn: '1h' });
}

// Helper to launch test server for live HTTP API tests
function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api', attendanceRoutes);
  app.use('/api', registrationRoutes);

  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        baseUrl,
        close: () => new Promise((res) => server.close(res))
      });
    });
  });
}

// ==============================================================================
// Category A: Unregistered Student Tests (Scenarios 1 - 7)
// ==============================================================================

test('A1-A7: Full Unregistered Student Lifecycle — New student creation, permanent registration, attendance & subsequent session availability', async () => {
  const testServer = await createTestServer();
  const token = createAdminToken('admin');
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Create 2 test sessions
  const s1 = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Cloud Computing - Session 1', 'CS501', 1, 'admin', 1)
  `).run().lastInsertRowid;

  const s2 = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Cloud Computing - Session 2', 'CS501', 2, 'admin', 1)
  `).run().lastInsertRowid;

  const testUsn = '1MJ24NEW001';
  const testName = 'Vikramaditya Sharma';
  const testDept = 'Computer Science and Engineering (CSE)';
  const testMobile = '9876543210';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);

    // 1. Add completely new student and mark attendance via manual-unregistered
    const res1 = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: testName,
        usn: testUsn,
        year: 3,
        department: testDept,
        mobile: testMobile,
        remarks: 'New walk-in student'
      })
    });

    assert.equal(res1.status, 201, 'Should return HTTP 201 Created');
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.ok(data1.student, 'Should return created student object');
    const createdId = data1.student.student_id;
    assert.ok(createdId, 'Should generate a student ID');

    // 2. Verify the student record exists in the database as a permanent record with is_registered = 1
    const studentInDb = db.prepare('SELECT * FROM students WHERE usn = ?').get(testUsn);
    assert.ok(studentInDb, 'Student must exist in database');
    assert.equal(studentInDb.student_id, createdId);
    assert.equal(studentInDb.name, testName);
    assert.equal(studentInDb.department, testDept);
    assert.equal(studentInDb.is_registered, 1, 'Student must have is_registered = 1 (Permanent registered record)');

    // 3. Verify attendance record exists and references the correct student
    const attRecord = db.prepare('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?').get(s1, createdId);
    assert.ok(attRecord, 'Attendance must be recorded');
    assert.equal(attRecord.session_id, s1);
    assert.equal(attRecord.student_id, createdId);
    assert.equal(attRecord.is_manual, 1);
    assert.equal(attRecord.token_used, 'MANUAL_ADMIN_OVERRIDE');

    // 4. Verify student appears in the registered-student attendance portal query
    const rosterRes = await fetch(`${testServer.baseUrl}/api/admin/students?registration_status=registered`, {
      headers: authHeaders
    });
    assert.equal(rosterRes.status, 200);
    const rosterData = await rosterRes.json();
    const foundInRoster = rosterData.students.find(s => s.usn === testUsn);
    assert.ok(foundInRoster, 'Student must be returned in registered students query');
    assert.equal(foundInRoster.is_registered, 1);

    // 5. Searchable by name, USN, or Student ID
    const searchRes = await fetch(`${testServer.baseUrl}/api/admin/students?search=${encodeURIComponent(testName)}`, {
      headers: authHeaders
    });
    const searchData = await searchRes.json();
    assert.ok(searchData.students.some(s => s.student_id === createdId), 'Student must be searchable by name');

    // 6. Refresh simulation: Direct query from persistent DB confirms permanence
    const freshDbCheck = db.prepare('SELECT * FROM students WHERE student_id = ?').get(createdId);
    assert.ok(freshDbCheck, 'Student remains persisted after multiple queries');

    // 7. Verify the student can now be selected and marked in a DIFFERENT attendance session (s2)
    // using the normal registered student portal (manual-mark) without entering details again
    const res2 = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-mark`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s2,
        student_id: createdId,
        remarks: 'Marked in next session via registered portal'
      })
    });

    assert.equal(res2.status, 200, 'Should mark attendance in session 2');
    const data2 = await res2.json();
    assert.equal(data2.success, true);
    assert.equal(data2.is_registered, true);

    const attRecord2 = db.prepare('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?').get(s2, createdId);
    assert.ok(attRecord2, 'Attendance for session 2 must be recorded');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id IN (?, ?)').run(s1, s2);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id IN (?, ?)').run(s1, s2);
    await testServer.close();
  }
});

// ==============================================================================
// Category B: Existing Student Tests (Scenarios 8 - 13)
// ==============================================================================

test('B8-B13: Existing Student Workflows — Reuse, eligibility upgrade (0 -> 1), no credentials, already registered', async () => {
  const testServer = await createTestServer();
  const token = createAdminToken('admin');
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const sessionId = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Existing Student Session', 'EX101', 1, 'admin', 1)
  `).run().lastInsertRowid;

  const unregUsn = '1MJ24PREV001';
  const unregStudentId = 'PREV1234';
  const regUsn = '1MJ24ALREG01';
  const regStudentId = 'ALRE5678';

  try {
    db.prepare('DELETE FROM students WHERE usn IN (?, ?)').run(unregUsn, regUsn);

    // Pre-insert student with is_registered = 0 (Case B)
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Preexisting Walkin', ?, 'Mechanical Engineering', 2, null, '9876540001', 0)
    `).run(unregStudentId, unregUsn);

    // Pre-insert student with is_registered = 1 (Case C)
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Already Registered', ?, 'Civil Engineering', 3, null, '9876540002', 1)
    `).run(regStudentId, regUsn);

    // 8. Add attendance for student who exists with is_registered = 0
    const resB = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: sessionId,
        name: 'Preexisting Walkin',
        usn: unregUsn,
        year: 2,
        department: 'Mechanical Engineering',
        remarks: 'Activating existing student'
      })
    });

    assert.equal(resB.status, 200);
    const dataB = await resB.json();
    assert.equal(dataB.success, true);
    assert.equal(dataB.category, 'unregistered_upgraded');

    // 9. Verify existing record is reused
    const studentCount = db.prepare('SELECT COUNT(*) as count FROM students WHERE usn = ?').get(unregUsn).count;
    assert.equal(studentCount, 1, 'Must NOT create duplicate student');

    // 10. Verify student ID was preserved
    const upgradedStudent = db.prepare('SELECT * FROM students WHERE usn = ?').get(unregUsn);
    assert.equal(upgradedStudent.student_id, unregStudentId);

    // 11. Verify attendance eligibility is upgraded to 1
    assert.equal(upgradedStudent.is_registered, 1, 'Student must be upgraded to is_registered = 1');

    // 12. Verify no unintended login credentials are created
    const studentCols = db.prepare('PRAGMA table_info(students)').all().map(c => c.name);
    assert.ok(!studentCols.includes('password'), 'Students table must NOT contain password');
    assert.ok(!studentCols.includes('password_hash'), 'Students table must NOT contain password_hash');
    const adminMatch = db.prepare('SELECT id FROM admins WHERE username = ?').get(unregStudentId);
    assert.equal(adminMatch, undefined, 'No admin account should be generated for student');

    // 13. Test workflow for already registered student (Case C)
    const resC = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: sessionId,
        name: 'Already Registered',
        usn: regUsn,
        year: 3,
        department: 'Civil Engineering',
        remarks: 'Existing registered mark'
      })
    });

    assert.equal(resC.status, 200);
    const dataC = await resC.json();
    assert.equal(dataC.success, true);
    assert.equal(dataC.category, 'registered_existing');

    const regCount = db.prepare('SELECT COUNT(*) as count FROM students WHERE usn = ?').get(regUsn).count;
    assert.equal(regCount, 1, 'Must NOT duplicate already registered student');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn IN (?, ?)').run(unregUsn, regUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    await testServer.close();
  }
});

// ==============================================================================
// Category C: Duplicate and Validation Tests (Scenarios 14 - 22)
// ==============================================================================

test('C14-C22: Duplicate Prevention, Conflicting Details, and Strict Validation', async () => {
  const testServer = await createTestServer();
  const token = createAdminToken('admin');
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const s1 = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Validation Session 1', 'VAL101', 1, 'admin', 1)
  `).run().lastInsertRowid;

  const s2 = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Validation Session 2', 'VAL102', 2, 'admin', 1)
  `).run().lastInsertRowid;

  const testUsn = '1MJ24VAL001';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);

    // Initial student creation
    const resInit = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: 'Rohit Verma',
        usn: testUsn,
        year: 2,
        department: 'Computer Science and Engineering (CSE)'
      })
    });
    assert.equal(resInit.status, 201);

    // 14. Attempt to add the same student again in the same session -> 409 already marked
    const resDupSession = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: 'Rohit Verma',
        usn: testUsn,
        year: 2,
        department: 'Computer Science and Engineering (CSE)'
      })
    });
    assert.equal(resDupSession.status, 409, 'Must reject duplicate attendance in same session');
    const dataDup = await resDupSession.json();
    assert.ok(dataDup.error.includes('already recorded') || dataDup.already_marked);

    // 15. Attempt to add with conflicting student details (different name for same USN)
    const resConflict = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s2,
        name: 'Completely Different Person',
        usn: testUsn,
        year: 2,
        department: 'Computer Science and Engineering (CSE)'
      })
    });
    assert.equal(resConflict.status, 409, 'Must reject conflicting student details for same USN');
    const dataConflict = await resConflict.json();
    assert.ok(dataConflict.conflict === true || dataConflict.error.includes('Conflict'));

    // 16 & 17. Record attendance for same student in different session (s2) with matching details -> Succeeds
    const resDiffSession = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s2,
        name: 'Rohit Verma',
        usn: testUsn,
        year: 2,
        department: 'Computer Science and Engineering (CSE)'
      })
    });
    assert.equal(resDiffSession.status, 200, 'Same student in different session must succeed');

    // 18. Missing required fields: Name missing
    const resNoName = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: '',
        usn: '1MJ24NONAME',
        year: 2,
        department: 'CSE'
      })
    });
    assert.equal(resNoName.status, 400);

    // 19. Missing USN
    const resNoUsn = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: 'No Usn Student',
        usn: '',
        year: 2,
        department: 'CSE'
      })
    });
    assert.equal(resNoUsn.status, 400);

    // 20. Invalid year (year = 5)
    const resBadYear = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: 'Bad Year Student',
        usn: '1MJ24BADYR',
        year: 5,
        department: 'CSE'
      })
    });
    assert.equal(resBadYear.status, 400);

    // Year 1 without cycle
    const resYr1NoCycle = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: 'First Year Student',
        usn: '1MJ24Y1NOCYC',
        year: 1,
        cycle: ''
      })
    });
    assert.equal(resYr1NoCycle.status, 400);

    // 21 & 22. Whitespace and Case Normalization
    const resNorm = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: s1,
        name: '  Ananya Patel  ',
        usn: '  1mj24norm99  ',
        year: 2,
        department: 'Information Science and Engineering (ISE)'
      })
    });
    assert.equal(resNorm.status, 201);
    const normStudent = db.prepare('SELECT * FROM students WHERE usn = ?').get('1MJ24NORM99');
    assert.ok(normStudent, 'USN must be trimmed and capitalized');
    assert.equal(normStudent.name, 'Ananya Patel', 'Name must be trimmed');
    db.prepare('DELETE FROM students WHERE usn = ?').run('1MJ24NORM99');
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id IN (?, ?)').run(s1, s2);
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);
    db.prepare('DELETE FROM sessions WHERE id IN (?, ?)').run(s1, s2);
    await testServer.close();
  }
});

// ==============================================================================
// Category D: Failure and Concurrency Tests (Scenarios 23 - 30)
// ==============================================================================

test('D23-D30: Atomic Transactions, Concurrency, and Rollback Integrity', async () => {
  const sessionId = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active)
    VALUES ('Transaction Test Session', 'TX101', 1, 'admin', 1)
  `).run().lastInsertRowid;

  const testUsn = '1MJ24TX001';
  const testStudentId = 'TXTEST01';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);

    // 26. Verify transaction rollbacks completely if attendance insertion fails
    assert.throws(() => {
      const rollbackTx = db.transaction(() => {
        // Step 1: Create student
        db.prepare(`
          INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
          VALUES (?, 'Rollback Tester', ?, 'Computer Science and Engineering (CSE)', 2, null, '9876543210', 1)
        `).run(testStudentId, testUsn);

        // Step 2: Intentionally violate foreign key constraint or trigger error
        // Invalid session_id 999999999 with foreign_keys = ON will throw
        db.prepare(`
          INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual)
          VALUES (999999999, ?, 1, 'MANUAL_TEST', 1)
        `).run(testStudentId);
      });

      rollbackTx();
    }, /FOREIGN KEY constraint failed/);

    // Confirm that Step 1 was ROLLED BACK and no orphan student was created
    const orphanStudent = db.prepare('SELECT * FROM students WHERE usn = ?').get(testUsn);
    assert.equal(orphanStudent, undefined, 'Student insertion must be rolled back on attendance failure');

    // 28-30. Concurrent insertion test for same student
    const testServer = await createTestServer();
    const token = createAdminToken('admin');
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const concurrentUsn = '1MJ24CONCURR';
    db.prepare('DELETE FROM students WHERE usn = ?').run(concurrentUsn);

    // Fire 2 concurrent requests for the exact same student
    const [p1, p2] = await Promise.all([
      fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          name: 'Concurrent Student',
          usn: concurrentUsn,
          year: 2,
          department: 'Computer Science and Engineering (CSE)'
        })
      }),
      fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          name: 'Concurrent Student',
          usn: concurrentUsn,
          year: 2,
          department: 'Computer Science and Engineering (CSE)'
        })
      })
    ]);

    const statuses = [p1.status, p2.status];
    // Exactly one must succeed (201 or 200), and the other must be handled (409 conflict)
    assert.ok(statuses.includes(201), 'At least one request must create the student (201)');
    assert.ok(statuses.includes(409) || statuses.includes(200), 'Second request must be handled without 500 error');

    // Verify only ONE student record exists in the DB
    const studentCount = db.prepare('SELECT COUNT(*) as count FROM students WHERE usn = ?').get(concurrentUsn).count;
    assert.equal(studentCount, 1, 'Only ONE canonical student record must be created under concurrency');

    // Verify only ONE attendance record exists
    const attCount = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE session_id = ?').get(sessionId).count;
    assert.equal(attCount, 1, 'Only ONE attendance record must be created under concurrency');

    db.prepare('DELETE FROM students WHERE usn = ?').run(concurrentUsn);
    await testServer.close();
  } finally {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn IN (?, ?)').run(testUsn, '1MJ24CONCURR');
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
});

// ==============================================================================
// Category E: Authorization Tests (Scenarios 31 - 35)
// ==============================================================================

test('E31-E35: Backend Authorization Enforcement on Manual Attendance Routes', async () => {
  const testServer = await createTestServer();

  // 34. Unauthenticated request without token -> 401
  const resNoAuth = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: 1, name: 'Hacker', usn: '1MJ24HACK01', year: 2, department: 'CSE' })
  });
  assert.equal(resNoAuth.status, 401, 'Unauthenticated request must return 401');

  // 33. Invalid / forged token -> 401
  const resBadAuth = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer forged_fake_token_123',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ session_id: 1, name: 'Hacker', usn: '1MJ24HACK01', year: 2, department: 'CSE' })
  });
  assert.equal(resBadAuth.status, 401, 'Invalid token must return 401');

  // 31. Valid admin token -> Authorized (404 due to non-existent session, NOT 401)
  const validToken = createAdminToken('admin');
  const resValid = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-unregistered`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ session_id: 99999999, name: 'Test', usn: '1MJ24AUTH', year: 2, department: 'CSE' })
  });
  assert.notEqual(resValid.status, 401, 'Valid admin token must NOT be rejected with 401');
  assert.equal(resValid.status, 404, 'Session 99999999 not found -> 404');

  await testServer.close();
});

// ==============================================================================
// Category F: Regression Tests (Scenarios 36 - 42)
// ==============================================================================

test('F36-F42: System Regressions — Registered manual, QR scan, stats, live feed, exports', async () => {
  const testServer = await createTestServer();
  const token = createAdminToken('admin');
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const sessionRes = db.prepare(`
    INSERT INTO sessions (subject_name, subject_code, hour_number, started_by, is_active, pin_required)
    VALUES ('Regression Session', 'REG999', 1, 'admin', 1, 0)
  `).run();
  const sessionId = sessionRes.lastInsertRowid;

  const regUsn = '1MJ24REGR01';
  const regStudentId = 'REGR9901';

  try {
    db.prepare('DELETE FROM students WHERE usn = ?').run(regUsn);

    // Create student
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'Regression Student', ?, 'Computer Science and Engineering (CSE)', 2, null, '9876549901', 1)
    `).run(regStudentId, regUsn);

    // 36. Verify normal registered-student manual attendance
    const resMark = await fetch(`${testServer.baseUrl}/api/admin/attendance/manual-mark`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: sessionId,
        student_id: regStudentId,
        remarks: 'Normal manual registered attendance'
      })
    });
    assert.equal(resMark.status, 200);

    // 39. Verify live feed endpoint returns recorded student with correct fields
    const resLive = await fetch(`${testServer.baseUrl}/api/attendance/live/${sessionId}`);
    assert.equal(resLive.status, 200);
    const liveData = await resLive.json();
    assert.equal(liveData.records.length, 1);
    assert.equal(liveData.records[0].student_id, regStudentId);
    assert.equal(liveData.records[0].is_registered, 1);
    assert.equal(liveData.records[0].is_manual, 1);

    // 40. Verify student search by partial name
    const resSearch = await fetch(`${testServer.baseUrl}/api/admin/students?search=Regression`, {
      headers: authHeaders
    });
    const searchData = await resSearch.json();
    assert.ok(searchData.students.some(s => s.student_id === regStudentId));

    // 41. Verify CSV Export endpoint
    const resCsv = await fetch(`${testServer.baseUrl}/api/attendance/export/${sessionId}`, {
      headers: authHeaders
    });
    assert.equal(resCsv.status, 200);
    const csvText = await resCsv.text();
    assert.ok(csvText.includes('Regression Student'));
    assert.ok(csvText.includes('Registered'));
    assert.ok(csvText.includes('Manual Entry'));

    // 41b. Verify XLSX Export endpoint
    const resXlsx = await fetch(`${testServer.baseUrl}/api/attendance/export-xlsx/${sessionId}`, {
      headers: authHeaders
    });
    assert.equal(resXlsx.status, 200);
    const xlsxBuffer = await resXlsx.arrayBuffer();
    assert.ok(xlsxBuffer.byteLength > 1000);

    // 37. QR scan endpoint regression: create 2nd student and test mark
    const qrUsn = '1MJ24QR001';
    const qrStudentId = 'QRST0001';
    db.prepare('DELETE FROM students WHERE usn = ?').run(qrUsn);
    db.prepare(`
      INSERT INTO students (student_id, name, usn, department, year, cycle, mobile, is_registered)
      VALUES (?, 'QR Student', ?, 'Computer Science and Engineering (CSE)', 2, null, '9876540003', 1)
    `).run(qrStudentId, qrUsn);

    const tokenObj = generateTokenForSession(sessionId, false);
    const resQr = await fetch(`${testServer.baseUrl}/api/attendance/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenObj.token,
        student_id: qrStudentId,
        unique_pin: tokenObj.unique_pin
      })
    });
    assert.equal(resQr.status, 200, 'QR mark endpoint should succeed');
    const qrData = await resQr.json();
    assert.equal(qrData.success, true);

    db.prepare('DELETE FROM students WHERE usn = ?').run(qrUsn);
  } finally {
    db.prepare('DELETE FROM qr_tokens WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE usn = ?').run(regUsn);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    await testServer.close();
  }
});
