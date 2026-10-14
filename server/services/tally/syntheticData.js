/**
 * Synthetic Financial Data Module
 * STRICTLY FOR AUTOMATED TESTS AND EXPLICIT SANDBOX DEMONSTRATION ENVIRONMENTS.
 * All records are watermarked with source = 'DEMO / SYNTHETIC - NOT LIVE'.
 * These are NEVER to be silently injected into production reporting workflows.
 */

const getSyntheticCustomerLedgers = () => [
  {
    name: 'Rajesh Enterprises',
    partyIdentifier: 'CUST-MUM-104',
    gstin: '27AABCR1234F1Z8',
    mobile: '919876543210',
    email: 'rajesh@rajesh-ent.com',
    address: 'Shop 12, Commercial Market, Andheri East, Mumbai 400069',
    openingBalance: 15000.00,
    openingBalanceType: 'Dr',
    statementPeriod: '01-Apr-2025 to 31-Mar-2026',
    tallyClosingBalance: 60200.00,
    tallyBalanceType: 'Dr',
    source: 'DEMO / SYNTHETIC - NOT LIVE',
    isSynthetic: true,
    transactions: [
      {
        date: '10-Feb-2026',
        voucherNo: 'INV-1042',
        voucherType: 'Sales',
        reference: 'PO-9821',
        narration: 'Being goods sold against PO #9821 via Chalan 402',
        debit: 25000.00,
        credit: 0
      },
      {
        date: '18-Feb-2026',
        voucherNo: 'RCP-502',
        voucherType: 'Receipt',
        reference: 'NEFT-889102',
        narration: 'Being payment received via NEFT HDFC Bank',
        debit: 0,
        credit: 15000.00
      },
      {
        date: '28-Feb-2026',
        voucherNo: 'INV-1108',
        voucherType: 'Sales',
        reference: 'PO-9912',
        narration: 'Being supply of commercial electrical cables',
        debit: 35200.00,
        credit: 0
      }
    ]
  },
  {
    name: 'Metro Hardware Store',
    partyIdentifier: 'CUST-PUN-209',
    gstin: '27AABCM5678K1Z2',
    mobile: '919812345678',
    email: 'accounts@metrohardware.in',
    address: 'Plot 45, MIDC Industrial Area, Bhosari, Pune 411026',
    openingBalance: 40000.00,
    openingBalanceType: 'Dr',
    statementPeriod: '01-Apr-2025 to 31-Mar-2026',
    tallyClosingBalance: 122500.50,
    tallyBalanceType: 'Dr',
    source: 'DEMO / SYNTHETIC - NOT LIVE',
    isSynthetic: true,
    transactions: [
      {
        date: '05-Jan-2026',
        voucherNo: 'INV-0980',
        voucherType: 'Sales',
        reference: 'PO-8812',
        narration: 'Heavy hardware supplies consignment #1',
        debit: 60000.00,
        credit: 0
      },
      {
        date: '22-Jan-2026',
        voucherNo: 'RCP-489',
        voucherType: 'Receipt',
        reference: 'RTGS-002911',
        narration: 'On account part-settlement via RTGS',
        debit: 0,
        credit: 20000.00
      },
      {
        date: '15-Feb-2026',
        voucherNo: 'INV-1065',
        voucherType: 'Sales',
        reference: 'PO-8901',
        narration: 'Industrial fasteners and structural bolts',
        debit: 42500.50,
        credit: 0
      }
    ]
  },
  {
    name: 'Sharma Trading Co.',
    partyIdentifier: 'CUST-DEL-318',
    gstin: '07AABCS9012M1Z5',
    mobile: '919899887766',
    email: 'sharma.trading@gmail.com',
    address: 'B-4, Wholesale Ring Road, Azadpur, Delhi 110033',
    openingBalance: 0.00,
    openingBalanceType: 'Dr',
    statementPeriod: '01-Apr-2025 to 31-Mar-2026',
    tallyClosingBalance: 19800.00,
    tallyBalanceType: 'Dr',
    source: 'DEMO / SYNTHETIC - NOT LIVE',
    isSynthetic: true,
    transactions: [
      {
        date: '12-Feb-2026',
        voucherNo: 'INV-1055',
        voucherType: 'Sales',
        reference: 'PO-4412',
        narration: 'Special trade goods consignment',
        debit: 19800.00,
        credit: 0
      }
    ]
  }
];

/**
 * Verified balanced Balance Sheet test fixture
 * Total Liabilities (₹ 55,00,000) === Total Assets (₹ 55,00,000)
 */
const getSyntheticBalanceSheetData = () => {
  return {
    companyName: 'Acme Enterprise Ltd (Sandbox)',
    asOfDate: '31-Mar-2026',
    financialYear: '2025-26',
    source: 'DEMO / SYNTHETIC - NOT LIVE',
    isSynthetic: true,
    closingStock: 1250000.00,
    netProfitLoss: 850000.00,
    groups: [
      // Liabilities
      { name: "Proprietor's Capital Account", parent: 'Capital Account', balance: 2000000.00, balanceType: 'Cr' },
      { name: 'General Reserve Fund', parent: 'Reserves & Surplus', balance: 650000.00, balanceType: 'Cr' },
      { name: 'HDFC Bank Term Loan (Secured)', parent: 'Loans (Liability)', balance: 1200000.00, balanceType: 'Cr' },
      { name: 'Sundry Creditors (Trade Payables)', parent: 'Current Liabilities', balance: 550000.00, balanceType: 'Cr' },
      { name: 'GST & Statutory Duties Payable', parent: 'Current Liabilities', balance: 250000.00, balanceType: 'Cr' },

      // Assets
      { name: 'Plant, Machinery & Factory Equipment', parent: 'Fixed Assets', balance: 1800000.00, balanceType: 'Dr' },
      { name: 'Office Furniture & Fixtures', parent: 'Fixed Assets', balance: 250000.00, balanceType: 'Dr' },
      { name: 'Long Term Mutual Fund Investments', parent: 'Investments', balance: 500000.00, balanceType: 'Dr' },
      { name: 'Sundry Debtors (Trade Receivables)', parent: 'Current Assets', balance: 950000.00, balanceType: 'Dr' },
      { name: 'HDFC Current Bank Account', parent: 'Bank Accounts', balance: 680000.00, balanceType: 'Dr' },
      { name: 'Cash on Hand', parent: 'Cash-in-hand', balance: 70000.00, balanceType: 'Dr' }
    ]
  };
};

module.exports = {
  getSyntheticCustomerLedgers,
  getSyntheticBalanceSheetData
};
