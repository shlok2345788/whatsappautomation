const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  prepareBatchForApproval,
  approveBatch,
  rejectBatch,
  dispatchBatch,
  listBatches
} = require('../services/queue/queueService');
const {
  startQueue,
  submitForApproval,
  approveBatch: controllerApprove,
  rejectBatch: controllerReject,
  dispatchApprovedBatch
} = require('../controllers/queueController');
const { supabase } = require('../services/supabaseClient');

test('Task 4.1 — Review and Approval Workflow Suite', async (t) => {
  const tenantA = 'tenant_approval_a_' + Date.now();
  const tenantB = 'tenant_approval_b_' + Date.now();

  const tempDir = path.join(os.tmpdir(), 'approval_test_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  const pdfFile = path.join(tempDir, 'statement.pdf');
  fs.writeFileSync(pdfFile, 'APPROVAL_TEST_PDF_STATEMENT');

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  });

  // Seed PDF and contact for Tenant A
  const now = new Date().toISOString();
  const { data: contactRow } = await supabase.from('contacts').insert({
    company_id: tenantA,
    name: 'Approval Target Customer',
    mobile: '919876543210',
    isValid: 1,
    createdAt: now
  }).select().single();

  const { data: pdfRow } = await supabase.from('pdf_files').insert({
    company_id: tenantA,
    originalFilename: 'statement.pdf',
    extractedName: 'Statement',
    filePath: pdfFile,
    fileSize: 100,
    matchedContactId: contactRow.id,
    createdAt: now
  }).select().single();

  let createdBatchId = null;

  await t.test('1. Submit queue for approval creates pending_approval batch with items', async () => {
    const rawItems = [{ pdfId: pdfRow.id, contactId: contactRow.id }];
    const batch = await prepareBatchForApproval(tenantA, rawItems, 'Hello {{name}}', 'analyst_uid');

    assert.ok(batch.batchId, 'Batch ID must be generated');
    assert.equal(batch.approvalStatus, 'pending');
    assert.equal(batch.status, 'pending_approval');
    assert.equal(batch.totalItems, 1);
    createdBatchId = batch.batchId;

    // Verify items in DB
    const { data: items } = await supabase
      .from('queue_items')
      .select('*')
      .eq('batch_id', createdBatchId);

    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'pending');
    assert.equal(items[0].approvalRef, null, 'Unapproved items must have null approvalRef');
  });

  await t.test('2. Unapproved batch cannot be dispatched directly and throws error', async () => {
    await assert.rejects(
      async () => await dispatchBatch(tenantA, createdBatchId, null),
      /requires managerial approval before dispatch/i
    );
  });

  await t.test('3. Enforce approval requirement when tenant settings requireApproval is enabled', async () => {
    // Enable requireApproval in settings
    await supabase.from('settings').upsert({
      company_id: tenantA,
      requireApproval: 1,
      delayBetweenMessages: 4,
      updatedAt: new Date().toISOString()
    }, { onConflict: 'company_id' });

    const req = {
      companyId: tenantA,
      user: { id: tenantA },
      body: { queueItems: [{ pdfId: pdfRow.id, contactId: contactRow.id }] },
      app: { get: () => null }
    };
    let statusCode = 200;
    let jsonBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { jsonBody = data; return this; }
    };

    await startQueue(req, res, () => {});

    assert.equal(statusCode, 403, 'Direct dispatch without approval must return 403');
    assert.match(jsonBody.message, /Managerial approval is required/i);
  });

  await t.test('4. Managerial approval transitions batch to approved and populates approvalRef', async () => {
    const approval = await approveBatch(tenantA, createdBatchId, 'manager_john');

    assert.equal(approval.approvalStatus, 'approved');
    assert.equal(approval.approvedBy, 'manager_john');
    assert.ok(approval.approvalRef, 'approvalRef must be set');

    // Verify DB batch state
    const { data: batchInDb } = await supabase
      .from('queue_batches')
      .select('*')
      .eq('id', createdBatchId)
      .single();

    assert.equal(batchInDb.approvalStatus, 'approved');
    assert.equal(batchInDb.status, 'ready');

    // Verify item has approvalRef
    const { data: items } = await supabase
      .from('queue_items')
      .select('*')
      .eq('batch_id', createdBatchId);

    assert.ok(items[0].approvalRef, 'Items must record approvalRef');
  });

  await t.test('5. Rejection workflow: rejected batch cannot be approved or dispatched', async () => {
    const rawItems = [{ pdfId: pdfRow.id, contactId: contactRow.id }];
    const batch = await prepareBatchForApproval(tenantA, rawItems, 'Hello {{name}}', 'analyst_uid');

    const rejection = await rejectBatch(tenantA, batch.batchId, 'risk_officer', 'Customer ledger balance discrepancy');
    assert.equal(rejection.approvalStatus, 'rejected');

    // Attempting to dispatch rejected batch must fail
    await assert.rejects(
      async () => await dispatchBatch(tenantA, batch.batchId, null),
      /requires managerial approval/i
    );

    // Attempting to approve previously rejected batch must fail
    await assert.rejects(
      async () => await approveBatch(tenantA, batch.batchId, 'manager_bob'),
      /previously rejected/i
    );
  });

  await t.test('6. Multi-tenant isolation: Tenant B cannot approve or view Tenant A batch', async () => {
    await assert.rejects(
      async () => await approveBatch(tenantB, createdBatchId, 'tenant_b_user'),
      /not found/i
    );
  });
});
