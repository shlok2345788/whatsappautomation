const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../services/supabaseClient');
const queueService = require('../services/queue/queueService');

test('C2 — Make Queue Sending Trust Server-Side Data Only', async (t) => {
  const tenantA = 'tenant_company_A_' + Date.now();
  const tenantB = 'tenant_company_B_' + Date.now();
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Create real dummy PDFs on disk
  const samplePdfPathA = path.join(uploadsDir, `test_c2_doc_A_${Date.now()}.pdf`);
  fs.writeFileSync(samplePdfPathA, '%PDF-1.4 Company A statement');

  const samplePdfPathB = path.join(uploadsDir, `test_c2_doc_B_${Date.now()}.pdf`);
  fs.writeFileSync(samplePdfPathB, '%PDF-1.4 Company B statement');

  let contactA, pdfA, contactB, pdfB;

  t.before(async () => {
    // Insert contact for Tenant A
    const { data: cA } = await supabase.from('contacts').insert({
      company_id: tenantA,
      name: 'Authorized Debtor A',
      mobile: '919876543210',
      isValid: 1
    }).select().single();
    contactA = cA;

    // Insert PDF for Tenant A
    const { data: pA } = await supabase.from('pdf_files').insert({
      company_id: tenantA,
      originalFilename: 'Authorized_Statement_A.pdf',
      extractedName: 'Authorized Debtor A',
      filePath: samplePdfPathA,
      fileSize: 100,
      fileHash: 'hash_a_123',
      matchedContactId: contactA.id
    }).select().single();
    pdfA = pA;

    // Insert contact for Tenant B
    const { data: cB } = await supabase.from('contacts').insert({
      company_id: tenantB,
      name: 'Victim Debtor B',
      mobile: '919999999999',
      isValid: 1
    }).select().single();
    contactB = cB;

    // Insert PDF for Tenant B
    const { data: pB } = await supabase.from('pdf_files').insert({
      company_id: tenantB,
      originalFilename: 'Confidential_Statement_B.pdf',
      extractedName: 'Victim Debtor B',
      filePath: samplePdfPathB,
      fileSize: 100,
      fileHash: 'hash_b_456',
      matchedContactId: contactB.id
    }).select().single();
    pdfB = pB;
  });

  t.after(async () => {
    if (fs.existsSync(samplePdfPathA)) try { fs.unlinkSync(samplePdfPathA); } catch (e) {}
    if (fs.existsSync(samplePdfPathB)) try { fs.unlinkSync(samplePdfPathB); } catch (e) {}
    await supabase.from('pdf_files').delete().eq('company_id', tenantA);
    await supabase.from('pdf_files').delete().eq('company_id', tenantB);
    await supabase.from('contacts').delete().eq('company_id', tenantA);
    await supabase.from('contacts').delete().eq('company_id', tenantB);
    await supabase.from('message_logs').delete().eq('company_id', tenantA);
    await supabase.from('message_logs').delete().eq('company_id', tenantB);
  });

  await t.test('1. Fabricated filesystem path provided by browser is rejected or ignored in favor of server path', async () => {
    // Attacker sends arbitrary filesystem path like /etc/passwd or C:\\Windows\\win.ini
    const maliciousItem = {
      pdfId: pdfA.id,
      pdfPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
      phone: '919876543210',
      name: 'Tampered Name'
    };

    // The validation function must resolve the path strictly from DB (samplePdfPathA), NOT C:\Windows\...
    const validatedItems = await queueService.validateAndResolveQueueItems(tenantA, [maliciousItem]);
    assert.strictEqual(validatedItems.length, 1);
    assert.strictEqual(
      validatedItems[0].pdfPath,
      samplePdfPathA,
      'Resolved PDF path must be the server DB path, completely ignoring client-supplied path'
    );
  });

  await t.test('2. PDF belonging to another company is rejected with an authorization error', async () => {
    // Tenant A attempts to send Tenant B's PDF
    const crossTenantItem = {
      pdfId: pdfB.id, // belongs to Tenant B
      contactId: contactA.id
    };

    await assert.rejects(
      async () => {
        await queueService.validateAndResolveQueueItems(tenantA, [crossTenantItem]);
      },
      /unauthorized|invalid pdf identifier|forbidden/i,
      'Must reject PDF belonging to another company'
    );
  });

  await t.test('3. Client-edited phone number cannot override authorized recipient from server contact record', async () => {
    // Attacker modifies phone number in request body to redirect another customer's document
    const tamperedPhoneItem = {
      pdfId: pdfA.id,
      contactId: contactA.id,
      phone: '918888888888', // Tampered phone! Real is 919876543210
      name: 'Attacker Recipient'
    };

    const validatedItems = await queueService.validateAndResolveQueueItems(tenantA, [tamperedPhoneItem]);
    assert.strictEqual(
      validatedItems[0].phone,
      '919876543210',
      'Phone must be resolved from server contact record, ignoring client-tampered phone'
    );
    assert.strictEqual(
      validatedItems[0].name,
      'Authorized Debtor A',
      'Name must be resolved from server contact record'
    );
  });

  await t.test('4. Contact belonging to another company cannot be attached to Tenant A PDF', async () => {
    const crossTenantContactItem = {
      pdfId: pdfA.id,
      contactId: contactB.id // belongs to Tenant B!
    };

    await assert.rejects(
      async () => {
        await queueService.validateAndResolveQueueItems(tenantA, [crossTenantContactItem]);
      },
      /unauthorized contact|contact does not belong/i,
      'Must reject foreign tenant contact identifier'
    );
  });

  await t.test('5. Non-existent PDF ID is rejected cleanly without internal path leakage', async () => {
    const nonExistentItem = {
      pdfId: 99999999
    };

    await assert.rejects(
      async () => {
        await queueService.validateAndResolveQueueItems(tenantA, [nonExistentItem]);
      },
      /unauthorized or invalid pdf|not found/i,
      'Must reject non-existent PDF'
    );
  });

  await t.test('6. Legitimate authorized queue request resolves correctly from server records', async () => {
    const legitimateItem = {
      pdfId: pdfA.id
    };

    const validated = await queueService.validateAndResolveQueueItems(tenantA, [legitimateItem]);
    assert.strictEqual(validated.length, 1);
    assert.strictEqual(validated[0].pdfId, pdfA.id);
    assert.strictEqual(validated[0].pdfFilename, 'Authorized_Statement_A.pdf');
    assert.strictEqual(validated[0].pdfPath, samplePdfPathA);
    assert.strictEqual(validated[0].phone, '919876543210');
    assert.strictEqual(validated[0].name, 'Authorized Debtor A');
  });
});
