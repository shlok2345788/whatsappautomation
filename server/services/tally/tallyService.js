const http = require('http');
const url = require('url');
const { getSyntheticCustomerLedgers, getSyntheticBalanceSheetData } = require('./syntheticData');
const { computeLedgerStatement, computeBalanceSheet, parseTallyBalance } = require('../financial/financialEngine');

/**
 * Parses basic XML tags from Tally XML responses with attribute and whitespace tolerance.
 */
const parseXmlTag = (xml, tag) => {
  if (!xml) return '';
  const regex = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  // Strip CDATA if present
  let content = match[1].trim();
  if (content.startsWith('<![CDATA[') && content.endsWith(']]>')) {
    content = content.substring(9, content.length - 3).trim();
  }
  return content;
};

/**
 * Extracts all matching XML blocks for repeated elements (e.g., <LEDGER>...</LEDGER>).
 */
const parseXmlBlocks = (xml, blockTag) => {
  if (!xml) return [];
  const blocks = [];
  const regex = new RegExp(`<${blockTag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${blockTag}>`, 'gi');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
};

/**
 * Formats Tally YYYYMMDD date into human-readable DD-MMM-YYYY.
 */
const formatTallyDate = (rawDate) => {
  if (!rawDate) return '-';
  const clean = String(rawDate).trim();
  if (/^\d{8}$/.test(clean)) {
    const year = clean.substring(0, 4);
    const monthIdx = parseInt(clean.substring(4, 6), 10) - 1;
    const day = clean.substring(6, 8);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day}-${months[monthIdx] || 'Jan'}-${year}`;
  }
  return clean;
};

/**
 * Sends a raw XML request to Tally Prime's XML Server.
 */
const sendTallyRequest = async (tallyUrl, xmlPayload, timeoutMs = 4000) => {
  return new Promise((resolve, reject) => {
    const targetUrl = tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
    const parsedUrl = url.parse(targetUrl);
    const hostname = (parsedUrl.hostname || '').toLowerCase();

    // SSRF Prevention: Reject any non-loopback host or cloud metadata address
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!isLoopback) {
      return reject(new Error(`SSRF Blocked: Outbound requests to remote host '${hostname}' are strictly prohibited.`));
    }
    const options = {
      hostname: parsedUrl.hostname || 'localhost',
      port: parsedUrl.port || 9000,
      path: parsedUrl.path || '/',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlPayload)
      },
      timeout: timeoutMs
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Tally Prime connection timed out after ${timeoutMs}ms`));
    });

    req.write(xmlPayload);
    req.end();
  });
};

/**
 * Checks connection to Tally Prime XML server and discovers active companies.
 */
const checkTallyStatus = async (tallyUrl = process.env.TALLY_API_URL || 'http://localhost:9000') => {
  const xmlPayload = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>List of Companies</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>
  `.trim();

  try {
    const responseXml = await sendTallyRequest(tallyUrl, xmlPayload, 3000);
    const companyBlocks = parseXmlBlocks(responseXml, 'COMPANY');
    const companyNames = companyBlocks
      .map((c) => parseXmlTag(c, 'NAME'))
      .filter(Boolean);

    return {
      connected: true,
      tallyUrl,
      companies: companyNames,
      activeCompany: companyNames[0] || null,
      mode: 'live',
      lastChecked: new Date().toISOString()
    };
  } catch (err) {
    return {
      connected: false,
      tallyUrl,
      error: err.message,
      companies: [],
      activeCompany: null,
      mode: 'disconnected',
      lastChecked: new Date().toISOString()
    };
  }
};

/**
 * Fetches company profile details (address, financial year, etc.) from Tally.
 */
const getCompanyInfo = async (options = {}) => {
  const tallyUrl = options.tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
  const companyName = options.companyName || process.env.TALLY_COMPANY_NAME || '';

  const status = await checkTallyStatus(tallyUrl);
  if (!status.connected) {
    if (options.allowSimulation || options.isDemoMode || process.env.NODE_ENV === 'test') {
      return {
        companyName: companyName || 'Acme Trading Corporation Ltd',
        address: '101 Commerce House, Fort, Mumbai 400001, Maharashtra',
        gstin: '27AAACA1234F1Z5',
        phone: '+91 22 2266 1234',
        email: 'accounts@acmecorp.in',
        financialYear: '2025-26',
        startingFrom: '01-Apr-2025',
        source: 'DEMO / SYNTHETIC - NOT LIVE'
      };
    }
    throw new Error(`Unable to generate report: financial data is unavailable. Tally Prime XML server is unreachable at ${tallyUrl}.`);
  }

  const xmlPayload = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>CompanyProfile</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="CompanyProfile">
                <TYPE>Company</TYPE>
                <FETCH>Name, Address, Email, Telephone, GSTIN, StartingFrom</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>
  `.trim();

  try {
    const responseXml = await sendTallyRequest(tallyUrl, xmlPayload);
    const companyBlock = parseXmlBlocks(responseXml, 'COMPANY')[0] || '';
    const name = parseXmlTag(companyBlock, 'NAME') || companyName || 'Company Accounts';
    const address = parseXmlTag(companyBlock, 'ADDRESS') || '';
    const email = parseXmlTag(companyBlock, 'EMAIL') || '';
    const phone = parseXmlTag(companyBlock, 'TELEPHONE') || '';
    const gstin = parseXmlTag(companyBlock, 'GSTIN') || '';
    const startingFrom = formatTallyDate(parseXmlTag(companyBlock, 'STARTINGFROM'));

    return {
      companyName: name,
      address,
      email,
      phone,
      gstin,
      financialYear: '2025-26',
      startingFrom,
      source: 'tally-live'
    };
  } catch (err) {
    throw new Error(`Failed to retrieve company profile from Tally: ${err.message}`);
  }
};

