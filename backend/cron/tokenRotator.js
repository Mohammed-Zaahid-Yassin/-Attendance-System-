const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

let rotatorTimer = null;

function rotateActiveSessions() {
  try {
    const now = Date.now();
    // Only rotate sessions that are active
    const activeSessions = db.prepare('SELECT id, static_qr_mode FROM sessions WHERE is_active = 1').all();

    for (const session of activeSessions) {
      // NEVER rotate sessions in static QR mode
      if (Number(session.static_qr_mode) === 1 || session.static_qr_mode === true) {
        continue;
      }

      const activeToken = db.prepare(`
        SELECT id FROM qr_tokens 
        WHERE session_id = ? AND expires_at > ? 
        ORDER BY id DESC LIMIT 1
      `).get(session.id, now);

      // If the current token has expired, generate the next authoritative token
      if (!activeToken) {
        generateTokenForSession(session.id, false);
      }
    }

    // Cleanup tokens older than 1 hour to keep SQLite clean (do NOT delete static tokens of active sessions)
    const oneHourAgo = now - 3600000;
    db.prepare(`
      DELETE FROM qr_tokens 
      WHERE expires_at < ? 
        AND session_id IN (SELECT id FROM sessions WHERE static_qr_mode IS NULL OR static_qr_mode = 0 OR static_qr_mode = '0')
    `).run(oneHourAgo);
  } catch (err) {
    console.error('[TokenRotator] Error during rotation cycle:', err.message);
  }
}

// Generate and insert a new token for a specific session
function generateTokenForSession(sessionId, isStatic = false) {
  const token = uuidv4();
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();

  let totalDurationMs;
  let expiresAt;

  if (isStatic) {
    totalDurationMs = 86400000; // 24 hours for frozen static mode
    expiresAt = now + totalDurationMs;
  } else {
    // Requirements: Minimum 30s validity + randomized delay of 0-5s (total 30,000 to 35,000 ms)
    const baseValidityMs = 30000;
    const randomDelayMs = Math.floor(Math.random() * 5001); // 0 to 5000 ms
    totalDurationMs = baseValidityMs + randomDelayMs;
    expiresAt = now + totalDurationMs;
  }

  const insertStmt = db.prepare(`
    INSERT INTO qr_tokens (session_id, token, unique_pin, expires_at, duration_ms, issued_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(sessionId, token, pin, expiresAt, totalDurationMs, now);

  return { 
    token, 
    unique_pin: pin, 
    issued_at: now,
    expires_at: expiresAt,
    duration_ms: totalDurationMs,
    is_static: isStatic
  };
}

// Get the latest valid token for a session
function getCurrentToken(sessionId) {
  const now = Date.now();
  const session = db.prepare('SELECT id, is_active, static_qr_mode FROM sessions WHERE id = ?').get(sessionId);
  if (!session || session.is_active !== 1) return null;

  const isStatic = Number(session.static_qr_mode) === 1 || session.static_qr_mode === true;

  // For static QR mode: return the session's fixed token without rotating
  if (isStatic) {
    let tokenRow = db.prepare(`
      SELECT token, unique_pin, expires_at, duration_ms, issued_at 
      FROM qr_tokens 
      WHERE session_id = ? 
      ORDER BY id DESC LIMIT 1
    `).get(sessionId);

    if (tokenRow) {
      // Ensure the static token expiration stays far in the future
      if (tokenRow.expires_at < now + 3600000) {
        const farFuture = now + 86400000;
        db.prepare('UPDATE qr_tokens SET expires_at = ?, duration_ms = ? WHERE token = ?')
          .run(farFuture, 86400000, tokenRow.token);
        tokenRow.expires_at = farFuture;
      }
      return {
        ...tokenRow,
        issued_at: tokenRow.issued_at || now,
        duration_ms: 86400000,
        time_remaining_ms: 86400000,
        is_static: true
      };
    }

    // If none exists yet, generate a frozen static token
    const newToken = generateTokenForSession(sessionId, true);
    return {
      ...newToken,
      time_remaining_ms: 86400000,
      is_static: true
    };
  }

  // Dynamic rotating mode:
  const tokenRow = db.prepare(`
    SELECT token, unique_pin, expires_at, duration_ms, issued_at 
    FROM qr_tokens 
    WHERE session_id = ? AND expires_at > ? 
    ORDER BY id DESC LIMIT 1
  `).get(sessionId, now);

  if (tokenRow) {
    const duration = tokenRow.duration_ms || 30000;
    const issuedAt = tokenRow.issued_at || (tokenRow.expires_at - duration);
    return {
      ...tokenRow,
      issued_at: issuedAt,
      duration_ms: duration,
      time_remaining_ms: Math.max(0, tokenRow.expires_at - now),
      is_static: false
    };
  }

  // If none active, generate one on the fly for active dynamic session
  const newToken = generateTokenForSession(sessionId, false);
  return {
    ...newToken,
    time_remaining_ms: Math.max(0, newToken.expires_at - now),
    is_static: false
  };
}

// Start the rotation task (checks expiration every 1 second)
function startTokenRotator() {
  if (rotatorTimer) {
    return;
  }

  rotatorTimer = setInterval(rotateActiveSessions, 1000);
  if (rotatorTimer && typeof rotatorTimer.unref === 'function') {
    rotatorTimer.unref();
  }
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
