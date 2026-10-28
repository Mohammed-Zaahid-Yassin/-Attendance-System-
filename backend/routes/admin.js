const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const { generateTokenForSession } = require('../cron/tokenRotator');

// All admin routes require adminAuth
router.use(adminAuth);

// 1. Dashboard Overview Stats
router.get('/stats', (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const activeSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1').get().count;
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
  const todayAttendance = db.prepare(`
    SELECT COUNT(*) as count FROM attendance 
    WHERE date(marked_at) = date('now')
  `).get().count;

  // Today's sessions with attendance counts
  const sessions = db.prepare(`
    SELECT 
      s.*, 
      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) as attendance_count
    FROM sessions s
    ORDER BY s.id DESC LIMIT 10
  `).all();

  return res.json({
    total_students: totalStudents,
    active_sessions: activeSessions,
    total_sessions: totalSessions,
    today_attendance: todayAttendance,
    recent_sessions: sessions
  });
});

// 2. Start a New Class/Subject Session (1 to 5 hours)
// 2. Start a New Class/Subject Session (1 to 5 hours)
router.post('/sessions/start', (req, res) => {
  const { 
    subject_name, 
    subject_code, 
    hour_number, 
    geo_fence_enabled, 
    geo_lat, 
    geo_lng, 
    geo_radius_m,
    geo_corners,
    pin_required
  } = req.body;

  if (!subject_name) {
    return res.status(400).json({ error: 'Subject name is required' });
  }

  const hour = parseInt(hour_number, 10) || 1;
  const isGeoEnabled = geo_fence_enabled ? 1 : 0;
  const isPinRequired = pin_required !== undefined ? (pin_required ? 1 : 0) : 1;
  let lat = geo_lat ? parseFloat(geo_lat) : null;
  let lng = geo_lng ? parseFloat(geo_lng) : null;
  let radius = geo_radius_m ? parseInt(geo_radius_m, 10) : 100;
  let cornersJson = geo_corners ? (typeof geo_corners === 'string' ? geo_corners : JSON.stringify(geo_corners)) : null;

  if (req.body.saved_location_id) {
    const loc = db.prepare('SELECT * FROM saved_locations WHERE id = ?').get(req.body.saved_location_id);
    if (loc) {
      lat = loc.geo_lat;
      lng = loc.geo_lng;
      radius = loc.geo_radius_m || 100;
      cornersJson = loc.geo_corners;
    }
  }

  if (lat === null || lng === null) {
    const defaultVenue = db.prepare('SELECT * FROM venue_configs ORDER BY id DESC LIMIT 1').get();
    if (defaultVenue) {
      lat = defaultVenue.geo_lat;
      lng = defaultVenue.geo_lng;
      radius = defaultVenue.geo_radius_m || 100;
      if (!cornersJson && defaultVenue.geo_corners) {
        cornersJson = defaultVenue.geo_corners;
      }
    }
  }

  try {
    const isStaticQr = (
      req.body.static_qr_mode === 1 ||
      req.body.static_qr_mode === '1' ||
      req.body.static_qr_mode === true ||
      req.body.static_qr_mode === 'true'
    ) ? 1 : 0;
    const insertStmt = db.prepare(`
      INSERT INTO sessions (
        subject_name, subject_code, hour_number, started_by, 
        geo_fence_enabled, geo_lat, geo_lng, geo_radius_m, geo_corners, geo_type, pin_required, static_qr_mode
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      subject_name.trim(),
      (subject_code || '').trim(),
      hour,
      req.admin.username,
      isGeoEnabled,
      lat,
      lng,
      radius,
      cornersJson,
      req.body.geo_type === 'polygon' ? 'polygon' : 'circle',
      isPinRequired,
      isStaticQr
    );

    const sessionId = result.lastInsertRowid;
    generateTokenForSession(sessionId, isStaticQr === 1);

    const newSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    return res.status(201).json({ success: true, session: newSession });
  } catch (err) {
    console.error('[Start Session Error]', err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// 3. Stop an Active Session
router.post('/sessions/:id/stop', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const updateStmt = db.prepare(`
    UPDATE sessions 
    SET is_active = 0, ended_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  const result = updateStmt.run(sessionId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.json({ success: true, message: `Session ${sessionId} ended` });
});

// 4. List All Sessions with Attendance Counts
router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT 
      s.*, 
      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) as attendance_count
    FROM sessions s
    ORDER BY s.id DESC
  `).all();

  return res.json({ sessions });
});

// 5. Active Sessions List (public/display friendly)
router.get('/sessions/active', (req, res) => {
  const sessions = db.prepare(`
    SELECT 
      s.*, 
      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) as attendance_count
    FROM sessions s 
    WHERE s.is_active = 1
    ORDER BY s.id DESC
  `).all();

  return res.json({ sessions });
});

// 6. Update Geo-fence for a Session (Toggle on/off, change 4-corner polygon, coords/radius, or apply saved location)
router.patch('/sessions/:id/geofence', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const { enabled, lat, lng, radius, corners, saved_location_id } = req.body;

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (saved_location_id) {
    const loc = db.prepare('SELECT * FROM saved_locations WHERE id = ?').get(saved_location_id);
    if (loc) {
      db.prepare(`
        UPDATE sessions 
        SET geo_fence_enabled = 1, geo_lat = ?, geo_lng = ?, geo_radius_m = ?, geo_corners = ?
        WHERE id = ?
      `).run(
        loc.geo_lat,
        loc.geo_lng,
        loc.geo_radius_m || 100,
        loc.geo_corners,
        sessionId
      );
      const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      return res.json({ success: true, session: updated, message: `Geofence updated to: ${loc.name}` });
    }
  }

  const cornersJson = corners !== undefined 
    ? (corners ? (typeof corners === 'string' ? corners : JSON.stringify(corners)) : null)
    : undefined;

  // Build SET clause dynamically to only update provided fields
  const fields = [];
  const values = [];

  if (enabled !== undefined) { fields.push('geo_fence_enabled = ?'); values.push(enabled ? 1 : 0); }
  if (lat !== undefined) { fields.push('geo_lat = ?'); values.push(lat ? parseFloat(lat) : null); }
  if (lng !== undefined) { fields.push('geo_lng = ?'); values.push(lng ? parseFloat(lng) : null); }
  if (radius !== undefined) { fields.push('geo_radius_m = ?'); values.push(parseInt(radius, 10) || 100); }
  if (cornersJson !== undefined) { fields.push('geo_corners = ?'); values.push(cornersJson); }
  if (req.body.geo_type !== undefined) {
    fields.push('geo_type = ?');
    values.push(req.body.geo_type === 'polygon' ? 'polygon' : 'circle');
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No update fields provided' });
  }

  values.push(sessionId);
  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  return res.json({ success: true, session: updated, message: 'Geofence updated' });
});

// 6b. On-the-fly Toggle 1: Enable / Disable Geofence toggle
router.patch('/sessions/:id/toggle-geofence', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const newStatus = session.geo_fence_enabled === 1 ? 0 : 1;
  db.prepare('UPDATE sessions SET geo_fence_enabled = ? WHERE id = ?').run(newStatus, sessionId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

  return res.json({ 
    success: true, 
    geo_fence_enabled: newStatus === 1,
    message: newStatus === 1 ? 'Geofence enabled' : 'Geofence disabled (bypassed)',
    session: updated 
  });
});

// 6c. On-the-fly Toggle 2: Enable / Disable Unique PIN toggle
router.patch('/sessions/:id/toggle-pin', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const currentPinReq = session.pin_required !== 0 ? 1 : 0;
  const newStatus = currentPinReq === 1 ? 0 : 1;
  db.prepare('UPDATE sessions SET pin_required = ? WHERE id = ?').run(newStatus, sessionId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

  return res.json({ 
    success: true, 
    pin_required: newStatus === 1,
    message: newStatus === 1 ? 'Unique PIN requirement enabled' : 'Unique PIN requirement disabled (QR scan only)',
    session: updated 
  });
});

// 6d. On-the-fly Toggle 3: Enable / Disable Static QR Mode (freezes QR rotation on display screen)
router.patch('/sessions/:id/toggle-static-qr', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const isCurrentlyStatic = Number(session.static_qr_mode) === 1;
  let newMode;
  if (req.body && req.body.enabled !== undefined) {
    newMode = req.body.enabled ? 1 : 0;
  } else if (req.body && req.body.static_qr_mode !== undefined) {
    newMode = req.body.static_qr_mode ? 1 : 0;
  } else {
    newMode = isCurrentlyStatic ? 0 : 1;
  }
  db.prepare('UPDATE sessions SET static_qr_mode = ? WHERE id = ?').run(newMode, sessionId);

  const now = Date.now();
  if (newMode === 1) {
    // FREEZE: extend current active token by 24 hours so it is completely locked/static
    const latestToken = db.prepare(`
      SELECT * FROM qr_tokens 
      WHERE session_id = ? 
      ORDER BY id DESC LIMIT 1
    `).get(sessionId);

    if (latestToken) {
      db.prepare('UPDATE qr_tokens SET expires_at = ?, duration_ms = ? WHERE id = ?')
        .run(now + 86400000, 86400000, latestToken.id);
    } else {
      generateTokenForSession(sessionId, true);
    }
  } else {
    // RESUME DYNAMIC: set the latest token to expire in standard 30s so rotation resumes cleanly
    const latestToken = db.prepare(`
      SELECT * FROM qr_tokens 
      WHERE session_id = ? 
      ORDER BY id DESC LIMIT 1
    `).get(sessionId);

    if (latestToken) {
      db.prepare('UPDATE qr_tokens SET expires_at = ?, duration_ms = ? WHERE id = ?')
        .run(now + 30000, 30000, latestToken.id);
    }
  }

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

  return res.json({
    success: true,
    static_qr_mode: newMode === 1,
    message: newMode === 1
      ? 'Static QR mode enabled — display screen will show a frozen QR (no rotation)'
      : 'Static QR mode disabled — display screen resumes rotating anti-proxy QR',
    session: updated
  });
});

// Helper for walk-in student ID generation: first 4 uppercase letters of Name + 4 digits from mobile or USN
function computeStudentIDForWalkin(name, mobile, usn) {
  const cleanName = (name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const namePart = cleanName.length >= 4 ? cleanName.substring(0, 4) : cleanName.padEnd(4, 'X');

  let suffix = '';
  const cleanMobile = (mobile || '').replace(/\D/g, '');
  if (cleanMobile.length >= 4) {
    suffix = cleanMobile.slice(-4);
  } else {
    const cleanUsnDigits = (usn || '').replace(/\D/g, '');
    if (cleanUsnDigits.length >= 4) {
      suffix = cleanUsnDigits.slice(-4);
    } else {
      suffix = cleanUsnDigits.padStart(4, '0');
    }
  }
  return `${namePart}${suffix}`;
}

// 7. Manual Attendance Override / Error Correction (Registered students or by Student ID / USN)
// Add attendance manually for a student who had a device/scan issue
router.post('/attendance/manual-mark', (req, res) => {
  const { session_id, student_id, usn, remarks } = req.body;

  const lookupKey = (student_id || usn || '').trim().toUpperCase();
  if (!session_id || !lookupKey) {
    return res.status(400).json({ error: 'Session ID and Student ID or USN are required' });
  }

  const student = db.prepare('SELECT * FROM students WHERE student_id = ? OR usn = ?').get(lookupKey, lookupKey);
  if (!student) {
    return res.status(404).json({ error: 'Student not found in roster with ID or USN: ' + lookupKey });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const adminName = (req.admin && req.admin.username) ? req.admin.username : 'admin';
  const customRemarks = (remarks && remarks.trim()) ? remarks.trim() : 'Manual entry by administrator';
  const tokenUsed = student.is_registered === 0 ? 'MANUAL_UNREGISTERED' : 'MANUAL_ADMIN_OVERRIDE';

  try {
    const insertStmt = db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
      VALUES (?, ?, 1, ?, 1, ?, ?)
    `);
    insertStmt.run(session_id, student.student_id, tokenUsed, customRemarks, adminName);

    return res.json({
      success: true,
      message: `Manually marked attendance for ${student.name} (${student.student_id})`,
      student,
      is_registered: student.is_registered !== 0
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: `Attendance already marked for ${student.name} (${student.student_id}) in this session` });
    }
    return res.status(500).json({ error: 'Database error' });
  }
});

