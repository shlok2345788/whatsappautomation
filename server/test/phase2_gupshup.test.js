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
      assert.ok(result.messageId.startsWith('mock_gup_'));
      assert.strictEqual(result.status, 'submitted');
    } finally {
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
});
