const test = require('node:test');
const assert = require('node:assert/strict');
const { supabase } = require('../services/supabaseClient');
const { getHistory } = require('../controllers/historyController');

test('C3 — Eliminate SQL Injection in History Search', async (t) => {
  const companyA = 'sqli_tenant_A_' + Date.now();
  const companyB = 'sqli_tenant_B_' + Date.now();
  const now = new Date().toISOString();

  t.before(async () => {
    // Populate logs for Company A
    await supabase.from('message_logs').insert([
      {
        company_id: companyA,
        contactName: 'Alice Sharma',
        phone: '919876543210',
        pdfFilename: 'Alice_Statement.pdf',
        pdfPath: '/uploads/Alice_Statement.pdf',
        status: 'Sent',
        createdAt: now
      },
      {
        company_id: companyA,
        contactName: 'Bob Patel',
        phone: '919811223344',
        pdfFilename: 'Bob_Ledger.pdf',
        pdfPath: '/uploads/Bob_Ledger.pdf',
        status: 'Failed',
        createdAt: now
      }
    ]);

    // Populate confidential logs for Company B (must NEVER be exposed to Company A)
    await supabase.from('message_logs').insert([
      {
        company_id: companyB,
        contactName: 'Secret Corporate Customer',
        phone: '919000000000',
        pdfFilename: 'Confidential_Audit_Report.pdf',
        pdfPath: '/uploads/Confidential_Audit_Report.pdf',
        status: 'Sent',
        createdAt: now
      }
    ]);
  });

  t.after(async () => {
    await supabase.from('message_logs').delete().eq('company_id', companyA);
    await supabase.from('message_logs').delete().eq('company_id', companyB);
  });

  const runSearch = async (searchParam, companyId = companyA) => {
    let responseData = null;
    let statusCode = 200;

    const req = {
      companyId,
      query: { search: searchParam, page: 1, limit: 50 }
    };

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        responseData = data;
        return res;
      }
    };

    await getHistory(req, res, (err) => {
      if (err) throw err;
    });

    return { statusCode, data: responseData };
  };

  await t.test('1. Malicious SQL quotes and keywords cannot bypass tenant isolation or alter query structure', async () => {
    // Attack payloads attempting SQL injection or tenant bypass
    const injectionPayloads = [
      `' OR '1'='1`,
      `' OR company_id='${companyB}' --`,
      `') OR (1=1) --`,
      `Alice' UNION SELECT * FROM message_logs --`,
      `' AND 1=0 UNION ALL SELECT 1, 'hacked', '000', 'hacked.pdf', '', '', '', 'Sent', '', '', '' --`
    ];

    for (const payload of injectionPayloads) {
      const result = await runSearch(payload);
      assert.strictEqual(result.statusCode, 200);

      // Verify that Company B's confidential records are NEVER returned
      const leaked = (result.data.logs || []).filter((log) => log.company_id === companyB || log.contactName.includes('Secret Corporate'));
      assert.strictEqual(
        leaked.length,
        0,
        `SQL injection payload '${payload}' must not leak cross-tenant records`
      );
    }
  });

  await t.test('2. Commas and filter operators in search string do not cause query corruption or crash', async () => {
    const operatorPayloads = [
      `Sharma,Patel`,
      `contactName.eq.Secret,phone.ilike.%9000%`,
      `Alice,status.eq.Sent`,
      `.,.,.,.,.,`,
      `test.ilike.something`,
      `a.b.c.d.e`
    ];

    for (const payload of operatorPayloads) {
      const result = await runSearch(payload);
      assert.strictEqual(result.statusCode, 200);
      assert.ok(Array.isArray(result.data.logs));

      // Must never return tenant B
      const leaked = (result.data.logs || []).filter((log) => log.company_id === companyB);
      assert.strictEqual(leaked.length, 0);
    }
  });

  await t.test('3. Wildcards and malformed search expressions are handled safely', async () => {
    const wildcardPayloads = [
      `%`,
      `%%%%`,
      `_`,
      `[a-z]`,
      `\\`,
      `*`,
      `?`
    ];

    for (const payload of wildcardPayloads) {
      const result = await runSearch(payload);
      assert.strictEqual(result.statusCode, 200);
      assert.ok(Array.isArray(result.data.logs));

      const leaked = (result.data.logs || []).filter((log) => log.company_id === companyB);
      assert.strictEqual(leaked.length, 0);
    }
  });

  await t.test('4. Unicode and legitimate customer searches work accurately', async () => {
    // Search for Alice
    const resAlice = await runSearch('Alice');
    assert.strictEqual(resAlice.statusCode, 200);
    assert.strictEqual(resAlice.data.logs.length, 1);
    assert.strictEqual(resAlice.data.logs[0].contactName, 'Alice Sharma');

    // Search by phone number
    const resPhone = await runSearch('981122');
    assert.strictEqual(resPhone.statusCode, 200);
    assert.strictEqual(resPhone.data.logs.length, 1);
    assert.strictEqual(resPhone.data.logs[0].contactName, 'Bob Patel');

    // Search by filename
    const resFile = await runSearch('Alice_Statement');
    assert.strictEqual(resFile.statusCode, 200);
    assert.strictEqual(resFile.data.logs.length, 1);
    assert.strictEqual(resFile.data.logs[0].pdfFilename, 'Alice_Statement.pdf');

    // Search with non-matching term
    const resNone = await runSearch('NonExistentCustomerNameXYZ');
    assert.strictEqual(resNone.statusCode, 200);
    assert.strictEqual(resNone.data.logs.length, 0);
  });

  await t.test('5. Excessively long search inputs are bounded and sanitized', async () => {
    const longInput = 'A'.repeat(5000);
    const result = await runSearch(longInput);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.data.logs.length, 0);
  });
});
