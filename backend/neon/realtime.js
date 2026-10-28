const { createRealtime, rawSql } = require('@neon/realtime/server');
const env = require('./env');

let realtime = null;

if (env.NEON_REALTIME_SECRET) {
  try {
    realtime = createRealtime({
      secret: env.NEON_REALTIME_SECRET,
      db: 'neondb'
    });
  } catch (err) {
    console.warn('[Neon Realtime] Initialization warning:', err.message);
  }
}

/**
 * Seal an arbitrary raw SQL query with parameters
 */
async function sealQuery(sqlQuery, params = []) {
  if (!realtime) {
    throw new Error('Neon Realtime secret is not configured');
  }
  const query = rawSql(sqlQuery, params);
  const sealed = await realtime.seal({ query });
  return sealed;
}

/**
 * Seal active sessions query for live display projector/screens
 */
async function sealActiveSessionsQuery() {
  const sql = `
    SELECT id, subject_name, subject_code, hour_number, started_by, started_at, is_active, pin_required, static_qr_mode, geo_type 
    FROM sessions 
    WHERE is_active = 1 
    ORDER BY id DESC
  `;
  const sealed = await sealQuery(sql);
  return {
    name: 'activeSessions',
    sql,
    sealed,
    url: env.NEON_REALTIME_URL
  };
}

/**
 * Seal live attendance stream for a given session
 */
async function sealSessionAttendanceQuery(sessionId) {
  const numId = parseInt(sessionId, 10);
  if (isNaN(numId)) {
    throw new Error('Invalid session ID');
  }
  const sql = `
    SELECT id, session_id, student_id, marked_at, lat, lng, geo_verified, is_manual, marked_by 
    FROM attendance 
    WHERE session_id = $1 
    ORDER BY id DESC 
    LIMIT 200
  `;
  const sealed = await sealQuery(sql, [numId]);
  return {
    name: `sessionAttendance_${numId}`,
    sessionId: numId,
    sql,
    sealed,
    url: env.NEON_REALTIME_URL
  };
}

/**
 * Check Realtime status
 */
async function getRealtimeStatus() {
  const isConfigured = Boolean(env.NEON_REALTIME_SECRET && env.NEON_REALTIME_URL);
  let sampleSealed = null;
  let error = null;

  if (isConfigured && realtime) {
    try {
      sampleSealed = await sealQuery('SELECT id, subject_name FROM sessions WHERE is_active = 1 LIMIT 5');
    } catch (err) {
      error = err.message;
    }
  }

  return {
    configured: isConfigured,
    realtimeUrl: env.NEON_REALTIME_URL,
    hasSecret: Boolean(env.NEON_REALTIME_SECRET),
    sampleSealedQueryWorking: Boolean(sampleSealed),
    capabilitySample: sampleSealed ? sampleSealed.capability.substring(0, 32) + '...' : null,
    expiresAt: sampleSealed ? sampleSealed.expiresAt : null,
    error
  };
}

module.exports = {
  realtime,
  sealQuery,
  sealActiveSessionsQuery,
  sealSessionAttendanceQuery,
  getRealtimeStatus
};
