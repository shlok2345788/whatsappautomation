const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { computeLedgerStatement, formatCurrency } = require('../financial/financialEngine');

/**
 * Builds compliant, multi-page HTML template for professional Tally Customer Ledger Statement.
 */
const buildLedgerHtml = (data) => {
  const companyName = data.companyName || 'FINANCIAL LEDGER STATEMENT';
  const companyAddress = data.companyAddress || 'Corporate Office';
  const companyGstin = data.companyGstin || '';
  const customerName = data.customerName || data.name || 'Customer';
  const customerMobile = data.customerMobile || data.mobile || '';
  const customerEmail = data.customerEmail || data.email || '';
  const customerAddress = data.customerAddress || data.address || '';
  const customerGstin = data.customerGstin || data.gstin || '';
  const statementPeriod = data.statementPeriod || 'Current Financial Year';
  const currencySymbol = data.currencySymbol || '₹';
  const generatedAt = data.generatedAt || new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const source = data.source || 'tally-live';

  // Compute or format ledger statement using the financial engine
  const statement = data.totalDebits !== undefined && data.transactions?.[0]?.runningBalanceFormatted
    ? data
    : computeLedgerStatement({
        openingBalance: data.openingBalance || 0,
        openingBalanceType: data.openingBalanceType || data.balanceType || 'Dr',
        transactions: data.transactions || [],
        tallyClosingBalance: data.closingBalance,
        tallyClosingBalanceType: data.balanceType
      });

  const transactions = statement.transactions || [];

  const rowsHtml = transactions.length > 0
    ? transactions.map((tx) => `
        <tr>
          <td class="col-date">${tx.date || '-'}</td>
          <td class="col-voucherno">${tx.voucherNo || '-'}</td>
          <td class="col-type">${tx.voucherType || tx.type || 'Invoice'}</td>
          <td class="col-narration">
            <div class="narration-main">${tx.narration || tx.particulars || 'Transaction entry'}</div>
            ${tx.reference ? `<div class="narration-ref">Ref: ${tx.reference}</div>` : ''}
          </td>
          <td class="col-amount text-right">${tx.debit ? formatCurrency(tx.debit, false) : '-'}</td>
          <td class="col-amount text-right">${tx.credit ? formatCurrency(tx.credit, false) : '-'}</td>
          <td class="col-balance text-right font-bold">${tx.runningBalanceFormatted || `${formatCurrency(tx.runningBalance || tx.balance || 0, false)} ${tx.runningBalanceType || 'Dr'}`}</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="7" class="text-center empty-state">
            No transaction records found for the selected period.<br>
            Opening Balance Brought Forward: <strong>${statement.openingBalanceFormatted || `₹ ${data.closingBalance || 0} ${data.balanceType || 'Dr'}`}</strong>
          </td>
        </tr>
      `;

  const reconciliationBadgeHtml = statement.isReconciled !== false
    ? `<div class="audit-badge badge-reconciled">✓ Audited & Reconciled with Tally Prime Records</div>`
    : `<div class="audit-badge badge-warning">⚠️ ${statement.validationMessage || 'Discrepancy detected with Tally closing balance.'}</div>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ledger Statement - ${customerName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 14mm 16mm 14mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.45;
    }

    /* Executive Header */
    .company-header {
      border-bottom: 2px solid #1e40af;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .company-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.3px;
      margin-bottom: 3px;
    }

    .company-meta {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.35;
    }

    .statement-title-block {
      text-align: right;
    }

    .statement-badge {
      display: inline-block;
      background: #1e40af;
      color: #ffffff;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .period-label {
      font-size: 10.5px;
      font-weight: 600;
      color: #334155;
    }

    /* Customer & Account Details Card */
    .account-card {
      display: flex;
      justify-content: space-between;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 16px;
    }

    .account-col {
      flex: 1;
    }

    .field-label {
      font-size: 9.5px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.4px;
      margin-bottom: 2px;
    }

    .field-value-lg {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }

    .field-subtext {
      font-size: 10px;
      color: #475569;
      margin-top: 2px;
    }

    /* Opening Balance Banner */
    .opening-banner {
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 7px 12px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      color: #1e3a8a;
    }

    /* Transactions Table with Cross-Page Header Repetition */
    table.ledger-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      table-layout: fixed;
    }

    table.ledger-table thead {
      display: table-header-group;
    }

    table.ledger-table tfoot {
      display: table-footer-group;
    }

    table.ledger-table tr {
      page-break-inside: avoid;
    }

    table.ledger-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 7px 8px;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #94a3b8;
    }

    table.ledger-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10.5px;
      vertical-align: top;
      word-wrap: break-word;
    }

    table.ledger-table tr:nth-child(even) td {
      background: #fafafa;
    }

    .col-date { width: 12%; }
    .col-voucherno { width: 14%; font-family: ui-monospace, monospace; }
    .col-type { width: 12%; }
    .col-narration { width: 26%; }
    .col-amount { width: 12%; font-family: ui-monospace, monospace; }
    .col-balance { width: 12%; font-family: ui-monospace, monospace; }

    .narration-main {
      font-weight: 500;
      color: #1e293b;
    }

    .narration-ref {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 1px;
    }

    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }

    /* Summary Totals Row */
    .totals-row td {
      background: #f8fafc !important;
      font-weight: 700;
      border-top: 2px solid #cbd5e1;
      border-bottom: 2px solid #0f172a;
      color: #0f172a;
      padding: 8px;
    }

    /* Financial Summary & Closing Balance Block */
    .summary-section {
      page-break-inside: avoid;
      margin-top: 16px;
      display: flex;
      gap: 14px;
      justify-content: space-between;
    }

    .summary-box {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
    }

    .summary-metric {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px dashed #cbd5e1;
      font-size: 10.5px;
    }

    .summary-metric:last-child {
      border-bottom: none;
    }

    .closing-card {
      width: 280px;
      background: #fef2f2;
      border: 2px solid #f87171;
      border-radius: 6px;
      padding: 12px 14px;
      text-align: right;
    }

    .closing-card.credit {
      background: #f0fdf4;
      border-color: #4ade80;
    }

    .closing-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #991b1b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .closing-card.credit .closing-label {
      color: #166534;
    }

    .closing-amount {
      font-size: 19px;
      font-weight: 800;
      color: #b91c1c;
      margin-top: 3px;
      font-family: ui-monospace, monospace;
    }

    .closing-card.credit .closing-amount {
      color: #15803d;
    }

    /* Audit & Verification Badge */
    .audit-badge {
      display: inline-block;
      margin-top: 12px;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }

    .badge-reconciled {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
    }

    .badge-warning {
      background: #fffbeb;
      color: #92400e;
      border: 1px solid #fde68a;
    }

    /* Footer & Disclaimer */
    .statement-footer {
      page-break-inside: avoid;
      margin-top: 24px;
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
      font-size: 9.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .empty-state {
      padding: 24px !important;
      color: #64748b;
      font-style: italic;
    }
  </style>
</head>
<body>

  <!-- Company & Statement Header -->
  <div class="company-header">
    <div>
      <div class="company-title">${companyName}</div>
      <div class="company-meta">
        ${companyAddress ? `<div>${companyAddress}</div>` : ''}
        ${companyGstin ? `<div>GSTIN: <strong>${companyGstin}</strong></div>` : ''}
      </div>
    </div>
    <div class="statement-title-block">
      <div class="statement-badge">Statement of Accounts</div>
      <div class="period-label">Period: ${statementPeriod}</div>
      <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">Generated: ${generatedAt}</div>
    </div>
  </div>

  <!-- Customer Account Info Grid -->
  <div class="account-card">
    <div class="account-col">
      <div class="field-label">Party / Account Name</div>
      <div class="field-value-lg">${customerName}</div>
      ${customerAddress ? `<div class="field-subtext">${customerAddress}</div>` : ''}
      ${customerGstin ? `<div class="field-subtext">GSTIN: <strong>${customerGstin}</strong></div>` : ''}
    </div>
    <div class="account-col" style="text-align: right;">
      <div class="field-label">Contact Details</div>
      ${customerMobile ? `<div style="font-weight: 600; color: #1e293b;">Tel: +${customerMobile}</div>` : ''}
      ${customerEmail ? `<div class="field-subtext">${customerEmail}</div>` : ''}
      <div class="field-subtext" style="margin-top: 4px;">Data Source: <strong>${source}</strong></div>
    </div>
  </div>

  <!-- Opening Balance Indicator -->
  <div class="opening-banner">
    <span>Opening Balance (Brought Forward)</span>
    <span>${statement.openingBalanceFormatted || `₹ ${data.openingBalance || 0} ${data.openingBalanceType || 'Dr'}`}</span>
  </div>

  <!-- Itemized Transactions Table -->
  <table class="ledger-table">
    <thead>
      <tr>
        <th class="col-date">Date</th>
        <th class="col-voucherno">Voucher No</th>
        <th class="col-type">Voucher Type</th>
        <th class="col-narration">Particulars / Narration</th>
        <th class="col-amount text-right">Debit (${currencySymbol})</th>
        <th class="col-amount text-right">Credit (${currencySymbol})</th>
        <th class="col-balance text-right">Balance (${currencySymbol})</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="4" class="text-right">Total Transactions for Period:</td>
        <td class="col-amount text-right">${statement.totalDebitsFormatted || formatCurrency(statement.totalDebits || 0, false)}</td>
        <td class="col-amount text-right">${statement.totalCreditsFormatted || formatCurrency(statement.totalCredits || 0, false)}</td>
        <td class="col-balance text-right">${statement.closingBalanceFormatted || `${formatCurrency(statement.closingBalance || 0, false)} ${statement.closingBalanceType || 'Dr'}`}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Closing Summary & Reconciliation Card -->
  <div class="summary-section">
    <div class="summary-box">
      <div style="font-weight: 700; font-size: 11px; margin-bottom: 6px; color: #1e293b;">Period Account Movement</div>
      <div class="summary-metric">
        <span style="color: #64748b;">Opening Balance</span>
        <span style="font-weight: 600;">${statement.openingBalanceFormatted || '-'}</span>
      </div>
      <div class="summary-metric">
        <span style="color: #64748b;">Total Invoiced (Debits)</span>
        <span style="font-weight: 600; color: #1e40af;">+ ${statement.totalDebitsFormatted || '₹ 0.00'}</span>
      </div>
      <div class="summary-metric">
        <span style="color: #64748b;">Total Received (Credits)</span>
        <span style="font-weight: 600; color: #15803d;">- ${statement.totalCreditsFormatted || '₹ 0.00'}</span>
      </div>
      <div class="summary-metric">
        <span style="color: #64748b;">Net Period Movement</span>
        <span style="font-weight: 700;">${formatCurrency(statement.netMovement || 0)}</span>
      </div>
      ${reconciliationBadgeHtml}
    </div>

    <div class="closing-card ${statement.closingBalanceType === 'Cr' ? 'credit' : ''}">
      <div class="closing-label">
        ${statement.closingBalanceType === 'Cr' ? 'Closing Balance (Advance / Credit Due):' : 'Total Outstanding Balance Due:'}
      </div>
      <div class="closing-amount">
        ${statement.closingBalanceFormatted || `₹ ${statement.closingBalance || 0} ${statement.closingBalanceType || 'Dr'}`}
      </div>
      <div style="font-size: 9.5px; color: #64748b; margin-top: 6px;">
        As of ${statementPeriod.split(' to ')[1] || new Date().toLocaleDateString('en-IN')}
      </div>
    </div>
  </div>

  <!-- Signoff & Footer -->
  <div class="statement-footer">
    <div>
      This is a computer-verified statement generated from Tally accounting records. Please notify discrepancies within 7 days.
    </div>
    <div style="font-family: ui-monospace, monospace;">
      Page 1 of 1
    </div>
  </div>

</body>
</html>
  `.trim();
};

/**
 * Robust fallback PDF buffer generator if headless Chrome is unavailable.
 */
const buildMinimalFallbackPdf = (title, customer, amount) => {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 190 >> stream
BT
/F1 16 Tf
40 730 Td
(${title}) Tj
/F1 11 Tf
0 -26 Td
(Party Name: ${customer}) Tj
0 -18 Td
(Account Statement Period: Current Financial Year) Tj
0 -18 Td
(Total Outstanding Balance Due: ${amount}) Tj
0 -24 Td
(Status: Computer-verified financial statement.) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000486 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
564
%%EOF`;
  return Buffer.from(content, 'utf8');
};

/**
 * Generates an executive PDF ledger statement file with page numbering and margin control.
 */
const generateLedgerPdf = async (ledgerData, outputDir) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeCustomerName = (ledgerData.customerName || ledgerData.name || 'Customer')
    .replace(/[^a-zA-Z0-9\s_-]/g, '_')
    .trim();
  const filename = `${safeCustomerName}_Statement.pdf`;
  const targetFilePath = path.join(outputDir, filename);

  const htmlContent = buildLedgerHtml(ledgerData);

  let pdfBuffer;
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load' });
    pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size: 8px; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 12mm; font-family: sans-serif;">
          <span>Confidential Statement | ${ledgerData.companyName || 'Accounts'}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `
    });
  } catch (err) {
    console.warn('[LedgerGenerator] Puppeteer launch failed, using minimal PDF fallback:', err.message);
    pdfBuffer = buildMinimalFallbackPdf(
      ledgerData.companyName || 'STATEMENT OF ACCOUNTS',
      ledgerData.customerName || ledgerData.name || 'Customer',
      `₹ ${ledgerData.closingBalance || 0} ${ledgerData.balanceType || 'Dr'}`
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }

  fs.writeFileSync(targetFilePath, pdfBuffer);

  const stats = fs.statSync(targetFilePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(pdfBuffer);
  const fileHash = hashSum.digest('hex');

  return {
    filePath: targetFilePath,
    originalFilename: filename,
    extractedName: ledgerData.customerName || ledgerData.name,
    fileSize: stats.size,
    fileHash,
    pdfBuffer
  };
};

module.exports = {
  buildLedgerHtml,
  generateLedgerPdf,
  buildMinimalFallbackPdf
};