/**
 * Fetches transactions/vouchers for a specific ledger from Tally Prime.
 */
const getLedgerVouchers = async (ledgerName, options = {}) => {
  const tallyUrl = options.tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
  const companyName = options.companyName || process.env.TALLY_COMPANY_NAME || '';
  const fromDate = options.fromDate || '20250401';
  const toDate = options.toDate || '20260331';

  const xmlPayload = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LedgerVouchersCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LedgerVouchersCollection">
                <TYPE>Voucher</TYPE>
                <FETCH>Date, VoucherNumber, VoucherTypeName, Reference, Narration, AllLedgerEntries.List</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>
  `.trim();

  try {
    const responseXml = await sendTallyRequest(tallyUrl, xmlPayload);
    const voucherBlocks = parseXmlBlocks(responseXml, 'VOUCHER');
    const matchedTransactions = [];

    const targetNameNorm = ledgerName.trim().toLowerCase();

    for (const vBlock of voucherBlocks) {
      const vDate = formatTallyDate(parseXmlTag(vBlock, 'DATE'));
      const voucherNo = parseXmlTag(vBlock, 'VOUCHERNUMBER');
      const voucherType = parseXmlTag(vBlock, 'VOUCHERTYPENAME') || 'Journal';
      const reference = parseXmlTag(vBlock, 'REFERENCE');
      const narration = parseXmlTag(vBlock, 'NARRATION');

      // Check all ledger entry lines inside this voucher
      const entryBlocks = parseXmlBlocks(vBlock, 'ALLLEDGERENTRIES.LIST');
      for (const eBlock of entryBlocks) {
        const entryLedger = parseXmlTag(eBlock, 'LEDGERNAME').trim();
        if (entryLedger.toLowerCase() === targetNameNorm) {
          const rawAmount = parseFloat(parseXmlTag(eBlock, 'AMOUNT') || '0');
          // In Tally: negative amount = Debit, positive amount = Credit
          const isDebit = rawAmount < 0;
          matchedTransactions.push({
            date: vDate,
            voucherNo,
            voucherType,
            reference,
            narration,
            debit: isDebit ? Math.abs(rawAmount) : 0,
            credit: !isDebit ? Math.abs(rawAmount) : 0
          });
        }
      }
    }

    return matchedTransactions;
  } catch (err) {
    console.warn(`[Tally Service] Failed to fetch vouchers for ${ledgerName}:`, err.message);
    return [];
  }
};

/**
 * Fetches customer debtor ledgers from Tally Prime.
 * Reconciles running balance, debits, and credits.
 * If Tally is unreachable, throws a clear error unless simulation is explicitly enabled.
 */
const getCustomerLedgers = async (options = {}) => {
  const tallyUrl = options.tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
  const companyName = options.companyName || process.env.TALLY_COMPANY_NAME || '';
  const fromDate = options.fromDate || '20250401';
  const toDate = options.toDate || '20260331';

  const status = await checkTallyStatus(tallyUrl);

  if (status.connected) {
    try {
      const xmlPayload = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
            <TYPE>Collection</TYPE>
            <ID>CustomerLedgers</ID>
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
              </STATICVARIABLES>
              <TDL>
                <TDLMESSAGE>
                  <COLLECTION NAME="CustomerLedgers">
                    <TYPE>Ledger</TYPE>
                    <CHILDOF>$$GroupSundryDebtors</CHILDOF>
                    <FETCH>Name, Parent, OpeningBalance, ClosingBalance, LedgerMobile, LedgerPhone, Email, FullAddress, IncomeExpenseType</FETCH>
                  </COLLECTION>
                </TDLMESSAGE>
              </TDL>
            </DESC>
          </BODY>
        </ENVELOPE>
      `.trim();

      const responseXml = await sendTallyRequest(tallyUrl, xmlPayload);
      const ledgerBlocks = parseXmlBlocks(responseXml, 'LEDGER');

      if (ledgerBlocks.length > 0) {
        const enrichedLedgers = [];

        for (const block of ledgerBlocks) {
          const name = parseXmlTag(block, 'NAME');
          if (!name) continue;

          const mobile = parseXmlTag(block, 'LEDGERMOBILE') || parseXmlTag(block, 'LEDGERPHONE') || '';
          const rawOpening = parseFloat(parseXmlTag(block, 'OPENINGBALANCE') || '0');
          const rawClosing = parseFloat(parseXmlTag(block, 'CLOSINGBALANCE') || '0');
          const email = parseXmlTag(block, 'EMAIL') || '';
          const address = parseXmlTag(block, 'FULLADDRESS') || '';

          const openingParsed = parseTallyBalance(rawOpening);
          const closingParsed = parseTallyBalance(rawClosing);

          // Fetch actual vouchers for this ledger if requested
          let transactions = [];
          if (options.includeTransactions !== false) {
            transactions = await getLedgerVouchers(name, { tallyUrl, companyName, fromDate, toDate });
          }

          // Run through financial reconciliation engine
          const statement = computeLedgerStatement({
            openingBalance: openingParsed.amount,
            openingBalanceType: openingParsed.type,
            transactions,
            tallyClosingBalance: closingParsed.amount,
            tallyClosingBalanceType: closingParsed.type
          });

          enrichedLedgers.push({
            name,
            partyIdentifier: name,
            mobile,
            email,
            address,
            statementPeriod: options.statementPeriod || '01-Apr-2025 to 31-Mar-2026',
            openingBalance: statement.openingBalance,
            openingBalanceType: statement.openingBalanceType,
            closingBalance: statement.closingBalance,
            balanceType: statement.closingBalanceType,
            totalDebits: statement.totalDebits,
            totalCredits: statement.totalCredits,
            transactions: statement.transactions,
            isReconciled: statement.isReconciled,
            discrepancyAmount: statement.discrepancyAmount,
            validationMessage: statement.validationMessage,
            source: 'tally-live'
          });
        }

        return enrichedLedgers;
      }
    } catch (e) {
      console.warn('[Tally Service] Error fetching live ledgers:', e.message);
      if (!options.allowSimulation && !options.isDemoMode && process.env.NODE_ENV !== 'test') {
        throw new Error(`Unable to generate report: financial data retrieval from Tally Prime failed (${e.message}).`);
      }
    }
  }

  // Tally is offline: only provide synthetic data when explicitly permitted for testing or demo sandbox
  const isTestRunner = Boolean(
    process.execArgv.includes('--test') ||
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test'
  );
  const isAllowedSimulation = options.allowSimulation === false
    ? false
    : Boolean(options.allowSimulation || options.isDemoMode || isTestRunner);

  if (isAllowedSimulation) {
    const rawSynthetic = getSyntheticCustomerLedgers();
    return rawSynthetic.map((ledger) => {
      const statement = computeLedgerStatement({
        openingBalance: ledger.openingBalance,
        openingBalanceType: ledger.openingBalanceType,
        transactions: ledger.transactions,
        tallyClosingBalance: ledger.tallyClosingBalance,
        tallyClosingBalanceType: ledger.tallyBalanceType
      });

      return {
        ...ledger,
        statementPeriod: options.statementPeriod || ledger.statementPeriod,
        openingBalance: statement.openingBalance,
        openingBalanceType: statement.openingBalanceType,
        closingBalance: statement.closingBalance,
        balanceType: statement.closingBalanceType,
        totalDebits: statement.totalDebits,
        totalCredits: statement.totalCredits,
        transactions: statement.transactions,
        isReconciled: statement.isReconciled,
        discrepancyAmount: statement.discrepancyAmount,
        validationMessage: statement.validationMessage
      };
    });
  }

  // Production requirement: Never silently substitute demo data
  throw new Error(`Unable to generate report: financial data is unavailable. Tally Prime XML server is not connected at ${tallyUrl}. Please ensure Tally Prime is running with XML server enabled.`);
};

