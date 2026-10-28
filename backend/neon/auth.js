const { createRemoteJWKSet, jwtVerify } = require('jose');
const env = require('./env');

let jwksSet = null;

function getJwks() {
  if (!jwksSet && env.NEON_AUTH_JWKS_URL) {
    try {
      jwksSet = createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL));
    } catch (err) {
      console.error('[Neon Auth] Failed to initialize JWKS set:', err.message);
    }
  }
  return jwksSet;
}

/**
 * Verify a JWT token issued by Neon Auth
 */
async function verifyNeonToken(token) {
  if (!token) return { valid: false, error: 'No token provided' };
  try {
    const jwks = getJwks();
    if (!jwks) {
      return { valid: false, error: 'Neon Auth JWKS URL not configured' };
    }
    const { payload, protectedHeader } = await jwtVerify(token, jwks);
    return {
      valid: true,
      user: payload,
      header: protectedHeader
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Fetch public auth discovery information from Neon Auth
 */
async function getAuthMetadata() {
  if (!env.NEON_AUTH_JWKS_URL) {
    return { enabled: false, error: 'NEON_AUTH_JWKS_URL not configured' };
  }
  try {
    const res = await fetch(env.NEON_AUTH_JWKS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const jwks = await res.json();
    return {
      enabled: true,
      baseUrl: env.NEON_AUTH_BASE_URL,
      jwksUrl: env.NEON_AUTH_JWKS_URL,
      keysCount: (jwks.keys || []).length,
      keys: (jwks.keys || []).map(k => ({ kid: k.kid, kty: k.kty, alg: k.alg, use: k.use }))
    };
  } catch (err) {
    return {
      enabled: false,
      baseUrl: env.NEON_AUTH_BASE_URL,
      jwksUrl: env.NEON_AUTH_JWKS_URL,
      error: err.message
    };
  }
}

module.exports = {
  getJwks,
  verifyNeonToken,
  getAuthMetadata
};
