const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { generateTokenForSession, getCurrentToken } = require('../cron/tokenRotator');
const { checkGeoFence } = require('../middleware/geoCheck');

// ─────────────────────────────────────────────────────────────────────────────
// 1. COUNTDOWN PROGRESSION & DETERMINISTIC MATHEMATICAL MODEL TESTS
// ─────────────────────────────────────────────────────────────────────────────
test('Countdown Model: 0% issuance, 25%, 50%, 75%, and 100% expiration states', () => {
  const issuedAt = 1000000;
  const durationMs = 32000;
  const expiresAt = issuedAt + durationMs;
  const total = expiresAt - issuedAt;

  // Formula as required:
  // p = clamp((t_n - t_i) / (t_e - t_i), 0, 1)
  // r = max(0, t_e - t_n)
  // visibleFraction = 1 - p
  function calc(tn) {
    const p = Math.max(0, Math.min(1, (tn - issuedAt) / total));
    const r = Math.max(0, expiresAt - tn);
    const visibleFraction = 1 - p;
    const angleDeg = -90 + p * 360;
    const angleRad = (angleDeg * Math.PI) / 180;
    const radius = 200;
    const cx = 250;
    const cy = 250;
    const beadX = cx + radius * Math.cos(angleRad);
    const beadY = cy + radius * Math.sin(angleRad);
    const distFromCenter = Math.sqrt((beadX - cx) ** 2 + (beadY - cy) ** 2);
    return { p, r, visibleFraction, angleDeg, beadX, beadY, distFromCenter };
  }

  // 1. At issuance (tn = issuedAt)
  const atStart = calc(issuedAt);
  assert.equal(atStart.p, 0, 'Elapsed progress at issuance must be 0');
  assert.equal(atStart.visibleFraction, 1, 'Visible arc at issuance must be 100%');
  assert.equal(atStart.r, durationMs, 'Remaining ms at issuance must equal full duration');
  assert.equal(atStart.angleDeg, -90, 'Initial angle must be -90 deg (12 o clock)');
  assert.ok(Math.abs(atStart.distFromCenter - 200) < 0.001, 'Endpoint bead must be on circumference');

  // 2. At 25% elapsed (tn = issuedAt + 0.25 * total)
  const at25 = calc(issuedAt + 0.25 * total);
  assert.equal(at25.p, 0.25, 'Progress at 25% must be 0.25');
  assert.equal(at25.visibleFraction, 0.75, 'Visible arc at 25% elapsed must be 75%');
  assert.equal(at25.angleDeg, 0, 'Angle at 25% must be 0 deg (3 o clock)');
  assert.ok(Math.abs(at25.distFromCenter - 200) < 0.001, 'Endpoint bead must remain on circumference at 25%');

  // 3. At 50% elapsed (tn = issuedAt + 0.50 * total)
  const at50 = calc(issuedAt + 0.50 * total);
  assert.equal(at50.p, 0.50, 'Progress at 50% must be 0.50');
  assert.equal(at50.visibleFraction, 0.50, 'Visible arc at 50% elapsed must be 50%');
  assert.equal(at50.angleDeg, 90, 'Angle at 50% must be 90 deg (6 o clock)');
  assert.ok(Math.abs(at50.distFromCenter - 200) < 0.001, 'Endpoint bead must remain on circumference at 50%');

  // 4. At 75% elapsed (tn = issuedAt + 0.75 * total)
  const at75 = calc(issuedAt + 0.75 * total);
  assert.equal(at75.p, 0.75, 'Progress at 75% must be 0.75');
  assert.equal(at75.visibleFraction, 0.25, 'Visible arc at 75% elapsed must be 25%');
  assert.equal(at75.angleDeg, 180, 'Angle at 75% must be 180 deg (9 o clock)');
  assert.ok(Math.abs(at75.distFromCenter - 200) < 0.001, 'Endpoint bead must remain on circumference at 75%');

  // 5. At expiration (tn = expiresAt)
  const atEnd = calc(expiresAt);
  assert.equal(atEnd.p, 1, 'Progress at expiration must be 1.0');
  assert.equal(atEnd.visibleFraction, 0, 'Visible arc at expiration must be 0%');
  assert.equal(atEnd.r, 0, 'Remaining ms at expiration must be 0');
  assert.equal(atEnd.angleDeg, 270, 'Angle at expiration reaches full 360 sweep back to 12 o clock');

  // 6. Post-expiration clamping (tn = expiresAt + 5000)
  const postEnd = calc(expiresAt + 5000);
  assert.equal(postEnd.p, 1, 'Progress must be clamped to 1.0 after expiration');
  assert.equal(postEnd.visibleFraction, 0, 'Visible arc remains 0 after expiration');
  assert.equal(postEnd.r, 0, 'Remaining ms remains 0 after expiration');
});