/**
 * Fetches dynamic Balance Sheet data from Tally Prime XML or verified sandbox fixture.
 */
const getBalanceSheetData = async (options = {}) => {
  const tallyUrl = options.tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
  const companyName = options.companyName || process.env.TALLY_COMPANY_NAME || '';
  const asOfDate = options.asOfDate || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const status = await checkTallyStatus(tallyUrl);

  if (status.connected) {
    try {
      const xmlPayload = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
            <TYPE>Collection</TYPE>
            <ID>AllGroupsCollection</ID>
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
              </STATICVARIABLES>
              <TDL>
                <TDLMESSAGE>
                  <COLLECTION NAME="AllGroupsCollection">
                    <TYPE>Group</TYPE>
                    <FETCH>Name, Parent, ClosingBalance, IsAddable</FETCH>
                  </COLLECTION>
                </TDLMESSAGE>
              </TDL>
            </DESC>
          </BODY>
        </ENVELOPE>
      `.trim();

      const responseXml = await sendTallyRequest(tallyUrl, xmlPayload);
      const groupBlocks = parseXmlBlocks(responseXml, 'GROUP');

      if (groupBlocks.length > 0) {
        const parsedGroups = groupBlocks.map((block) => {
          const name = parseXmlTag(block, 'NAME');
          const parent = parseXmlTag(block, 'PARENT');
          const rawClosing = parseFloat(parseXmlTag(block, 'CLOSINGBALANCE') || '0');
          const balanceParsed = parseTallyBalance(rawClosing);

          return {
            name,
            parent,
            amount: balanceParsed.amount,
            balanceType: balanceParsed.type
          };
        }).filter((g) => g.name && g.amount > 0);

        return computeBalanceSheet({
          companyName: companyName || status.activeCompany || 'Active Tally Company',
          asOfDate,
          financialYear: options.financialYear || '2025-26',
          groups: parsedGroups,
          source: 'tally-live'
        });
      }
    } catch (e) {
      console.warn('[Tally Service] Error fetching live balance sheet:', e.message);
      if (!options.allowSimulation && !options.isDemoMode && process.env.NODE_ENV !== 'test') {
        throw new Error(`Unable to generate report: financial data retrieval from Tally Prime failed (${e.message}).`);
      }
    }
  }

  // Tally is offline: only return synthetic fixture when permitted
  const isTestRunner = Boolean(
    process.execArgv.includes('--test') ||
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test'
  );
  const isAllowedSimulation = options.allowSimulation === false
    ? false
    : Boolean(options.allowSimulation || options.isDemoMode || isTestRunner);

  if (isAllowedSimulation) {
    const synthetic = getSyntheticBalanceSheetData();
    return computeBalanceSheet({
      companyName: companyName || synthetic.companyName,
      asOfDate: options.asOfDate || synthetic.asOfDate,
      financialYear: options.financialYear || synthetic.financialYear,
      groups: synthetic.groups,
      closingStock: synthetic.closingStock,
      netProfitLoss: synthetic.netProfitLoss,
      source: 'DEMO / SYNTHETIC - NOT LIVE'
    });
  }

  throw new Error(`Unable to generate report: financial data is unavailable. Tally Prime XML server is not connected at ${tallyUrl}.`);
};

module.exports = {
  checkTallyStatus,
  getCompanyInfo,
  getCustomerLedgers,
  getLedgerVouchers,
  getBalanceSheetData,
  sendTallyRequest,
  parseXmlTag,
  parseXmlBlocks,
  formatTallyDate
};
