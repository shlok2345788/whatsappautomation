const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { verifyToken } = require('../middleware/authMiddleware');

test('C1 — Reject Forged Authentication Tokens Suite', async (t) => {
  const originalEnv = { ...process.env };

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('1. Reject forged token with victim UID and Google issuer signed with wrong secret in non-production mode', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'legitimate_production_grade_secret_key_12345';

    // Attacker crafts a token with victim's UID and Google issuer claims, signed with attacker's key
    const forgedToken = jwt.sign(
      {
        sub: 'victim_tenant_99999',
        uid: 'victim_tenant_99999',
        iss: 'https://securetoken.google.com/docsender-project',
        aud: 'docsender-project',
        email: 'victim@targetcompany.com'
      },
      'attacker_secret_key_666'
    );

    await assert.rejects(
      async () => {
        await verifyToken(forgedToken);
      },
      (err) => {
        assert.match(err.message, /invalid signature|Token verification failed|Not authorized|signature/i);
        return true;
      },
      'Forged token signed with wrong secret must be rejected even in development mode'
    );
  });

  await t.test('2. Reject forged token in production mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'legitimate_production_grade_secret_key_12345';

    const forgedToken = jwt.sign(
      {
        sub: 'victim_tenant_production',
        uid: 'victim_tenant_production',
        iss: 'https://securetoken.google.com/docsender-prod',
        email: 'ceo@targetcorp.com'
      },
      'attacker_unauthorized_key'
    );

    await assert.rejects(
      async () => {
        await verifyToken(forgedToken);
      },
      (err) => {
        assert.match(err.message, /invalid signature|Token verification failed|Not authorized|signature/i);
        return true;
      },
      'Forged token must be rejected in production mode'
    );
  });

  await t.test('3. Reject expired tokens', async () => {
    process.env.JWT_SECRET = 'valid_test_secret_key_987654321';

    const expiredToken = jwt.sign(
      { uid: 'user_123', email: 'user@test.com' },
      process.env.JWT_SECRET,
      { expiresIn: '-10s' }
    );

    await assert.rejects(
      async () => {
        await verifyToken(expiredToken);
      },
      (err) => {
        assert.match(err.message, /jwt expired|expired/i);
        return true;
      },
      'Expired token must be rejected'
    );
  });

  await t.test('4. Reject malformed and garbage tokens', async () => {
    process.env.JWT_SECRET = 'valid_test_secret_key_987654321';

    const malformedTokens = [
      'not.a.valid.jwt',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_payload',
      'Bearer abcdef12345',
      '...'
    ];

    for (const token of malformedTokens) {
      await assert.rejects(
        async () => {
          await verifyToken(token);
        },
        /jwt malformed|invalid token|Token verification failed/i,
        `Malformed token '${token}' must be rejected`
      );
    }
  });

  await t.test('5. Reject missing or empty tokens', async () => {
    process.env.JWT_SECRET = 'valid_test_secret_key_987654321';

    await assert.rejects(
      async () => {
        await verifyToken(null);
      },
      /No authentication token provided/i
    );

    await assert.rejects(
      async () => {
        await verifyToken('');
      },
      /No authentication token provided/i
    );
  });

  await t.test('6. Fail safely when authentication configuration is unavailable (no Firebase Admin & no JWT_SECRET)', async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'development';

    const token = jwt.sign({ uid: 'user_123' }, 'some_key');

    await assert.rejects(
      async () => {
        await verifyToken(token);
      },
      /Authentication configuration is unavailable|JWT_SECRET/i,
      'Must reject when no authentication secret or provider is configured'
    );
  });

  await t.test('7. Reject tokens when audience or issuer validation fails if configured', async () => {
    process.env.JWT_SECRET = 'valid_test_secret_key_987654321';
    process.env.JWT_AUDIENCE = 'expected-audience-corp';
    process.env.JWT_ISSUER = 'expected-issuer-corp';

    const wrongAudienceToken = jwt.sign(
      { uid: 'user_123' },
      process.env.JWT_SECRET,
      { audience: 'wrong-audience', issuer: 'expected-issuer-corp' }
    );

    await assert.rejects(
      async () => {
        await verifyToken(wrongAudienceToken);
      },
      /jwt audience invalid|audience/i,
      'Token with wrong audience must be rejected'
    );
  });

  await t.test('8. Accept validly signed token with correct claims', async () => {
    process.env.JWT_SECRET = 'valid_test_secret_key_987654321';
    delete process.env.JWT_AUDIENCE;
    delete process.env.JWT_ISSUER;

    const validToken = jwt.sign(
      { uid: 'tenant_valid_42', email: 'corp@tenant.com', name: 'Valid Tenant LLC' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const user = await verifyToken(validToken);
    assert.strictEqual(user.id, 'tenant_valid_42');
    assert.strictEqual(user.companyId, 'tenant_valid_42');
    assert.strictEqual(user.email, 'corp@tenant.com');
    assert.strictEqual(user.name, 'Valid Tenant LLC');
  });
});
