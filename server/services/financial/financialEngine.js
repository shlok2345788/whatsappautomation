/**
 * Financial Calculation & Integrity Engine
 * Provides decimal-safe arithmetic, ledger running balance calculation,
 * reconciliation checks against Tally Prime, and Balance Sheet grouping
 * with strict double-counting prevention.
 */

// Multiply to integer paise (cents) to eliminate IEEE 754 floating point errors
const toPaise = (amount) => {
  if (amount === undefined || amount === null || amount === '') return 0;
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''));
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
};

const fromPaise = (paise) => {
  return Number((paise / 100).toFixed(2));
};

/**
 * Formats a number into Indian currency format (e.g. 1,50,000.00)
 */
const formatCurrency = (amount, includeSymbol = true) => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
  const abs = Math.abs(isNaN(num) ? 0 : num);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return includeSymbol ? `₹ ${formatted}` : formatted;
};

/**
 * Normalizes balance sign from Tally conventions.
 * In Tally XML:
 *  - Negative CLOSINGBALANCE is Debit (Dr)
 *  - Positive CLOSINGBALANCE is Credit (Cr)
 *  - Or explicit balanceType ('Dr' | 'Cr')
 */
const parseTallyBalance = (rawAmount, explicitType) => {
  if (explicitType === 'Dr') {
    return { amount: Math.abs(parseFloat(rawAmount) || 0), type: 'Dr', sign: 1 };
  }
  if (explicitType === 'Cr') {
    return { amount: Math.abs(parseFloat(rawAmount) || 0), type: 'Cr', sign: -1 };
  }
  const num = parseFloat(rawAmount) || 0;
  if (num < 0) {
    return { amount: Math.abs(num), type: 'Dr', sign: 1 };
  } else if (num > 0) {
    return { amount: num, type: 'Cr', sign: -1 };
  }
  return { amount: 0, type: 'Nil', sign: 0 };
};

/**
 * Reconciles a ledger statement:
 * Computes running balance, total debits, total credits, closing balance,
 * and reconciles against Tally closing balance.
 */
const computeLedgerStatement = ({
  openingBalance = 0,
  openingBalanceType = 'Dr',
  transactions = [],
  tallyClosingBalance = null,
  tallyClosingBalanceType = null,
  partyAccountType = 'Debtor' // 'Debtor' (normal Dr) or 'Creditor' (normal Cr)
}) => {
  const openingPaise = toPaise(Math.abs(openingBalance));
  // Opening balance in signed paise: Dr is +, Cr is -
  let runningSignedPaise = openingBalanceType.toUpperCase() === 'CR' ? -openingPaise : openingPaise;

  let totalDebitPaise = 0;
  let totalCreditPaise = 0;

  const processedTransactions = transactions.map((tx, idx) => {
    const debitPaise = toPaise(tx.debit || 0);
    const creditPaise = toPaise(tx.credit || 0);

    totalDebitPaise += debitPaise;
    totalCreditPaise += creditPaise;

    // Running balance calculation:
    // Debit increases receivable (positive), Credit decreases (negative)
    runningSignedPaise = runningSignedPaise + debitPaise - creditPaise;

    let balanceType = 'Dr';
    let balanceAbs = runningSignedPaise;
    if (runningSignedPaise < 0) {
      balanceType = 'Cr';
      balanceAbs = Math.abs(runningSignedPaise);
    } else if (runningSignedPaise === 0) {
      balanceType = 'Nil';
      balanceAbs = 0;
    }

    return {
      index: idx + 1,
      date: tx.date || '-',
      voucherNo: tx.voucherNo || '-',
      voucherType: tx.voucherType || tx.type || 'Journal',
      reference: tx.reference || '',
      narration: tx.narration || tx.particulars || '',
      debit: fromPaise(debitPaise),
      credit: fromPaise(creditPaise),
      runningBalance: fromPaise(balanceAbs),
      runningBalanceType: balanceType,
      runningBalanceFormatted: `${formatCurrency(fromPaise(balanceAbs))} ${balanceType}`
    };
  });

  const calculatedClosingPaise = Math.abs(runningSignedPaise);
  const calculatedClosingBalance = fromPaise(calculatedClosingPaise);
  let calculatedClosingType = 'Dr';
  if (runningSignedPaise < 0) {
    calculatedClosingType = 'Cr';
  } else if (runningSignedPaise === 0) {
    calculatedClosingType = 'Nil';
  }

  // Reconcile against Tally closing balance if provided
  let isReconciled = true;
  let discrepancyAmount = 0;
  let validationMessage = 'Statement calculations verified and balanced.';

  if (tallyClosingBalance !== null && tallyClosingBalance !== undefined) {
    const expectedTally = parseTallyBalance(tallyClosingBalance, tallyClosingBalanceType);
    const tallySignedPaise = expectedTally.type === 'Cr'
      ? -toPaise(expectedTally.amount)
      : toPaise(expectedTally.amount);

    const diffPaise = Math.abs(runningSignedPaise - tallySignedPaise);
    if (diffPaise > 0) {
      isReconciled = false;
      discrepancyAmount = fromPaise(diffPaise);
      validationMessage = `Reconciliation Warning: Calculated closing balance (${formatCurrency(calculatedClosingBalance)} ${calculatedClosingType}) differs from Tally closing balance (${formatCurrency(expectedTally.amount)} ${expectedTally.type}) by ${formatCurrency(discrepancyAmount)}.`;
    }
  }

  return {
    openingBalance: fromPaise(openingPaise),
    openingBalanceType: openingBalanceType || 'Dr',
    openingBalanceFormatted: `${formatCurrency(fromPaise(openingPaise))} ${openingBalanceType || 'Dr'}`,
    transactions: processedTransactions,
    transactionCount: processedTransactions.length,
    totalDebits: fromPaise(totalDebitPaise),
    totalCredits: fromPaise(totalCreditPaise),
    totalDebitsFormatted: formatCurrency(fromPaise(totalDebitPaise)),
    totalCreditsFormatted: formatCurrency(fromPaise(totalCreditPaise)),
    netMovement: fromPaise(totalDebitPaise - totalCreditPaise),
    closingBalance: calculatedClosingBalance,
    closingBalanceType: calculatedClosingType,
    closingBalanceFormatted: `${formatCurrency(calculatedClosingBalance)} ${calculatedClosingType}`,
    isReconciled,
    discrepancyAmount,
    validationMessage
  };
};