// 7b. Manual Attendance for Unregistered / Walk-in Students
router.post('/attendance/manual-unregistered', (req, res) => {
  const { session_id, name, usn, department, year, cycle, mobile, remarks } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Validate required inputs
  const trimmedName = (name || '').trim();
  const cleanUsn = (usn || '').trim().toUpperCase();

  if (!trimmedName) {
    return res.status(400).json({ error: 'Student full name is required' });
  }
  if (!cleanUsn) {
    return res.status(400).json({ error: 'USN / Student ID is required' });
  }

  const numYear = parseInt(year, 10);
  if (isNaN(numYear) || numYear < 1 || numYear > 4) {
    return res.status(400).json({ error: 'Year of study must be between 1 and 4' });
  }

  let studentCycle = null;
  let finalDepartment = (department || '').trim();

  if (numYear === 1) {
    if (!cycle || (!cycle.includes('Physics') && !cycle.includes('Chemistry'))) {
      return res.status(400).json({ error: '1st Year students must specify Cycle (Physics Cycle or Chemistry Cycle)' });
    }
    studentCycle = cycle.includes('Physics') ? 'Physics Cycle' : 'Chemistry Cycle';
    finalDepartment = `Basic Sciences (${studentCycle})`;
  } else {
    if (!finalDepartment || finalDepartment === 'ALL') {
      return res.status(400).json({ error: 'Department is required for Year 2, 3, and 4 students' });
    }
  }

  // Mobile validation (optional, but if provided must be valid)
  let cleanMobile = '';
  if (mobile && String(mobile).trim()) {
    cleanMobile = String(mobile).replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      return res.status(400).json({ error: 'Mobile number must be at least 10 digits if provided' });
    }
  }

  const adminName = (req.admin && req.admin.username) ? req.admin.username : 'admin';
  const customRemarks = (remarks && remarks.trim()) ? remarks.trim() : 'Manual unregistered walk-in entry';

  // Check if student already exists in database (Case A & Case B)
  const existingStudent = db.prepare('SELECT * FROM students WHERE usn = ? OR student_id = ?').get(cleanUsn, cleanUsn);

  if (existingStudent) {
    // Check if attendance already marked in this session
    const existingAttendance = db.prepare('SELECT id FROM attendance WHERE session_id = ? AND student_id = ?').get(session_id, existingStudent.student_id);
    if (existingAttendance) {
      return res.status(409).json({
        error: `Attendance already recorded for ${existingStudent.name} (${existingStudent.student_id}) in this session`,
        student: existingStudent,
        already_marked: true
      });
    }

    // Determine category:
    // Case A: Student is registered (is_registered = 1)
    // Case B: Student exists but unregistered (is_registered = 0)
    const isRegistered = existingStudent.is_registered === 1 || existingStudent.is_registered === null;
    const tokenUsed = isRegistered ? 'MANUAL_ADMIN_OVERRIDE' : 'MANUAL_UNREGISTERED';

    try {
      db.prepare(`
        INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
        VALUES (?, ?, 1, ?, 1, ?, ?)
      `).run(session_id, existingStudent.student_id, tokenUsed, customRemarks, adminName);

      return res.status(200).json({
        success: true,
        category: isRegistered ? 'registered_existing' : 'unregistered_existing',
        message: isRegistered
          ? `Recorded attendance against existing registered record for ${existingStudent.name} (${existingStudent.student_id})`
          : `Recorded attendance against existing walk-in record for ${existingStudent.name} (${existingStudent.student_id})`,
        student: existingStudent
      });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: `Attendance already marked for ${existingStudent.name} in this session` });
      }
      return res.status(500).json({ error: 'Database error recording attendance' });
    }
  }

  // Case C: Student does NOT exist in the database.
  // Create unregistered student (is_registered = 0) and attendance atomically in a transaction.
  const createUnregisteredTx = db.transaction(() => {
    let baseId = computeStudentIDForWalkin(trimmedName, cleanMobile, cleanUsn);
    let candidateId = baseId;
    let counter = 1;
    while (true) {
      const exists = db.prepare('SELECT id FROM students WHERE student_id = ?').get(candidateId);
      if (!exists) break;
      candidateId = `${baseId}${counter++}`;
    }
    const finalStudentId = candidateId;

    db.prepare(`
      INSERT INTO students (name, usn, department, year, cycle, mobile, student_id, is_registered)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(trimmedName, cleanUsn, finalDepartment, numYear, studentCycle, cleanMobile, finalStudentId);

    db.prepare(`
      INSERT INTO attendance (session_id, student_id, geo_verified, token_used, is_manual, remarks, marked_by)
      VALUES (?, ?, 1, 'MANUAL_UNREGISTERED', 1, ?, ?)
    `).run(session_id, finalStudentId, customRemarks, adminName);

    return {
      student_id: finalStudentId,
      name: trimmedName,
      usn: cleanUsn,
      department: finalDepartment,
      year: numYear,
      cycle: studentCycle,
      mobile: cleanMobile,
      is_registered: 0
    };
  });

  try {
    const newStudent = createUnregisteredTx();
    return res.status(201).json({
      success: true,
      category: 'unregistered_new',
      message: `Unregistered student ${trimmedName} (${newStudent.student_id}) added and attendance marked`,
      student: newStudent
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Duplicate entry detected (USN or session attendance already exists)' });
    }
    console.error('[Manual Unregistered Error]', err);
    return res.status(500).json({ error: 'Failed to record unregistered student attendance: ' + err.message });
  }
});

// Delete an attendance entry if recorded in error
router.delete('/attendance/:attendanceId', (req, res) => {
  const id = parseInt(req.params.attendanceId, 10);
  const delStmt = db.prepare('DELETE FROM attendance WHERE id = ?');
  const result = delStmt.run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  return res.json({ success: true, message: 'Attendance record removed' });
});

// Edit an attendance entry (Update Student ID or GPS Verification)
router.put('/attendance/:attendanceId', (req, res) => {
  const id = parseInt(req.params.attendanceId, 10);
  const { student_id, geo_verified, marked_at } = req.body;

  const current = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  const cleanStudentId = student_id ? student_id.trim().toUpperCase() : current.student_id;
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(cleanStudentId);
  if (!student) {
    return res.status(404).json({ error: `Student ID "${cleanStudentId}" not found in roster` });
  }

  try {
    db.prepare(`
      UPDATE attendance
      SET student_id = ?, geo_verified = ?, marked_at = COALESCE(?, marked_at)
      WHERE id = ?
    `).run(
      cleanStudentId,
      geo_verified !== undefined ? (geo_verified ? 1 : 0) : current.geo_verified,
      marked_at || null,
      id
    );

    const updated = db.prepare(`
      SELECT 
        a.id,
        a.marked_at,
        a.lat,
        a.lng,
        a.geo_verified,
        s.student_id,
        s.name,
        s.usn,
        s.department,
        s.year,
        s.cycle,
        s.mobile
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      WHERE a.id = ?
    `).get(id);

    return res.json({ success: true, message: 'Attendance record updated successfully', record: updated });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'This student already has an attendance record in this session' });
    }
    return res.status(500).json({ error: 'Database update failed: ' + err.message });
  }
});

// 8. Student Roster Management (Search, Filter, List)
router.get('/students', (req, res) => {
  const { search, year, department, registration_status } = req.query;

  let query = 'SELECT * FROM students WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (name LIKE ? OR usn LIKE ? OR student_id LIKE ? OR mobile LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (year && year !== 'ALL') {
    query += ' AND year = ?';
    params.push(parseInt(year, 10));
  }

  if (department && department !== 'ALL') {
    query += ' AND (department = ? OR department LIKE ?)';
    params.push(department, `%${department}%`);
  }

  if (registration_status === 'registered') {
    query += ' AND (is_registered = 1 OR is_registered IS NULL)';
  } else if (registration_status === 'unregistered') {
    query += ' AND is_registered = 0';
  }

  query += ' ORDER BY id DESC';

  const students = db.prepare(query).all(...params);
  return res.json({ total: students.length, students });
});

// Edit a student roster entry
router.put('/students/:studentId', (req, res) => {
  const currentStudentId = req.params.studentId.toUpperCase();
  const { name, usn, department, year, cycle, mobile, new_student_id, is_registered } = req.body;

  const existing = db.prepare('SELECT * FROM students WHERE student_id = ?').get(currentStudentId);
  if (!existing) {
    return res.status(404).json({ error: 'Student not found in roster' });
  }

  const finalName = name !== undefined && name !== null ? name.trim() : existing.name;
  const finalUsn = usn !== undefined && usn !== null ? usn.trim().toUpperCase() : existing.usn;
  const finalDept = department !== undefined && department !== null ? department.trim() : existing.department;
  const finalYear = year !== undefined && year !== null ? parseInt(year, 10) : existing.year;
  const finalCycle = cycle !== undefined ? cycle : existing.cycle;
  const finalMobile = mobile !== undefined && mobile !== null ? mobile.trim() : existing.mobile;
  const finalStudentId = new_student_id !== undefined && new_student_id !== null ? new_student_id.trim().toUpperCase() : existing.student_id;
  const finalIsRegistered = is_registered !== undefined
    ? ((is_registered === 1 || is_registered === true || is_registered === '1') ? 1 : 0)
    : (existing.is_registered === undefined || existing.is_registered === null ? 1 : existing.is_registered);

  try {
    db.prepare(`
      UPDATE students 
      SET name = ?, usn = ?, department = ?, year = ?, cycle = ?, mobile = ?, student_id = ?, is_registered = ?
      WHERE id = ?
    `).run(
      finalName,
      finalUsn,
      finalDept,
      finalYear,
      finalCycle,
      finalMobile,
      finalStudentId,
      finalIsRegistered,
      existing.id
    );

    // If student_id changed, update attendance records referencing it
    if (finalStudentId !== currentStudentId) {
      db.prepare('UPDATE attendance SET student_id = ? WHERE student_id = ?').run(finalStudentId, currentStudentId);
    }

    const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(existing.id);
    return res.json({ success: true, message: 'Student roster entry updated successfully', student: updated });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'USN or Student ID already exists for another student' });
    }
    return res.status(500).json({ error: 'Failed to update student: ' + err.message });
  }
});

// Delete a student from roster
router.delete('/students/:studentId', (req, res) => {
  const { studentId } = req.params;
  const result = db.prepare('DELETE FROM students WHERE student_id = ?').run(studentId.toUpperCase());

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Student not found' });
  }

  return res.json({ success: true, message: `Student ${studentId} deleted from roster` });
});

// 9. Change Admin Password
router.post('/change-password', (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin) {
    return res.status(404).json({ error: 'Admin user not found' });
  }

  const isMatch = bcrypt.compareSync(current_password, admin.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Current password does not match' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(new_password, salt);
  const updateResult = db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  if (!updateResult || updateResult.changes === 0) {
    return res.status(500).json({ error: 'Failed to commit password change to database' });
  }

  // Commit and flush WAL pages directly into persistent storage
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (cpErr) {
    console.warn('[DB Checkpoint Notice]', cpErr.message);
  }

  return res.json({ success: true, message: 'Password changed successfully' });
});

// 10. Venue Config (Persistent Map-based auditorium/venue settings)
router.get('/venue-config', (req, res) => {
  let config = db.prepare('SELECT * FROM venue_configs ORDER BY id DESC LIMIT 1').get();
  if (!config) {
    config = {
      venue_name: 'MVJCE Central Auditorium',
      geo_lat: 12.983020,
      geo_lng: 77.759970,
      geo_radius_m: 100,
      geo_corners: null,
      mappls_api_key: ''
    };
  }
  return res.json({ success: true, config });
});

router.post('/venue-config', (req, res) => {
  const { venue_name, geo_lat, geo_lng, geo_radius_m, geo_corners, geo_type, mappls_api_key } = req.body;
  const venueType = geo_type === 'polygon' ? 'polygon' : 'circle';
  const cornersJson = geo_corners ? (typeof geo_corners === 'string' ? geo_corners : JSON.stringify(geo_corners)) : null;

  let effLat = parseFloat(geo_lat);
  let effLng = parseFloat(geo_lng);

  if ((isNaN(effLat) || isNaN(effLng)) && geo_corners) {
    try {
      const parsed = typeof geo_corners === 'string' ? JSON.parse(geo_corners) : geo_corners;
      if (Array.isArray(parsed) && parsed.length > 0) {
        effLat = parsed.reduce((sum, p) => sum + parseFloat(p.lat), 0) / parsed.length;
        effLng = parsed.reduce((sum, p) => sum + parseFloat(p.lng), 0) / parsed.length;
      }
    } catch {}
  }

  if (isNaN(effLat) || isNaN(effLng)) {
    return res.status(400).json({ error: 'Valid coordinates or polygon vertices are required' });
  }

  const existing = db.prepare('SELECT id FROM venue_configs ORDER BY id DESC LIMIT 1').get();
  if (existing) {
    db.prepare(`
      UPDATE venue_configs 
      SET venue_name = ?, geo_type = ?, geo_lat = ?, geo_lng = ?, geo_radius_m = ?, geo_corners = ?, mappls_api_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      venue_name || 'MVJCE Central Auditorium',
      venueType,
      parseFloat(effLat.toFixed(6)),
      parseFloat(effLng.toFixed(6)),
      parseInt(geo_radius_m, 10) || 100,
      cornersJson,
      mappls_api_key || '',
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO venue_configs (venue_name, geo_type, geo_lat, geo_lng, geo_radius_m, geo_corners, mappls_api_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      venue_name || 'MVJCE Central Auditorium',
      venueType,
      parseFloat(effLat.toFixed(6)),
      parseFloat(effLng.toFixed(6)),
      parseInt(geo_radius_m, 10) || 100,
      cornersJson,
      mappls_api_key || ''
    );
  }

  return res.json({ 
    success: true, 
    message: 'Venue configuration saved successfully',
    config: {
      venue_name: venue_name || 'MVJCE Central Auditorium',
      geo_type: venueType,
      geo_lat: parseFloat(effLat.toFixed(6)),
      geo_lng: parseFloat(effLng.toFixed(6)),
      geo_radius_m: parseInt(geo_radius_m, 10) || 100,
      geo_corners: cornersJson
    }
  });
});

