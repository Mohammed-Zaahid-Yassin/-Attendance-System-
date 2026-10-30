const assert = require('assert');

const BASE_URL = 'http://localhost:3001';

async function runTestSuite() {
  console.log('========================================================');
  console.log('🧪 RUNNING NEON END-TO-END VERIFICATION TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  async function testStep(name, fn) {
    process.stdout.write(`• ${name}... `);
    try {
      const start = Date.now();
      const result = await fn();
      const elapsed = Date.now() - start;
      console.log(`PASSED (${elapsed}ms)`);
      if (result) {
        console.log(`  └─ Details: ${typeof result === 'string' ? result : JSON.stringify(result)}`);
      }
      passed++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  // 1. Health check
  await testStep('App Health Check (/api/health)', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.ok(data.cloud && data.cloud.includes('Neon'), 'Must report Neon cloud platform');
    return `Status: ${data.status}, Cloud: ${data.cloud}`;
  });

  // 2. Global Neon Status
  await testStep('Global Neon Status Endpoint (/api/neon/status)', async () => {
    const res = await fetch(`${BASE_URL}/api/neon/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.services.postgres.status === 'healthy', 'Postgres must be healthy');
    assert.ok(data.services.auth.status === 'healthy', 'Auth must be healthy');
    assert.ok(data.services.object_storage.status === 'healthy', 'Storage must be healthy');
    assert.ok(data.services.functions.status === 'healthy', 'Functions must be healthy');
    assert.ok(data.services.realtime.status === 'healthy', 'Realtime must be healthy');
    return `All 5 services reporting healthy on branch '${data.branch}'`;
  });

  // 3. Service 1: Neon Postgres
  await testStep('Service 1: Neon Postgres Connection & Stats (/api/neon/postgres)', async () => {
    const res = await fetch(`${BASE_URL}/api/neon/postgres`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.postgres.database, 'neondb');
    assert.ok(data.postgres.version.includes('PostgreSQL 18'), 'Must be PostgreSQL 18');
    return `Database: ${data.postgres.database}, Students: ${data.postgres.students_count}, Sessions: ${data.postgres.sessions_count}`;
  });

  // 4. Service 2: Neon Auth
  await testStep('Service 2: Neon Auth Discovery & JWKS (/api/neon/auth)', async () => {
    const res = await fetch(`${BASE_URL}/api/neon/auth`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.auth.enabled, true);
    assert.ok(data.auth.keysCount >= 1, 'Must have at least 1 JWKS key');
    return `Base URL: ${data.auth.baseUrl}, Keys count: ${data.auth.keysCount}`;
  });

  // 5. Service 3: Neon Object Storage
  await testStep('Service 3: Neon Object Storage Upload/Get/Presign E2E (/api/neon/storage/test)', async () => {
    const res = await fetch(`${BASE_URL}/api/neon/storage/test`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.testKey.startsWith('tests/e2e_'));
    assert.ok(data.verifiedContent.includes('Neon Object Storage E2E Test'));
    assert.ok(data.presignedUrl.includes('X-Amz-Signature'), 'Must contain S3 SigV4 signature');
    return `Key: ${data.testKey}, Presigned URL verified`;
  });

  // 6. Service 4: Neon Functions
  await testStep('Service 4: Neon Functions Invocation (/api/neon/functions/hello)', async () => {
    const res = await fetch(`${BASE_URL}/api/neon/functions/hello`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.invocation.status, 200);
    assert.strictEqual(data.invocation.response, 'Hello from Neon Functions');
    return `Function 'hello' invoked at ${data.invocation.url} (${data.invocation.latencyMs}ms): "${data.invocation.response}"`;
  });

  // 7. Service 5: Neon Realtime
  await testStep('Service 5: Neon Realtime Query Sealing (/api/neon/realtime/sessions)', async () => {
    const res = await fetch(`${BASE_URL}/api/neon/realtime/sessions`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.query.sealed.capability, 'Must contain signed capability');
    assert.ok(data.query.sealed.expiresAt > Date.now(), 'Expires in future');
    return `Sealed Query: ${data.query.name}, Capability length: ${data.query.sealed.capability.length}`;
  });

  // 8. E2E Archival of Attendance Export to Neon Object Storage
  await testStep('Full Workflow: Export Attendance -> Auto-Archive to Neon Storage', async () => {
    // 1. Login as admin
    const password = process.env.ADMIN_PASSWORD || '22Mon08Aug2005';
    let loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password })
    });
    let loginData = await loginRes.json();
    if (!loginData.token) {
      loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      loginData = await loginRes.json();
    }
    assert.ok(loginData.token, 'Must return JWT token');

    // 2. Request attendance CSV export
    const exportRes = await fetch(`${BASE_URL}/api/attendance/export/1?token=${loginData.token}`);
    assert.strictEqual(exportRes.status, 200);
    const csv = await exportRes.text();
    assert.ok(csv.includes('Student ID'), 'Export must contain student headers');

    // 3. Verify archival in Neon Object Storage
    const storageRes = await fetch(`${BASE_URL}/api/neon/storage?prefix=reports/session_1/`);
    const storageData = await storageRes.json();
    assert.ok(storageData.count >= 1, 'Report must be archived in Neon Object Storage');
    return `Export archived in Neon Object Storage bucket '${storageData.bucket}', Objects count: ${storageData.count}`;
  });

  console.log('\n========================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
