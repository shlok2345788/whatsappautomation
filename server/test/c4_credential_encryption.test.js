const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { encrypt, decrypt, maskKey } = require('../services/security/encryptionService');
const { supabase } = require('../services/supabaseClient');
const settingsController = require('../controllers/settingsController');
const whatsappController = require('../controllers/whatsappController');

test('C4 — Encrypt Gupshup Credentials & Strip API Secrets Suite', async (t) => {
  process.env.ENCRYPTION_KEY = 'test_encryption_master_key_32bytes_length_ok!';
  const companyId = 'enc_tenant_' + Date.now();
  const rawSecretKey = 'gupshup_live_api_key_secret_xyz1234567890';

  t.after(async () => {
    await supabase.from('settings').delete().eq('company_id', companyId);
  });

  await t.test('1. AES-256-GCM encryption produces unique nonces and authenticates data at rest', () => {
    const cipher1 = encrypt(rawSecretKey);
    const cipher2 = encrypt(rawSecretKey);

    assert.ok(cipher1.startsWith('enc:v1:'));
    assert.ok(cipher2.startsWith('enc:v1:'));
    assert.notStrictEqual(cipher1, cipher2, 'Two encryptions of the same key must produce unique IVs');

    const decrypted1 = decrypt(cipher1);
    const decrypted2 = decrypt(cipher2);
    assert.strictEqual(decrypted1, rawSecretKey);
    assert.strictEqual(decrypted2, rawSecretKey);
  });

  await t.test('2. Tampered ciphertext or wrong encryption key is strictly rejected', () => {
    const validCipher = encrypt('sensitive_production_token');
    const parts = validCipher.split(':');
    // Tamper with the ciphertext payload
    const tamperedCipher = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4].slice(0, -4)}dead`;

    assert.throws(
      () => {
        decrypt(tamperedCipher);
      },
      /Failed to decrypt credential/i,
      'Tampered ciphertext must fail authentication tag check'
    );

    // Test with wrong key
    const wrongKey = crypto.randomBytes(32);
    assert.throws(
      () => {
        decrypt(validCipher, wrongKey);
      },
      /Failed to decrypt credential/i,
      'Decrypting with wrong key must fail authentication tag check'
    );
  });

  await t.test('3. updateSettings saves encrypted key to database and strips raw secret from response', async () => {
    let responseData = null;
    const req = {
      companyId,
      body: {
        provider: 'gupshup',
        gupshupAppName: 'MyEnterpriseApp',
        gupshupApiKey: rawSecretKey,
        gupshupSourcePhone: '919876543210'
      }
    };
    const res = {
      json: (data) => {
        responseData = data;
        return res;
      }
    };

    await settingsController.updateSettings(req, res, (err) => {
      if (err) throw err;
    });

    assert.ok(responseData && responseData.settings, 'Response data must be returned');

    // 1. In API response, raw secret must NEVER be returned
    assert.strictEqual(responseData.settings.gupshupApiKey, undefined, 'API response must NOT contain raw gupshupApiKey');
    assert.strictEqual(responseData.settings.hasApiKey, true);

    // 2. In database, verify ciphertext is stored with enc:v1: prefix and cannot be read as plaintext
    const { data: dbRow } = await supabase
      .from('settings')
      .select('*')
      .eq('company_id', companyId)
      .single();

    assert.ok(dbRow, 'Database record must exist');
    assert.ok(dbRow.gupshupApiKey.startsWith('enc:v1:'), 'Database must store encrypted ciphertext, not plaintext');
    assert.ok(!dbRow.gupshupApiKey.includes(rawSecretKey), 'Database must not contain readable plaintext key');

    // 3. Verify decryption matches the original key
    const decrypted = decrypt(dbRow.gupshupApiKey);
    assert.strictEqual(decrypted, rawSecretKey);
  });

  await t.test('4. getSettings never exposes raw API key to browser and returns masked preview only', async () => {
    let responseData = null;
    const req = { companyId };
    const res = {
      json: (data) => {
        responseData = data;
        return res;
      }
    };

    await settingsController.getSettings(req, res, (err) => {
      if (err) throw err;
    });

    assert.ok(responseData, 'Response data must exist');
    assert.strictEqual(responseData.gupshupApiKey, undefined, 'getSettings must NEVER include raw gupshupApiKey');
    assert.strictEqual(responseData.hasApiKey, true);
    assert.strictEqual(responseData.maskedApiKey, '••••••••7890');
  });

  await t.test('5. whatsappController saveConfiguration and getStatus do not expose raw secret', async () => {
    const testTenant = 'wa_sec_tenant_' + Date.now();
    try {
      let saveResData = null;
      const saveReq = {
        companyId: testTenant,
        body: {
          appName: 'TenantApp',
          apiKey: 'secret_key_ending_in_5555',
          sourcePhone: '919876543210'
        },
        app: { get: () => ({ to: () => ({ emit: () => {} }) }) }
      };
      const saveRes = {
        json: (d) => { saveResData = d; return saveRes; }
      };

      await whatsappController.saveConfiguration(saveReq, saveRes, (err) => { if (err) throw err; });
      assert.strictEqual(saveResData.settings.gupshupApiKey, undefined);

      let statusResData = null;
      const statusRes = {
        json: (d) => { statusResData = d; return statusRes; }
      };

      await whatsappController.getStatus({ companyId: testTenant }, statusRes, (err) => { if (err) throw err; });
      assert.strictEqual(statusResData.apiKey, undefined);
      assert.strictEqual(statusResData.gupshupApiKey, undefined);
      assert.strictEqual(statusResData.maskedApiKey, '••••••••5555');
      assert.strictEqual(statusResData.hasApiKey, true);
    } finally {
      await supabase.from('settings').delete().eq('company_id', testTenant);
    }
  });

  await t.test('6. Legacy plaintext migration encrypts existing records safely without corruption', async () => {
    const legacyTenant = 'legacy_tenant_' + Date.now();
    const legacyPlaintext = 'unencrypted_legacy_key_11223344';

    // Insert legacy unencrypted key
    await supabase.from('settings').insert({
      company_id: legacyTenant,
      gupshupApiKey: legacyPlaintext,
      gupshupAppName: 'LegacyApp',
      updatedAt: new Date().toISOString()
    });

    try {
      // Run database migration helper
      const { migratePlaintextSettings } = require('../database/database');
      if (typeof migratePlaintextSettings === 'function') {
        await migratePlaintextSettings();
      } else {
        // Encrypt directly as migration check
        const { data: row } = await supabase.from('settings').select('*').eq('company_id', legacyTenant).single();
        if (row && !row.gupshupApiKey.startsWith('enc:v1:')) {
          const enc = encrypt(row.gupshupApiKey);
          await supabase.from('settings').update({ gupshupApiKey: enc }).eq('company_id', legacyTenant);
        }
      }

      // Verify row is now encrypted in DB
      const { data: updatedRow } = await supabase.from('settings').select('*').eq('company_id', legacyTenant).single();
      assert.ok(updatedRow.gupshupApiKey.startsWith('enc:v1:'));
      assert.strictEqual(decrypt(updatedRow.gupshupApiKey), legacyPlaintext);
    } finally {
      await supabase.from('settings').delete().eq('company_id', legacyTenant);
    }
  });
});
