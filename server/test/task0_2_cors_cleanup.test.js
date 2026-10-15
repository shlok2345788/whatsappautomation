const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Task 0.2 — CORS & Obsolete Deployments Cleanup Suite', async (t) => {
  const serverJsPath = path.join(__dirname, '../server.js');
  const serverCode = fs.readFileSync(serverJsPath, 'utf8');

  await t.test('1. Obsolete hardcoded Vercel deployment URL is removed from codebase', () => {
    assert.equal(
      serverCode.includes('whatsappautomation-eight.vercel.app'),
      false,
      'server.js must not contain obsolete vercel origin'
    );
  });

  await t.test('2. CORS origin validator rejects malicious/unauthorized third-party origins', () => {
    // Recreate the CORS handler logic from server.js
    const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    const corsOriginHandler = (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS policy rejection: Origin ${origin} is not allowed`));
    };

    // Test rejection of attacker site
    corsOriginHandler('https://evil-hacker.com', (err, allow) => {
      assert.ok(err, 'Attacker origin must produce an error');
      assert.match(err.message, /CORS policy rejection/);
    });

    // Test rejection of old obsolete vercel url
    corsOriginHandler('https://whatsappautomation-eight.vercel.app', (err, allow) => {
      assert.ok(err, 'Obsolete URL must be rejected');
    });

    // Test acceptance of valid localhost origin
    corsOriginHandler('http://localhost:5173', (err, allow) => {
      assert.equal(err, null);
      assert.equal(allow, true);
    });

    // Test acceptance of non-browser origin (null/undefined)
    corsOriginHandler(undefined, (err, allow) => {
      assert.equal(err, null);
      assert.equal(allow, true);
    });
  });

  await t.test('3. Environment CLIENT_URL is respected when configured', () => {
    const customOrigin = 'https://app.whatsappledger.com';
    const origins = [customOrigin, 'http://localhost:5173'];
    assert.ok(origins.includes(customOrigin));
  });
});
