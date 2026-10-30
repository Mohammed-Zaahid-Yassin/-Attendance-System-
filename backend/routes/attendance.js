const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const db = require('../db');
const { getCurrentToken } = require('../cron/tokenRotator');
const { checkGeoFence } = require('../middleware/geoCheck');
const { adminAuth, requirePermission } = require('../middleware/adminAuth');
const { archiveAttendanceExport } = require('../neon/storage');


// 1. Get current rotating token and PIN for display screen
router.get('/token/current/:sessionId', (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = db.prepare('SELECT id, subject_name, subject_code, hour_number, is_active, pin_required, geo_fence_enabled, static_qr_mode FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.is_active) {
    return res.status(400).json({ error: 'This session is inactive/closed' });
  }

  const currentToken = getCurrentToken(sessionId);
  if (!currentToken) {
    return res.status(500).json({ error: 'Failed to retrieve active token' });
  }

  const isStatic = Boolean(Number(session.static_qr_mode) === 1 || session.static_qr_mode === true || session.static_qr_mode === '1' || currentToken.is_static === true);
  const serverNow = Date.now();
  return res.json({
    session_id: sessionId,
    subject_name: session.subject_name,
    subject_code: session.subject_code,
    hour_number: session.hour_number,
    token: currentToken.token,
    unique_pin: currentToken.unique_pin,
    pin_required: session.pin_required !== 0,
    geo_fence_enabled: session.geo_fence_enabled === 1,
    static_qr_mode: isStatic,
    is_static: isStatic,
    issued_at: currentToken.issued_at,
    expires_at: currentToken.expires_at,
    time_remaining_ms: Math.max(0, currentToken.expires_at - serverNow),
    duration_ms: currentToken.duration_ms || 30000,
    server_time: serverNow
  });
});

