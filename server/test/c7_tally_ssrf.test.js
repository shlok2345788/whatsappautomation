const test = require('node:test');
const assert = require('node:assert/strict');
const tallyController = require('../controllers/tallyController');
const tallyService = require('../services/tally/tallyService');
const { supabase } = require('../services/supabaseClient');

test('C7 — Eliminate SSRF in Tally Integration Suite', async (t) => {
  const createMockRes = () => {
    let statusCode = 200;
    let jsonBody = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (body) => {
        jsonBody = body;
        return res;
      },
      getStatus: () => statusCode,
      getBody: () => jsonBody
    };

    return res;
  };

  const tenantA = 'tenant_ssrf_a_' + Date.now();
  const tenantB = 'tenant_ssrf_b_' + Date.now();

  await t.test('1. Submitting arbitrary tallyUrl to GET /api/tally/status is rejected with HTTP 400', async () => {
    const maliciousUrls = [
      'http://169.254.169.254/latest/meta-data',
      'http://127.0.0.1:22',
      'http://192.168.1.50:8080',
      'http://attacker-controlled-c2.com/tally'
    ];

    for (const evilUrl of maliciousUrls) {
      const res = createMockRes();
      const req = {
        companyId: tenantA,
        query: { tallyUrl: evilUrl }
      };

      await tallyController.getTallyStatus(req, res, () => {});

      assert.strictEqual(
        res.getStatus(),
        400,
        `Expected HTTP 400 when submitting malicious tallyUrl: ${evilUrl}`
      );
      assert.match(
        res.getBody()?.error || '',
        /arbitrary destination URLs \(tallyUrl\) is prohibited/i
      );
    }
  });

  await t.test('2. Submitting tallyUrl in POST request bodies is strictly blocked', async () => {
    const res = createMockRes();
    const req = {
      companyId: tenantA,
      body: { tallyUrl: 'http://internal-vault:8200' },
      query: {}
    };

    await tallyController.getLedgers(req, res, () => {});

    assert.strictEqual(res.getStatus(), 400);
    assert.match(
      res.getBody()?.error || '',
      /arbitrary destination URLs/i
    );
  });

  await t.test('3. tallyService.sendTallyRequest rejects non-loopback and cloud metadata hosts with SSRF Blocked', async () => {
    const forbiddenUrls = [
      'http://169.254.169.254/latest/meta-data',
      'http://metadata.google.internal',
      'http://10.0.0.1:9000',
      'http://api.attacker.com:9000'
    ];

    for (const url of forbiddenUrls) {
      await assert.rejects(
        async () => {
          await tallyService.sendTallyRequest(url, '<ENVELOPE></ENVELOPE>');
        },
        /SSRF Blocked/i,
        `Must block SSRF request to ${url}`
      );
    }
  });

  await t.test('4. Authorized connector upload works via authenticated API key', async () => {
    // 1. Generate connector key for Tenant A
    const genRes = createMockRes();
    await tallyController.generateConnectorKey(
      { companyId: tenantA, body: { name: 'HQ Windows Connector' } },
      genRes,
      () => {}
    );

    assert.strictEqual(genRes.getStatus(), 201);
    const apiKey = genRes.getBody()?.apiKey;
    assert.ok(apiKey && apiKey.startsWith('conn_'), 'API key must be generated with conn_ prefix');

    // 2. Connector uploads validated ledgers over HTTPS
    const uploadRes = createMockRes();
    const uploadReq = {
      headers: { 'x-connector-key': apiKey },
      body: {
        companyName: 'Acme Chemicals Ltd',
        statementPeriod: '01-Apr-2025 to 31-Mar-2026',
        fromDate: '20250401',
        toDate: '20260331',
        ledgers: [
          {
            name: 'Delta Distributions',
            mobile: '919876543210',
            openingBalance: 5000,
            openingBalanceType: 'Dr',
            closingBalance: 15000,
            balanceType: 'Dr',
            transactions: [
              { date: '10-May-2025', voucherNo: 'INV-101', type: 'Sales', debit: 10000, credit: 0 }
            ]
          }
        ]
      }
    };

    await tallyController.uploadConnectorData(uploadReq, uploadRes, (err) => {
      if (err) throw err;
    });

    assert.strictEqual(uploadRes.getStatus(), 201);
    assert.strictEqual(uploadRes.getBody()?.success, true);
    assert.strictEqual(uploadRes.getBody()?.totalLedgers, 1);
    assert.strictEqual(uploadRes.getBody()?.reconciledCount, 1);

    // 3. Verify ledger run is preserved in database
    const { data: run } = await supabase
      .from('tally_ledger_runs')
      .select('*')
      .eq('company_id', tenantA)
      .single();

    assert.ok(run, 'Ledger run must be recorded in tally_ledger_runs');
    assert.strictEqual(run.companyName, 'Acme Chemicals Ltd');

    // 4. Verify ledgers can be retrieved by tenant
    const getRes = createMockRes();
    await tallyController.getLedgers(
      { companyId: tenantA, query: {} },
      getRes,
      () => {}
    );

    assert.strictEqual(getRes.getStatus(), 200);
    assert.strictEqual(getRes.getBody()?.count, 1);
    assert.strictEqual(getRes.getBody()?.ledgers[0].name, 'Delta Distributions');
    assert.strictEqual(getRes.getBody()?.ledgers[0].source, 'tally-connector');
  });

  await t.test('5. Connector upload with invalid or revoked key is rejected with HTTP 401', async () => {
    // With fake key
    const res1 = createMockRes();
    await tallyController.uploadConnectorData(
      { headers: { 'x-connector-key': 'conn_fake_key_1234567890' }, body: {} },
      res1,
      () => {}
    );
    assert.strictEqual(res1.getStatus(), 401);
    assert.match(res1.getBody()?.error || '', /Invalid or revoked connector API key/i);

    // With revoked key
    const genRes = createMockRes();
    await tallyController.generateConnectorKey(
      { companyId: tenantB, body: { name: 'Revoke Test Key' } },
      genRes,
      () => {}
    );
    const keyToRevoke = genRes.getBody()?.apiKey;
    const credId = genRes.getBody()?.credentialId;

    // Revoke it
    const revokeRes = createMockRes();
    await tallyController.revokeConnectorKey(
      { companyId: tenantB, body: { credentialId: credId } },
      revokeRes,
      () => {}
    );
    assert.strictEqual(revokeRes.getStatus(), 200);

    // Attempt upload with revoked key
    const uploadRes = createMockRes();
    await tallyController.uploadConnectorData(
      { headers: { 'x-connector-key': keyToRevoke }, body: { companyName: 'Corp B', ledgers: [{ name: 'A' }] } },
      uploadRes,
      () => {}
    );
    assert.strictEqual(uploadRes.getStatus(), 401);
  });

  await t.test('6. One tenant cannot view or alter another tenant connector data', async () => {
    // Tenant B queries ledgers; should NOT see Tenant A's 'Delta Distributions'
    const res = createMockRes();
    await tallyController.getLedgers(
      { companyId: tenantB, query: { isDemoMode: 'false' } },
      res,
      () => {}
    );

    const ledgers = res.getBody()?.ledgers || [];
    const hasTenantALedger = ledgers.some((l) => l.name === 'Delta Distributions');
    assert.strictEqual(hasTenantALedger, false, 'Tenant B must not see Tenant A ledger records');
  });
});
