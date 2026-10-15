const ExcelJS = require('exceljs');
const { db, formatRows } = require('../../database/database');
const { supabase } = require('../supabaseClient');

const DEFAULT_RATE_PER_MESSAGE = 0.50; // INR per billable message

/**
 * Resolves date range filter (start and end ISO strings) from month/year or explicit range.
 */
const resolveDateRange = (options = {}) => {
  let startDate = options.startDate;
  let endDate = options.endDate;

  if (options.year && options.month) {
    const y = parseInt(options.year, 10);
    const m = parseInt(options.month, 10);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    startDate = start.toISOString();
    endDate = end.toISOString();
  }

  return { startDate, endDate };
};

/**
 * Get usage summary and aggregation for a company or all companies.
 *
 * @param {Object} options
 * @param {string} [options.companyId]
 * @param {number} [options.month] 1-12
 * @param {number} [options.year]
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {number} [options.ratePerMessage]
 */
const getUsageSummary = async (options = {}) => {
  const { companyId, ratePerMessage = DEFAULT_RATE_PER_MESSAGE } = options;
  const { startDate, endDate } = resolveDateRange(options);

  let whereClauses = [];
  let params = [];

  if (companyId) {
    whereClauses.push('company_id = ?');
    params.push(String(companyId));
  }

  if (startDate) {
    whereClauses.push('createdAt >= ?');
    params.push(startDate);
  }

  if (endDate) {
    whereClauses.push('createdAt <= ?');
    params.push(endDate);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM message_logs ${whereSql} ORDER BY createdAt DESC`).all(...params);

  let totalDispatched = rows.length;
  let billableCount = 0;
  let simulatedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  const dailyBreakdown = {};

  for (const row of rows) {
    const isSim = Boolean(row.isSimulation || row.is_simulation);
    const status = (row.status || '').toLowerCase();
    const dateKey = (row.createdAt || '').slice(0, 10) || 'unknown';

    if (!dailyBreakdown[dateKey]) {
      dailyBreakdown[dateKey] = { date: dateKey, total: 0, billable: 0, failed: 0, simulated: 0 };
    }
    dailyBreakdown[dateKey].total++;

    if (isSim) {
      simulatedCount++;
      dailyBreakdown[dateKey].simulated++;
    } else if (status === 'failed') {
      failedCount++;
      dailyBreakdown[dateKey].failed++;
    } else if (['sent', 'delivered', 'read'].includes(status)) {
      billableCount++;
      dailyBreakdown[dateKey].billable++;
    } else {
      pendingCount++;
    }
  }

  const estimatedCost = +(billableCount * ratePerMessage).toFixed(2);

  // Get company name if available
  let companyName = companyId || 'All Companies';
  if (companyId) {
    try {
      const comp = db.prepare('SELECT company_name FROM companies WHERE id = ?').get(String(companyId));
      if (comp && comp.company_name) companyName = comp.company_name;
    } catch (e) {}
  }

  return {
    companyId: companyId || 'all',
    companyName,
    startDate: startDate || null,
    endDate: endDate || null,
    totalDispatched,
    billableCount,
    simulatedCount,
    failedCount,
    pendingCount,
    ratePerMessage,
    currency: 'INR',
    estimatedCost,
    dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => b.date.localeCompare(a.date)),
    logs: formatRows(rows)
  };
};

/**
 * Generate an Excel usage report workbook buffer for a tenant.
 */
const exportUsageReportExcel = async (options = {}) => {
  const summary = await getUsageSummary(options);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WhatsApp Ledger Automation';
  workbook.created = new Date();

  // Sheet 1: Summary Dashboard
  const summarySheet = workbook.addWorksheet('Billing Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 35 }
  ];

  summarySheet.addRows([
    { metric: 'Account / Tenant ID', value: summary.companyId },
    { metric: 'Company Name', value: summary.companyName },
    { metric: 'Report Period Start', value: summary.startDate || 'Beginning of time' },
    { metric: 'Report Period End', value: summary.endDate || 'Current' },
    { metric: 'Total Messages Dispatched', value: summary.totalDispatched },
    { metric: 'Billable Messages (Sent/Delivered)', value: summary.billableCount },
    { metric: 'Simulated Messages (Free/Non-billable)', value: summary.simulatedCount },
    { metric: 'Failed Messages (Non-billable)', value: summary.failedCount },
    { metric: 'Rate per Billable Message (INR)', value: `₹ ${summary.ratePerMessage.toFixed(2)}` },
    { metric: 'Total Estimated Charges (INR)', value: `₹ ${summary.estimatedCost.toFixed(2)}` }
  ]);

  // Style header row
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }
  };

  // Sheet 2: Itemized Message Details
  const itemizedSheet = workbook.addWorksheet('Itemized Messages');
  itemizedSheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Dispatched At', key: 'createdAt', width: 22 },
    { header: 'Recipient Name', key: 'contactName', width: 25 },
    { header: 'Phone Number', key: 'phone', width: 18 },
    { header: 'PDF Document', key: 'pdfFilename', width: 30 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Billable?', key: 'isBillable', width: 15 },
    { header: 'Provider Msg ID', key: 'providerMessageId', width: 28 },
    { header: 'Error Detail', key: 'errorReason', width: 25 }
  ];

  itemizedSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  itemizedSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' }
  };

  for (const log of summary.logs) {
    const isSim = Boolean(log.isSimulation || log.is_simulation);
    const status = (log.status || '').toLowerCase();
    const isBillable = !isSim && ['sent', 'delivered', 'read'].includes(status);

    itemizedSheet.addRow({
      id: log.id,
      createdAt: log.createdAt || log.created_at || '',
      contactName: log.contactName || '',
      phone: log.phone || '',
      pdfFilename: log.pdfFilename || '',
      status: isSim ? `${log.status} (Simulated)` : log.status,
      isBillable: isBillable ? 'YES' : 'NO',
      providerMessageId: log.providerMessageId || '',
      errorReason: log.errorReason || ''
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const periodLabel = options.year && options.month
    ? `${options.year}_${String(options.month).padStart(2, '0')}`
    : 'all_time';
  const filename = `usage_report_${summary.companyId}_${periodLabel}.xlsx`;

  return {
    buffer,
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
};

/**
 * System-wide multi-tenant aggregation for platform administrators.
 */
const getAllTenantsUsageOverview = async (options = {}) => {
  const { startDate, endDate } = resolveDateRange(options);
  const { ratePerMessage = DEFAULT_RATE_PER_MESSAGE } = options;

  let whereClauses = [];
  let params = [];
  if (startDate) {
    whereClauses.push('createdAt >= ?');
    params.push(startDate);
  }
  if (endDate) {
    whereClauses.push('createdAt <= ?');
    params.push(endDate);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT
      company_id,
      COUNT(*) as totalDispatched,
      SUM(CASE WHEN (isSimulation = 0 OR isSimulation IS NULL) AND LOWER(status) IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) as billableCount,
      SUM(CASE WHEN isSimulation = 1 THEN 1 ELSE 0 END) as simulatedCount,
      SUM(CASE WHEN LOWER(status) = 'failed' THEN 1 ELSE 0 END) as failedCount
    FROM message_logs
    ${whereSql}
    GROUP BY company_id
    ORDER BY billableCount DESC
  `;

  const rows = db.prepare(sql).all(...params);

  const tenants = rows.map((r) => {
    const billable = Number(r.billableCount) || 0;
    return {
      companyId: r.company_id,
      totalDispatched: Number(r.totalDispatched) || 0,
      billableCount: billable,
      simulatedCount: Number(r.simulatedCount) || 0,
      failedCount: Number(r.failedCount) || 0,
      ratePerMessage,
      estimatedCost: +(billable * ratePerMessage).toFixed(2)
    };
  });

  const totals = tenants.reduce(
    (acc, t) => {
      acc.totalDispatched += t.totalDispatched;
      acc.billableCount += t.billableCount;
      acc.simulatedCount += t.simulatedCount;
      acc.failedCount += t.failedCount;
      acc.totalRevenue += t.estimatedCost;
      return acc;
    },
    { totalDispatched: 0, billableCount: 0, simulatedCount: 0, failedCount: 0, totalRevenue: 0 }
  );

  totals.totalRevenue = +totals.totalRevenue.toFixed(2);

  return {
    period: { startDate, endDate },
    totals,
    tenants
  };
};

module.exports = {
  getUsageSummary,
  exportUsageReportExcel,
  getAllTenantsUsageOverview,
  DEFAULT_RATE_PER_MESSAGE
};
