const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  toPaise,
  fromPaise,
  formatCurrency,
  parseTallyBalance,
  computeLedgerStatement,
  computeBalanceSheet
} = require('../services/financial/financialEngine');

const tallyService = require('../services/tally/tallyService');
const { buildLedgerHtml, generateLedgerPdf } = require('../services/pdf/ledgerGenerator');
const { buildBalanceSheetHtml, generateBalanceSheetPdf } = require('../services/pdf/balanceSheetGenerator');
const { getSyntheticCustomerLedgers, getSyntheticBalanceSheetData } = require('../services/tally/syntheticData');

test('Financial Reporting & Integrity Verification Suite', async (t) => {

  // Test 1: Decimal precision and floating-point rounding safety
  await t.test('1. Decimal arithmetic avoids floating-point precision errors', () => {
    // In IEEE 754: 0.1 + 0.2 === 0.30000000000000004
    const paise1 = toPaise(0.1);
    const paise2 = toPaise(0.2);
    const sum = fromPaise(paise1 + paise2);
    assert.strictEqual(sum, 0.3);

    // Test with fractional paise
    const p1 = toPaise(12345.67);
    const p2 = toPaise(98765.33);
    assert.strictEqual(fromPaise(p1 + p2), 111111.0);
  });

  // Test 2: Ledger Running Balance and Dr/Cr Presentation
  await t.test('2. Ledger calculation computes correct running balances and reconciles with Tally', () => {
    const openingBalance = 10000.00; // Dr
    const openingBalanceType = 'Dr';
    const transactions = [
      { date: '01-Jan-2026', voucherNo: 'INV-001', type: 'Sales', debit: 50000.00, credit: 0 },
      { date: '10-Jan-2026', voucherNo: 'RCP-001', type: 'Receipt', debit: 0, credit: 30000.00 },
      { date: '15-Jan-2026', voucherNo: 'RCP-002', type: 'Receipt', debit: 0, credit: 40000.00 }, // Balance becomes Credit (10000 + 50000 - 30000 - 40000 = -10000)
      { date: '20-Jan-2026', voucherNo: 'INV-002', type: 'Sales', debit: 25000.00, credit: 0 }  // Balance returns to Debit (-10000 + 25000 = 15000 Dr)
    ];

    const result = computeLedgerStatement({
      openingBalance,
      openingBalanceType,
      transactions,
      tallyClosingBalance: 15000.00,
      tallyClosingBalanceType: 'Dr'
    });

    assert.strictEqual(result.openingBalance, 10000);
    assert.strictEqual(result.totalDebits, 75000);
    assert.strictEqual(result.totalCredits, 70000);
    assert.strictEqual(result.closingBalance, 15000);
    assert.strictEqual(result.closingBalanceType, 'Dr');
    assert.strictEqual(result.isReconciled, true);

    // Verify row 3 was Cr
    assert.strictEqual(result.transactions[2].runningBalance, 10000);
    assert.strictEqual(result.transactions[2].runningBalanceType, 'Cr');

    // Verify row 4 returned to Dr
    assert.strictEqual(result.transactions[3].runningBalance, 15000);
    assert.strictEqual(result.transactions[3].runningBalanceType, 'Dr');
  });

  // Test 3: Discrepancy Detection in Ledger Statement
  await t.test('3. Ledger reconciliation flags discrepancy when closing balance does not match Tally', () => {
    const result = computeLedgerStatement({
      openingBalance: 5000,
      openingBalanceType: 'Dr',
      transactions: [
        { date: '05-Feb-2026', voucherNo: 'INV-101', type: 'Sales', debit: 10000, credit: 0 }
      ],
      tallyClosingBalance: 20000, // Discrepancy: calculated is 15000, Tally is 20000
      tallyClosingBalanceType: 'Dr'
    });

    assert.strictEqual(result.closingBalance, 15000);
    assert.strictEqual(result.isReconciled, false);
    assert.strictEqual(result.discrepancyAmount, 5000);
    assert.ok(result.validationMessage.includes('Reconciliation Warning'));
  });

  // Test 4: Balance Sheet grouping and double-counting prevention
  await t.test('4. Balance Sheet aggregates groups without double-counting parent and child ledgers', () => {
    const groups = [
      // Parent and leaf
      { name: 'Fixed Assets', parent: '', balance: 100000 },
      { name: 'Current Assets', parent: '', balance: 50000 },
      { name: 'Capital Account', parent: '', balance: 120000 },
      { name: 'Current Liabilities', parent: '', balance: 30000 }
    ];

    const bs = computeBalanceSheet({
      companyName: 'Apex Enterprises',
      asOfDate: '31-Mar-2026',
      financialYear: '2025-26',
      groups,
      netProfitLoss: 0,
      closingStock: 0
    });

    assert.strictEqual(bs.totalAssets, 150000);
    assert.strictEqual(bs.totalLiabilities, 150000);
    assert.strictEqual(bs.isReconciled, true);
    assert.strictEqual(bs.discrepancy, 0);

    // Verify duplicate named accounts are not double-counted
    const groupsWithDuplicate = [
      { name: 'Fixed Assets', parent: '', balance: 100000 },
      { name: 'Fixed Assets', parent: '', balance: 100000 }, // Duplicate!
      { name: 'Current Assets', parent: '', balance: 50000 },
      { name: 'Capital Account', parent: '', balance: 150000 }
    ];

    const bsDeduplicated = computeBalanceSheet({
      companyName: 'Apex Enterprises',
      groups: groupsWithDuplicate
    });

    assert.strictEqual(bsDeduplicated.totalAssets, 150000, 'Duplicate account must not be double counted');
  });

  // Test 5: Treatment of Profit & Loss and Closing Stock in Balance Sheet
  await t.test('5. Balance sheet correctly incorporates Net Profit and Closing Stock', () => {
    const bs = computeBalanceSheet({
      companyName: 'Test Corp',
      groups: [
        { name: "Proprietor's Capital", balance: 500000 },
        { name: 'Fixed Assets', balance: 400000 }
      ],
      netProfitLoss: 100000, // Profit increases liabilities/reserves to 600,000
      closingStock: 200000   // Stock increases assets to 600,000
    });

    assert.strictEqual(bs.totalLiabilities, 600000);
    assert.strictEqual(bs.totalAssets, 600000);
    assert.strictEqual(bs.isReconciled, true);
  });

  // Test 6: Balance Sheet imbalance detection
  await t.test('6. Imbalanced Balance Sheet triggers validation warning and isReconciled = false', () => {
    const bs = computeBalanceSheet({
      companyName: 'Imbalanced Corp',
      groups: [
        { name: 'Capital Account', balance: 500000 },
        { name: 'Fixed Assets', balance: 450000 } // Discrepancy of 50,000
      ]
    });

    assert.strictEqual(bs.isReconciled, false);
    assert.strictEqual(bs.discrepancy, 50000);
    assert.ok(bs.validationNotes.includes('Validation Warning'));
  });

  // Test 7: Strict production error when Tally is offline without simulation flag
  await t.test('7. getCustomerLedgers throws clear error in production mode when Tally is unreachable', async () => {
    // Explicitly pass allowSimulation: false and isDemoMode: false to simulate production call
    await assert.rejects(
      async () => {
        await tallyService.getCustomerLedgers({
          tallyUrl: 'http://localhost:59999', // unreachable port
          allowSimulation: false,
          isDemoMode: false
        });
      },
      /Unable to generate report: financial data is unavailable/i,
      'Must reject production requests when Tally is offline without falling back to mock data'
    );
  });

  // Test 8: Multipage HTML & PDF rendering for large ledgers
  await t.test('8. generateLedgerPdf renders compliant PDF with valid header and structure', async () => {
    const tempDir = path.join(__dirname, 'temp_financial_pdf_test');
    try {
      // Create multi-transaction ledger
      const transactions = [];
      for (let i = 1; i <= 30; i++) {
        transactions.push({
          date: `${String(i).padStart(2, '0')}-Jan-2026`,
          voucherNo: `INV-${1000 + i}`,
          type: 'Sales',
          reference: `PO-${5000 + i}`,
          narration: `Itemized commercial trade batch #${i} delivery`,
          debit: 1000 + (i * 10),
          credit: 0
        });
      }

      const result = await generateLedgerPdf(
        {
          companyName: 'Premier Trading Corp',
          companyAddress: '401 Nariman Point, Mumbai',
          companyGstin: '27AAACP9999F1Z1',
          customerName: 'High-Volume Enterprise',
          customerMobile: '919876000000',
          statementPeriod: '01-Jan-2026 to 31-Jan-2026',
          openingBalance: 25000,
          openingBalanceType: 'Dr',
          transactions,
          source: 'synthetic-test'
        },
        tempDir
      );

      assert.ok(fs.existsSync(result.filePath), 'Ledger PDF must be generated');
      assert.ok(result.fileSize > 0, 'PDF size must be non-zero');
      const buffer = fs.readFileSync(result.filePath);
      assert.ok(buffer.toString('utf8', 0, 5).startsWith('%PDF'), 'Must be a valid PDF');
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  // Test 9: Balance Sheet PDF generation
  await t.test('9. generateBalanceSheetPdf renders executive PDF document', async () => {
    const tempDir = path.join(__dirname, 'temp_bs_pdf_test');
    try {
      const syntheticBs = getSyntheticBalanceSheetData();
      const bsData = computeBalanceSheet({
        companyName: syntheticBs.companyName,
        asOfDate: syntheticBs.asOfDate,
        financialYear: syntheticBs.financialYear,
        groups: syntheticBs.groups,
        closingStock: syntheticBs.closingStock,
        netProfitLoss: syntheticBs.netProfitLoss,
        source: syntheticBs.source
      });

      const result = await generateBalanceSheetPdf(bsData, tempDir);

      assert.ok(fs.existsSync(result.filePath), 'Balance Sheet PDF must be generated');
      assert.ok(result.fileSize > 0);
      const buffer = fs.readFileSync(result.filePath);
      assert.ok(buffer.toString('utf8', 0, 5).startsWith('%PDF'), 'Must be a valid PDF');
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

});
