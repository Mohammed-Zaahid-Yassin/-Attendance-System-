const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

let rotatorTimer = null;

function rotateActiveSessions() {
  try {
    const activeSessions = db.prepare('SELECT id FROM sessions WHERE is_active = 1').all();
    for (const session of activeSessions) {
      generateTokenForSession(session.id);
    }

    // Cleanup tokens older than 1 hour to keep SQLite clean
    const oneHourAgo = Date.now() - 3600000;
    db.prepare('DELETE FROM qr_tokens WHERE expires_at < ?').run(oneHourAgo);
  } catch (err) {
    console.error('[TokenRotator] Error during rotation cycle:', err.message);
  }
}

// Generate and insert a new token for a specific session
function generateTokenForSession(sessionId) {
  const token = uuidv4();
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  // Valid for 29 seconds (25s rotation + 4s grace buffer)
  const expiresAt = Date.now() + 29000;

  const insertStmt = db.prepare(`
    INSERT INTO qr_tokens (session_id, token, unique_pin, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  insertStmt.run(sessionId, token, pin, expiresAt);

  return { token, unique_pin: pin, expires_at: expiresAt };
}

// Get the latest valid token for a session
function getCurrentToken(sessionId) {
  const now = Date.now();
  const tokenRow = db.prepare(`
    SELECT token, unique_pin, expires_at 
    FROM qr_tokens 
    WHERE session_id = ? AND expires_at > ? 
    ORDER BY id DESC LIMIT 1
  `).get(sessionId, now);

  if (tokenRow) {
    return {
      ...tokenRow,
      time_remaining_ms: Math.max(0, tokenRow.expires_at - now)
    };
  }

  // If none active, generate one on the fly for active session
  const session = db.prepare('SELECT id, is_active FROM sessions WHERE id = ?').get(sessionId);
  if (session && session.is_active === 1) {
    const newToken = generateTokenForSession(sessionId);
    return {
      ...newToken,
      time_remaining_ms: Math.max(0, newToken.expires_at - now)
    };
  }

  return null;
}

// Start the rotation task (runs every 25 seconds)
function startTokenRotator() {
  if (rotatorTimer) {
    return;
  }

  rotatorTimer = setInterval(rotateActiveSessions, 25000);
  console.log('[TokenRotator] Rotation engine started: rotating session QR tokens & PINs every 25s');
}

function stopTokenRotator() {
  if (rotatorTimer) {
    clearInterval(rotatorTimer);
    rotatorTimer = null;
    console.log('[TokenRotator] Rotation engine stopped');
  }
}

module.exports = {
  startTokenRotator,
  stopTokenRotator,
  getCurrentToken,
  generateTokenForSession
};
