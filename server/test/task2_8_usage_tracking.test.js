const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  getUsageSummary,
  exportUsageReportExcel,
  getAllTenantsUsageOverview
} = require('../services/billing/usageService');
const { db } = require('../database/database');

test('Task 2.8 — Per-Client Usage Tracking & Export Suite', async (t) => {
  const tenantA = 'tenant_billing_a_' + Date.now();
  const tenantB = 'tenant_billing_b_' + Date.now();

  const now = new Date();
  const oct2026Date = '2026-10-10T12:00:00.000Z';
  const sep2026Date = '2026-09-15T12:00:00.000Z';

  // Seed sample message logs for Tenant A and Tenant B
  const seedLog = (companyId, status, isSim, createdAt, phone, contactName) => {
    db.prepare(`
      INSERT INTO message_logs (
        company_id, contactName, phone, pdfFilename, pdfPath, fileHash,
        messageText, status, isSimulation, createdAt, providerMessageId
      ) VALUES (?, ?, ?, 'invoice.pdf', '/uploads/test.pdf', 'hash123', 'Hello', ?, ?, ?, ?)
    `).run(
      companyId,
      contactName,
      phone,
      status,
      isSim ? 1 : 0,
      createdAt,
      'msg_' + Math.random().toString(36).substring(2, 9)
    );
  };

  // Tenant A: 3 real sent/delivered (billable), 1 simulated (free), 1 failed (free) in Oct 2026; 1 real in Sep 2026
  seedLog(tenantA, 'Sent', false, oct2026Date, '919800000001', 'Alice');
  seedLog(tenantA, 'Delivered', false, oct2026Date, '919800000002', 'Bob');
  seedLog(tenantA, 'Read', false, oct2026Date, '919800000003', 'Charlie');
  seedLog(tenantA, 'Sent', true, oct2026Date, '919800000004', 'Simulated Dave'); // Simulated
  seedLog(tenantA, 'Failed', false, oct2026Date, '919800000005', 'Failed Eve'); // Failed
  seedLog(tenantA, 'Sent', false, sep2026Date, '919800000006', 'September Frank');

  // Tenant B: 2 real sent in Oct 2026
  seedLog(tenantB, 'Sent', false, oct2026Date, '919800000099', 'Tenant B Grace');
  seedLog(tenantB, 'Delivered', false, oct2026Date, '919800000098', 'Tenant B Heidi');

  await t.test('1. Tenant A usage summary for October 2026 counts only genuine billable messages', async () => {
    const summary = await getUsageSummary({
      companyId: tenantA,
      month: 10,
      year: 2026,
      ratePerMessage: 0.50
    });

    assert.equal(summary.companyId, tenantA);
    assert.equal(summary.totalDispatched, 5, 'Should count 5 total dispatches in Oct 2026');
    assert.equal(summary.billableCount, 3, 'Should count exactly 3 billable messages');
    assert.equal(summary.simulatedCount, 1, 'Should record 1 simulated message');
    assert.equal(summary.failedCount, 1, 'Should record 1 failed message');
    assert.equal(summary.estimatedCost, 1.50, '3 messages * 0.50 = 1.50 INR');
  });

  await t.test('2. Multi-tenant isolation: Tenant A summary does not leak Tenant B data', async () => {
    const summaryA = await getUsageSummary({ companyId: tenantA, month: 10, year: 2026 });
    const phones = summaryA.logs.map((l) => l.phone);

    assert.ok(phones.includes('919800000001'), 'Must include Tenant A phone');
    assert.equal(phones.includes('919800000099'), false, 'Must NOT include Tenant B phone');
  });

  await t.test('3. Tenant B usage summary reflects only Tenant B activity', async () => {
    const summaryB = await getUsageSummary({
      companyId: tenantB,
      month: 10,
      year: 2026,
      ratePerMessage: 1.00
    });

    assert.equal(summaryB.totalDispatched, 2);
    assert.equal(summaryB.billableCount, 2);
    assert.equal(summaryB.estimatedCost, 2.00);
  });

  await t.test('4. Excel export generates valid multi-worksheet workbook with formatted cells', async () => {
    const exportResult = await exportUsageReportExcel({
      companyId: tenantA,
      month: 10,
      year: 2026,
      ratePerMessage: 0.50
    });

    assert.ok(exportResult.buffer, 'Buffer must be returned');
    assert.match(exportResult.filename, /usage_report_.*\.xlsx/);
    assert.equal(exportResult.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Parse back the generated buffer to verify workbook structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exportResult.buffer);

    const summarySheet = workbook.getWorksheet('Billing Summary');
    assert.ok(summarySheet, 'Billing Summary worksheet must exist');

    const itemizedSheet = workbook.getWorksheet('Itemized Messages');
    assert.ok(itemizedSheet, 'Itemized Messages worksheet must exist');

    // Verify row count in itemized sheet (header + 5 Oct logs = 6 rows)
    assert.equal(itemizedSheet.rowCount, 6);
  });

  await t.test('5. Multi-tenant admin overview aggregates across all tenants', async () => {
    const overview = await getAllTenantsUsageOverview({ month: 10, year: 2026 });

    assert.ok(overview.totals.totalDispatched >= 7, 'Totals should combine Tenant A and B');
    assert.ok(overview.totals.billableCount >= 5, 'Billable totals should combine Tenant A (3) + B (2)');

    const tenantAEntry = overview.tenants.find((t) => t.companyId === tenantA);
    assert.ok(tenantAEntry, 'Tenant A must be listed in admin overview');
    assert.equal(tenantAEntry.billableCount, 3);
  });
});
