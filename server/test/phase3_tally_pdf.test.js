const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const tallyService = require('../services/tally/tallyService');
const { buildLedgerHtml, generateLedgerPdf } = require('../services/pdf/ledgerGenerator');
const { supabase } = require('../services/supabaseClient');

test('Phase 3 - Tally Prime Integration & PDF Ledger Generation Suite', async (t) => {
  await t.test('Task 3.1: XML parser extracts tags and blocks from Tally response envelope', () => {
    const sampleXml = `
      <ENVELOPE>
        <BODY>
          <LEDGER>
            <NAME>Apex Chemicals</NAME>
            <LEDGERMOBILE>919876543210</LEDGERMOBILE>
            <CLOSINGBALANCE>-45000.00</CLOSINGBALANCE>
          </LEDGER>
          <LEDGER>
            <NAME>Bharat Steel</NAME>
            <LEDGERMOBILE>919811223344</LEDGERMOBILE>
            <CLOSINGBALANCE>-12500.50</CLOSINGBALANCE>
          </LEDGER>
        </BODY>
      </ENVELOPE>
    `;

    const ledgers = tallyService.parseXmlBlocks(sampleXml, 'LEDGER');
    assert.strictEqual(ledgers.length, 2);

    const name1 = tallyService.parseXmlTag(ledgers[0], 'NAME');
    const mobile1 = tallyService.parseXmlTag(ledgers[0], 'LEDGERMOBILE');
    const balance1 = tallyService.parseXmlTag(ledgers[0], 'CLOSINGBALANCE');

    assert.strictEqual(name1, 'Apex Chemicals');
    assert.strictEqual(mobile1, '919876543210');
    assert.strictEqual(balance1, '-45000.00');
  });

  await t.test('Task 3.2: getCustomerLedgers returns structured customer debt accounts with phone numbers', async () => {
    const ledgers = await tallyService.getCustomerLedgers();
    assert.ok(Array.isArray(ledgers));
    assert.ok(ledgers.length >= 2, 'Should return at least 2 customer ledgers');

    const first = ledgers[0];
    assert.ok(first.name, 'Customer ledger must have a name');
    assert.ok(first.mobile, 'Customer ledger must have a mobile phone number');
    assert.ok(first.closingBalance > 0, 'Customer ledger must have a positive balance');
    assert.strictEqual(first.balanceType, 'Dr');
  });

  await t.test('Task 3.3: buildLedgerHtml generates compliant HTML statement with debtor balance and details', () => {
    const html = buildLedgerHtml({
      companyName: 'Test Corp Ltd',
      customerName: 'Pooja Enterprises',
      mobile: '919988776655',
      statementPeriod: '01-Apr-2025 to 31-Mar-2026',
      closingBalance: 75000,
      balanceType: 'Dr',
      transactions: [
        { date: '15-Jan-2026', voucherNo: 'INV-100', type: 'Sales', debit: 75000, credit: 0, balance: 75000 }
      ]
    });

    assert.ok(html.includes('Test Corp Ltd'));
    assert.ok(html.includes('Pooja Enterprises'));
    assert.ok(html.includes('75,000.00'));
    assert.ok(html.includes('INV-100'));
  });

  await t.test('Task 3.4: generateLedgerPdf generates valid PDF statement file with correct magic bytes and hash', async () => {
    const tempDir = path.join(__dirname, 'temp_tally_output');
    try {
      const result = await generateLedgerPdf(
        {
          companyName: 'Apex Industries',
          customerName: 'Zenith Logistics',
          mobile: '919876500000',
          closingBalance: 32000,
          balanceType: 'Dr'
        },
        tempDir
      );

      assert.ok(fs.existsSync(result.filePath), 'PDF file must be written to disk');
      assert.strictEqual(result.originalFilename, 'Zenith Logistics_Statement.pdf');
      assert.ok(result.fileSize > 0, 'PDF size must be greater than 0');
      assert.ok(result.fileHash.length === 32, 'MD5 hash must be 32 hex chars');

      // Verify PDF magic bytes (%PDF)
      const buffer = fs.readFileSync(result.filePath);
      const header = buffer.toString('utf8', 0, 5);
      assert.ok(header.startsWith('%PDF'), 'File must begin with valid PDF signature');
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });
});
