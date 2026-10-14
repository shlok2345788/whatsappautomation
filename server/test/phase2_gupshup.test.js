const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const gupshupService = require('../services/whatsapp/gupshupService');
const { supabase } = require('../services/supabaseClient');

test('Phase 2 - Gupshup WABA Integration Suite', async (t) => {
  await t.test('Task 2.1: Phone normalization handles multiple international and domestic formats', () => {
    assert.strictEqual(gupshupService.normalizePhone('+91 98765-43210'), '919876543210');
    assert.strictEqual(gupshupService.normalizePhone('9876543210'), '919876543210');
    assert.strictEqual(gupshupService.normalizePhone('1-800-555-0199'), '18005550199');
    assert.strictEqual(gupshupService.normalizePhone(''), '');
  });

  await t.test('Task 2.2: sendPdfDocument validates file existence before calling API', async () => {
    await assert.rejects(
      async () => {
        await gupshupService.sendPdfDocument(
          'test_company_1',
          '9876543210',
          path.join(__dirname, 'non_existent_file.pdf'),
          'non_existent_file.pdf'
        );
      },
      /PDF document does not exist at path/i,
      'Should reject missing PDF file path'
    );
  });

  await t.test('Task 2.3: sendPdfDocument in development simulation mode returns structured success', async () => {
    const prevSim = process.env.SIMULATION_MODE;
    process.env.SIMULATION_MODE = 'true';

    // Create a temporary dummy PDF file in test folder
    const tempFilePath = path.join(__dirname, 'test_sample.pdf');
    fs.writeFileSync(tempFilePath, '%PDF-1.4 test document content');

    try {
      const result = await gupshupService.sendPdfDocument(
        'test_company_dev',
        '9876543210',
        tempFilePath,
        'test_sample.pdf',
        'Please find your statement attached'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.messageId.includes('_gup_'));
      assert.ok(result.status === 'submitted' || result.status === 'simulated');
    } finally {
      process.env.SIMULATION_MODE = prevSim;
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  });

  await t.test('Task 2.4: handleWebhookEvent updates message log and emits socket event', async () => {
    const testCompanyId = 'company_test_webhook_' + Date.now();
    const testMsgId = 'gup_test_msg_' + Date.now();

    // Insert dummy log
    const { data: inserted, error: insertErr } = await supabase.from('message_logs').insert({
      company_id: testCompanyId,
      contactName: 'Test Customer',
      phone: '919876543210',
      pdfFilename: 'ledger.pdf',
      pdfPath: '/dummy/ledger.pdf',
      status: 'Sent',
      providerMessageId: testMsgId,
      createdAt: new Date().toISOString()
    }).select().single();

    assert.ok(inserted && inserted.id, 'Must insert test message log');

    const emittedEvents = [];
    const mockIo = {
      to: (room) => ({
        emit: (event, payload) => {
          emittedEvents.push({ room, event, payload });
        }
      })
    };

    const webhookPayload = {
      type: 'message-event',
      payload: {
        id: testMsgId,
        type: 'delivered'
      }
    };

    const webhookResult = await gupshupService.handleWebhookEvent(webhookPayload, mockIo);
    assert.strictEqual(webhookResult.handled, true);
    assert.strictEqual(webhookResult.newStatus, 'Delivered');

    // Verify DB update
    const { data: updated } = await supabase
      .from('message_logs')
      .select('*')
      .eq('id', inserted.id)
      .single();

    assert.strictEqual(updated.status, 'Delivered');
    assert.strictEqual(updated.deliveryStatus, 'delivered');

    // Verify socket emission targeted tenant room
    assert.strictEqual(emittedEvents.length, 1);
    assert.strictEqual(emittedEvents[0].room, `user_${testCompanyId}`);
    assert.strictEqual(emittedEvents[0].event, 'message:status_update');
    assert.strictEqual(emittedEvents[0].payload.deliveryStatus, 'delivered');
  });

  await t.test('Task 2.5: Missing or incomplete credentials produce clear setup status without errors', async () => {
    const messagingProvider = require('../services/messaging/messagingProvider');
    const freshCompanyId = 'unconfigured_company_' + Date.now();

    const connection = await messagingProvider.checkConnection(freshCompanyId);
    assert.ok(
      connection.status === 'NOT_CONFIGURED' || connection.status === 'CONFIG_REQUIRED',
      'Should report NOT_CONFIGURED or CONFIG_REQUIRED when credentials are not configured'
    );
    assert.strictEqual(connection.provider, 'gupshup');
    assert.ok(connection.message.includes('not configured') || connection.message.includes('required'));
  });

  await t.test('Task 2.6: WhatsApp controller saveConfiguration securely upserts settings', async () => {
    const whatsappController = require('../controllers/whatsappController');
    const testCompanyId = 'cfg_company_' + Date.now();

    const mockReq = {
      companyId: testCompanyId,
      body: {
        appName: 'TestEnterpriseApp',
        apiKey: 'secret_gupshup_key_9999',
        sourcePhone: '919876543210',
        templateId: 'test_invoice_v1'
      },
      app: {
        get: () => ({
          to: () => ({
            emit: () => {}
          })
        })
      }
    };

    let responseData = null;
    const mockRes = {
      json: (data) => {
        responseData = data;
        return mockRes;
      }
    };

    await whatsappController.saveConfiguration(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.ok(responseData, 'Response data must exist');
    assert.strictEqual(responseData.settings.gupshupAppName, 'TestEnterpriseApp');
    assert.strictEqual(responseData.settings.gupshupSourcePhone, '919876543210');
    assert.strictEqual(responseData.settings.gupshupTemplateId, 'test_invoice_v1');

    // Verify getStatus masks the key
    let statusData = null;
    const mockStatusRes = {
      json: (data) => {
        statusData = data;
        return mockStatusRes;
      }
    };

    await whatsappController.getStatus({ companyId: testCompanyId }, mockStatusRes, (err) => {
      if (err) throw err;
    });

    assert.ok(statusData, 'Status data must exist');
    assert.strictEqual(statusData.appName, 'TestEnterpriseApp');
    assert.strictEqual(statusData.sourcePhone, '919876543210');
    assert.strictEqual(statusData.maskedApiKey, '••••••••9999');
    assert.strictEqual(statusData.hasApiKey, true);
  });

  await t.test('Task 2.7: downloadSignedPdf serves valid PDF file and prevents traversal', async () => {
    const pdfController = require('../controllers/pdfController');
    const { createSignedPdfToken } = require('../services/security/signedUrlService');
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const testFilename = `test_delivery_${Date.now()}.pdf`;
    const testFilePath = path.join(uploadsDir, testFilename);
    fs.writeFileSync(testFilePath, '%PDF-1.4 mock pdf for whatsapp delivery');
    const testCompany = 'test_signed_dl_' + Date.now();

    const { data: pdfRow } = await supabase.from('pdf_files').insert({
      company_id: testCompany,
      originalFilename: testFilename,
      extractedName: 'Test Signed',
      filePath: testFilePath
    }).select().single();

    try {
      const { token, expires } = createSignedPdfToken(pdfRow.id, testCompany, 300);
      const { Writable } = require('stream');
      const headers = {};
      let streamedBytes = 0;
      const mockRes = new Writable({
        write(chunk, encoding, callback) {
          streamedBytes += chunk.length;
          callback();
        }
      });
      mockRes.setHeader = (k, v) => {
        headers[k] = v;
      };
      mockRes.status = (code) => mockRes;

      await new Promise((resolve, reject) => {
        mockRes.on('finish', resolve);
        mockRes.on('error', reject);
        pdfController.downloadSignedPdf(
          { params: { identifier: String(pdfRow.id) }, query: { token, expires } },
          mockRes,
          reject
        );
      });

      assert.ok(streamedBytes > 0, 'Streamed PDF file bytes must be greater than 0');

      // Verify traversal blocking
      let traversalStatus = null;
      const traversalRes = {
        status: (code) => {
          traversalStatus = code;
          return {
            json: () => {}
          };
        }
      };

      await pdfController.downloadSignedPdf(
        { params: { filename: '../../package.json' } },
        traversalRes,
        () => {}
      );

      assert.ok(traversalStatus === 403 || traversalStatus === 404);
    } finally {
      if (fs.existsSync(testFilePath)) {
        try { fs.unlinkSync(testFilePath); } catch (e) {}
      }
      if (pdfRow?.id) {
        await supabase.from('pdf_files').delete().eq('id', pdfRow.id);
      }
    }
  });
});