// 11. Saved Preset Locations Management
router.get('/saved-locations', (req, res) => {
  const locations = db.prepare('SELECT * FROM saved_locations ORDER BY is_default DESC, id ASC').all();
  return res.json({ success: true, locations });
});

router.post('/saved-locations', (req, res) => {
  const { name, description, type, geo_lat, geo_lng, geo_radius_m, geo_corners, is_default } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Location name is required' });
  }

  const locType = type === 'polygon' ? 'polygon' : 'circle';
  const cornersJson = geo_corners ? (typeof geo_corners === 'string' ? geo_corners : JSON.stringify(geo_corners)) : null;

  let effLat = parseFloat(geo_lat);
  let effLng = parseFloat(geo_lng);

  if ((isNaN(effLat) || isNaN(effLng)) && geo_corners) {
    try {
      const parsed = typeof geo_corners === 'string' ? JSON.parse(geo_corners) : geo_corners;
      if (Array.isArray(parsed) && parsed.length > 0) {
        effLat = parsed.reduce((sum, p) => sum + parseFloat(p.lat), 0) / parsed.length;
        effLng = parsed.reduce((sum, p) => sum + parseFloat(p.lng), 0) / parsed.length;
      }
    } catch {}
  }

  if (isNaN(effLat) || isNaN(effLng)) {
    return res.status(400).json({ error: 'Valid coordinates or polygon vertices are required' });
  }

  if (is_default) {
    db.prepare('UPDATE saved_locations SET is_default = 0').run();
  }

  const insert = db.prepare(`
    INSERT INTO saved_locations (name, description, type, geo_lat, geo_lng, geo_radius_m, geo_corners, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    name.trim(),
    (description || '').trim(),
    locType,
    parseFloat(effLat.toFixed(6)),
    parseFloat(effLng.toFixed(6)),
    geo_radius_m ? parseInt(geo_radius_m, 10) : 100,
    cornersJson,
    is_default ? 1 : 0
  );

  const newLoc = db.prepare('SELECT * FROM saved_locations WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ success: true, location: newLoc, message: 'Preset location saved successfully' });
});

router.put('/saved-locations/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, description, type, geo_lat, geo_lng, geo_radius_m, geo_corners, is_default } = req.body;

  const existing = db.prepare('SELECT * FROM saved_locations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Saved location not found' });
  }

  if (is_default) {
    db.prepare('UPDATE saved_locations SET is_default = 0').run();
  }

  const cornersJson = geo_corners !== undefined 
    ? (geo_corners ? (typeof geo_corners === 'string' ? geo_corners : JSON.stringify(geo_corners)) : null)
    : existing.geo_corners;

  let effLat = geo_lat !== undefined ? parseFloat(geo_lat) : existing.geo_lat;
  let effLng = geo_lng !== undefined ? parseFloat(geo_lng) : existing.geo_lng;

  if ((isNaN(effLat) || isNaN(effLng)) && geo_corners) {
    try {
      const parsed = typeof geo_corners === 'string' ? JSON.parse(geo_corners) : geo_corners;
      if (Array.isArray(parsed) && parsed.length > 0) {
        effLat = parsed.reduce((sum, p) => sum + parseFloat(p.lat), 0) / parsed.length;
        effLng = parsed.reduce((sum, p) => sum + parseFloat(p.lng), 0) / parsed.length;
      }
    } catch {}
  }

  db.prepare(`
    UPDATE saved_locations 
    SET name = ?, description = COALESCE(?, description), type = ?, geo_lat = ?, geo_lng = ?, geo_radius_m = ?, geo_corners = ?, is_default = COALESCE(?, is_default), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name ? name.trim() : existing.name,
    description !== undefined ? description.trim() : null,
    type || existing.type,
    !isNaN(effLat) ? parseFloat(effLat.toFixed(6)) : existing.geo_lat,
    !isNaN(effLng) ? parseFloat(effLng.toFixed(6)) : existing.geo_lng,
    geo_radius_m !== undefined ? parseInt(geo_radius_m, 10) : existing.geo_radius_m,
    cornersJson,
    is_default !== undefined ? (is_default ? 1 : 0) : null,
    id
  );

  const updated = db.prepare('SELECT * FROM saved_locations WHERE id = ?').get(id);
  return res.json({ success: true, location: updated, message: 'Saved location updated' });
});

router.delete('/saved-locations/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = db.prepare('DELETE FROM saved_locations WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Saved location not found' });
  }
  return res.json({ success: true, message: 'Location deleted from saved presets' });
});

module.exports = router;