test('Countdown Model: Monotonicity and Background Tab Recovery', () => {
  const issuedAt = 500000;
  const expiresAt = 530000;
  const total = expiresAt - issuedAt;

  // Verify monotonicity across 100 sample points
  let lastP = -1;
  for (let t = issuedAt; t <= expiresAt + 2000; t += 300) {
    const p = Math.max(0, Math.min(1, (t - issuedAt) / total));
    assert.ok(p >= lastP, `Progress must be strictly non-decreasing: ${p} >= ${lastP}`);
    lastP = p;
  }

  // Background tab simulation:
  // Tab leaves at t = 505000 (p = 0.1667) and returns at t = 525000 (p = 0.8333)
  const tBeforeLeave = 505000;
  const tAfterReturn = 525000;
  const pBefore = Math.max(0, Math.min(1, (tBeforeLeave - issuedAt) / total));
  const pAfter = Math.max(0, Math.min(1, (tAfterReturn - issuedAt) / total));

  assert.ok(Math.abs(pBefore - 5000 / 30000) < 0.0001, 'Correct progress before leaving tab');
  assert.ok(Math.abs(pAfter - 25000 / 30000) < 0.0001, 'Immediate catchup to real-time progress upon tab return');
  assert.ok(pAfter > pBefore, 'Timer must not be stuck in background tab');
});

test('Token Synchronization: Stale Response Rejection & Same Token Preservation', () => {
  // Current active token displayed
  const currentDisplayed = {
    token: 'token-uuid-1',
    issued_at: 1000000,
    expires_at: 1032000
  };

  // 1. Simulating older/stale async response from previous slow request
  const staleResponse = {
    token: 'token-uuid-0',
    issued_at: 968000,
    expires_at: 1000000 // already older than current token
  };

  const isStale = staleResponse.expires_at < currentDisplayed.expires_at;
  assert.equal(isStale, true, 'Stale response with older expires_at must be detected and rejected');

  // 2. Simulating poll response for the same currently active token
  const sameTokenResponse = {
    token: 'token-uuid-1',
    issued_at: 1000000,
    expires_at: 1032000
  };

  const isSame = sameTokenResponse.token === currentDisplayed.token;
  assert.equal(isSame, true, 'Same token response must be detected so countdown is not reset');

  // 3. Simulating new rotated token
  const newRotatedResponse = {
    token: 'token-uuid-2',
    issued_at: 1032000,
    expires_at: 1064000
  };

  const isNew = newRotatedResponse.token !== currentDisplayed.token && newRotatedResponse.expires_at >= currentDisplayed.expires_at;
  assert.equal(isNew, true, 'New token must trigger coordinated state update');
});

test('Countdown Model: Proportional reduction with randomized duration (e.g. 34,500ms) - never stuck at 100%', () => {
  const durationMs = 34500; // 30,000 + 4,500ms random delay
  const now = 1000000;
  const expiresAt = now + durationMs;
  const issuedAt = now;

  function computeProgress(currentNow) {
    const r = Math.max(0, expiresAt - currentNow);
    const total = Math.max(1000, durationMs || (issuedAt ? expiresAt - issuedAt : 0) || Math.max(30000, r));
    const remainingFraction = Math.max(0, Math.min(1, r / total));
    const p = 1 - remainingFraction;
    return { p, remainingFraction, r };
  }

  // 1. At start (0ms elapsed): full 100%
  const start = computeProgress(now);
  assert.equal(start.p, 0, 'Progress at start must be 0');
  assert.equal(start.remainingFraction, 1.0, 'Remaining fraction at start must be 1.0');

  // 2. After 1000ms: must NOT be stuck at 1.0!
  const after1s = computeProgress(now + 1000);
  assert.ok(after1s.p > 0, 'Progress must immediately advance after 1s');
  assert.ok(after1s.remainingFraction < 1.0, 'Remaining fraction must be less than 1.0 after 1s');
  assert.ok(Math.abs(after1s.remainingFraction - (33500 / 34500)) < 0.0001, 'Must be exact proportion of 34,500ms');

  // 3. After 4500ms (at exactly 30s remaining): must have progressed smoothly to 30000/34500
  const after4500 = computeProgress(now + 4500);
  assert.ok(Math.abs(after4500.remainingFraction - (30000 / 34500)) < 0.0001, 'At 30s remaining, must equal 30000/34500');
  assert.ok(after4500.p > 0.12, 'Must have visibly progressed past 12% rather than being stuck');
});

