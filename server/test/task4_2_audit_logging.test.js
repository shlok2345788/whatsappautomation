const test = require('node:test');
const assert = require('node:assert/strict');
const {
  recordAuditLog,
  getAuditLogs,
  AUDIT_CATEGORIES
} = require('../services/audit/auditLogService');
const { getAuditLogsHandler, getAuditCategoriesHandler } = require('../controllers/auditController');

test('Task 4.2 — Immutable Audit Logging Suite', async (t) => {
  const tenantA = 'tenant_audit_a_' + Date.now();
  const tenantB = 'tenant_audit_b_' + Date.now();

  await t.test('1. recordAuditLog creates entry and automatically sanitizes secrets', () => {
    const entry = recordAuditLog({
      companyId: tenantA,
      userId: 'user_analyst_1',
      action: 'CREDENTIALS_UPDATE',
      category: AUDIT_CATEGORIES.SETTINGS,
      details: {
        provider: 'gupshup',
        gupshupApiKey: 'super_secret_raw_api_key_12345',
        password: 'cleartext_password_abc',
        appName: 'AcmeApp'
      },
      ipAddress: '192.168.1.50',
      userAgent: 'Mozilla/5.0'
    });

    assert.ok(entry.id, 'Entry ID must be returned');
    assert.equal(entry.companyId, tenantA);
    assert.equal(entry.category, 'SETTINGS');
    assert.equal(entry.details.gupshupApiKey, '[REDACTED]', 'API key must be redacted in audit details');
    assert.equal(entry.details.password, '[REDACTED]', 'Password must be redacted in audit details');
    assert.equal(entry.details.appName, 'AcmeApp', 'Non-sensitive fields must remain intact');
  });

  await t.test('2. getAuditLogs retrieves entries scoped to companyId', () => {
    // Record another event for Tenant A
    recordAuditLog({
      companyId: tenantA,
      userId: 'user_analyst_1',
      action: 'QUEUE_DISPATCH_STARTED',
      category: AUDIT_CATEGORIES.DISPATCH,
      details: { batchId: 42, count: 10 }
    });

    // Record an event for Tenant B
    recordAuditLog({
      companyId: tenantB,
      userId: 'user_tenant_b',
      action: 'TALLY_LEDGER_UPLOAD',
      category: AUDIT_CATEGORIES.TALLY_SYNC,
      details: { ledgerCount: 15 }
    });

    const tenantALogs = getAuditLogs({ companyId: tenantA });
    assert.equal(tenantALogs.total, 2, 'Tenant A must have 2 audit logs');

    const actions = tenantALogs.logs.map((l) => l.action);
    assert.ok(actions.includes('CREDENTIALS_UPDATE'));
    assert.ok(actions.includes('QUEUE_DISPATCH_STARTED'));
    assert.equal(actions.includes('TALLY_LEDGER_UPLOAD'), false, 'Tenant A must not see Tenant B event');
  });

  await t.test('3. Filtering by category and action returns specific subsets', () => {
    const dispatchOnly = getAuditLogs({
      companyId: tenantA,
      category: AUDIT_CATEGORIES.DISPATCH
    });

    assert.equal(dispatchOnly.total, 1);
    assert.equal(dispatchOnly.logs[0].action, 'QUEUE_DISPATCH_STARTED');

    const settingsOnly = getAuditLogs({
      companyId: tenantA,
      action: 'CREDENTIALS_UPDATE'
    });

    assert.equal(settingsOnly.total, 1);
    assert.equal(settingsOnly.logs[0].category, 'SETTINGS');
  });

  await t.test('4. Date range filtering narrows audit queries', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();

    const inRange = getAuditLogs({
      companyId: tenantA,
      startDate: yesterday,
      endDate: future
    });
    assert.equal(inRange.total, 2);

    const oldRange = getAuditLogs({
      companyId: tenantA,
      endDate: yesterday
    });
    assert.equal(oldRange.total, 0);
  });

  await t.test('5. Read-only audit log immutability: no update or delete functions exported', () => {
    const auditService = require('../services/audit/auditLogService');
    assert.equal(auditService.deleteAuditLog, undefined, 'deleteAuditLog must not exist');
    assert.equal(auditService.updateAuditLog, undefined, 'updateAuditLog must not exist');
    assert.equal(auditService.clearAuditLogs, undefined, 'clearAuditLogs must not exist');
  });

  await t.test('6. Controller endpoints return HTTP 200 with formatted audit entries and categories', async () => {
    const req = {
      companyId: tenantA,
      query: { category: 'DISPATCH' }
    };
    let statusCode = 200;
    let jsonBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { jsonBody = data; return this; }
    };

    await getAuditLogsHandler(req, res, () => {});
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.total, 1);
    assert.equal(jsonBody.logs[0].action, 'QUEUE_DISPATCH_STARTED');

    let catBody = null;
    const catRes = {
      json(data) { catBody = data; return this; }
    };
    await getAuditCategoriesHandler({}, catRes, () => {});
    assert.ok(catBody.categories.includes('AUTH'));
    assert.ok(catBody.categories.includes('SETTINGS'));
    assert.ok(catBody.categories.includes('APPROVAL'));
  });
});
