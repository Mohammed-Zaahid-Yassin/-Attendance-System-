const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
require('dotenv').config();

const REGISTRATION_KEY = process.env.REGISTRATION_KEY || 'STATIC_REG_QR_KEY_SECRET_7890';

// Helper to compute Student ID: first 4 letters of name in uppercase + last 4 digits of mobile
function computeStudentID(name, mobile) {
  // Strip non-alpha characters from name
  const cleanName = (name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const namePart = cleanName.length >= 4 
    ? cleanName.substring(0, 4) 
    : cleanName.padEnd(4, 'X');

  // Strip non-digit characters from mobile
  const cleanMobile = (mobile || '').replace(/\D/g, '');
  const mobilePart = cleanMobile.length >= 4 
    ? cleanMobile.slice(-4) 
    : cleanMobile.padStart(4, '0');

  return `${namePart}${mobilePart}`;
}

// Verify registration key for frontend guard
router.get('/registration-key/verify', (req, res) => {
  const { key } = req.query;
  if (!key || key !== REGISTRATION_KEY) {
    return res.status(403).json({ valid: false, error: 'Unauthorized: Invalid registration key' });
  }
  return res.json({ valid: true });
});

// Student Registration Endpoint
router.post('/register', (req, res) => {
  const { key, name, usn, department, year, cycle, mobile } = req.body;

  // Enforce access control via secret static QR key
  if (!key || key !== REGISTRATION_KEY) {
    return res.status(403).json({ error: 'Access Denied: Registration is only accessible via the official Admin Static QR code.' });
  }

  // Basic field checks
  if (!name || !usn || !year || !mobile) {
    return res.status(400).json({ error: 'Name, USN / Admission Number, Year of Study, and Mobile Number are required.' });
  }

  const numYear = parseInt(year, 10);
  if (isNaN(numYear) || numYear < 1 || numYear > 4) {
    return res.status(400).json({ error: 'Year must be between 1 and 4.' });
  }

  // Cycle check: Only applicable and mandatory for 1st years
  let studentCycle = null;
  let finalDepartment = (department || '').trim();

  if (numYear === 1) {
    if (!cycle || (cycle !== 'Physics' && cycle !== 'Chemistry' && cycle !== 'Physics Cycle' && cycle !== 'Chemistry Cycle')) {
      return res.status(400).json({ error: 'First year students must specify Cycle (Physics Cycle or Chemistry Cycle).' });
    }
    studentCycle = cycle.includes('Physics') ? 'Physics Cycle' : 'Chemistry Cycle';
    finalDepartment = `Basic Sciences (${studentCycle})`;
  } else {
    // 2nd, 3rd, 4th year require Department
    if (!finalDepartment) {
      return res.status(400).json({ error: 'Please select your Engineering Department.' });
    }
  }

  // Mobile validation
  const cleanMobile = mobile.replace(/\D/g, '');
  if (cleanMobile.length < 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }

  // Check if USN is already registered
  const existingUSN = db.prepare('SELECT student_id, name FROM students WHERE usn = ?').get(usn.trim().toUpperCase());
  if (existingUSN) {
    return res.status(409).json({
      error: `USN/Admission No. is already registered with Student ID: ${existingUSN.student_id}`,
      student_id: existingUSN.student_id
    });
  }

  // Generate base Student ID
  let studentId = computeStudentID(name, cleanMobile);

  // If collision with another student's ID, add a numeric suffix
  let candidateId = studentId;
  let counter = 1;
  while (true) {
    const existingID = db.prepare('SELECT id FROM students WHERE student_id = ?').get(candidateId);
    if (!existingID) {
      studentId = candidateId;
      break;
    }
    candidateId = `${studentId}${counter++}`;
  }

  try {
    const insertStmt = db.prepare(`
      INSERT INTO students (name, usn, department, year, cycle, mobile, student_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      name.trim(),
      usn.trim().toUpperCase(),
      finalDepartment,
      numYear,
      studentCycle,
      cleanMobile,
      studentId
    );

    return res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      student: {
        student_id: studentId,
        name: name.trim(),
        usn: usn.trim().toUpperCase(),
        department: finalDepartment,
        year: numYear,
        cycle: studentCycle,
        mobile: cleanMobile
      }
    });
  } catch (err) {
    console.error('[Registration Error]', err);
    return res.status(500).json({ error: 'Database error during student registration.' });
  }
});

// Admin Route to generate the static QR code for student registration
router.get('/admin/registration-qr', adminAuth, async (req, res) => {
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
      'https://attendance-system-mvjce-6rxahczaj-zaahid1.vercel.app'
    ).replace(/\/$/, '');

    // Safeguard: if origin points to the Render backend service, rewrite to Vercel
    if (frontendOrigin.includes('onrender.com')) {
      frontendOrigin = 'https://attendance-system-mvjce-6rxahczaj-zaahid1.vercel.app';
    }

    const registrationUrl = `${frontendOrigin}/register?key=${encodeURIComponent(REGISTRATION_KEY)}`;

    // 512x512 with pure black modules — maximum compatibility with native
    // iOS/Android cameras and older QR reader apps.
    // Error correction M (15%) is a good balance between density and resilience.
    const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 512,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    return res.json({
      success: true,
      url: registrationUrl,
      key: REGISTRATION_KEY,
      qr_code: qrDataUrl
    });
  } catch (err) {
    console.error('[QR Generation Error]', err);
    return res.status(500).json({ error: 'Failed to generate registration QR code.' });
  }
});

module.exports = router;
