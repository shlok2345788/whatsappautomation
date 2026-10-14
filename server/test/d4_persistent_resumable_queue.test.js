const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const queueService = require('../services/queue/queueService');
const { supabase } = require('../services/supabaseClient');

test('D4 — Persistent and Resumable Sending Queue Suite', async (t) => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const companyId = 'company_d4_' + Date.now();
  const testPdfDir = path.join(uploadsDir, 'pdfs', `tenant_${companyId}`);
  fs.mkdirSync(testPdfDir, { recursive: true });

  process.env.SIMULATION_MODE = 'true';
  process.env.NODE_ENV = 'development';

  // Setup 3 synthetic contacts and PDFs
  const contacts = [];
  const pdfs = [];

  for (let i = 1; i <= 3; i++) {
    const filePath = path.join(testPdfDir, `statement_${i}.pdf`);
    fs.writeFileSync(filePath, `%PDF-1.4 D4 Test Sample Statement ${i}`);

    const { data: contact } = await supabase.from('contacts').insert({
      company_id: companyId,
      name: `Debtor Customer ${i}`,
      mobile: `91987654321${i}`,
      isValid: 1
    }).select().single();
    contacts.push(contact);

    const { data: pdf } = await supabase.from('pdf_files').insert({
      company_id: companyId,
      originalFilename: `statement_${i}.pdf`,
      extractedName: `Debtor Customer ${i}`,
      filePath,
      fileSize: 300,
      matchedContactId: contact.id
    }).select().single();
    pdfs.push(pdf);
  }

  t.after(() => {
    try {
      for (const p of pdfs) {
        if (fs.existsSync(p.filePath)) fs.unlinkSync(p.filePath);
      }
      if (fs.existsSync(testPdfDir)) fs.rmdirSync(testPdfDir);
    } catch (e) {}
  });

  await t.test('1. Queue items are persistently stored in queue_items table upon batch creation', async () => {
    await supabase.from('settings').upsert({
      company_id: companyId,
      delayBetweenMessages: 0
    });

    const rawItems = [
      { pdfId: pdfs[0].id },
      { pdfId: pdfs[1].id }
    ];

    const validatedItems = await queueService.validateAndResolveQueueItems(companyId, rawItems);
    assert.equal(validatedItems.length, 2);

    const result = await queueService.processSendQueue(companyId, validatedItems, 'Hello {{name}}', null);
    assert.equal(result.total, 2);

    // Verify individual items are recorded in queue_items
    const { data: items } = await supabase
      .from('queue_items')
      .select('*')
      .eq('company_id', companyId);

    assert.ok(items.length >= 2, 'Must have at least 2 queue_items persisted');
    for (const item of items) {
      assert.ok(item.batch_id, 'Item must have batch_id');
      assert.equal(item.company_id, companyId);
      assert.ok(item.recipientPhone.startsWith('91987654321'));
      assert.ok(['simulated', 'sent', 'completed'].includes(item.status));
      assert.ok(item.providerMessageId.startsWith('sim_gup_'));
    }
  });

  await t.test('2. Interrupted crash recovery reconciles in-flight items without duplicating accepted provider messages', async () => {
    const crashCompany = 'comp_crash_' + Date.now();
    const nowIso = new Date().toISOString();

    // Create an interrupted batch with 3 distinct items
    const { data: batch } = await supabase.from('queue_batches').insert({
      company_id: crashCompany,
      status: 'running',
      totalItems: 3,
      processedItems: 1,
      sentCount: 1,
      failedCount: 0,
      skippedCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    // Item 1: Already Sent with provider message ID
    await supabase.from('queue_items').insert({
      batch_id: batch.id,
      company_id: crashCompany,
      recipientName: 'Customer 1',
      recipientPhone: '919820000001',
      pdfId: pdfs[0].id,
      pdfFilename: 'stmt_1.pdf',
      pdfPath: pdfs[0].filePath,
      status: 'sent',
      deliveryStatus: 'submitted',
      providerMessageId: 'gup_accepted_001',
      createdAt: nowIso,
      updatedAt: nowIso
    });

    // Item 2: Was in 'processing' state when server crashed, but provider ALREADY returned message ID
    const { data: item2 } = await supabase.from('queue_items').insert({
      batch_id: batch.id,
      company_id: crashCompany,
      recipientName: 'Customer 2',
      recipientPhone: '919820000002',
      pdfId: pdfs[1].id,
      pdfFilename: 'stmt_2.pdf',
      pdfPath: pdfs[1].filePath,
      status: 'processing',
      deliveryStatus: 'pending',
      providerMessageId: 'gup_accepted_002', // Accepted by Gupshup!
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    // Item 3: Was in 'processing' state when server crashed BEFORE provider accepted (no message ID)
    const { data: item3 } = await supabase.from('queue_items').insert({
      batch_id: batch.id,
      company_id: crashCompany,
      recipientName: 'Customer 3',
      recipientPhone: '919820000003',
      pdfId: pdfs[2].id,
      pdfFilename: 'stmt_3.pdf',
      pdfPath: pdfs[2].filePath,
      status: 'processing',
      deliveryStatus: 'pending',
      providerMessageId: '', // Died before provider accepted
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    // Execute crash recovery
    await queueService.recoverOrphanedQueues();

    // Verify batch is marked 'interrupted'
    const { data: recoveredBatch } = await supabase
      .from('queue_batches')
      .select('*')
      .eq('id', batch.id)
      .single();
    assert.equal(recoveredBatch.status, 'interrupted');

    // Verify Item 2 (accepted by provider) was transitioned to 'sent' and NOT left pending
    const { data: recItem2 } = await supabase
      .from('queue_items')
      .select('*')
      .eq('id', item2.id)
      .single();
    assert.equal(recItem2.status, 'sent', 'Accepted provider message must NOT be resent');

    // Verify Item 3 (interrupted before provider accepted) was safely reset to 'pending'
    const { data: recItem3 } = await supabase
      .from('queue_items')
      .select('*')
      .eq('id', item3.id)
      .single();
    assert.equal(recItem3.status, 'pending', 'Unsubmitted item must be reset to pending for resumption');
  });

  await t.test('3. Resuming an interrupted batch dispatches only the remaining pending items and updates batch to completed', async () => {
    const resumeCompany = 'comp_resume_' + Date.now();
    const nowIso = new Date().toISOString();

    await supabase.from('settings').upsert({
      company_id: resumeCompany,
      delayBetweenMessages: 0
    });

    const resumePdfs = [];
    const resumeContacts = [];
    for (let k = 1; k <= 3; k++) {
      const { data: c } = await supabase.from('contacts').insert({
        company_id: resumeCompany,
        name: `Resume Debtor ${k}`,
        mobile: `91983000000${k}`,
        isValid: 1
      }).select().single();
      resumeContacts.push(c);

      const rPdfPath = path.join(testPdfDir, `resume_stmt_${k}.pdf`);
      fs.writeFileSync(rPdfPath, `%PDF-1.4 Resume Test File ${k}`);

      const { data: p } = await supabase.from('pdf_files').insert({
        company_id: resumeCompany,
        originalFilename: `resume_stmt_${k}.pdf`,
        extractedName: `Resume Debtor ${k}`,
        filePath: rPdfPath,
        fileSize: 300,
        matchedContactId: c.id
      }).select().single();
      resumePdfs.push(p);
    }

    // Setup interrupted batch
    const { data: batch } = await supabase.from('queue_batches').insert({
      company_id: resumeCompany,
      status: 'interrupted',
      totalItems: 3,
      processedItems: 1,
      sentCount: 1,
      simulatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    // Item 1: Already Sent
    await supabase.from('queue_items').insert({
      batch_id: batch.id,
      company_id: resumeCompany,
      contactId: resumeContacts[0].id,
      recipientName: resumeContacts[0].name,
      recipientPhone: resumeContacts[0].mobile,
      pdfId: resumePdfs[0].id,
      pdfFilename: resumePdfs[0].originalFilename,
      pdfPath: resumePdfs[0].filePath,
      status: 'sent',
      deliveryStatus: 'submitted',
      providerMessageId: 'gup_accepted_previously',
      createdAt: nowIso,
      updatedAt: nowIso
    });

    // Item 2: Pending
    const { data: pItem2 } = await supabase.from('queue_items').insert({
      batch_id: batch.id,
      company_id: resumeCompany,
      contactId: resumeContacts[1].id,
      recipientName: resumeContacts[1].name,
      recipientPhone: resumeContacts[1].mobile,
      pdfId: resumePdfs[1].id,
      pdfFilename: resumePdfs[1].originalFilename,
      pdfPath: resumePdfs[1].filePath,
      status: 'pending',
      deliveryStatus: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    // Item 3: Pending
    const { data: pItem3 } = await supabase.from('queue_items').insert({
      batch_id: batch.id,
      company_id: resumeCompany,
      contactId: resumeContacts[2].id,
      recipientName: resumeContacts[2].name,
      recipientPhone: resumeContacts[2].mobile,
      pdfId: resumePdfs[2].id,
      pdfFilename: resumePdfs[2].originalFilename,
      pdfPath: resumePdfs[2].filePath,
      status: 'pending',
      deliveryStatus: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso
    }).select().single();

    // Resume the batch!
    const summary = await queueService.resumeBatch(resumeCompany, batch.id, null);

    assert.equal(summary.total, 3);
    assert.equal(summary.simulatedCount, 2, 'Should process the 2 pending items');
    assert.equal(summary.sentCount, 1, 'Should preserve the 1 previously sent item');

    // Verify Item 2 and 3 are now simulated
    const { data: updatedItem2 } = await supabase.from('queue_items').select('*').eq('id', pItem2.id).single();
    const { data: updatedItem3 } = await supabase.from('queue_items').select('*').eq('id', pItem3.id).single();

    assert.equal(updatedItem2.status, 'simulated');
    assert.equal(updatedItem3.status, 'simulated');
    assert.ok(updatedItem2.providerMessageId.startsWith('sim_gup_'));
    assert.ok(updatedItem3.providerMessageId.startsWith('sim_gup_'));

    // Verify batch is now marked completed
    const { data: completedBatch } = await supabase.from('queue_batches').select('*').eq('id', batch.id).single();
    assert.equal(completedBatch.status, 'completed');
    assert.equal(completedBatch.processedItems, 3);
  });

  await t.test('4. Cross-tenant resumption is strictly rejected with authorization error', async () => {
    const foreignCompany = 'comp_foreign_' + Date.now();
    const victimCompany = 'comp_victim_' + Date.now();

    const { data: victimBatch } = await supabase.from('queue_batches').insert({
      company_id: victimCompany,
      status: 'interrupted',
      totalItems: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).select().single();

    await assert.rejects(
      async () => {
        await queueService.resumeBatch(foreignCompany, victimBatch.id, null);
      },
      /Queue batch not found or unauthorized/i
    );
  });

  await t.test('5. Resuming a completed batch returns immediately without duplicate sending', async () => {
    const compCompleted = 'comp_done_' + Date.now();
    const { data: doneBatch } = await supabase.from('queue_batches').insert({
      company_id: compCompleted,
      status: 'completed',
      totalItems: 2,
      processedItems: 2,
      sentCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).select().single();

    const result = await queueService.resumeBatch(compCompleted, doneBatch.id, null);
    assert.ok(result.message.includes('already completed'));
  });
});
