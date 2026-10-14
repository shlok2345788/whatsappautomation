const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const gupshupService = require('../services/whatsapp/gupshupService');
const messagingProvider = require('../services/messaging/messagingProvider');
const { supabase } = require('../services/supabaseClient');
const { encrypt } = require('../services/security/encryptionService');

test('D3 — Attach PDFs to WhatsApp Template Messages Suite', async (t) => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const companyId = 'company_d3_' + Date.now();
  const testPdfDir = path.join(uploadsDir, 'pdfs', `tenant_${companyId}`);
  fs.mkdirSync(testPdfDir, { recursive: true });

  const testPdfPath = path.join(testPdfDir, 'customer_ledger_statement.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 D3 Template Statement Test');

  // Insert test PDF record in database
  const { data: pdfRecord } = await supabase.from('pdf_files').insert({
    company_id: companyId,
    originalFilename: 'customer_ledger_statement.pdf',
    extractedName: 'Test Debtor Customer',
    fileSize: 450,
    filePath: testPdfPath,
    fileHash: 'd3hash_' + Date.now(),
    uploadedAt: new Date().toISOString()
  }).select().single();

  t.after(() => {
    try {
      if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
      if (fs.existsSync(testPdfDir)) fs.rmdirSync(testPdfDir);
    } catch (e) {}
  });

  await t.test('1. Template with document header includes attachment structure with signed PDF URL', async () => {
    process.env.SIMULATION_MODE = 'true';
    process.env.NODE_ENV = 'development';

    // Configure template in settings
    await supabase.from('settings').upsert({
      company_id: companyId,
      gupshupTemplateId: 'ledger_document_statement_v1',
      gupshupApiKey: '',
      gupshupSourcePhone: '',
      gupshupAppName: ''
    });

    const templateParams = ['Acme Corp', 'October 2026', '₹45,200.00'];
    const result = await gupshupService.sendPdfDocument(
      companyId,
      '919876543210',
      testPdfPath,
      pdfRecord.originalFilename,
      'Account Statement',
      pdfRecord.id,
      templateParams
    );

    assert.equal(result.success, true);
    assert.equal(result.isSimulation, true);
    assert.equal(result.status, 'simulated');

    // Inspect the generated payload
    const payload = result.payload;
    assert.ok(payload, 'Result must include payload');
    assert.equal(payload.type, 'template');
    assert.equal(payload.template.id, 'ledger_document_statement_v1');
    assert.deepEqual(payload.template.params, ['Acme Corp', 'October 2026', '₹45,200.00']);

    // Crucial D3 invariant: Attachment must be present with signed URL and filename
    assert.ok(payload.attachment, 'Payload must attach document header');
    assert.equal(payload.attachment.type, 'file');
    assert.equal(payload.attachment.filename, 'customer_ledger_statement.pdf');
    assert.match(payload.attachment.url, /\/api\/pdfs\/download-signed\//);
    assert.match(payload.attachment.url, /token=[a-f0-9]{64}/);
    assert.match(payload.attachment.url, /expires=\d+/);
  });

  await t.test('2. Template parameters map correctly and convert non-strings safely without dropping attachment', async () => {
    process.env.SIMULATION_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const mixedParams = ['Customer A', 12345, null, undefined, 'Closing Balance: 500'];
    const result = await gupshupService.sendPdfDocument(
      companyId,
      '919876543210',
      testPdfPath,
      pdfRecord.originalFilename,
      '',
      pdfRecord.id,
      mixedParams
    );

    assert.equal(result.success, true);
    const payload = result.payload;
    assert.deepEqual(payload.template.params, ['Customer A', '12345', '', '', 'Closing Balance: 500']);
    assert.ok(payload.attachment.url);
    assert.equal(payload.attachment.filename, 'customer_ledger_statement.pdf');
  });

  await t.test('3. Missing or whitespace templateId fails clearly upon validation and execution', async () => {
    const invalidCompanyId = 'comp_invalid_tpl_' + Date.now();
    await supabase.from('settings').upsert({
      company_id: invalidCompanyId,
      gupshupTemplateId: '   '
    });

    await assert.rejects(
      async () => {
        await messagingProvider.validateTemplateConfig(invalidCompanyId);
      },
      /Configured WhatsApp templateId is invalid or empty/i
    );

    await assert.rejects(
      async () => {
        await gupshupService.sendPdfDocument(
          invalidCompanyId,
          '919876543210',
          testPdfPath,
          'file.pdf',
          '',
          pdfRecord.id,
          ['param1']
        );
      },
      /Configured WhatsApp templateId is invalid or empty/i
    );
  });

  await t.test('4. Live Gupshup dispatch submits template payload with attachment and parses provider submission', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATION_MODE = 'false';

    const liveCompanyId = 'comp_live_' + Date.now();
    const encKey = encrypt('mock_gupshup_live_key');
    await supabase.from('settings').upsert({
      company_id: liveCompanyId,
      gupshupApiKey: encKey,
      gupshupSourcePhone: '919820000000',
      gupshupAppName: 'TestGupshupApp',
      gupshupTemplateId: 'ledger_doc_v2'
    });

    const originalFetch = global.fetch;
    let interceptedUrl = null;
    let interceptedBody = null;
    let interceptedHeaders = null;

    global.fetch = async (url, options) => {
      interceptedUrl = url;
      interceptedHeaders = options.headers;
      interceptedBody = options.body;

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: 'submitted',
          messageId: 'gup_live_msg_987654321'
        })
      };
    };

    try {
      const result = await gupshupService.sendPdfDocument(
        liveCompanyId,
        '919876543210',
        testPdfPath,
        pdfRecord.originalFilename,
        'Monthly Statement',
        pdfRecord.id,
        ['Shlok Enterprise', 'Oct 2026']
      );

      assert.equal(result.success, true);
      assert.equal(result.messageId, 'gup_live_msg_987654321');
      assert.equal(result.status, 'submitted');

      // Verify the wire format submitted to Gupshup
      assert.ok(interceptedUrl.includes('/msg'));
      assert.equal(interceptedHeaders['apikey'], 'mock_gupshup_live_key');

      const urlParams = new URLSearchParams(interceptedBody);
      assert.equal(urlParams.get('channel'), 'whatsapp');
      assert.equal(urlParams.get('source'), '919820000000');
      assert.equal(urlParams.get('destination'), '919876543210');
      assert.equal(urlParams.get('src.name'), 'TestGupshupApp');

      const sentMessageObj = JSON.parse(urlParams.get('message'));
      assert.equal(sentMessageObj.type, 'template');
      assert.equal(sentMessageObj.template.id, 'ledger_doc_v2');
      assert.deepEqual(sentMessageObj.template.params, ['Shlok Enterprise', 'Oct 2026']);
      assert.equal(sentMessageObj.attachment.type, 'file');
      assert.equal(sentMessageObj.attachment.filename, 'customer_ledger_statement.pdf');
      assert.match(sentMessageObj.attachment.url, /\/api\/pdfs\/download-signed\//);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('5. Gupshup provider rejection throws clear error and does not falsely mark sent', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATION_MODE = 'false';

    const failCompanyId = 'comp_fail_' + Date.now();
    await supabase.from('settings').upsert({
      company_id: failCompanyId,
      gupshupApiKey: encrypt('mock_gupshup_live_key'),
      gupshupSourcePhone: '919820000000',
      gupshupAppName: 'TestGupshupApp',
      gupshupTemplateId: 'ledger_doc_v2'
    });

    const originalFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          status: 'error',
          message: 'Template header media URL unreachable or invalid template parameter count'
        })
      };
    };

    try {
      await assert.rejects(
        async () => {
          await gupshupService.sendPdfDocument(
            failCompanyId,
            '919876543210',
            testPdfPath,
            pdfRecord.originalFilename,
            '',
            pdfRecord.id,
            ['Param1']
          );
        },
        /Gupshup API HTTP error 400.*Template header media URL unreachable/i
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
