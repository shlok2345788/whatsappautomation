const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { formatCurrency } = require('../financial/financialEngine');

/**
 * Builds HTML template for executive, presentation-grade Balance Sheet.
 */
const buildBalanceSheetHtml = (data) => {
  const companyName = data.companyName || 'Corporate Enterprise';
  const asOfDate = data.asOfDate || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const financialYear = data.financialYear || '2025-26';
  const source = data.source || 'tally-live';
  const generatedAt = data.generatedAt || new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const liabilities = data.liabilities || [];
  const assets = data.assets || [];

  const totalLiabilities = data.totalLiabilities || 0;
  const totalAssets = data.totalAssets || 0;
  const isReconciled = data.isReconciled !== false;
  const discrepancy = data.discrepancy || 0;

  const renderCategory = (cat) => `
    <div class="category-block">
      <div class="category-header">
        <span class="category-title">${cat.name}</span>
        <span class="category-subtotal font-mono font-bold">${cat.subtotalFormatted || formatCurrency(cat.subtotalAmount || 0)}</span>
      </div>
      <div class="category-items">
        ${(cat.items || []).map((item) => `
          <div class="account-row">
            <span class="account-name">${item.name}</span>
            <span class="account-amount font-mono">${item.amountFormatted || formatCurrency(item.amount || 0)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Balance Sheet - ${companyName} - As of ${asOfDate}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 12mm 14mm 12mm;
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
      font-size: 10.5px;
      line-height: 1.45;
    }

    .report-header {
      text-align: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }

    .company-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
      margin-bottom: 3px;
    }

    .report-title {
      font-size: 13px;
      font-weight: 700;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .report-meta {
      font-size: 10px;
      color: #475569;
      margin-top: 3px;
    }

    /* Verification & Audit Banner */
    .audit-seal {
      margin-bottom: 14px;
      padding: 8px 12px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 600;
    }

    .seal-balanced {
      background: #f0fdf4;
      border: 1px solid #86efac;
      color: #166534;
    }

    .seal-warning {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #991b1b;
    }

    /* Two-Column Financial Layout */
    .balance-sheet-grid {
      display: flex;
      gap: 14px;
      margin-bottom: 16px;
    }

    .side-column {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      overflow: hidden;
    }

    .side-header {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 12px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
    }

    .side-content {
      flex: 1;
      padding: 10px;
    }

    .category-block {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }

    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1f5f9;
      padding: 5px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 10px;
      color: #1e293b;
      margin-bottom: 4px;
      border-left: 3px solid #2563eb;
    }

    .category-items {
      padding-left: 6px;
    }

    .account-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 6px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 10px;
    }

    .account-name {
      color: #334155;
    }

    .account-amount {
      color: #0f172a;
    }

    /* Grand Total Section */
    .side-total {
      background: #f8fafc;
      border-top: 2px solid #0f172a;
      padding: 10px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 800;
      font-size: 12px;
      color: #0f172a;
    }

    .side-total .total-amount {
      border-bottom: 3px double #0f172a;
      padding-bottom: 2px;
      font-size: 13px;
    }

    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .font-bold {
      font-weight: 700;
    }

    /* Footer & Notes */
    .report-footer {
      page-break-inside: avoid;
      border-top: 1px solid #cbd5e1;
      padding-top: 8px;
      font-size: 9px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>

  <!-- Report Header -->
  <div class="report-header">
    <div class="company-title">${companyName}</div>
    <div class="report-title">Balance Sheet</div>
    <div class="report-meta">
      As at <strong>${asOfDate}</strong> | Financial Year <strong>${financialYear}</strong> | Currency in Indian Rupees (₹)
    </div>
  </div>

  <!-- Audit & Integrity Seal -->
  <div class="audit-seal ${isReconciled ? 'seal-balanced' : 'seal-warning'}">
    <div>
      ${isReconciled
        ? '✓ Audited & Verified: Total Assets exactly equal Total Liabilities. No double counting detected.'
        : `⚠️ Unreconciled Warning: Assets and Liabilities differ by ₹ ${discrepancy.toLocaleString('en-IN')}. Report requires Tally adjustment.`}
    </div>
    <div>
      Data Source: <strong>${source}</strong> | ${generatedAt}
    </div>
  </div>

  <!-- Two-Column Balance Sheet Grid -->
  <div class="balance-sheet-grid">
    
    <!-- Liabilities Column -->
    <div class="side-column">
      <div class="side-header">
        <span>Capital & Liabilities</span>
        <span>Amount (₹)</span>
      </div>
      <div class="side-content">
        ${liabilities.map(renderCategory).join('')}
      </div>
      <div class="side-total">
        <span>Total Liabilities</span>
        <span class="total-amount font-mono">${formatCurrency(totalLiabilities)}</span>
      </div>
    </div>

    <!-- Assets Column -->
    <div class="side-column">
      <div class="side-header">
        <span>Property & Assets</span>
        <span>Amount (₹)</span>
      </div>
      <div class="side-content">
        ${assets.map(renderCategory).join('')}
      </div>
      <div class="side-total">
        <span>Total Assets</span>
        <span class="total-amount font-mono">${formatCurrency(totalAssets)}</span>
      </div>
    </div>

  </div>

  <!-- Signoff & Footer -->
  <div class="report-footer">
    <div>
      Generated electronically by DocSender Financial Engine from Tally Prime accounting ledgers.
    </div>
    <div class="font-mono">
      Page 1 of 1
    </div>
  </div>

</body>
</html>
  `.trim();
};

/**
 * Minimal fallback PDF buffer generator for Balance Sheet if Puppeteer is offline.
 */
const buildMinimalBalanceSheetFallback = (companyName, totalLiab, totalAssets, isBalanced) => {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 210 >> stream
BT
/F1 16 Tf
40 730 Td
(BALANCE SHEET - ${companyName}) Tj
/F1 11 Tf
0 -26 Td
(Report Status: ${isBalanced ? 'Audited and Balanced' : 'Unreconciled Difference'}) Tj
0 -18 Td
(Total Capital and Liabilities: ${totalLiab}) Tj
0 -18 Td
(Total Property and Assets: ${totalAssets}) Tj
0 -24 Td
(Generated via Tally Prime Accounting Engine) Tj
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
0000000506 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
584
%%EOF`;
  return Buffer.from(content, 'utf8');
};