/**
 * Standard Indian Accounting Balance Sheet Hierarchy definition.
 */
const LIABILITIES_GROUP_KEYS = [
  'capital account',
  "proprietor's capital",
  "partners' capital",
  'reserves & surplus',
  'reserves and surplus',
  'retained earnings',
  'loans (liability)',
  'secured loans',
  'unsecured loans',
  'bank od a/c',
  'bank occ a/c',
  'current liabilities',
  'sundry creditors',
  'duties & taxes',
  'provisions',
  'profit & loss a/c',
  'profit and loss a/c'
];

const ASSETS_GROUP_KEYS = [
  'fixed assets',
  'property plant and equipment',
  'tangible assets',
  'intangible assets',
  'investments',
  'current assets',
  'stock-in-hand',
  'closing stock',
  'inventories',
  'sundry debtors',
  'cash-in-hand',
  'bank accounts',
  'loans & advances (asset)',
  'deposits (asset)'
];

/**
 * Calculates a verified Balance Sheet from account groups,
 * preventing double-counting of parent groups and child ledgers.
 */
const computeBalanceSheet = ({
  companyName = 'Company',
  asOfDate = new Date().toISOString().split('T')[0],
  financialYear = '2025-26',
  groups = [],
  netProfitLoss = 0, // positive = profit, negative = loss
  closingStock = 0,
  source = 'tally-live'
}) => {
  const liabilitiesCategories = [
    { name: 'Capital Account', items: [], subtotal: 0 },
    { name: 'Reserves & Surplus', items: [], subtotal: 0 },
    { name: 'Loans & Borrowings (Secured & Unsecured)', items: [], subtotal: 0 },
    { name: 'Current Liabilities & Provisions', items: [], subtotal: 0 },
    { name: 'Sundry Creditors', items: [], subtotal: 0 },
    { name: 'Other Liabilities', items: [], subtotal: 0 }
  ];

  const assetsCategories = [
    { name: 'Fixed Assets (Property, Plant & Equipment)', items: [], subtotal: 0 },
    { name: 'Investments', items: [], subtotal: 0 },
    { name: 'Current Assets', items: [], subtotal: 0 },
    { name: 'Inventories / Closing Stock', items: [], subtotal: 0 },
    { name: 'Sundry Debtors', items: [], subtotal: 0 },
    { name: 'Cash and Bank Balances', items: [], subtotal: 0 },
    { name: 'Other Assets & Advances', items: [], subtotal: 0 }
  ];

  // Identify parent groups whose child ledgers are already present in the list
  // to avoid double counting parent total + child items
  const parentNamesWithChildren = new Set();
  for (const grp of groups) {
    if (grp.parent && String(grp.parent).trim()) {
      parentNamesWithChildren.add(String(grp.parent).trim().toLowerCase());
    }
  }

  // Track included accounts by unique name to prevent duplicate counting
  const includedAccounts = new Set();

  for (const grp of groups) {
    const rawName = (grp.name || '').trim();
    if (!rawName) continue;

    const nameLower = rawName.toLowerCase();
    const parentName = (grp.parent || '').trim().toLowerCase();
    const amount = Math.abs(parseFloat(grp.amount || grp.balance || grp.closingBalance || 0));

    if (amount === 0 && !grp.showZero) continue;

    // Check duplicate by name
    if (includedAccounts.has(nameLower)) continue;

    // If this item is a parent group whose children are also present as items in the list,
    // skip this parent to avoid double-counting!
    if (parentNamesWithChildren.has(nameLower)) {
      continue;
    }

    includedAccounts.add(nameLower);

    const item = {
      name: rawName,
      amount,
      amountFormatted: formatCurrency(amount),
      parent: grp.parent || ''
    };

    // Classify into appropriate category
    if (nameLower.includes('capital') || parentName.includes('capital')) {
      liabilitiesCategories[0].items.push(item);
      liabilitiesCategories[0].subtotal += toPaise(amount);
    } else if (nameLower.includes('reserve') || nameLower.includes('surplus') || parentName.includes('reserve')) {
      liabilitiesCategories[1].items.push(item);
      liabilitiesCategories[1].subtotal += toPaise(amount);
    } else if (nameLower.includes('loan') || nameLower.includes('borrowing') || nameLower.includes('bank od') || nameLower.includes('bank occ') || parentName.includes('loan')) {
      liabilitiesCategories[2].items.push(item);
      liabilitiesCategories[2].subtotal += toPaise(amount);
    } else if (nameLower.includes('creditor') || parentName.includes('creditor')) {
      liabilitiesCategories[4].items.push(item);
      liabilitiesCategories[4].subtotal += toPaise(amount);
    } else if (
      nameLower.includes('tax') ||
      nameLower.includes('duty') ||
      nameLower.includes('duties') ||
      nameLower.includes('provision') ||
      nameLower.includes('payable') ||
      nameLower.includes('current liabilit') ||
      parentName.includes('current liabilit')
    ) {
      liabilitiesCategories[3].items.push(item);
      liabilitiesCategories[3].subtotal += toPaise(amount);
    } else if (nameLower.includes('liabilit') || grp.balanceType === 'Cr' || grp.type === 'Liability') {
      liabilitiesCategories[5].items.push(item);
      liabilitiesCategories[5].subtotal += toPaise(amount);
    } else if (nameLower.includes('fixed asset') || nameLower.includes('plant') || nameLower.includes('equipment') || nameLower.includes('furniture') || nameLower.includes('machinery') || parentName.includes('fixed asset')) {
      assetsCategories[0].items.push(item);
      assetsCategories[0].subtotal += toPaise(amount);
    } else if (nameLower.includes('investment') || parentName.includes('investment')) {
      assetsCategories[1].items.push(item);
      assetsCategories[1].subtotal += toPaise(amount);
    } else if (nameLower.includes('stock') || nameLower.includes('inventory') || parentName.includes('stock')) {
      assetsCategories[3].items.push(item);
      assetsCategories[3].subtotal += toPaise(amount);
    } else if (nameLower.includes('debtor') || parentName.includes('debtor')) {
      assetsCategories[4].items.push(item);
      assetsCategories[4].subtotal += toPaise(amount);
    } else if (nameLower.includes('cash') || nameLower.includes('bank') || parentName.includes('cash') || parentName.includes('bank')) {
      assetsCategories[5].items.push(item);
      assetsCategories[5].subtotal += toPaise(amount);
    } else if (nameLower.includes('advance') || nameLower.includes('deposit') || nameLower.includes('current asset') || parentName.includes('current asset')) {
      assetsCategories[2].items.push(item);
      assetsCategories[2].subtotal += toPaise(amount);
    } else {
      // Default to Other Assets or Other Liabilities
      if (nameLower.includes('asset') || grp.balanceType === 'Dr' || grp.type === 'Asset') {
        assetsCategories[6].items.push(item);
        assetsCategories[6].subtotal += toPaise(amount);
      } else {
        liabilitiesCategories[5].items.push(item);
        liabilitiesCategories[5].subtotal += toPaise(amount);
      }
    }
  }

  // Treatment of Closing Stock (if provided explicitly and not already in groups)
  if (closingStock > 0 && assetsCategories[3].items.length === 0) {
    const stockItem = {
      name: 'Closing Stock (Valued at Lower of Cost or NRV)',
      amount: closingStock,
      amountFormatted: formatCurrency(closingStock),
      parent: 'Current Assets'
    };
    assetsCategories[3].items.push(stockItem);
    assetsCategories[3].subtotal += toPaise(closingStock);
  }

  // Treatment of Profit & Loss Account
  // In Tally, Net Profit is added under Reserves & Surplus in Liabilities
  // If Net Loss, it reduces Liabilities or is displayed with a negative sign
  if (netProfitLoss !== 0) {
    const pnlItem = {
      name: netProfitLoss >= 0 ? 'Profit & Loss Account (Current Year Net Profit)' : 'Profit & Loss Account (Current Year Net Loss)',
      amount: netProfitLoss,
      amountFormatted: `${netProfitLoss < 0 ? '-' : ''}${formatCurrency(Math.abs(netProfitLoss))}`,
      parent: 'Reserves & Surplus'
    };
    liabilitiesCategories[1].items.push(pnlItem);
    liabilitiesCategories[1].subtotal += toPaise(netProfitLoss);
  }

  // Convert category subtotals from paise to numbers
  const formattedLiabilities = liabilitiesCategories
    .filter((cat) => cat.items.length > 0)
    .map((cat) => ({
      ...cat,
      subtotalAmount: fromPaise(cat.subtotal),
      subtotalFormatted: formatCurrency(fromPaise(cat.subtotal))
    }));

  const formattedAssets = assetsCategories
    .filter((cat) => cat.items.length > 0)
    .map((cat) => ({
      ...cat,
      subtotalAmount: fromPaise(cat.subtotal),
      subtotalFormatted: formatCurrency(fromPaise(cat.subtotal))
    }));

  // Calculate Grand Totals safely using paise
  const totalLiabilitiesPaise = formattedLiabilities.reduce((acc, cat) => acc + toPaise(cat.subtotalAmount), 0);
  const totalAssetsPaise = formattedAssets.reduce((acc, cat) => acc + toPaise(cat.subtotalAmount), 0);

  const totalLiabilities = fromPaise(totalLiabilitiesPaise);
  const totalAssets = fromPaise(totalAssetsPaise);

  const discrepancyPaise = Math.abs(totalAssetsPaise - totalLiabilitiesPaise);
  const discrepancy = fromPaise(discrepancyPaise);
  const isReconciled = discrepancyPaise === 0;

  const validationNotes = isReconciled
    ? 'Reconciled: Total Assets exactly equal Total Liabilities.'
    : `Validation Warning: Assets (₹ ${totalAssets.toLocaleString('en-IN')}) and Liabilities (₹ ${totalLiabilities.toLocaleString('en-IN')}) differ by ₹ ${discrepancy.toLocaleString('en-IN')}.`;

  return {
    companyName,
    asOfDate,
    financialYear,
    source,
    generatedAt: new Date().toISOString(),
    liabilities: formattedLiabilities,
    assets: formattedAssets,
    totalLiabilities,
    totalLiabilitiesFormatted: formatCurrency(totalLiabilities),
    totalAssets,
    totalAssetsFormatted: formatCurrency(totalAssets),
    isReconciled,
    discrepancy,
    discrepancyFormatted: formatCurrency(discrepancy),
    validationNotes
  };
};

module.exports = {
  toPaise,
  fromPaise,
  formatCurrency,
  parseTallyBalance,
  computeLedgerStatement,
  computeBalanceSheet,
  LIABILITIES_GROUP_KEYS,
  ASSETS_GROUP_KEYS
};
