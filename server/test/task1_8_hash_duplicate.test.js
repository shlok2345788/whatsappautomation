const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const queueService = require('../services/queue/queueService');
const pdfService = require('../services/pdf/pdfService');
const { supabase } = require('../services/supabaseClient');

test('Task 1.8 — Cryptographic SHA-256 Content-Hash Duplicate Detection Suite', async (t) => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const companyA = 'tenant_hash_a_' + Date.now();
  const companyB = 'tenant_hash_b_' + Date.now();

  const dirA = path.join(uploadsDir, 'pdfs', `tenant_${companyA}`);
  const dirB = path.join(uploadsDir, 'pdfs', `tenant_${companyB}`);
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirB, { recursive: true });

  process.env.SIMULATION_MODE = 'true';
  process.env.NODE_ENV = 'development';

  const cleanupFiles = [];

  t.after(() => {
    try {
      for (const f of cleanupFiles) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      if (fs.existsSync(dirA)) fs.rmdirSync(dirA);
      if (fs.existsSync(dirB)) fs.rmdirSync(dirB);
    } catch (e) {}
  });

  await t.test('1. SHA-256 hash computation produces 64-character hex digest', async () => {
    const testFile = path.join(dirA, 'sample_hash.pdf');
    fs.writeFileSync(testFile, '%PDF-1.4 Content for hashing validation');
    cleanupFiles.push(testFile);

    const hash1 = pdfService.calculateFileHash(testFile);
    const hash2 = queueService.computeFileSha256(testFile);

    assert.equal(hash1.length, 64, 'calculateFileHash must produce 64-character SHA-256 hex string');
    assert.equal(hash2.length, 64, 'computeFileSha256 must produce 64-character SHA-256 hex string');
    assert.equal(hash1, hash2, 'Both hash calculations must match');

    // Expected SHA-256
    const expected = crypto.createHash('sha256').update('%PDF-1.4 Content for hashing validation').digest('hex');
    assert.equal(hash1, expected, 'Hash matches Node.js crypto SHA-256');
  });

  await t.test('2. Identical content under different filenames is detected as duplicate and skipped', async () => {
    const sameContent = '%PDF-1.4 Identical Content Across Multiple Files';

    const file1 = path.join(dirA, 'ledger_original.pdf');
    const file2 = path.join(dirA, 'ledger_renamed_copy.pdf');
    fs.writeFileSync(file1, sameContent);
    fs.writeFileSync(file2, sameContent);
    cleanupFiles.push(file1, file2);

    const { data: contact } = await supabase.from('contacts').insert({
      company_id: companyA,
      name: 'Dup Target Customer',
      mobile: '919800000001',
      isValid: 1
    }).select().single();

    const { data: pdf1 } = await supabase.from('pdf_files').insert({
      company_id: companyA,
      originalFilename: 'ledger_original.pdf',
      extractedName: 'Dup Target Customer',
      filePath: file1,
      matchedContactId: contact.id
    }).select().single();

    const { data: pdf2 } = await supabase.from('pdf_files').insert({
      company_id: companyA,
      originalFilename: 'ledger_renamed_copy.pdf',
      extractedName: 'Dup Target Customer',
      filePath: file2,
      matchedContactId: contact.id
    }).select().single();

    await supabase.from('settings').upsert({
      company_id: companyA,
      delayBetweenMessages: 0
    });

    // Send original
    const result1 = await queueService.processSendQueue(companyA, [{
      pdfId: pdf1.id,
      contactId: contact.id
    }], null, null);

    assert.equal(result1.simulatedCount, 1, 'First file should be dispatched');
    assert.equal(result1.skippedCount, 0, 'First file should not be skipped');

    // Attempt to send second file with identical content but different filename
    const result2 = await queueService.processSendQueue(companyA, [{
      pdfId: pdf2.id,
      contactId: contact.id
    }], null, null);

    assert.equal(result2.skippedCount, 1, 'File with identical SHA-256 hash should be skipped as duplicate');
    assert.equal(result2.simulatedCount, 0, 'Duplicate content must not be sent');
  });

  await t.test('3. Changed content under same filename is permitted and dispatched', async () => {
    const file = path.join(dirA, 'monthly_statement.pdf');
    fs.writeFileSync(file, '%PDF-1.4 Initial Month Content v1');
    cleanupFiles.push(file);

    const { data: contact } = await supabase.from('contacts').insert({
      company_id: companyA,
      name: 'Month End Customer',
      mobile: '919800000002',
      isValid: 1
    }).select().single();

    const { data: pdfRow } = await supabase.from('pdf_files').insert({
      company_id: companyA,
      originalFilename: 'monthly_statement.pdf',
      extractedName: 'Month End Customer',
      filePath: file,
      matchedContactId: contact.id
    }).select().single();

    // First send v1
    const res1 = await queueService.processSendQueue(companyA, [{
      pdfId: pdfRow.id,
      contactId: contact.id
    }], null, null);
    assert.equal(res1.simulatedCount, 1);

    // Now update file content to v2 (different hash, same filename)
    fs.writeFileSync(file, '%PDF-1.4 Updated Month Content with New Transactions v2');

    // Send v2 under same filename
    const res2 = await queueService.processSendQueue(companyA, [{
      pdfId: pdfRow.id,
      contactId: contact.id
    }], null, null);

    assert.equal(res2.simulatedCount, 1, 'Updated content under same filename should be sent');
    assert.equal(res2.skippedCount, 0, 'Updated content must not be blocked as duplicate');
  });

  await t.test('4. forceSend: true overrides duplicate suppression and dispatches regardless', async () => {
    const file = path.join(dirA, 'forced_document.pdf');
    fs.writeFileSync(file, '%PDF-1.4 Static Document Content');
    cleanupFiles.push(file);

    const { data: contact } = await supabase.from('contacts').insert({
      company_id: companyA,
      name: 'Force Send Customer',
      mobile: '919800000003',
      isValid: 1
    }).select().single();

    const { data: pdfRow } = await supabase.from('pdf_files').insert({
      company_id: companyA,
      originalFilename: 'forced_document.pdf',
      extractedName: 'Force Send Customer',
      filePath: file,
      matchedContactId: contact.id
    }).select().single();

    // 1st send
    await queueService.processSendQueue(companyA, [{
      pdfId: pdfRow.id,
      contactId: contact.id
    }], null, null);

    // 2nd send without forceSend should be skipped
    const resSkipped = await queueService.processSendQueue(companyA, [{
      pdfId: pdfRow.id,
      contactId: contact.id
    }], null, null);
    assert.equal(resSkipped.skippedCount, 1);

    // 3rd send WITH forceSend: true should be dispatched
    const resForced = await queueService.processSendQueue(companyA, [{
      pdfId: pdfRow.id,
      contactId: contact.id,
      forceSend: true
    }], null, null);

    assert.equal(resForced.simulatedCount, 1, 'forceSend: true must dispatch even if content hash matches previously sent');
    assert.equal(resForced.skippedCount, 0, 'forceSend: true must not be skipped');
  });

  await t.test('5. Multi-tenant isolation: identical content in tenant B is not blocked by tenant A send', async () => {
    const commonContent = '%PDF-1.4 Universal Standard Terms & Conditions';

    const fileA = path.join(dirA, 'terms.pdf');
    const fileB = path.join(dirB, 'terms.pdf');
    fs.writeFileSync(fileA, commonContent);
    fs.writeFileSync(fileB, commonContent);
    cleanupFiles.push(fileA, fileB);

    // Common phone number
    const commonPhone = '919800000099';

    const { data: contactA } = await supabase.from('contacts').insert({
      company_id: companyA,
      name: 'Common Contact A',
      mobile: commonPhone,
      isValid: 1
    }).select().single();

    const { data: pdfA } = await supabase.from('pdf_files').insert({
      company_id: companyA,
      originalFilename: 'terms.pdf',
      extractedName: 'Common Contact A',
      filePath: fileA,
      matchedContactId: contactA.id
    }).select().single();

    const { data: contactB } = await supabase.from('contacts').insert({
      company_id: companyB,
      name: 'Common Contact B',
      mobile: commonPhone,
      isValid: 1
    }).select().single();

    const { data: pdfB } = await supabase.from('pdf_files').insert({
      company_id: companyB,
      originalFilename: 'terms.pdf',
      extractedName: 'Common Contact B',
      filePath: fileB,
      matchedContactId: contactB.id
    }).select().single();

    await supabase.from('settings').upsert({
      company_id: companyB,
      delayBetweenMessages: 0
    });

    // Send in Company A
    const resA = await queueService.processSendQueue(companyA, [{
      pdfId: pdfA.id,
      contactId: contactA.id
    }], null, null);
    assert.equal(resA.simulatedCount, 1);

    // Send in Company B (same content hash, same phone, different company)
    const resB = await queueService.processSendQueue(companyB, [{
      pdfId: pdfB.id,
      contactId: contactB.id
    }], null, null);

    assert.equal(resB.simulatedCount, 1, 'Company B must dispatch even if Company A sent the same content hash to the same phone');
    assert.equal(resB.skippedCount, 0, 'Different company must not be blocked');
  });
});
