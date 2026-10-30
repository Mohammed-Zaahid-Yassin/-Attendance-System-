const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secure_jwt_secret_key_2024_xyz';

test('APPLICATION-WIDE FULL API & FUNCTIONALITY AUDIT', async (t) => {
  const server = http.createServer(app);
  let baseUrl;

  await new Promise(resolve => {
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const primaryAdmin = db.prepare('SELECT * FROM admins WHERE id = 1').get();
  const superToken = jwt.sign(
    { id: primaryAdmin.id, username: primaryAdmin.username, role: 'super_admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminHeaders = {
    'Authorization': `Bearer ${superToken}`,
    'Content-Type': 'application/json'
  };

  let auditSessionId = null;
  let auditStudentId = null;
  let auditUserId = null;

  try {
    // 1. Health & Public Discovery
    await t.test('1. System Health & Public Discovery', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.ok(data.cloud);
    });

    await t.test('2. Public Active Sessions Feed', async () => {
      const res = await fetch(`${baseUrl}/api/sessions/active`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.sessions));
    });

    // 2. Authentication & JWT Integrity
    await t.test('3. Admin Authentication Suite', async () => {
      // 3a. Invalid credentials
      const badRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong_password_xyz' })
      });
      assert.equal(badRes.status, 401);

      // 3b. Missing credentials
      const missingRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin' })
      });
      assert.equal(missingRes.status, 400);

      // 3c. Valid login
      const goodRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '22Mon08Aug2005' })
      });
      assert.equal(goodRes.status, 200);
      const loginData = await goodRes.json();
      assert.equal(loginData.success, true);
      assert.ok(loginData.token);
      assert.equal(loginData.admin.username, 'admin');
      assert.equal(loginData.admin.role, 'super_admin');
      assert.equal(loginData.admin.password_hash, undefined);

      // 3d. Verify token endpoint
      const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json();
      assert.equal(verifyData.valid, true);
      assert.equal(verifyData.admin.username, 'admin');

      // 3e. Logout endpoint
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
      assert.equal(logoutRes.status, 200);
    });

    // 3. User Management CRUD & Create New User Flow
    await t.test('4. User Management & Create New User Complete Flow', async () => {
      // Clean up previous runs
      db.prepare("DELETE FROM admins WHERE username = 'audit_teacher'").run();

      // 4a. Create valid user
      const createRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          username: 'audit_teacher',
          password: 'secure_password_99',
          confirm_password: 'secure_password_99',
          display_name: 'Prof. Audit Teacher',
          role: 'attendance_manager'
        })
      });

      assert.equal(createRes.status, 201, 'Create user must return 201');
      const createData = await createRes.json();
      assert.equal(createData.success, true);
      assert.equal(createData.user.username, 'audit_teacher');
      assert.equal(createData.user.display_name, 'Prof. Audit Teacher');
      assert.equal(createData.user.role, 'attendance_manager');
      auditUserId = createData.user.id;

      // 4b. Verify user in user list
      const listRes = await fetch(`${baseUrl}/api/admin/users`, { headers: adminHeaders });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      const found = listData.users.find(u => u.username === 'audit_teacher');
      assert.ok(found, 'Created user must exist in GET /api/admin/users');
      assert.equal(found.is_active, true);

      // 4c. Test duplicate username validation
      const dupRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          username: 'AUDIT_TEACHER',
          password: 'secure_password_99',
          confirm_password: 'secure_password_99'
        })
      });
      assert.equal(dupRes.status, 409, 'Duplicate username must return 409');

      // 4d. Test password mismatch validation
      const mismatchRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          username: 'audit_teacher_2',
          password: 'password1',
          confirm_password: 'password2'
        })
      });
      assert.equal(mismatchRes.status, 400, 'Password mismatch must return 400');

      // 4e. Update user details
      const updateRes = await fetch(`${baseUrl}/api/admin/users/${auditUserId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          display_name: 'Senior Prof. Audit Teacher',
          role: 'qr_manager'
        })
      });
      assert.equal(updateRes.status, 200);
      const updateData = await updateRes.json();
      assert.equal(updateData.user.display_name, 'Senior Prof. Audit Teacher');
      assert.equal(updateData.user.role, 'qr_manager');

      // 4f. Delete user
      const deleteRes = await fetch(`${baseUrl}/api/admin/users/${auditUserId}`, {
        method: 'DELETE',
        headers: adminHeaders
      });
      assert.equal(deleteRes.status, 200);
    });

    // 4. Session Lifecycle & Controls
    await t.test('5. Session Lifecycle & Emergency Toggles', async () => {
      // 5a. Start session
      const startRes = await fetch(`${baseUrl}/api/admin/sessions/start`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          subject_name: 'Computer Networks - Audit',
          subject_code: '21CS52',
          hour_number: 3,
          geo_fence_enabled: 1,
          geo_lat: 12.985300,
          geo_lng: 77.762465,
          geo_radius_m: 100,
          pin_required: true,
          static_qr_mode: 0
        })
      });
      assert.equal(startRes.status, 201);
      const startData = await startRes.json();
      auditSessionId = startData.session.id;
      assert.ok(auditSessionId);

      // 5b. Toggle geofence
      const geoRes = await fetch(`${baseUrl}/api/admin/sessions/${auditSessionId}/toggle-geofence`, {
        method: 'PATCH',
        headers: adminHeaders
      });
      assert.equal(geoRes.status, 200);

      // 5c. Toggle PIN
      const pinRes = await fetch(`${baseUrl}/api/admin/sessions/${auditSessionId}/toggle-pin`, {
        method: 'PATCH',
        headers: adminHeaders
      });
      assert.equal(pinRes.status, 200);

      // 5d. Toggle Static QR mode
      const staticRes = await fetch(`${baseUrl}/api/admin/sessions/${auditSessionId}/toggle-static-qr`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ enabled: true })
      });
      assert.equal(staticRes.status, 200);

      // 5e. Token retrieval for session
      const tokenRes = await fetch(`${baseUrl}/api/token/current/${auditSessionId}`);
      assert.equal(tokenRes.status, 200);
      const tokenData = await tokenRes.json();
      assert.ok(tokenData.token);
      assert.ok(tokenData.unique_pin);
    });

    // 5. Student Registration & Roster
    await t.test('6. Student Registration & Roster Operations', async () => {
      const regKey = process.env.REGISTRATION_KEY || 'STATIC_REG_QR_KEY_SECRET_7890';
      const testUsn = '1MJ24CS999';
      db.prepare('DELETE FROM students WHERE usn = ?').run(testUsn);

      // 6a. Verify registration secret key
      const keyRes = await fetch(`${baseUrl}/api/registration-key/verify?key=${encodeURIComponent(regKey)}`);
      assert.equal(keyRes.status, 200);
      const keyData = await keyRes.json();
      assert.equal(keyData.valid, true);

      // 6b. Register student
      const regRes = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: regKey,
          name: 'Aditi Deshmukh',
          usn: testUsn,
          year: 3,
          department: 'Computer Science and Engineering (CSE)',
          mobile: '9876543299'
        })
      });
      assert.equal(regRes.status, 201);
      const regData = await regRes.json();
      assert.equal(regData.success, true);
      assert.equal(regData.student.student_id, 'ADIT3299');
      auditStudentId = regData.student.student_id;

      // 6c. Query student roster
      const rosterRes = await fetch(`${baseUrl}/api/admin/students?search=Aditi`, {
        headers: adminHeaders
      });
      assert.equal(rosterRes.status, 200);
      const rosterData = await rosterRes.json();
      assert.ok(rosterData.students.some(s => s.student_id === auditStudentId));

      // 6d. Update student details
      const updateRes = await fetch(`${baseUrl}/api/admin/students/${auditStudentId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          name: 'Aditi D. Deshmukh',
          usn: testUsn,
          department: 'Computer Science and Engineering (CSE)',
          year: 3,
          mobile: '9876543299',
          is_registered: 1
        })
      });
      assert.equal(updateRes.status, 200);
    });

    // 6. Attendance Marking & Unregistered Walk-in
    await t.test('7. Attendance Marking & Unregistered Student Walk-in', async () => {
      // 7a. Manual mark registered student
      const manualRes = await fetch(`${baseUrl}/api/admin/attendance/manual-mark`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          session_id: auditSessionId,
          student_id: auditStudentId,
          remarks: 'Present in class'
        })
      });
      assert.equal(manualRes.status, 200);

      // 7b. Prevent duplicate attendance in same session
      const dupAttRes = await fetch(`${baseUrl}/api/admin/attendance/manual-mark`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          session_id: auditSessionId,
          student_id: auditStudentId
        })
      });
      assert.equal(dupAttRes.status, 409);

      // 7c. Unregistered student walk-in with permanent roster registration
      const walkInUsn = '1MJ24WALK01';
      db.prepare('DELETE FROM students WHERE usn = ?').run(walkInUsn);
      const walkInRes = await fetch(`${baseUrl}/api/admin/attendance/manual-unregistered`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          session_id: auditSessionId,
          name: 'Rohan Kulkarni',
          usn: walkInUsn,
          year: 2,
          department: 'Information Science and Engineering (ISE)',
          mobile: '9811223344',
          remarks: 'Auditorium walk-in'
        })
      });
      assert.equal(walkInRes.status, 201);
      const walkInData = await walkInRes.json();
      assert.equal(walkInData.success, true);
      assert.equal(walkInData.student.is_registered, 1, 'Walk-in must be permanently registered');
      assert.equal(walkInData.student.student_id, 'ROHA3344');

      // 7d. Live attendance feed
      const liveRes = await fetch(`${baseUrl}/api/attendance/live/${auditSessionId}`, {
        headers: adminHeaders
      });
      assert.equal(liveRes.status, 200);
      const liveData = await liveRes.json();
      assert.equal(liveData.records.length, 2);

      // 7e. CSV export
      const csvRes = await fetch(`${baseUrl}/api/attendance/export/${auditSessionId}`, {
        headers: adminHeaders
      });
      assert.equal(csvRes.status, 200);
      const csvText = await csvRes.text();
      assert.ok(csvText.includes('Aditi D. Deshmukh'));
      assert.ok(csvText.includes('Rohan Kulkarni'));

      // 7f. XLSX export
      const xlsxRes = await fetch(`${baseUrl}/api/attendance/export-xlsx/${auditSessionId}`, {
        headers: adminHeaders
      });
      assert.equal(xlsxRes.status, 200);
      assert.ok(xlsxRes.headers.get('content-type').includes('spreadsheetml'));
    });

    // 7. Venue Configurations & Presets
    await t.test('8. Venue Config & Saved Locations Management', async () => {
      // 8a. Venue config GET
      const venueGet = await fetch(`${baseUrl}/api/admin/venue-config`, { headers: adminHeaders });
      assert.equal(venueGet.status, 200);

      // 8b. Saved locations list
      const locList = await fetch(`${baseUrl}/api/admin/saved-locations`, { headers: adminHeaders });
      assert.equal(locList.status, 200);
      const locData = await locList.json();
      assert.ok(Array.isArray(locData.locations));
      assert.ok(locData.locations.length >= 5);
    });

    // 8. Session Clean up & End Session
    await t.test('9. Session Stop & Cleanup', async () => {
      const stopRes = await fetch(`${baseUrl}/api/admin/sessions/${auditSessionId}/stop`, {
        method: 'POST',
        headers: adminHeaders
      });
      assert.equal(stopRes.status, 200);

      // Verify session is no longer active
      const check = db.prepare('SELECT is_active FROM sessions WHERE id = ?').get(auditSessionId);
      assert.equal(check.is_active, 0);
    });

  } finally {
    // Teardown server
    await new Promise(res => server.close(res));
  }
});
