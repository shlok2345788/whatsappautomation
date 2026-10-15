const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  cleanupExpiredPdfs,
  getRetentionStatus,
  startRetentionSchedule,
  stopRetentionSchedule
} = require('../services/pdf/pdfRetentionService');
const { supabase } = require('../services/supabaseClient');

test('Task 1.13 — PDF Retention and Automated Cleanup Suite', async (t) => {
  const testDir = path.join(os.tmpdir(), 'pdf_retention_test_' + Date.now());
  const uploadsDir = path.join(testDir, 'uploads');
  const pdfsDir = path.join(uploadsDir, 'pdfs');

  const tenantA = 'tenant_retention_a_' + Date.now();
  const tenantB = 'tenant_retention_b_' + Date.now();

  const tenantADir = path.join(pdfsDir, `tenant_${tenantA}`);
  const tenantBDir = path.join(pdfsDir, `tenant_${tenantB}`);

  fs.mkdirSync(tenantADir, { recursive: true });
  fs.mkdirSync(tenantBDir, { recursive: true });

  const now = Date.now();
  const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
  const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();

  // Create physical files
  const expiredFileA = path.join(tenantADir, 'expired_statement_a.pdf');
  const activeFileA = path.join(tenantADir, 'active_statement_a.pdf');
  const expiredFileB = path.join(tenantBDir, 'expired_statement_b.pdf');

  fs.writeFileSync(expiredFileA, 'EXPIRED_PDF_CONTENT_A_40_DAYS_OLD');
  fs.writeFileSync(activeFileA, 'ACTIVE_PDF_CONTENT_A_5_DAYS_OLD');
  fs.writeFileSync(expiredFileB, 'EXPIRED_PDF_CONTENT_B_40_DAYS_OLD');

  // Insert database records
  await supabase.from('pdf_files').insert([
    {
      company_id: tenantA,
      originalFilename: 'expired_statement_a.pdf',
      extractedName: 'Expired A',
      filePath: expiredFileA,
      fileSize: fs.statSync(expiredFileA).size,
      createdAt: fortyDaysAgo
    },
    {
      company_id: tenantA,
      originalFilename: 'active_statement_a.pdf',
      extractedName: 'Active A',
      filePath: activeFileA,
      fileSize: fs.statSync(activeFileA).size,
      createdAt: fiveDaysAgo
    },
    {
      company_id: tenantB,
      originalFilename: 'expired_statement_b.pdf',
      extractedName: 'Expired B',
      filePath: expiredFileB,
      fileSize: fs.statSync(expiredFileB).size,
      createdAt: fortyDaysAgo
    }
  ]);

  t.after(() => {
    stopRetentionSchedule();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('1. Dry run identifies expired files without deleting anything', async () => {
    const status = await getRetentionStatus({
      retentionDays: 30,
      uploadsDir,
      companyId: tenantA
    });

    assert.equal(status.dryRun, true);
    assert.equal(status.expiredRecords, 1);
    assert.equal(status.activeRecords, 1);
    assert.ok(fs.existsSync(expiredFileA), 'Expired file A must still exist during dry run');
  });

  await t.test('2. Multi-tenant scoping: cleanup for tenant A deletes only tenant A expired files', async () => {
    const result = await cleanupExpiredPdfs({
      retentionDays: 30,
      uploadsDir,
      companyId: tenantA
    });

    assert.equal(result.deletedFiles, 1);
    assert.equal(result.deletedRecords, 1);

    // Verify expired file A deleted from disk
    assert.equal(fs.existsSync(expiredFileA), false, 'Expired file A must be unlinked from disk');

    // Verify active file A untouched on disk
    assert.equal(fs.existsSync(activeFileA), true, 'Active file A must remain intact on disk');

    // Verify tenant B expired file untouched
    assert.equal(fs.existsSync(expiredFileB), true, 'Tenant B file must not be touched by tenant A cleanup');

    // Verify DB record for expired file A removed
    const { data: checkA } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('filePath', expiredFileA)
      .maybeSingle();
    assert.equal(checkA, null, 'Expired file A record must be removed from DB');

    // Verify DB record for active file A remains
    const { data: checkActiveA } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('filePath', activeFileA)
      .maybeSingle();
    assert.ok(checkActiveA, 'Active file A record must remain in DB');
  });

  await t.test('3. System-wide cleanup with custom retention deletes remaining expired files across tenants', async () => {
    const result = await cleanupExpiredPdfs({
      retentionDays: 30,
      uploadsDir
    });

    assert.ok(result.deletedFiles >= 1, 'Tenant B expired file must be cleaned up');
    assert.equal(fs.existsSync(expiredFileB), false, 'Expired file B must be unlinked');

    // Active file A still intact
    assert.equal(fs.existsSync(activeFileA), true, 'Active file A must still remain intact');
  });

  await t.test('4. Security guard: files outside uploadsDir are never deleted', async () => {
    const externalFile = path.join(testDir, 'outside_uploads.pdf');
    fs.writeFileSync(externalFile, 'OUTSIDE_UPLOADS_CONTENT');

    const tenantC = 'tenant_external_' + Date.now();
    await supabase.from('pdf_files').insert([
      {
        company_id: tenantC,
        originalFilename: 'outside_uploads.pdf',
        extractedName: 'Outside Uploads',
        filePath: externalFile,
        fileSize: 100,
        createdAt: fortyDaysAgo
      }
    ]);

    const result = await cleanupExpiredPdfs({
      retentionDays: 30,
      uploadsDir,
      companyId: tenantC
    });

    assert.equal(fs.existsSync(externalFile), true, 'External file must not be deleted due to path restriction');
  });

  await t.test('5. Automated retention schedule can be started and stopped safely', async () => {
    const timer = startRetentionSchedule(60000, { uploadsDir });
    assert.ok(timer, 'Schedule timer must be returned');
    stopRetentionSchedule();
  });
});