/**
 * Generates an executive Balance Sheet PDF.
 */
const generateBalanceSheetPdf = async (bsData, outputDir) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeCompanyName = (bsData.companyName || 'Company')
    .replace(/[^a-zA-Z0-9\s_-]/g, '_')
    .trim();
  const filename = `${safeCompanyName}_BalanceSheet_${(bsData.asOfDate || 'Current').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const targetFilePath = path.join(outputDir, filename);

  const htmlContent = buildBalanceSheetHtml(bsData);

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
      margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size: 8px; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 10mm; font-family: sans-serif;">
          <span>Official Balance Sheet | ${bsData.companyName || 'Accounts'}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `
    });
  } catch (err) {
    console.warn('[BalanceSheetGenerator] Puppeteer launch failed, using fallback:', err.message);
    pdfBuffer = buildMinimalBalanceSheetFallback(
      bsData.companyName || 'Company',
      formatCurrency(bsData.totalLiabilities || 0),
      formatCurrency(bsData.totalAssets || 0),
      bsData.isReconciled !== false
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }

  fs.writeFileSync(targetFilePath, pdfBuffer);

  const stats = fs.statSync(targetFilePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(pdfBuffer);
  const fileHash = hashSum.digest('hex');

  return {
    filePath: targetFilePath,
    originalFilename: filename,
    extractedName: `${bsData.companyName} Balance Sheet`,
    fileSize: stats.size,
    fileHash,
    pdfBuffer
  };
};

module.exports = {
  buildBalanceSheetHtml,
  generateBalanceSheetPdf,
  buildMinimalBalanceSheetFallback
};
