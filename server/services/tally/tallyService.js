const http = require('http');
const url = require('url');

/**
 * Parses basic XML tags from Tally XML responses without heavy native dependencies.
 */
const parseXmlTag = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
};

/**
 * Extracts all matching XML blocks for repeated elements (e.g., <LEDGER>...</LEDGER>).
 */
const parseXmlBlocks = (xml, blockTag) => {
  const blocks = [];
  const regex = new RegExp(`<${blockTag}[^>]*>([\\s\\S]*?)<\\/${blockTag}>`, 'gi');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
};

/**
 * Sends a raw XML request to Tally Prime's XML Server.
 */
const sendTallyRequest = async (tallyUrl, xmlPayload, timeoutMs = 4000) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(tallyUrl || 'http://localhost:9000');
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
 * Checks connection to Tally Prime XML server.
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
    const companyNames = parseXmlBlocks(responseXml, 'COMPANY').map((c) => parseXmlTag(c, 'NAME')).filter(Boolean);

    return {
      connected: true,
      tallyUrl,
      companies: companyNames.length > 0 ? companyNames : ['Default Tally Company'],
      mode: 'live'
    };
  } catch (err) {
    // Tally not running locally or unreachable
    return {
      connected: false,
      tallyUrl,
      error: err.message,
      mode: 'simulation-available'
    };
  }
};

/**
 * Fetches customer ledgers (Sundry Debtors) from Tally Prime or returns high-fidelity simulated test ledgers.
 */
const getCustomerLedgers = async (options = {}) => {
  const tallyUrl = options.tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
  const companyName = options.companyName || process.env.TALLY_COMPANY_NAME || '';

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
                    <FETCH>Name, ClosingBalance, LedgerMobile, LedgerPhone, Email, FullAddress</FETCH>
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
        return ledgerBlocks.map((block) => {
          const name = parseXmlTag(block, 'NAME');
          const mobile = parseXmlTag(block, 'LEDGERMOBILE') || parseXmlTag(block, 'LEDGERPHONE') || '';
          const closingBalance = parseFloat(parseXmlTag(block, 'CLOSINGBALANCE') || '0');
          const email = parseXmlTag(block, 'EMAIL') || '';
          const address = parseXmlTag(block, 'FULLADDRESS') || '';

          return {
            name,
            mobile,
            closingBalance: Math.abs(closingBalance),
            balanceType: closingBalance < 0 ? 'Dr' : 'Cr',
            email,
            address,
            source: 'tally-live'
          };
        }).filter((l) => l.name);
      }
    } catch (e) {
      console.warn('[Tally Service] Error fetching live ledgers, falling back to simulated data:', e.message);
    }
  }

  // Realistic simulated ledgers when Tally Prime is offline
  return [
    {
      name: 'Rajesh Enterprises',
      mobile: '919876543210',
      closingBalance: 45200.00,
      balanceType: 'Dr',
      email: 'rajesh@rajesh-ent.com',
      address: 'Shop 12, Commercial Market, Mumbai',
      statementPeriod: '01-Apr-2025 to 31-Mar-2026',
      source: 'simulation',
      transactions: [
        { date: '10-Feb-2026', voucherNo: 'INV-1042', type: 'Sales', debit: 25000.00, credit: 0, balance: 25000.00 },
        { date: '18-Feb-2026', voucherNo: 'RCP-502', type: 'Receipt', debit: 0, credit: 15000.00, balance: 10000.00 },
        { date: '28-Feb-2026', voucherNo: 'INV-1108', type: 'Sales', debit: 35200.00, credit: 0, balance: 45200.00 },
      ]
    },
    {
      name: 'Metro Hardware Store',
      mobile: '919812345678',
      closingBalance: 82500.50,
      balanceType: 'Dr',
      email: 'accounts@metrohardware.in',
      address: 'Plot 45, Industrial Area, Pune',
      statementPeriod: '01-Apr-2025 to 31-Mar-2026',
      source: 'simulation',
      transactions: [
        { date: '05-Jan-2026', voucherNo: 'INV-0980', type: 'Sales', debit: 60000.00, credit: 0, balance: 60000.00 },
        { date: '22-Jan-2026', voucherNo: 'RCP-489', type: 'Receipt', debit: 0, credit: 20000.00, balance: 40000.00 },
        { date: '15-Feb-2026', voucherNo: 'INV-1065', type: 'Sales', debit: 42500.50, credit: 0, balance: 82500.50 },
      ]
    },
    {
      name: 'Sharma Trading Co.',
      mobile: '919899887766',
      closingBalance: 19800.00,
      balanceType: 'Dr',
      email: 'sharma.trading@gmail.com',
      address: 'B-4, Wholesale Ring Road, Delhi',
      statementPeriod: '01-Apr-2025 to 31-Mar-2026',
      source: 'simulation',
      transactions: [
        { date: '12-Feb-2026', voucherNo: 'INV-1055', type: 'Sales', debit: 19800.00, credit: 0, balance: 19800.00 },
      ]
    }
  ];
};

module.exports = {
  checkTallyStatus,
  getCustomerLedgers,
  sendTallyRequest,
  parseXmlTag,
  parseXmlBlocks
};
