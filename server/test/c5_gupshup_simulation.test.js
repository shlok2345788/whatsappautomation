const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const gupshupService = require('../services/whatsapp/gupshupService');
const { supabase } = require('../services/supabaseClient');

test('C5 — Prevent Fake Successful Gupshup Sends Suite', async (t) => {
  const originalEnv = { ...process.env };
  const tempPdf = path.join(__dirname, `temp_c5_test_${Date.now()}.pdf`);
  fs.writeFileSync(tempPdf, '%PDF-1.4 test dummy PDF');

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  t.after(() => {
    if (fs.existsSync(tempPdf)) {
      try { fs.unlinkSync(tempPdf); } catch (e) {}
    }
  });

  await t.test('1. Missing Gupshup credentials in production results in a clear failure', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.GUPSHUP_API_KEY;
    delete process.env.GUPSHUP_APP_NAME;
    delete process.env.GUPSHUP_SOURCE_PHONE;
    delete process.env.SIMULATION_MODE;

    const unconfiguredCompany = 'prod_unconfigured_' + Date.now();

    await assert.rejects(
      async () => {
        await gupshupService.sendPdfDocument(
          unconfiguredCompany,
          '919876543210',
          tempPdf,
          'statement.pdf'
        );
      },
      /missing or incomplete|Dispatch failed|credentials are missing/i,
      'Must reject live dispatch when credentials are not configured in production'
    );
  });

  await t.test('2. Simulation cannot be enabled in production environment', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SIMULATION_MODE = 'true'; // Attempting to turn simulation on in production

    const prodCompany = 'prod_company_sim_attempt_' + Date.now();

    await assert.rejects(
      async () => {
        await gupshupService.sendPdfDocument(
          prodCompany,
          '919876543210',
          tempPdf,
          'statement.pdf'
        );
      },
      /Simulation mode is strictly prohibited in production|cannot be enabled in production|missing or incomplete/i,
      'Simulation must be completely blocked in production'
    );
  });

  await t.test('3. Simulation disabled by default in non-production when SIMULATION_MODE is not set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SIMULATION_MODE; // Not set -> disabled by default
    delete process.env.GUPSHUP_API_KEY;
    delete process.env.GUPSHUP_APP_NAME;
    delete process.env.GUPSHUP_SOURCE_PHONE;

    const devCompany = 'dev_company_no_sim_' + Date.now();

    await assert.rejects(
      async () => {
        await gupshupService.sendPdfDocument(
          devCompany,
          '919876543210',
          tempPdf,
          'statement.pdf'
        );
      },
      /missing or incomplete|credentials are missing|Set valid credentials or configure SIMULATION_MODE/i,
      'Simulation must be disabled by default without explicit SIMULATION_MODE=true'
    );
  });

  await t.test('4. When SIMULATION_MODE is explicitly enabled in dev, distinct simulation status is recorded', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATION_MODE = 'true';
    delete process.env.GUPSHUP_API_KEY;

    const simCompany = 'sim_dev_company_' + Date.now();

    const result = await gupshupService.sendPdfDocument(
      simCompany,
      '919876543210',
      tempPdf,
      'statement.pdf'
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isSimulation, true, 'Result must clearly indicate simulation');
    assert.strictEqual(result.status, 'simulated');
    assert.ok(result.messageId.startsWith('sim_gup_'));
  });

  await t.test('5. Simulation results are never marked as real Sent/Delivered status in database', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATION_MODE = 'true';
    delete process.env.GUPSHUP_API_KEY;

    const queueService = require('../services/queue/queueService');
    const simTenant = 'sim_queue_tenant_' + Date.now();

    // Setup dummy contact and PDF
    const { data: contact } = await supabase.from('contacts').insert({
      company_id: simTenant,
      name: 'Simulated User',
      mobile: '919876543210',
      isValid: 1
    }).select().single();

    const { data: pdf } = await supabase.from('pdf_files').insert({
      company_id: simTenant,
      originalFilename: 'test_sim.pdf',
      extractedName: 'Simulated User',
      filePath: tempPdf,
      matchedContactId: contact.id
    }).select().single();

    try {
      await queueService.processSendQueue(simTenant, [{ pdfId: pdf.id }], 'Test Template', null);

      // Check message log status
      const { data: logRow } = await supabase
        .from('message_logs')
        .select('*')
        .eq('company_id', simTenant)
        .eq('pdfFilename', 'test_sim.pdf')
        .single();

      assert.ok(logRow, 'Message log must exist');
      assert.strictEqual(
        logRow.status,
        'Simulated',
        'Simulated dispatches must NOT be marked as Sent'
      );
      assert.strictEqual(logRow.deliveryStatus, 'simulated');
      assert.strictEqual(logRow.isSimulation, 1, 'isSimulation column must be 1');
      assert.ok(logRow.errorReason.includes('simulation mode'));

      // Check queue_batches record
      const { data: batchRow } = await supabase
        .from('queue_batches')
        .select('*')
        .eq('company_id', simTenant)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      assert.strictEqual(batchRow.sentCount, 0, 'Sent count for real dispatches must be 0');
      assert.strictEqual(batchRow.simulatedCount, 1, 'Simulated count must be 1');
    } finally {
      await supabase.from('contacts').delete().eq('company_id', simTenant);
      await supabase.from('pdf_files').delete().eq('company_id', simTenant);
      await supabase.from('message_logs').delete().eq('company_id', simTenant);
    }
  });

  await t.test('6. Startup validation rejects SIMULATION_MODE in production and catches missing secrets', () => {
    const { validateEnv } = require('../config/validateEnv');

    process.env.NODE_ENV = 'production';
    process.env.SIMULATION_MODE = 'true';
    assert.throws(
      () => validateEnv(),
      /SIMULATION_MODE is strictly prohibited in production/i,
      'Must throw startup error when SIMULATION_MODE is true in production'
    );

    delete process.env.SIMULATION_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;
    assert.throws(
      () => validateEnv(),
      /Missing critical production configuration/i,
      'Must throw startup error when critical secrets are missing in production'
    );

    // With valid production secrets and no simulation mode
    process.env.JWT_SECRET = 'valid_prod_jwt_secret_value_123';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    assert.doesNotThrow(
      () => validateEnv(),
      'Must succeed when production is properly configured without simulation'
    );
  });
});

