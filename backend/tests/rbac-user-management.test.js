const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { adminAuth, requirePermission, parsePermissions } = require('../middleware/adminAuth');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secure_jwt_secret_key_2024_xyz';

// Helper mock req/res for testing Express route handlers directly
function mockReqRes(reqData = {}) {
  const req = {
    headers: {},
    query: {},
    params: {},
    body: {},
    ...reqData
  };
  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    }
  };
  return { req, res };
}

test('RBAC & User Management Suite', async (t) => {
  const targetPassword = process.env.ADMIN_PASSWORD || '22Mon08Aug2005';

  await t.test('1. Primary Administrator password & fields verification', () => {
    const admin = db.prepare("SELECT * FROM admins WHERE username = 'admin' OR id = 1").get();
    assert.ok(admin, 'Primary admin must exist in database');
    assert.equal(admin.id, 1, 'Primary admin id must be 1');
    assert.equal(admin.role, 'super_admin', 'Primary admin role must be super_admin');
    assert.equal(admin.is_active, 1, 'Primary admin must be active');

    // Password verification
    const matchesTarget = bcrypt.compareSync(targetPassword, admin.password_hash);
    assert.equal(matchesTarget, true, 'Primary admin password must match new secure password');

    const matchesOld = bcrypt.compareSync('admin123', admin.password_hash);
    assert.equal(matchesOld, false, 'Primary admin password must NOT match legacy admin123');
  });

  await t.test('2. Primary Administrator login via /api/auth/login', () => {
    const authRouter = require('../routes/auth');
    // Find POST /login handler
    const loginLayer = authRouter.stack.find(l => l.route && l.route.path === '/login' && l.route.methods.post);
    assert.ok(loginLayer, 'Login route must be defined');
    const loginHandler = loginLayer.route.stack[0].handle;

    // Test with correct password
    const { req: reqSuccess, res: resSuccess } = mockReqRes({
      body: { username: 'admin', password: targetPassword }
    });
    loginHandler(reqSuccess, resSuccess);
    assert.equal(resSuccess.statusCode, 200);
    assert.equal(resSuccess.jsonData.success, true);
    assert.ok(resSuccess.jsonData.token, 'Must return JWT token');
    assert.equal(resSuccess.jsonData.admin.username, 'admin');
    assert.equal(resSuccess.jsonData.admin.role, 'super_admin');
    assert.equal(resSuccess.jsonData.admin.password_hash, undefined, 'Must NEVER return password_hash');

    // Test with wrong password
    const { req: reqWrong, res: resWrong } = mockReqRes({
      body: { username: 'admin', password: 'wrongpassword' }
    });
    loginHandler(reqWrong, resWrong);
    assert.equal(resWrong.statusCode, 401);
  });

  await t.test('3. Admin User Management CRUD & Permissions', async (sub) => {
    const adminRouter = require('../routes/admin');
    const primaryAdmin = db.prepare("SELECT * FROM admins WHERE id = 1").get();
    const primaryToken = jwt.sign({ id: primaryAdmin.id, username: primaryAdmin.username }, JWT_SECRET);

    const getUsersHandler = adminRouter.stack.find(l => l.route && l.route.path === '/users' && l.route.methods.get).route.stack.slice(-1)[0].handle;
    const createUserHandler = adminRouter.stack.find(l => l.route && l.route.path === '/users' && l.route.methods.post).route.stack.slice(-1)[0].handle;
    const updateUserHandler = adminRouter.stack.find(l => l.route && l.route.path === '/users/:id' && l.route.methods.put).route.stack.slice(-1)[0].handle;
    const deleteUserHandler = adminRouter.stack.find(l => l.route && l.route.path === '/users/:id' && l.route.methods.delete).route.stack.slice(-1)[0].handle;

    let createdAttendanceMgrId = null;
    let createdQrMgrId = null;

    await sub.test('3a. Create Attendance Manager account', () => {
      // Clean up previous test runs if any
      db.prepare("DELETE FROM admins WHERE username IN ('test_att_mgr', 'test_qr_mgr', 'test_custom')").run();

      const { req, res } = mockReqRes({
        admin: primaryAdmin,
        body: {
          username: 'test_att_mgr',
          display_name: 'Attendance Officer',
          role: 'attendance_manager',
          password: 'Password123!',
          confirm_password: 'Password123!'
        }
      });
      createUserHandler(req, res);
      assert.equal(res.statusCode, 201);
      assert.equal(res.jsonData.success, true);
      assert.equal(res.jsonData.user.username, 'test_att_mgr');
      assert.equal(res.jsonData.user.role, 'attendance_manager');
      assert.equal(res.jsonData.user.password_hash, undefined, 'Never expose password_hash');
      createdAttendanceMgrId = res.jsonData.user.id;
    });

    await sub.test('3b. Create QR Manager account', () => {
      const { req, res } = mockReqRes({
        admin: primaryAdmin,
        body: {
          username: 'test_qr_mgr',
          display_name: 'QR Officer',
          role: 'qr_manager',
          password: 'Password123!',
          confirm_password: 'Password123!'
        }
      });
      createUserHandler(req, res);
      assert.equal(res.statusCode, 201);
      assert.equal(res.jsonData.user.role, 'qr_manager');
      createdQrMgrId = res.jsonData.user.id;
    });

    await sub.test('3c. Prevent duplicate usernames', () => {
      const { req, res } = mockReqRes({
        admin: primaryAdmin,
        body: {
          username: 'TEST_ATT_MGR', // case-insensitive check
          role: 'attendance_manager',
          password: 'Password123!',
          confirm_password: 'Password123!'
        }
      });
      createUserHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.ok(res.jsonData.error.includes('already taken'));
    });

    await sub.test('3d. List users returns all accounts without passwords', () => {
      const { req, res } = mockReqRes({ admin: primaryAdmin });
      getUsersHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.jsonData.users));
      assert.ok(res.jsonData.users.length >= 3);
      for (const u of res.jsonData.users) {
        assert.equal(u.password_hash, undefined, 'Must not return password hash');
        assert.ok(u.username, 'Must have username');
        assert.ok(Array.isArray(u.permissions), 'Permissions must be parsed array');
      }
    });

    await sub.test('3e. Primary admin safeguard: cannot deactivate, demote or delete admin (id: 1)', () => {
      // Attempt deactivation
      const { req: reqDeact, res: resDeact } = mockReqRes({
        admin: primaryAdmin,
        params: { id: '1' },
        body: { is_active: 0 }
      });
      updateUserHandler(reqDeact, resDeact);
      assert.equal(resDeact.statusCode, 403);
      assert.ok(resDeact.jsonData.error.includes('cannot be deactivated'));

      // Attempt demotion
      const { req: reqDemote, res: resDemote } = mockReqRes({
        admin: primaryAdmin,
        params: { id: '1' },
        body: { role: 'attendance_manager' }
      });
      updateUserHandler(reqDemote, resDemote);
      assert.equal(resDemote.statusCode, 403);
      assert.ok(resDemote.jsonData.error.includes('must remain a super_admin'));

      // Attempt deletion
      const { req: reqDel, res: resDel } = mockReqRes({
        admin: primaryAdmin,
        params: { id: '1' }
      });
      deleteUserHandler(reqDel, resDel);
      assert.equal(resDel.statusCode, 403);
      assert.ok(resDel.jsonData.error.includes('cannot be deleted'));
    });

    await sub.test('3f. Self-deletion safeguard: admin cannot delete their own account', () => {
      const { req, res } = mockReqRes({
        admin: { id: createdAttendanceMgrId, username: 'test_att_mgr' },
        params: { id: String(createdAttendanceMgrId) }
      });
      deleteUserHandler(req, res);
      assert.equal(res.statusCode, 403);
      assert.ok(res.jsonData.error.includes('cannot delete your own account'));
    });

    await sub.test('3g. Update user details and reset password', () => {
      const { req, res } = mockReqRes({
        admin: primaryAdmin,
        params: { id: String(createdAttendanceMgrId) },
        body: {
          display_name: 'Lead Attendance Officer',
          password: 'NewUpdatedPassword456!',
          confirm_password: 'NewUpdatedPassword456!'
        }
      });
      updateUserHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.user.display_name, 'Lead Attendance Officer');

      // Verify that new password works in database
      const updatedUser = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(createdAttendanceMgrId);
      assert.equal(bcrypt.compareSync('NewUpdatedPassword456!', updatedUser.password_hash), true);
    });

    await sub.test('3h. Role-Based Access Enforcement', () => {
      // Test attendance_manager permissions
      const attManagerUser = db.prepare('SELECT * FROM admins WHERE id = ?').get(createdAttendanceMgrId);
      const attManagerPerms = parsePermissions(attManagerUser.permissions, attManagerUser.role);

      // Should be allowed for attendance operations
      const mockReqAtt = { admin: { ...attManagerUser, permissions: attManagerPerms } };
      let allowed = false;
      requirePermission('manage_live_attendance')(mockReqAtt, {}, () => { allowed = true; });
      assert.equal(allowed, true, 'attendance_manager must have manage_live_attendance');

      // Should be blocked from managing users
      const { res: resUserBlocked } = mockReqRes();
      let blockedCalled = false;
      requirePermission('manage_users')(mockReqAtt, resUserBlocked, () => { blockedCalled = true; });
      assert.equal(blockedCalled, false, 'attendance_manager must NOT have manage_users');
      assert.equal(resUserBlocked.statusCode, 403);

      // Should be blocked from venue settings
      const { res: resSettingsBlocked } = mockReqRes();
      let settingsCalled = false;
      requirePermission('manage_settings')(mockReqAtt, resSettingsBlocked, () => { settingsCalled = true; });
      assert.equal(settingsCalled, false, 'attendance_manager must NOT have manage_settings');
      assert.equal(resSettingsBlocked.statusCode, 403);

      // Test qr_manager permissions
      const qrManagerUser = db.prepare('SELECT * FROM admins WHERE id = ?').get(createdQrMgrId);
      const qrManagerPerms = parsePermissions(qrManagerUser.permissions, qrManagerUser.role);
      const mockReqQr = { admin: { ...qrManagerUser, permissions: qrManagerPerms } };

      let qrAllowed = false;
      requirePermission('view_registration_qr')(mockReqQr, {}, () => { qrAllowed = true; });
      assert.equal(qrAllowed, true, 'qr_manager must have view_registration_qr');

      const { res: resQrAttBlocked } = mockReqRes();
      let attCalled = false;
      requirePermission('manage_live_attendance')(mockReqQr, resQrAttBlocked, () => { attCalled = true; });
      assert.equal(attCalled, false, 'qr_manager must NOT have manage_live_attendance');
      assert.equal(resQrAttBlocked.statusCode, 403);
    });

    await sub.test('3i. Deactivation blocks login and revokes access', () => {
      // Deactivate attendance manager
      db.prepare('UPDATE admins SET is_active = 0 WHERE id = ?').run(createdAttendanceMgrId);

      const authRouter = require('../routes/auth');
      const loginHandler = authRouter.stack.find(l => l.route && l.route.path === '/login' && l.route.methods.post).route.stack[0].handle;

      // Login attempt should be rejected with 403
      const { req: reqLogin, res: resLogin } = mockReqRes({
        body: { username: 'test_att_mgr', password: 'NewUpdatedPassword456!' }
      });
      loginHandler(reqLogin, resLogin);
      assert.equal(resLogin.statusCode, 403);
      assert.ok(resLogin.jsonData.error.includes('deactivated'));

      // Pre-existing JWT verification should also be rejected
      const deactToken = jwt.sign({ id: createdAttendanceMgrId, username: 'test_att_mgr' }, JWT_SECRET);
      const { req: reqAuth, res: resAuth } = mockReqRes({
        headers: { authorization: `Bearer ${deactToken}` }
      });
      let nextCalled = false;
      adminAuth(reqAuth, resAuth, () => { nextCalled = true; });
      assert.equal(nextCalled, false, 'Deactivated token must not proceed');
      assert.equal(resAuth.statusCode, 403);

      // Reactivate attendance manager
      db.prepare('UPDATE admins SET is_active = 1 WHERE id = ?').run(createdAttendanceMgrId);
      const { req: reqReAuth, res: resReAuth } = mockReqRes({
        headers: { authorization: `Bearer ${deactToken}` }
      });
      let reactivatedProceeded = false;
      adminAuth(reqReAuth, resReAuth, () => { reactivatedProceeded = true; });
      assert.equal(reactivatedProceeded, true, 'Reactivated user can proceed');
    });

    await sub.test('3j. Delete non-primary user succeeds', () => {
      const { req, res } = mockReqRes({
        admin: primaryAdmin,
        params: { id: String(createdAttendanceMgrId) }
      });
      deleteUserHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);

      // Confirm removed from SQLite
      const check = db.prepare('SELECT id FROM admins WHERE id = ?').get(createdAttendanceMgrId);
      assert.equal(check, undefined, 'User must be deleted from database');

      // Also clean up qr manager
      db.prepare('DELETE FROM admins WHERE id = ?').run(createdQrMgrId);
    });
  });
});

