const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const gupshupService = require('../services/whatsapp/gupshupService');
const messagingProvider = require('../services/messaging/messagingProvider');
const { supabase } = require('../services/supabaseClient');
const { encrypt } = require('../services/security/encryptionService');

test('D5 — Tenant Sender Isolation & Removal of Default Sender Fallback Suite', async (t) => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const tempTestDir = path.join(uploadsDir, 'pdfs', 'tenant_d5_isolation');
  fs.mkdirSync(tempTestDir, { recursive: true });

  const dummyPdf = path.join(tempTestDir, 'd5_sample.pdf');
  fs.writeFileSync(dummyPdf, '%PDF-1.4 D5 Isolation Test Document');

  // Set global environment variables to verify they are NEVER used as fallbacks for tenants
  const prevEnvSource = process.env.GUPSHUP_SOURCE_PHONE;
  const prevEnvKey = process.env.GUPSHUP_API_KEY;
  const prevEnvApp = process.env.GUPSHUP_APP_NAME;

  process.env.GUPSHUP_SOURCE_PHONE = '919999999999';
  process.env.GUPSHUP_API_KEY = 'global_fallback_secret_key';
  process.env.GUPSHUP_APP_NAME = 'GlobalFallbackApp';

  t.after(() => {
    try {
      if (fs.existsSync(dummyPdf)) fs.unlinkSync(dummyPdf);
      if (fs.existsSync(tempTestDir)) fs.rmdirSync(tempTestDir);
      process.env.GUPSHUP_SOURCE_PHONE = prevEnvSource;
      process.env.GUPSHUP_API_KEY = prevEnvKey;
      process.env.GUPSHUP_APP_NAME = prevEnvApp;
    } catch (e) {}
  });

  await t.test('1. Tenant without a configured sender cannot send and does NOT fall back to global env sender', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATION_MODE = 'false';

    const unconfiguredTenant = 'tenant_unconfigured_' + Date.now();

    // Check credentials resolution
    const creds = await gupshupService.getCredentials(unconfiguredTenant);
    assert.strictEqual(creds.sourcePhone, '', 'Must not fall back to global GUPSHUP_SOURCE_PHONE');
    assert.strictEqual(creds.apiKey, '', 'Must not fall back to global GUPSHUP_API_KEY');
    assert.strictEqual(creds.appName, '', 'Must not fall back to global GUPSHUP_APP_NAME');

    // Check connection state
    const conn = await messagingProvider.checkConnection(unconfiguredTenant);
    assert.strictEqual(conn.status, 'NOT_CONFIGURED');
    assert.strictEqual(conn.senderPhone, '', 'Connection status must report empty senderPhone');

    // Attempting to send without configured sender must fail with actionable error
    await assert.rejects(
      async () => {
        await gupshupService.sendPdfDocument(
          unconfiguredTenant,
          '919876543210',
          dummyPdf,
          'd5_sample.pdf'
        );
      },
      /Gupshup credentials are missing or incomplete/i
    );
  });

  await t.test('2. Multiple tenants send strictly from their own configured business numbers', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATION_MODE = 'false';

    const tenantA = 'tenant_A_' + Date.now();
    const tenantB = 'tenant_B_' + Date.now();

    // Setup Tenant A settings
    await supabase.from('settings').upsert({
      company_id: tenantA,
      gupshupAppName: 'BusinessAppAlpha',
      gupshupApiKey: encrypt('api_key_alpha_123'),
      gupshupSourcePhone: '919811111111'
    });

    // Setup Tenant B settings
    await supabase.from('settings').upsert({
      company_id: tenantB,
      gupshupAppName: 'BusinessAppBeta',
      gupshupApiKey: encrypt('api_key_beta_456'),
      gupshupSourcePhone: '919822222222'
    });

    // Intercept fetch dispatches to verify wire payload
    const originalFetch = global.fetch;
    const sentDispatches = [];

    global.fetch = async (url, options) => {
      const params = new URLSearchParams(options.body);
      sentDispatches.push({
        url,
        apiKey: options.headers['apikey'],
        source: params.get('source'),
        srcName: params.get('src.name'),
        destination: params.get('destination')
      });

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'submitted', messageId: 'msg_' + Date.now() })
      };
    };

    try {
      // Send as Tenant A
      const resA = await gupshupService.sendPdfDocument(tenantA, '919876543210', dummyPdf, 'd5_sample.pdf');
      assert.strictEqual(resA.success, true);

      // Send as Tenant B
      const resB = await gupshupService.sendPdfDocument(tenantB, '919876543210', dummyPdf, 'd5_sample.pdf');
      assert.strictEqual(resB.success, true);

      assert.strictEqual(sentDispatches.length, 2);

      // Verify Tenant A dispatch details
      assert.strictEqual(sentDispatches[0].source, '919811111111', 'Tenant A must send from 919811111111');
      assert.strictEqual(sentDispatches[0].srcName, 'BusinessAppAlpha');
      assert.strictEqual(sentDispatches[0].apiKey, 'api_key_alpha_123');

      // Verify Tenant B dispatch details
      assert.strictEqual(sentDispatches[1].source, '919822222222', 'Tenant B must send from 919822222222');
      assert.strictEqual(sentDispatches[1].srcName, 'BusinessAppBeta');
      assert.strictEqual(sentDispatches[1].apiKey, 'api_key_beta_456');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('3. Changing tenant ID cannot access or use another tenant credentials', async () => {
    const victimTenant = 'tenant_victim_' + Date.now();
    const attackerTenant = 'tenant_attacker_' + Date.now();

    await supabase.from('settings').upsert({
      company_id: victimTenant,
      gupshupAppName: 'VictimEnterprise',
      gupshupApiKey: encrypt('victim_secret_key_789'),
      gupshupSourcePhone: '919899999999'
    });

    // Attacker has no settings configured
    const attackerCreds = await gupshupService.getCredentials(attackerTenant);
    assert.strictEqual(attackerCreds.sourcePhone, '');
    assert.strictEqual(attackerCreds.apiKey, '');
    assert.strictEqual(attackerCreds.appName, '');
    assert.notStrictEqual(attackerCreds.sourcePhone, '919899999999');
  });

  await t.test('4. Corrupted or invalid encrypted credentials produce safe configuration error without leaks', async () => {
    const corruptTenant = 'tenant_corrupt_' + Date.now();

    // Store tampered ciphertext
    await supabase.from('settings').upsert({
      company_id: corruptTenant,
      gupshupAppName: 'CorruptApp',
      gupshupApiKey: 'enc:v1:0123456789abcdef:badtag:badciphertext',
      gupshupSourcePhone: '919877777777'
    });

    const creds = await gupshupService.getCredentials(corruptTenant);
    assert.strictEqual(creds.apiKey, '', 'Corrupted ciphertext must result in empty key, not crash');

    const conn = await messagingProvider.checkConnection(corruptTenant);
    assert.strictEqual(conn.status, 'CONFIG_REQUIRED');
  });
});