// 2. Get QR code image as Data URL for the current active token
router.get('/token/qr/:sessionId', async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = db.prepare('SELECT id, subject_name, subject_code, hour_number, is_active, pin_required, geo_fence_enabled, static_qr_mode FROM sessions WHERE id = ?').get(sessionId);
  if (!session || !session.is_active) {
    return res.status(400).json({ error: 'Session is inactive or not found' });
  }

  const currentToken = getCurrentToken(sessionId);
  if (!currentToken) {
    return res.status(500).json({ error: 'No active token available' });
  }

  try {
    // Determine the frontend origin:
    // 1. Explicit ?origin query param sent by frontend (e.g. window.location.origin)
    // 2. FRONTEND_URL environment variable (if configured)
    // 3. x-forwarded-host header (when requests pass through Vercel's proxy rewrite)
    // 4. referer header origin (if present from browser request)
    // 5. Default production Vercel deployment URL
    let frontendOrigin = (
      req.query.origin ||
      process.env.FRONTEND_URL ||
      (req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}` : '') ||
      (req.headers.referer ? new URL(req.headers.referer).origin : '') ||
      'https://attendance-system-mvjce.vercel.app'
    ).replace(/\/$/, '');

    // Safeguard: if origin points to the Render backend service, rewrite to Vercel
    if (frontendOrigin.includes('onrender.com')) {
      frontendOrigin = 'https://attendance-system-mvjce.vercel.app';
    }

    // Target URL encoded in the QR code: points to student scan page with token
    const scanUrl = `${frontendOrigin}/scan?token=${encodeURIComponent(currentToken.token)}`;

    const qrDataUrl = await QRCode.toDataURL(scanUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 512,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    const isStatic = Boolean(Number(session.static_qr_mode) === 1 || session.static_qr_mode === true || session.static_qr_mode === '1' || currentToken.is_static === true);
    const serverNow = Date.now();
    return res.json({
      session_id: sessionId,
      subject_name: session.subject_name,
      hour_number: session.hour_number,
      token: currentToken.token,
      unique_pin: currentToken.unique_pin,
      pin_required: session.pin_required !== 0,
      geo_fence_enabled: session.geo_fence_enabled === 1,
      static_qr_mode: isStatic,
      is_static: isStatic,
      issued_at: currentToken.issued_at,
      expires_at: currentToken.expires_at,
      time_remaining_ms: Math.max(0, currentToken.expires_at - serverNow),
      duration_ms: currentToken.duration_ms || 30000,
      server_time: serverNow,
      qr_code: qrDataUrl,
      scan_url: scanUrl
    });
  } catch (err) {
    console.error('[QR Error]', err);
    return res.status(500).json({ error: 'Failed to generate session QR code' });
  }
});

// Helper endpoint for student scan page to inspect token requirements
router.get('/attendance/token-info', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const tokenRow = db.prepare('SELECT * FROM qr_tokens WHERE token = ?').get(token.trim());
  if (!tokenRow) {
    return res.status(404).json({ error: 'Invalid or expired QR token' });
  }

  const session = db.prepare('SELECT id, subject_name, hour_number, is_active, pin_required, geo_fence_enabled, static_qr_mode FROM sessions WHERE id = ?').get(tokenRow.session_id);
  if (!session || !session.is_active) {
    return res.status(400).json({ error: 'Attendance session is no longer active' });
  }

  const isStatic = Boolean(Number(session.static_qr_mode) === 1 || session.static_qr_mode === true || session.static_qr_mode === '1');

  // If not static QR mode, verify token has not expired
  if (!isStatic && tokenRow.expires_at < Date.now()) {
    return res.status(400).json({ error: 'QR token has expired' });
  }

  return res.json({
    valid: true,
    session_id: session.id,
    subject_name: session.subject_name,
    hour_number: session.hour_number,
    pin_required: session.pin_required !== 0,
    geo_fence_enabled: session.geo_fence_enabled === 1,
    is_static_qr: isStatic
  });
});

// 3. Mark Attendance (Student Endpoint)
router.post('/attendance/mark', (req, res) => {
  const { token, student_id, unique_pin, lat, lng } = req.body;

  if (!token || !student_id) {
    return res.status(400).json({ error: 'Token and Student ID are required.' });
  }

  const cleanStudentId = student_id.trim().toUpperCase();
  const cleanPin = (unique_pin || '').toString().trim();

  // 1. Validate Token in SQLite
  const tokenRow = db.prepare('SELECT * FROM qr_tokens WHERE token = ?').get(token.trim());
  if (!tokenRow) {
    return res.status(400).json({ error: 'Invalid or expired QR code. Please scan the current code on the screen.' });
  }

  // 2. Validate Session
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(tokenRow.session_id);
  if (!session || session.is_active !== 1) {
    return res.status(400).json({ error: 'Attendance session is no longer active.' });
  }

  // 3. Expiration Check (bypassed if session is in Static QR Mode)
  const isStatic = Boolean(Number(session.static_qr_mode) === 1 || session.static_qr_mode === true || session.static_qr_mode === '1');
  const now = Date.now();
  if (!isStatic && tokenRow.expires_at < now) {
    return res.status(400).json({ error: 'This QR code token has expired (rotates every ~30s). Please scan the latest code on the auditorium screen.' });
  }

  // 3. Validate Unique PIN if required by session
  const isPinRequired = session.pin_required !== 0;
  if (isPinRequired) {
    if (!cleanPin) {
      return res.status(400).json({ error: 'Please enter the 6-digit Unique PIN shown on the screen.' });
    }
    if (tokenRow.unique_pin !== cleanPin) {
      return res.status(400).json({ error: 'Incorrect Unique PIN. Look at the auditorium display and enter the current 6-digit PIN.' });
    }
  }

  // 4. Validate Student ID in SQLite roster
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(cleanStudentId);
  if (!student) {
    return res.status(404).json({
      error: `Student ID "${cleanStudentId}" not found in roster. Make sure you registered via the official static QR code.`
    });
  }

  // 5. Geofence Verification if enabled
  let geoVerified = 0;
  if (session.geo_fence_enabled === 1) {
    const geoResult = checkGeoFence(session, lat, lng);
    if (!geoResult.allowed) {
      return res.status(403).json({ error: `Geofence check failed: ${geoResult.reason}` });
    }
    geoVerified = 1;
  }

  // 6. Record Attendance in SQLite (prevent duplicates via UNIQUE constraint)
  try {
    const insertStmt = db.prepare(`
      INSERT INTO attendance (session_id, student_id, lat, lng, geo_verified, token_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      session.id,
      cleanStudentId,
      lat ? parseFloat(lat) : null,
      lng ? parseFloat(lng) : null,
      geoVerified,
      token.trim()
    );

    return res.status(200).json({
      success: true,
      message: 'Attendance successfully marked!',
      student: {
        student_id: student.student_id,
        name: student.name,
        usn: student.usn,
        department: student.department
      },
      session: {
        subject_name: session.subject_name,
        subject_code: session.subject_code,
        hour_number: session.hour_number
      },
      marked_at: new Date().toISOString()
    });
  } catch (err) {
    // SQLite constraint violation (UNIQUE session_id + student_id)
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        error: `Attendance is already marked for ${student.name} in ${session.subject_name} (Hour ${session.hour_number}).`
      });
    }
    console.error('[Attendance Mark Error]', err);
    return res.status(500).json({ error: 'Failed to record attendance due to server error.' });
  }
});

