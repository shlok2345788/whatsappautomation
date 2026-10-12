const test = require('node:test');
const assert = require('node:assert/strict');
const { supabase } = require('../services/supabaseClient');
const { recoverOrphanedQueues } = require('../services/queue/queueService');

test('Phase 4 - Reliability, Observability & Crash Recovery Suite', async (t) => {
  await t.test('Task 4.1: recoverOrphanedQueues cleanly recovers interrupted batches and dangling logs', async () => {
    const testCompany = 'test_recovery_company_' + Date.now();
    const nowIso = new Date().toISOString();

    // 1. Simulate an interrupted batch from an ungraceful server crash
    const { data: batch, error: batchErr } = await supabase.from('queue_batches').insert({
      company_id: testCompany,
      status: 'running',
      totalItems: 50,
      processedItems: 12,
      sentCount: 10,
      failedCount: 2,
      skippedCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    assert.ok(batch && batch.id, 'Must create test batch');

    // 2. Simulate a message log locked in "Sending" state
    const { data: logEntry, error: logErr } = await supabase.from('message_logs').insert({
      company_id: testCompany,
      contactName: 'In Flight Debtor',
      phone: '919876543210',
      pdfFilename: 'statement.pdf',
      pdfPath: '/path/to/statement.pdf',
      status: 'Sending',
      createdAt: nowIso
    }).select().single();

    assert.ok(logEntry && logEntry.id, 'Must create test log');

    // 3. Trigger recovery handler
    await recoverOrphanedQueues();

    // 4. Verify batch was updated to 'interrupted'
    const { data: recoveredBatch } = await supabase
      .from('queue_batches')
      .select('*')
      .eq('id', batch.id)
      .single();

    assert.strictEqual(recoveredBatch.status, 'interrupted', 'Crashed batch must be transitioned to interrupted');

    // 5. Verify dangling log was unlocked to Failed with restart message
    const { data: recoveredLog } = await supabase
      .from('message_logs')
      .select('*')
      .eq('id', logEntry.id)
      .single();

    assert.strictEqual(recoveredLog.status, 'Failed');
    assert.ok(
      recoveredLog.errorReason.includes('interrupted by server restart'),
      'Dangling message log must be marked as safely retryable'
    );
  });
});
