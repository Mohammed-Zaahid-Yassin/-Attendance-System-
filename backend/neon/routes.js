const express = require('express');
const router = express.Router();
const postgres = require('./postgres');
const auth = require('./auth');
const storage = require('./storage');
const functions = require('./functions');
const realtime = require('./realtime');
const env = require('./env');

/**
 * Global Neon Status: Healthcheck of all 5 Neon services
 */
router.get('/status', async (req, res) => {
  const result = {
    branch: env.NEON_BRANCH,
    timestamp: new Date().toISOString(),
    services: {}
  };

  // 1. Postgres
  try {
    const pgStatus = await postgres.getPostgresStatus();
    result.services.postgres = {
      status: 'healthy',
      database: pgStatus.database,
      version: pgStatus.version,
      stats: {
        students: parseInt(pgStatus.students_count, 10),
        sessions: parseInt(pgStatus.sessions_count, 10),
        attendance: parseInt(pgStatus.attendance_count, 10),
        admins: parseInt(pgStatus.admins_count, 10)
      }
    };
  } catch (err) {
    result.services.postgres = { status: 'error', error: err.message };
  }

  // 2. Auth
  try {
    const authStatus = await auth.getAuthMetadata();
    result.services.auth = {
      status: authStatus.enabled ? 'healthy' : 'disabled',
      baseUrl: authStatus.baseUrl,
      jwksUrl: authStatus.jwksUrl,
      keysCount: authStatus.keysCount
    };
  } catch (err) {
    result.services.auth = { status: 'error', error: err.message };
  }

  // 3. Object Storage
  try {
    const storageList = await storage.listAssets({ maxKeys: 10 });
    result.services.object_storage = {
      status: 'healthy',
      bucket: storage.BUCKET,
      endpoint: env.AWS_ENDPOINT_URL_S3,
      region: env.AWS_REGION,
      objectCount: storageList.count
    };
  } catch (err) {
    result.services.object_storage = { status: 'error', error: err.message };
  }

  // 4. Functions
  try {
    const fnRes = await functions.invokeHelloFunction();
    result.services.functions = {
      status: fnRes.success ? 'healthy' : 'error',
      functionName: 'hello',
      url: fnRes.url,
      latencyMs: fnRes.latencyMs,
      response: fnRes.response
    };
  } catch (err) {
    result.services.functions = { status: 'error', error: err.message };
  }

  // 5. Realtime
  try {
    const rtStatus = await realtime.getRealtimeStatus();
    result.services.realtime = {
      status: rtStatus.sampleSealedQueryWorking ? 'healthy' : 'error',
      url: rtStatus.realtimeUrl,
      sampleSealedWorking: rtStatus.sampleSealedQueryWorking,
      expiresAt: rtStatus.expiresAt
    };
  } catch (err) {
    result.services.realtime = { status: 'error', error: err.message };
  }

  const allHealthy = Object.values(result.services).every(s => s.status === 'healthy');
  res.status(allHealthy ? 200 : 207).json(result);
});

/**
 * 1. Postgres Service Endpoints
 */
router.get('/postgres', async (req, res) => {
  try {
    const status = await postgres.getPostgresStatus();
    res.json({ success: true, postgres: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. Auth Service Endpoints
 */
router.get('/auth', async (req, res) => {
  try {
    const metadata = await auth.getAuthMetadata();
    res.json({ success: true, auth: metadata });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. Object Storage Endpoints
 */
router.get('/storage', async (req, res) => {
  try {
    const list = await storage.listAssets({ prefix: req.query.prefix || '' });
    res.json({ success: true, ...list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/storage/test', async (req, res) => {
  try {
    const testKey = `tests/e2e_${Date.now()}.txt`;
    const content = `Neon Object Storage E2E Test at ${new Date().toISOString()}`;
    
    // 1. Upload
    await storage.uploadAsset({
      key: testKey,
      body: Buffer.from(content, 'utf-8'),
      contentType: 'text/plain'
    });

    // 2. Read back
    const readBack = await storage.getAsset({ key: testKey });

    // 3. Generate presigned URL
    const presigned = await storage.getPresignedAssetUrl({ key: testKey, expiresInSeconds: 300 });

    res.json({
      success: true,
      testKey,
      verifiedContent: readBack.body.toString('utf-8'),
      presignedUrl: presigned.url
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. Functions Endpoints
 */
router.get('/functions/hello', async (req, res) => {
  try {
    const invocation = await functions.invokeHelloFunction();
    res.json({ success: invocation.success, invocation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. Realtime Endpoints
 */
router.get('/realtime', async (req, res) => {
  try {
    const status = await realtime.getRealtimeStatus();
    res.json({ success: true, realtime: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/realtime/sessions', async (req, res) => {
  try {
    const sealed = await realtime.sealActiveSessionsQuery();
    res.json({ success: true, query: sealed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/realtime/attendance/:sessionId', async (req, res) => {
  try {
    const sealed = await realtime.sealSessionAttendanceQuery(req.params.sessionId);
    res.json({ success: true, query: sealed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