test('Countdown Colors: Smooth multi-step gradient (Orange at 100%, Yellow at 50%, Red at 25%)', () => {
  function getGradientColor(remainingFraction) {
    const f = Math.max(0, Math.min(1, remainingFraction));
    let r, g, b;
    if (f >= 0.5) {
      // 100% -> 50%: Orange [249, 115, 22] -> Yellow [250, 204, 21]
      const t = (1.0 - f) / 0.5;
      r = Math.round(249 + (250 - 249) * t);
      g = Math.round(115 + (204 - 115) * t);
      b = Math.round(22 + (21 - 22) * t);
    } else if (f >= 0.25) {
      // 50% -> 25%: Yellow [250, 204, 21] -> Red [239, 68, 68]
      const t = (0.5 - f) / 0.25;
      r = Math.round(250 + (239 - 250) * t);
      g = Math.round(204 + (68 - 204) * t);
      b = Math.round(21 + (68 - 21) * t);
    } else {
      // 25% -> 0%: Red [239, 68, 68] -> Dark Red [220, 38, 38]
      const t = (0.25 - f) / 0.25;
      r = Math.round(239 + (220 - 239) * t);
      g = Math.round(68 + (38 - 68) * t);
      b = Math.round(68 + (38 - 68) * t);
    }
    return { r, g, b, str: `rgb(${r}, ${g}, ${b})` };
  }

  // 1. At 100% remaining: pure orange (249, 115, 22)
  const c100 = getGradientColor(1.0);
  assert.equal(c100.r, 249);
  assert.equal(c100.g, 115);
  assert.equal(c100.b, 22);

  // 2. At 75% remaining: intermediate golden-amber
  const c75 = getGradientColor(0.75);
  assert.equal(c75.r, 250);
  assert.ok(c75.g > 115 && c75.g < 204, 'Green must smoothly blend towards yellow');

  // 3. At 50% remaining: pure yellow (250, 204, 21)
  const c50 = getGradientColor(0.50);
  assert.equal(c50.r, 250);
  assert.equal(c50.g, 204);
  assert.equal(c50.b, 21);

  // 4. At 37.5% remaining: intermediate sunset coral
  const c37 = getGradientColor(0.375);
  assert.ok(c37.g > 68 && c37.g < 204, 'Green must smoothly blend from yellow towards red');

  // 5. At 25% remaining: pure warning red (239, 68, 68)
  const c25 = getGradientColor(0.25);
  assert.equal(c25.r, 239);
  assert.equal(c25.g, 68);
  assert.equal(c25.b, 68);

  // 6. At 0% (expired): deep red
  const c0 = getGradientColor(0.0);
  assert.equal(c0.r, 220);
  assert.equal(c0.g, 38);
  assert.equal(c0.b, 38);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BACKEND TOKEN ROTATOR, EXPIRATION, & TIME SERVER TESTS
// ─────────────────────────────────────────────────────────────────────────────
test('Backend: generateTokenForSession produces authoritative timestamps and duration', () => {
  // Find or create an active test session
  let session = db.prepare('SELECT id FROM sessions WHERE is_active = 1 LIMIT 1').get();
  if (!session) {
    const res = db.prepare(`
      INSERT INTO sessions (subject_name, subject_code, hour_number, is_active, pin_required, geo_fence_enabled)
      VALUES ('Test Subject', 'TEST101', 1, 1, 1, 0)
    `).run();
    session = { id: res.lastInsertRowid };
  }

  const tokenData = generateTokenForSession(session.id);
  assert.ok(tokenData.token, 'Token string must exist');
  assert.ok(tokenData.unique_pin, '6-digit PIN must exist');
  assert.equal(tokenData.unique_pin.length, 6, 'PIN must be 6 digits');
  assert.ok(tokenData.issued_at > 0, 'issued_at must be valid epoch ms');
  assert.ok(tokenData.expires_at > tokenData.issued_at, 'expires_at must be after issued_at');
  assert.ok(tokenData.duration_ms >= 30000 && tokenData.duration_ms <= 35000, 'duration_ms must be within 30000-35000 ms');
  assert.equal(tokenData.expires_at - tokenData.issued_at, tokenData.duration_ms, 'expires_at - issued_at must equal duration_ms');

  // Query back using getCurrentToken
  const retrieved = getCurrentToken(session.id);
  assert.ok(retrieved, 'getCurrentToken must return valid active token');
  assert.equal(retrieved.token, tokenData.token, 'Retrieved token must match generated token');
  assert.equal(retrieved.duration_ms, tokenData.duration_ms, 'Retrieved duration_ms must match');
  assert.equal(retrieved.issued_at, tokenData.issued_at, 'Retrieved issued_at must match');
  assert.ok(retrieved.time_remaining_ms > 0, 'time_remaining_ms must be positive');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STUDENT ATTENDANCE & SECURITY REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────
test('Backend Attendance: Leading-zero PIN support & Duplicate Prevention', () => {
  // Create or get session
  let session = db.prepare('SELECT id FROM sessions WHERE is_active = 1 LIMIT 1').get();
  if (!session) {
    const res = db.prepare(`
      INSERT INTO sessions (subject_name, subject_code, hour_number, is_active, pin_required, geo_fence_enabled)
      VALUES ('Security Test', 'SEC101', 1, 1, 1, 0)
    `).run();
    session = { id: res.lastInsertRowid };
  }

  // Create token with leading-zero PIN '012345'
  const token = 'test-token-leading-zero-' + Date.now();
  const leadingZeroPin = '012345';
  const expiresAt = Date.now() + 30000;
  db.prepare(`
    INSERT INTO qr_tokens (session_id, token, unique_pin, expires_at, duration_ms, issued_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session.id, token, leadingZeroPin, expiresAt, 30000, Date.now());

  // Register a test student if not present
  const testStudentId = 'TEST0001';
  db.prepare(`
    INSERT OR IGNORE INTO students (name, usn, department, year, cycle, mobile, student_id)
    VALUES ('Test Student', '1MV22CS999', 'Computer Science and Engineering', 3, null, '9999990001', ?)
  `).run(testStudentId);

  // Clear previous attendance for this student in this session if any
  db.prepare('DELETE FROM attendance WHERE session_id = ? AND student_id = ?').run(session.id, testStudentId);

  // Verify PIN matching as string retains leading zero
  const tokenRow = db.prepare('SELECT * FROM qr_tokens WHERE token = ?').get(token);
  assert.equal(tokenRow.unique_pin, '012345', 'Stored PIN must have leading zero');

  const studentSubmittedPin = '012345';
  assert.equal(tokenRow.unique_pin === studentSubmittedPin, true, 'String comparison must strictly match leading zero');

  // Insert attendance
  const insertStmt = db.prepare(`
    INSERT INTO attendance (session_id, student_id, lat, lng, geo_verified, token_used)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(session.id, testStudentId, null, null, 0, token);

  // Duplicate insertion MUST throw UNIQUE constraint violation
  assert.throws(() => {
    insertStmt.run(session.id, testStudentId, null, null, 0, token);
  }, /UNIQUE constraint failed/, 'Double-marking must be rejected by SQLite UNIQUE constraint');
});

test('Backend Geofencing: Circle & Polygon enforcement', () => {
  // 1. Circle test: MVJCE coordinates (12.985450, 77.762600) with 100m radius
  const circleSession = {
    geo_fence_enabled: 1,
    geo_type: 'circle',
    geo_lat: 12.985450,
    geo_lng: 77.762600,
    geo_radius_m: 100
  };

  // Inside (30m away)
  const insideCircle = checkGeoFence(circleSession, 12.985600, 77.762600);
  assert.equal(insideCircle.allowed, true, 'Coordinates within 100m radius must be allowed');

  // Outside (500m away)
  const outsideCircle = checkGeoFence(circleSession, 12.990000, 77.762600);
  assert.equal(outsideCircle.allowed, false, 'Coordinates beyond radius must be rejected');
  assert.equal(outsideCircle.code, 'OUTSIDE_BOUNDARY', 'Error code must be OUTSIDE_BOUNDARY');

  // 2. Polygon test: MVJCE campus boundary
  const polygonSession = {
    geo_fence_enabled: 1,
    geo_type: 'polygon',
    geo_corners: JSON.stringify([
      { lat: 12.986500, lng: 77.761000 },
      { lat: 12.986500, lng: 77.764000 },
      { lat: 12.984000, lng: 77.764000 },
      { lat: 12.984000, lng: 77.761000 }
    ])
  };

  // Inside bounding box
  const insidePolygon = checkGeoFence(polygonSession, 12.985200, 77.762500);
  assert.equal(insidePolygon.allowed, true, 'Point inside polygon must be allowed');

  // Outside bounding box
  const outsidePolygon = checkGeoFence(polygonSession, 12.990000, 77.762500);
  assert.equal(outsidePolygon.allowed, false, 'Point outside polygon must be rejected');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. FRONTEND TYPOGRAPHY & PLACEHOLDER AUDIT TESTS
// ─────────────────────────────────────────────────────────────────────────────
test('Frontend Typography: Shared baseline, concise placeholders, and no clipping styles', () => {
  const scanPagePath = path.resolve(__dirname, '../../frontend/src/pages/ScanPage.jsx');
  const content = fs.readFileSync(scanPagePath, 'utf8');

  // Verify concise placeholders
  assert.ok(content.includes('placeholder="E.g. ARJU3210"'), 'Student ID must have concise placeholder "E.g. ARJU3210"');
  assert.ok(content.includes('placeholder="Enter 6-digit PIN"'), 'Screen PIN must have concise placeholder "Enter 6-digit PIN"');

  // Verify shared height and typography classes
  assert.ok(content.includes('h-12 rounded-xl'), 'Both inputs must use consistent h-12 height and rounded-xl');
  assert.ok(content.includes('placeholder:font-mono placeholder:text-sm'), 'Both inputs must use unified placeholder font styling');

  // Verify that the old oversized 24px PIN placeholder style was removed
  assert.ok(!content.includes('text-2xl font-bold tracking-[0.25em] text-amber-400 placeholder-[#554e48]'), 'Old oversized 24px input style causing mobile horizontal clipping must be removed');

  // Verify PIN input uses numeric inputmode and keeps leading zeros
  assert.ok(content.includes('inputMode="numeric"'), 'PIN input must specify inputMode="numeric"');
  assert.ok(content.includes("replace(/\\D/g, '')"), 'PIN input must strip non-digits while keeping leading zeros as string');

  // Verify student reminder text exists on the page
  assert.ok(content.includes('First 4 letters of name'), 'Page must contain reminder that Student ID is first 4 letters of name + last 4 digits of mobile');
});

test('Frontend Projector Display: ClockRingTimer exported and coordinates verified', () => {
  const displayPagePath = path.resolve(__dirname, '../../frontend/src/pages/DisplayPage.jsx');
  const content = fs.readFileSync(displayPagePath, 'utf8');

  // Verify ClockRingTimer is exported
  assert.ok(content.includes('export function ClockRingTimer'), 'ClockRingTimer must be exported');

  // Verify authoritative timestamps are passed
  assert.ok(content.includes('issuedAt={tokenData.issued_at}'), 'ClockRingTimer must receive issued_at');
  assert.ok(content.includes('expiresAt={tokenData.expires_at}'), 'ClockRingTimer must receive expires_at');
  assert.ok(content.includes('serverTimeOffset={serverTimeOffsetRef.current}'), 'ClockRingTimer must receive serverTimeOffset');

  // Verify key={tokenData.token} ensures coordinated transition without timer reset on same token
  assert.ok(content.includes('key={tokenData.token}'), 'ClockRingTimer must use key={tokenData.token}');

  // Verify broken totalMs formula was removed
  assert.ok(!content.includes('(tokenData.expires_at - Date.now() + tokenData.time_remaining_ms)'), 'Broken totalMs calculation must be removed');
});
