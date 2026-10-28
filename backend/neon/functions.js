const env = require('./env');

/**
 * Invoke the deployed Neon Function ('hello')
 */
async function invokeHelloFunction() {
  const url = env.NEON_FUNCTION_HELLO_BASE_URL;
  if (!url) {
    return {
      success: false,
      error: 'NEON_FUNCTION_HELLO_BASE_URL not configured'
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain, application/json',
        'User-Agent': 'AttendanceSystem-Backend/1.0'
      }
    });

    const latencyMs = Date.now() - startTime;
    const body = await res.text();

    return {
      success: res.ok,
      status: res.status,
      statusText: res.statusText,
      url,
      latencyMs,
      response: body
    };
  } catch (err) {
    return {
      success: false,
      url,
      latencyMs: Date.now() - startTime,
      error: err.message
    };
  }
}

module.exports = {
  invokeHelloFunction
};
