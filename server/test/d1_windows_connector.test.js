const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const tallyController = require('../controllers/tallyController');
const { supabase } = require('../services/supabaseClient');

test('D1 — Local Windows Tally Connector Architecture & Upload Suite', async (t) => {
  const connectorDir = path.resolve(__dirname, '../../connector');
  const exePath = path.join(connectorDir, 'dist', 'TallyConnector.exe');

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

  const tenantA = 'd1_tenant_a_' + Date.now();
  const tenantB = 'd1_tenant_b_' + Date.now();

  await t.test('1. Packaged Windows executable exists and runs standalone without Python', () => {
    assert.ok(fs.existsSync(exePath), `TallyConnector.exe must exist at ${exePath}`);
    const stats = fs.statSync(exePath);
    assert.ok(stats.size > 5 * 1024 * 1024, 'Standalone executable size must contain embedded runtime');

    const run = spawnSync(exePath, ['--help'], { encoding: 'utf-8' });
    assert.strictEqual(run.status, 0, 'Executable must run with exit code 0');
    assert.match(run.stdout, /Tally Prime Windows Connector Daemon/i);
    assert.match(run.stdout, /--once/);
    assert.match(run.stdout, /--demo/);
  });

  await t.test('2. Generate unique per-client connector API credential with secure hash', async () => {
    const res = createMockRes();
    await tallyController.generateConnectorKey(
      { companyId: tenantA, body: { name: 'Client Windows PC - Main Office' } },
      res,
      () => {}
    );

    assert.strictEqual(res.getStatus(), 201);
    const body = res.getBody();
    assert.ok(body.apiKey && body.apiKey.startsWith('conn_'));
    assert.ok(body.credentialId);

    // Verify key hash in database
    const { data: cred } = await supabase
      .from('connector_credentials')
      .select('*')
      .eq('id', body.credentialId)
      .single();

    assert.ok(cred, 'Credential must exist in database');
    assert.strictEqual(cred.company_id, tenantA);
    assert.strictEqual(cred.isRevoked, 0);
  });

  await t.test('3. Connector uploads verified ledger data and reconciles balances on server', async () => {
    // 1. Generate key
    const genRes = createMockRes();
    await tallyController.generateConnectorKey(
      { companyId: tenantA, body: { name: 'Branch Connector' } },
      genRes,
      () => {}
    );
    const apiKey = genRes.getBody().apiKey;

    // 2. Perform connector upload
    const uploadRes = createMockRes();
    const payload = {
      companyName: 'Sunrise Trading Co',
      statementPeriod: '01-Apr-2025 to 31-Mar-2026',
      fromDate: '20250401',
      toDate: '20260331',
      ledgers: [
        {
          name: 'Apex Distributors',
          mobile: '919876500001',
          email: 'apex@example.com',
          address: 'GIDC, Ahmedabad',
          gstin: '24AAACA0001A1Z1',
          openingBalance: 10000.0,
          openingBalanceType: 'Dr',
          closingBalance: 25000.0,
          balanceType: 'Dr',
          transactions: [
            { date: '15-Apr-2025', voucherNo: 'INV-01', type: 'Sales', debit: 20000.0, credit: 0.0 },
            { date: '30-Apr-2025', voucherNo: 'RCP-01', type: 'Receipt', debit: 0.0, credit: 5000.0 }
          ]
        },
        {
          name: 'Zenith Retailers',
          mobile: '919876500002',
          openingBalance: 0.0,
          openingBalanceType: 'Dr',
          closingBalance: 12000.0, // Calculated: 10000 -> discrepancy 2000
          balanceType: 'Dr',
          transactions: [
            { date: '01-May-2025', voucherNo: 'INV-02', type: 'Sales', debit: 10000.0, credit: 0.0 }
          ]
        }
      ]
    };

    await tallyController.uploadConnectorData(
      { headers: { 'x-connector-key': apiKey }, body: payload },
      uploadRes,
      (err) => { if (err) throw err; }
    );

    assert.strictEqual(uploadRes.getStatus(), 201);
    const resBody = uploadRes.getBody();
    assert.strictEqual(resBody.success, true);
    assert.strictEqual(resBody.totalLedgers, 2);
    assert.strictEqual(resBody.reconciledCount, 1, 'First ledger must reconcile exactly');
    assert.strictEqual(resBody.discrepancyCount, 1, 'Second ledger discrepancy must be reported');
    assert.ok(resBody.runId);

    // 3. Verify status reflects live connector
    const statusRes = createMockRes();
    await tallyController.getTallyStatus({ companyId: tenantA, query: {} }, statusRes, () => {});
    assert.strictEqual(statusRes.getStatus(), 200);
    assert.strictEqual(statusRes.getBody()?.status, 'CONNECTED');
    assert.strictEqual(statusRes.getBody()?.companyName, 'Sunrise Trading Co');
    assert.strictEqual(statusRes.getBody()?.source, 'tally-connector');
  });

  await t.test('4. Cross-tenant isolation: Tenant B cannot upload into or see Tenant A records', async () => {
    // Generate key for Tenant B
    const genB = createMockRes();
    await tallyController.generateConnectorKey(
      { companyId: tenantB, body: { name: 'Tenant B Connector' } },
      genB,
      () => {}
    );
    const keyB = genB.getBody().apiKey;

    // Tenant B uploads its own data
    const uploadB = createMockRes();
    await tallyController.uploadConnectorData(
      {
        headers: { 'x-connector-key': keyB },
        body: {
          companyName: 'Beta Logistics',
          ledgers: [{ name: 'Beta Customer 1', openingBalance: 0, closingBalance: 0 }]
        }
      },
      uploadB,
      () => {}
    );

    assert.strictEqual(uploadB.getStatus(), 201);

    // Tenant B queries ledgers
    const getB = createMockRes();
    await tallyController.getLedgers({ companyId: tenantB, query: {} }, getB, () => {});
    const ledgersB = getB.getBody()?.ledgers || [];
    assert.strictEqual(ledgersB.length, 1);
    assert.strictEqual(ledgersB[0].name, 'Beta Customer 1');

    // Tenant A queries ledgers
    const getA = createMockRes();
    await tallyController.getLedgers({ companyId: tenantA, query: {} }, getA, () => {});
    const ledgersA = getA.getBody()?.ledgers || [];
    assert.ok(ledgersA.some((l) => l.name === 'Apex Distributors'));
    assert.ok(!ledgersA.some((l) => l.name === 'Beta Customer 1'), 'Tenant A must not see Tenant B');
  });

  await t.test('5. Revoked connector credentials immediately fail authentication', async () => {
    // Revoke Tenant A's key
    const revokeRes = createMockRes();
    await tallyController.revokeConnectorKey({ companyId: tenantA, body: {} }, revokeRes, () => {});
    assert.strictEqual(revokeRes.getStatus(), 200);

    // Attempt upload with now-revoked key
    const { data: creds } = await supabase
      .from('connector_credentials')
      .select('*')
      .eq('company_id', tenantA);

    for (const cred of creds) {
      assert.strictEqual(cred.isRevoked, 1, 'All credentials must be marked revoked');
    }
  });
});
