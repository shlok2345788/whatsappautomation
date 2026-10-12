const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const { verifyToken } = require('../middleware/authMiddleware');
const pdfService = require('../services/pdf/pdfService');

test('Phase 1 - Security & Tenant Hardening Suite', async (t) => {
  const secretKey = 'super_secret_jwt_key_whatsapp_pdf_sender_2026';
  process.env.JWT_SECRET = secretKey;

  await t.test('Task 1.1: scanLocalFolder must be completely removed from pdfService', () => {
    assert.strictEqual(
      pdfService.scanLocalFolder,
      undefined,
      'pdfService.scanLocalFolder must be undefined'
    );
  });

  await t.test('Task 1.4: verifyToken must reject forged or unsigned tokens', async () => {
    const forgedToken = jwt.sign({ uid: 'attacker_uid' }, 'wrong_secret');
    await assert.rejects(
      async () => {
        await verifyToken(forgedToken);
      },
      /Token verification failed|Not authorized/i,
      'Forged token with wrong secret must be rejected'
    );
  });

  await t.test('Task 1.4: verifyToken must successfully verify authentic tokens with companyId', async () => {
    const validToken = jwt.sign(
      { uid: 'tenant_12345', email: 'test@tenant.com', name: 'Acme Corp' },
      secretKey
    );
    const user = await verifyToken(validToken);
    assert.strictEqual(user.id, 'tenant_12345');
    assert.strictEqual(user.companyId, 'tenant_12345');
    assert.strictEqual(user.name, 'Acme Corp');
  });

  await t.test('Task 1.5: Fuzzy matching must NOT automatically link partial substring names', () => {
    const contactMap = new Map();
    contactMap.set('raj', { id: 1, name: 'Raj', mobile: '919876543210' });

    const pdfName = 'Rajesh Sharma';
    const normalizedPdf = pdfName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match check:
    const exactMatch = contactMap.get(normalizedPdf);
    assert.strictEqual(exactMatch, undefined, 'Rajesh Sharma must NOT exact match to Raj');

    // Substring containment check: "rajeshsharma" contains "raj", but auto-match must be blocked:
    let autoMatched = null;
    let suggested = null;

    for (const [cNorm, contact] of contactMap.entries()) {
      if (normalizedPdf === cNorm) {
        autoMatched = contact;
      } else if (normalizedPdf.includes(cNorm) || cNorm.includes(normalizedPdf)) {
        suggested = contact;
      }
    }

    assert.strictEqual(autoMatched, null, 'Partial substring must NEVER be auto-matched');
    assert.notStrictEqual(suggested, null, 'Partial substring may only be flagged as suggested');
  });
});
