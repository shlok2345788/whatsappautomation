const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { Writable } = require('stream');

const pdfController = require('../controllers/pdfController');
const gupshupService = require('../services/whatsapp/gupshupService');
const { createSignedPdfToken } = require('../services/security/signedUrlService');
const { supabase } = require('../services/supabaseClient');

test('D2 — Tenant-Specific PDF Retrieval & Gupshup Download Link Suite', async (t) => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const tenantId = 'tenant_d2_' + Date.now();
  const otherTenantId = 'tenant_d2_other_' + Date.now();

  const tenantDir = path.join(uploadsDir, 'pdfs', `tenant_${tenantId}`);
  fs.mkdirSync(tenantDir, { recursive: true });

  const testPdfPath = path.join(tenantDir, 'statement_2026.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 Tenant D2 Account Statement Sample Data');

  let pdfRecord, otherPdfRecord;

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

  t.before(async () => {
    const { data: p1 } = await supabase.from('pdf_files').insert({
      company_id: tenantId,
      originalFilename: 'statement_2026.pdf',
      extractedName: 'John Doe',
      filePath: testPdfPath,
      fileSize: fs.statSync(testPdfPath).size
    }).select().single();
    pdfRecord = p1;

    const { data: p2 } = await supabase.from('pdf_files').insert({
      company_id: otherTenantId,
      originalFilename: 'other_statement.pdf',
      extractedName: 'Jane Roe',
      filePath: testPdfPath,
      fileSize: 100
    }).select().single();
    otherPdfRecord = p2;
  });

  t.after(async () => {
    try {
      if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
      if (fs.existsSync(tenantDir)) fs.rmSync(tenantDir, { recursive: true, force: true });
    } catch (e) {}

    if (pdfRecord?.id) await supabase.from('pdf_files').delete().eq('id', pdfRecord.id);
    if (otherPdfRecord?.id) await supabase.from('pdf_files').delete().eq('id', otherPdfRecord.id);
  });

  await t.test('1. Valid tenant-specific PDF in uploads/pdfs/tenant_<id>/ is fetched successfully via signed link', async () => {
    const { token, expires } = createSignedPdfToken(pdfRecord.id, tenantId, 600);
    const res = createMockRes();

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      pdfController.downloadSignedPdf(
        {
          params: { identifier: String(pdfRecord.id) },
          query: { token, expires }
        },
        res,
        reject
      );
    });

    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getHeaders()['content-type'], 'application/pdf');
    assert.ok(res.getStreamedBytes() > 0, 'Must stream the tenant-specific PDF file content');
  });

  await t.test('2. Token generated for Tenant A cannot download a PDF belonging to Tenant B', async () => {
    // Generate valid token for otherPdfRecord (which belongs to otherTenantId)
    const { token, expires } = createSignedPdfToken(otherPdfRecord.id, otherTenantId, 600);
    const res = createMockRes();

    // Attacker attempts to use that token against pdfRecord (which belongs to tenantId)
    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        {
          params: { identifier: String(pdfRecord.id) },
          query: { token, expires }
        },
        res,
        () => resolve()
      );
    });

    assert.strictEqual(res.getStatus(), 403, 'Cross-tenant token reuse must be rejected with 403');
    assert.match(res.getBody()?.message || '', /invalid or tampered/i);
  });

  await t.test('3. Expired signed link for tenant PDF returns HTTP 403', async () => {
    const { token, expires } = createSignedPdfToken(pdfRecord.id, tenantId, -30); // expired 30s ago
    const res = createMockRes();

    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        {
          params: { identifier: String(pdfRecord.id) },
          query: { token, expires }
        },
        res,
        () => resolve()
      );
    });

    assert.strictEqual(res.getStatus(), 403);
    assert.match(res.getBody()?.message || '', /expired/i);
  });

  await t.test('4. Deleted file on disk returns HTTP 404 cleanly even if token is valid', async () => {
    // Register record with nonexistent file path
    const { data: missingPdf } = await supabase.from('pdf_files').insert({
      company_id: tenantId,
      originalFilename: 'missing_doc.pdf',
      extractedName: 'Missing Doc',
      filePath: path.join(tenantDir, 'deleted_before_download.pdf')
    }).select().single();

    try {
      const { token, expires } = createSignedPdfToken(missingPdf.id, tenantId, 600);
      const res = createMockRes();

      await new Promise((resolve) => {
        res.on('finish', resolve);
        pdfController.downloadSignedPdf(
          {
            params: { identifier: String(missingPdf.id) },
            query: { token, expires }
          },
          res,
          () => resolve()
        );
      });

      assert.strictEqual(res.getStatus(), 404, 'Must return 404 when file is missing from disk');
      assert.match(res.getBody()?.message || '', /File not found on storage disk/i);
    } finally {
      await supabase.from('pdf_files').delete().eq('id', missingPdf.id);
    }
  });

  await t.test('5. Path traversal attempt using malformed identifier is blocked', async () => {
    const res = createMockRes();
    await new Promise((resolve) => {
      res.on('finish', resolve);
      pdfController.downloadSignedPdf(
        {
          params: { identifier: '../../etc/passwd' },
          query: { token: 'any', expires: '9999999999' }
        },
        res,
        () => resolve()
      );
    });

    assert.ok(res.getStatus() === 403 || res.getStatus() === 404);
  });
});
