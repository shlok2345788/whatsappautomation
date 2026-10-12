const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

/**
 * Builds HTML template for standard Tally Customer Ledger Statement.
 */
const buildLedgerHtml = (data) => {
  const companyName = data.companyName || 'FINANCIAL LEDGER STATEMENT';
  const customerName = data.customerName || 'Customer';
  const statementPeriod = data.statementPeriod || 'Current Financial Year';
  const closingBalance = Number(data.closingBalance || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const balanceType = data.balanceType || 'Dr';
  const transactions = data.transactions || [];

  const rowsHtml = transactions.length > 0
    ? transactions.map((tx) => `
        <tr>
          <td>${tx.date || '-'}</td>
          <td>${tx.voucherNo || '-'}</td>
          <td>${tx.type || 'Invoice'}</td>
          <td style="text-align: right;">${tx.debit ? Number(tx.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
          <td style="text-align: right;">${tx.credit ? Number(tx.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
          <td style="text-align: right; font-weight: 600;">${Number(tx.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} Dr</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">
            Opening Balance Brought Forward — Outstanding Balance: ₹ ${closingBalance} ${balanceType}
          </td>
        </tr>
      `;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ledger Statement - ${customerName}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 32px;
      font-size: 13px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .company-title {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .subtitle {
      color: #64748b;
      font-size: 12px;
    }
    .statement-badge {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-grid {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .meta-col {
      flex: 1;
    }
    .meta-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .meta-value {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid #cbd5e1;
      font-size: 12px;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .closing-card {
      background: #f8fafc;
      border: 2px solid #cbd5e1;
      padding: 16px;
      border-radius: 6px;
      text-align: right;
      margin-top: 16px;
    }
    .closing-label {
      font-size: 12px;
      color: #475569;
      font-weight: 600;
    }
    .closing-amount {
      font-size: 22px;
      font-weight: 700;
      color: #dc2626;
      margin-top: 4px;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-title">${companyName}</div>
      <div class="subtitle">Official Statement of Accounts (Ledger Extract)</div>
    </div>
    <div>
      <div class="statement-badge">Statement of Account</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-col">
      <div class="meta-label">Customer / Debtor Name</div>
      <div class="meta-value">${customerName}</div>
      ${data.mobile ? `<div style="color: #64748b; font-size: 12px; margin-top: 2px;">Phone: ${data.mobile}</div>` : ''}
    </div>
    <div class="meta-col" style="text-align: right;">
      <div class="meta-label">Statement Period</div>
      <div class="meta-value" style="font-size: 13px;">${statementPeriod}</div>
      <div style="color: #64748b; font-size: 11px; margin-top: 2px;">Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Date</th>
        <th style="width: 20%;">Voucher No</th>
        <th style="width: 20%;">Type</th>
        <th style="width: 15%; text-align: right;">Debit (₹)</th>
        <th style="width: 15%; text-align: right;">Credit (₹)</th>
        <th style="width: 15%; text-align: right;">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="closing-card">
    <div class="closing-label">Total Outstanding Closing Balance Due:</div>
    <div class="closing-amount">₹ ${closingBalance} ${balanceType}</div>
  </div>

  <div class="footer">
    This is an automatically generated electronic statement of accounts. If you have any questions or discrepancy, please contact our accounts department immediately.
  </div>
</body>
</html>
  `.trim();
};

/**
 * Creates a minimal valid fallback PDF buffer if Puppeteer browser fails to launch.
 */
const buildMinimalFallbackPdf = (title, customer, amount) => {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 140 >> stream
BT
/F1 18 Tf
50 720 Td
(${title}) Tj
/F1 12 Tf
0 -30 Td
(Customer: ${customer}) Tj
0 -20 Td
(Outstanding Amount Due: ${amount}) Tj
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
0000000436 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
514
%%EOF`;
  return Buffer.from(content, 'utf8');
};

/**
 * Generates a PDF ledger statement file and writes it directly into the target directory.
 */
const generateLedgerPdf = async (ledgerData, outputDir) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeCustomerName = (ledgerData.customerName || 'Customer')
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
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
  } catch (err) {
    console.warn('[LedgerGenerator] Puppeteer launch failed, using minimal PDF generator fallback:', err.message);
    pdfBuffer = buildMinimalFallbackPdf(
      ledgerData.companyName || 'STATEMENT OF ACCOUNTS',
      ledgerData.customerName,
      `₹ ${ledgerData.closingBalance || 0}`
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
    extractedName: ledgerData.customerName,
    fileSize: stats.size,
    fileHash
  };
};

module.exports = {
  buildLedgerHtml,
  generateLedgerPdf
};