// 4. Live Attendance Feed for a Session (Public or Admin)
router.get('/attendance/live/:sessionId', (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const records = db.prepare(`
    SELECT 
      a.id,
      a.marked_at,
      a.lat,
      a.lng,
      a.geo_verified,
      a.is_manual,
      a.remarks,
      a.token_used,
      a.marked_by,
      s.student_id,
      s.name,
      s.usn,
      s.department,
      s.year,
      s.cycle,
      s.mobile,
      s.is_registered
    FROM attendance a
    JOIN students s ON a.student_id = s.student_id
    WHERE a.session_id = ?
    ORDER BY a.id DESC
  `).all(sessionId);

  const registeredCount = records.filter(r => r.is_registered === 1 || r.is_registered === null).length;
  const unregisteredCount = records.filter(r => r.is_registered === 0).length;

  return res.json({
    session,
    count: records.length,
    registered_count: registeredCount,
    unregistered_count: unregisteredCount,
    records
  });
});

// Helpers for attendance export filename generation
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
  let cleanEvent = (subjectName || '').replace(/[/\\?%*:|"<>]/g, '').trim();
  if (!cleanEvent) {
    cleanEvent = hourNumber ? `Attendance-Hour${hourNumber}` : 'Attendance';
  }

  const deptStr = getShortDept(department);
  const yearStr = getYearSuffix(year);

  const parts = [cleanEvent];
  if (deptStr) parts.push(deptStr);
  if (yearStr) parts.push(yearStr);

  return `${parts.join('-')}.${ext}`;
}

// 5. Export Attendance as CSV
router.get('/attendance/export/:sessionId', adminAuth, requirePermission('export_reports'), (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { department, year } = req.query;
  let query = `
    SELECT 
      a.id,
      s.student_id,
      s.name,
      s.usn,
      s.department,
      s.year,
      s.cycle,
      s.mobile,
      s.is_registered,
      a.marked_at,
      a.geo_verified,
      a.is_manual,
      a.remarks,
      a.token_used
    FROM attendance a
    JOIN students s ON a.student_id = s.student_id
    WHERE a.session_id = ?
  `;
  const params = [sessionId];
  if (department && department !== 'ALL') {
    query += ' AND s.department = ?';
    params.push(department);
  }
  if (year && year !== 'ALL') {
    query += ' AND s.year = ?';
    params.push(parseInt(year, 10));
  }
  query += ' ORDER BY a.id ASC';

  const records = db.prepare(query).all(...params);

  // Generate CSV rows
  const headers = ['Sl No', 'Student ID', 'Student Name', 'USN / Admission No', 'Department', 'Year', 'Cycle', 'Mobile', 'Registration Status', 'Entry Type', 'Remarks', 'Marked At', 'Geo Verified'];
  const rows = records.map((r, index) => [
    index + 1,
    `"${r.student_id}"`,
    `"${(r.name || '').replace(/"/g, '""')}"`,
    `"${r.usn || ''}"`,
    `"${r.department || ''}"`,
    r.year,
    `"${r.cycle || 'N/A'}"`,
    `"${r.mobile || 'N/A'}"`,
    `"${r.is_registered === 0 ? 'Unregistered / Walk-in' : 'Registered'}"`,
    `"${r.is_manual || (r.token_used && r.token_used.startsWith('MANUAL')) ? 'Manual Entry' : 'QR Scan'}"`,
    `"${(r.remarks || '').replace(/"/g, '""')}"`,
    `"${r.marked_at}"`,
    r.geo_verified ? 'Yes' : 'No'
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const filename = computeExportFilename({
    department,
    year,
    subjectName: session.subject_name,
    hourNumber: session.hour_number,
    ext: 'csv'
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  // Asynchronously archive export to Neon Object Storage (assets bucket)
  archiveAttendanceExport({
    sessionId,
    filename,
    data: Buffer.from(csvContent, 'utf-8'),
    contentType: 'text/csv'
  }).catch((err) => console.warn('[Neon Storage Archive CSV Error]', err.message));

  return res.send(csvContent);
});

// 6. Export Attendance as Excel XLSX
router.get('/attendance/export-xlsx/:sessionId', adminAuth, requirePermission('export_reports'), (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { department, year } = req.query;
  let query = `
    SELECT 
      a.id,
      s.student_id,
      s.name,
      s.usn,
      s.department,
      s.year,
      s.cycle,
      s.mobile,
      s.is_registered,
      a.marked_at,
      a.geo_verified,
      a.is_manual,
      a.remarks,
      a.token_used
    FROM attendance a
    JOIN students s ON a.student_id = s.student_id
    WHERE a.session_id = ?
  `;
  const params = [sessionId];
  if (department && department !== 'ALL') {
    query += ' AND s.department = ?';
    params.push(department);
  }
  if (year && year !== 'ALL') {
    query += ' AND s.year = ?';
    params.push(parseInt(year, 10));
  }
  query += ' ORDER BY a.id ASC';

  const records = db.prepare(query).all(...params);

  const headers = ['Sl No', 'Student ID', 'Student Name', 'USN / Admission No', 'Department', 'Year', 'Cycle', 'Mobile', 'Registration Status', 'Entry Type', 'Remarks', 'Marked At', 'Geo Verified'];
  const data = [
    headers,
    ...records.map((r, index) => [
      index + 1,
      r.student_id,
      r.name,
      r.usn,
      r.department,
      r.year,
      r.cycle || 'N/A',
      r.mobile || 'N/A',
      r.is_registered === 0 ? 'Unregistered / Walk-in' : 'Registered',
      r.is_manual || (r.token_used && r.token_used.startsWith('MANUAL')) ? 'Manual Entry' : 'QR Scan',
      r.remarks || '',
      r.marked_at,
      r.geo_verified ? 'Yes' : 'No'
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 18 },
    { wch: 24 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 24 },
    { wch: 22 },
    { wch: 14 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = computeExportFilename({
    department,
    year,
    subjectName: session.subject_name,
    hourNumber: session.hour_number,
    ext: 'xlsx'
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  // Asynchronously archive export to Neon Object Storage (assets bucket)
  archiveAttendanceExport({
    sessionId,
    filename,
    data: buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }).catch((err) => console.warn('[Neon Storage Archive XLSX Error]', err.message));

  return res.send(buffer);
});

module.exports = router;
