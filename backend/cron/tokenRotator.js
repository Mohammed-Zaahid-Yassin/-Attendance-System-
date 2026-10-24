const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

let rotatorTimer = null;

function rotateActiveSessions() {
  try {
    const now = Date.now();
    const activeSessions = db.prepare('SELECT id FROM sessions WHERE is_active = 1').all();
    for (const session of activeSessions) {
      const activeToken = db.prepare(`
        SELECT id FROM qr_tokens 
        WHERE session_id = ? AND expires_at > ? 
        ORDER BY id DESC LIMIT 1
      `).get(session.id, now);

      // If the current token has expired, generate the next authoritative token
      if (!activeToken) {
        generateTokenForSession(session.id);
      }
    }

    // Cleanup tokens older than 1 hour to keep SQLite clean
    const oneHourAgo = now - 3600000;
    db.prepare('DELETE FROM qr_tokens WHERE expires_at < ?').run(oneHourAgo);
  } catch (err) {
    console.error('[TokenRotator] Error during rotation cycle:', err.message);
  }
}

// Generate and insert a new token for a specific session with 30-35s randomized validity
function generateTokenForSession(sessionId) {
  const token = uuidv4();
  const pin = Math.floor(100000 + Math.random() * 900000).toString();

  // Requirements: Minimum 30s validity + randomized delay of 0-5s (total 30,000 to 35,000 ms)
  const baseValidityMs = 30000;
  const randomDelayMs = Math.floor(Math.random() * 5001); // 0 to 5000 ms
  const totalDurationMs = baseValidityMs + randomDelayMs;
  const expiresAt = Date.now() + totalDurationMs;

  const insertStmt = db.prepare(`
    INSERT INTO qr_tokens (session_id, token, unique_pin, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  insertStmt.run(sessionId, token, pin, expiresAt);

  return { 
    token, 
    unique_pin: pin, 
    expires_at: expiresAt,
    duration_ms: totalDurationMs
  };
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

// Start the rotation task (checks expiration every 1 second)
function startTokenRotator() {
  if (rotatorTimer) {
    return;
  }

  rotatorTimer = setInterval(rotateActiveSessions, 1000);
  console.log('[TokenRotator] Rotation engine started: 30-35s randomized window per session');
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
