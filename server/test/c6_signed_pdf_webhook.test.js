const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { Writable } = require('stream');

const pdfController = require('../controllers/pdfController');
const webhookController = require('../controllers/webhookController');
const gupshupService = require('../services/whatsapp/gupshupService');
const { createSignedPdfToken } = require('../services/security/signedUrlService');
const { supabase } = require('../services/supabaseClient');

test('C6 — Secure PDF Links & Verify Gupshup Webhooks Suite', async (t) => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Helper to create mock response
  const createMockRes = () => {
    let statusCode = 200;
    let jsonBody = null;
    let streamedBytes = 0;
    const headers = {};

    const res = new Writable({
      write(chunk, encoding, cb) {
        streamedBytes += chunk.length;
        cb();
      }
    });

    res.status = (code) => {
      statusCode = code;
      return res;
    };

    res.json = (body) => {
      jsonBody = body;
      res.emit('finish');
      return res;
    };

    res.setHeader = (key, val) => {
      headers[key.toLowerCase()] = val;
    };

    res.getStatus = () => statusCode;
    res.getBody = () => jsonBody;
    res.getStreamedBytes = () => streamedBytes;
    res.getHeaders = () => headers;

    return res;
  };

  const tenantA = 'tenant_c6_a_' + Date.now();
  const tenantB = 'tenant_c6_b_' + Date.now();

  // Create tenant A subfolder for tenant-specific storage test
  const tenantADir = path.join(uploadsDir, 'pdfs', `tenant_${tenantA}`);
  fs.mkdirSync(tenantADir, { recursive: true });

  const pdfPathA = path.join(tenantADir, 'ledger_statement_a.pdf');
  fs.writeFileSync(pdfPathA, '%PDF-1.4 Tenant A Statement Content');

  const pdfPathB = path.join(uploadsDir, `ledger_b_${Date.now()}.pdf`);
  fs.writeFileSync(pdfPathB, '%PDF-1.4 Tenant B Statement Content');

  let pdfA, pdfB;

  t.before(async () => {
    const { data: recA } = await supabase.from('pdf_files').insert({
      company_id: tenantA,
      originalFilename: 'ledger_statement_a.pdf',
      extractedName: 'Customer A',
      filePath: pdfPathA
    }).select().single();
    pdfA = recA;

    const { data: recB } = await supabase.from('pdf_files').insert({
      company_id: tenantB,
      originalFilename: 'ledger_b.pdf',
      extractedName: 'Customer B',
      filePath: pdfPathB
    }).select().single();
    pdfB = recB;
  });

  t.after(async () => {
    try {
      if (fs.existsSync(pdfPathA)) fs.unlinkSync(pdfPathA);
      if (fs.existsSync(pdfPathB)) fs.unlinkSync(pdfPathB);
      if (fs.existsSync(tenantADir)) fs.rmSync(tenantADir, { recursive: true, force: true });
    } catch (e) {}

    if (pdfA?.id) await supabase.from('pdf_files').delete().eq('id', pdfA.id);
    if (pdfB?.id) await supabase.from('pdf_files').delete().eq('id', pdfB.id);
  });

  // ==========================================
  // Part A: Signed PDF Download Links
  // ==========================================

  await t.test('1. Unsigned download link is rejected with HTTP 403', async () => {
    const res = createMockRes();

    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        { params: { identifier: String(pdfA.id) }, query: {} },
        res,
        () => resolve()
      );
    });

    assert.strictEqual(res.getStatus(), 403);
    assert.match(res.getBody()?.message || '', /signature token and expiration required/i);
  });

  await t.test('2. Expired download link is rejected with HTTP 403', async () => {
    // Generate token that expired 10 seconds ago
    const { token, expires } = createSignedPdfToken(pdfA.id, tenantA, -10);
    const res = createMockRes();

    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        { params: { identifier: String(pdfA.id) }, query: { token, expires } },
        res,
        () => resolve()
      );
    });

    assert.strictEqual(res.getStatus(), 403);
    assert.match(res.getBody()?.message || '', /expired/i);
  });

  await t.test('3. Tampered download signature is rejected with HTTP 403', async () => {
    const { token, expires } = createSignedPdfToken(pdfA.id, tenantA, 900);
    const tamperedToken = token.slice(0, -4) + 'abcd';
    const res = createMockRes();

    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        { params: { identifier: String(pdfA.id) }, query: { token: tamperedToken, expires } },
        res,
        () => resolve()
      );
    });

    assert.strictEqual(res.getStatus(), 403);
    assert.match(res.getBody()?.message || '', /invalid or tampered/i);
  });

  await t.test('4. Token generated for PDF A cannot be reused to access PDF B', async () => {
    // Valid token created specifically for PDF A
    const { token, expires } = createSignedPdfToken(pdfA.id, tenantA, 900);
    const res = createMockRes();

    // Attacker attempts to use PDF A token against PDF B
    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        { params: { identifier: String(pdfB.id) }, query: { token, expires } },
        res,
        () => resolve()
      );
    });

    assert.strictEqual(res.getStatus(), 403);
    assert.match(res.getBody()?.message || '', /invalid or tampered/i);
  });

  await t.test('5. Valid unexpired signed link successfully streams tenant-specific PDF', async () => {
    const { token, expires } = createSignedPdfToken(pdfA.id, tenantA, 900);
    const res = createMockRes();

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      pdfController.downloadSignedPdf(
        { params: { identifier: String(pdfA.id) }, query: { token, expires } },
        res,
        reject
      );
    });

    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getHeaders()['content-type'], 'application/pdf');
    assert.ok(res.getStreamedBytes() > 0, 'PDF bytes must be successfully piped');
  });

  // ==========================================
  // Part B: Webhook Verification & Progression
  // ==========================================

  await t.test('6. Unsigned or invalid webhook request is rejected with HTTP 401 when secret is set', async () => {
    const prevSecret = process.env.GUPSHUP_WEBHOOK_SECRET;
    process.env.GUPSHUP_WEBHOOK_SECRET = 'super_secret_webhook_token_99';

    try {
      const res1 = createMockRes();
      await webhookController.handleGupshupWebhook(
        { headers: {}, body: { id: 'msg_1' }, app: { get: () => null } },
        res1,
        () => {}
      );
      assert.strictEqual(res1.getStatus(), 401, 'Must reject missing webhook token');

      const res2 = createMockRes();
      await webhookController.handleGupshupWebhook(
        { headers: { 'x-gupshup-token': 'wrong_token' }, body: { id: 'msg_1' }, app: { get: () => null } },
        res2,
        () => {}
      );
      assert.strictEqual(res2.getStatus(), 401, 'Must reject invalid webhook token');
    } finally {
      process.env.GUPSHUP_WEBHOOK_SECRET = prevSecret;
    }
  });

  await t.test('7. Valid webhook updates message log and emits real-time socket event', async () => {
    const prevSecret = process.env.GUPSHUP_WEBHOOK_SECRET;
    process.env.GUPSHUP_WEBHOOK_SECRET = 'valid_test_secret_77';

    const testMsgId = 'gup_wh_test_' + Date.now();
    const { data: logEntry } = await supabase.from('message_logs').insert({
      company_id: tenantA,
      contactName: 'Webhook Contact',
      phone: '919876543210',
      pdfFilename: 'statement.pdf',
      pdfPath: pdfPathA,
      status: 'Sent',
      deliveryStatus: 'sent',
      providerMessageId: testMsgId,
      createdAt: new Date().toISOString()
    }).select().single();

    const emitted = [];
    const mockIo = {
      to: (room) => ({
        emit: (event, payload) => emitted.push({ room, event, payload })
      })
    };

    try {
      const res = createMockRes();
      await webhookController.handleGupshupWebhook(
        {
          headers: { 'x-gupshup-token': 'valid_test_secret_77' },
          body: {
            type: 'message-event',
            payload: {
              id: testMsgId,
              type: 'delivered'
            }
          },
          app: { get: () => mockIo }
        },
        res,
        () => {}
      );

      assert.strictEqual(res.getStatus(), 200);

      // Verify DB update
      const { data: updated } = await supabase
        .from('message_logs')
        .select('*')
        .eq('id', logEntry.id)
        .single();

      assert.strictEqual(updated.status, 'Delivered');
      assert.strictEqual(updated.deliveryStatus, 'delivered');

      // Verify socket emit
      assert.strictEqual(emitted.length, 1);
      assert.strictEqual(emitted[0].room, `user_${tenantA}`);
      assert.strictEqual(emitted[0].payload.deliveryStatus, 'delivered');
    } finally {
      process.env.GUPSHUP_WEBHOOK_SECRET = prevSecret;
      await supabase.from('message_logs').delete().eq('id', logEntry.id);
    }
  });

  await t.test('8. Duplicate webhook events are handled idempotently without corrupting history', async () => {
    const testMsgId = 'gup_dup_test_' + Date.now();
    const { data: logEntry } = await supabase.from('message_logs').insert({
      company_id: tenantA,
      contactName: 'Duplicate Test Contact',
      phone: '919876543210',
      pdfFilename: 'statement.pdf',
      pdfPath: pdfPathA,
      status: 'Delivered',
      deliveryStatus: 'delivered',
      providerMessageId: testMsgId,
      createdAt: new Date().toISOString()
    }).select().single();

    try {
      // Send identical event again
      const result = await gupshupService.handleWebhookEvent({
        type: 'message-event',
        payload: { id: testMsgId, type: 'delivered' }
      }, null);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.duplicate, true, 'Must identify event as duplicate');

      const { data: check } = await supabase
        .from('message_logs')
        .select('*')
        .eq('id', logEntry.id)
        .single();

      assert.strictEqual(check.status, 'Delivered');
      assert.strictEqual(check.deliveryStatus, 'delivered');
    } finally {
      await supabase.from('message_logs').delete().eq('id', logEntry.id);
    }
  });

  await t.test('9. Out-of-order webhook events do not regress status from Read to Delivered or Sent', async () => {
    const testMsgId = 'gup_ooo_test_' + Date.now();
    const { data: logEntry } = await supabase.from('message_logs').insert({
      company_id: tenantA,
      contactName: 'Out-Of-Order Contact',
      phone: '919876543210',
      pdfFilename: 'statement.pdf',
      pdfPath: pdfPathA,
      status: 'Read',
      deliveryStatus: 'read',
      providerMessageId: testMsgId,
      createdAt: new Date().toISOString()
    }).select().single();

    try {
      // Arriving delayed 'delivered' event
      const resultDelivered = await gupshupService.handleWebhookEvent({
        type: 'message-event',
        payload: { id: testMsgId, type: 'delivered' }
      }, null);

      assert.strictEqual(resultDelivered.ignoredRegression, true);

      // Arriving delayed 'sent' event
      const resultSent = await gupshupService.handleWebhookEvent({
        type: 'message-event',
        payload: { id: testMsgId, type: 'sent' }
      }, null);

      assert.strictEqual(resultSent.ignoredRegression, true);

      // Verify status remained Read
      const { data: check } = await supabase
        .from('message_logs')
        .select('*')
        .eq('id', logEntry.id)
        .single();

      assert.strictEqual(check.status, 'Read');
      assert.strictEqual(check.deliveryStatus, 'read');
    } finally {
      await supabase.from('message_logs').delete().eq('id', logEntry.id);
    }
  });
});
