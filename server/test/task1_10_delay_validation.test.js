const test = require('node:test');
const assert = require('node:assert/strict');
const { updateSettings } = require('../controllers/settingsController');
const { supabase } = require('../services/supabaseClient');

test('Task 1.10 — Server-Side Send-Delay Validation Suite', async (t) => {
  const companyId = 'company_delay_' + Date.now();

  const createMockReqRes = (body) => {
    const req = {
      companyId,
      body
    };
    let statusCode = 200;
    let jsonBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      }
    };

    return { req, res, getStatus: () => statusCode, getJson: () => jsonBody };
  };

  await t.test('1. Reject negative delay values with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ delayBetweenMessages: -5 });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 400, 'Negative delay must return HTTP 400');
    assert.match(getJson().message, /between 1 and 120 seconds/i);
  });

  await t.test('2. Reject non-numeric delay values with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ delayBetweenMessages: 'invalid_delay' });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 400, 'Non-numeric string must return HTTP 400');
    assert.match(getJson().message, /between 1 and 120 seconds/i);
  });

  await t.test('3. Reject sub-minimum (zero) delay values with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ delayBetweenMessages: 0 });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 400, '0 seconds delay must return HTTP 400');
    assert.match(getJson().message, /between 1 and 120 seconds/i);
  });

  await t.test('4. Reject floating point non-integer delay values with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ delayBetweenMessages: 3.5 });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 400, 'Fractional delay (3.5s) must return HTTP 400');
    assert.match(getJson().message, /between 1 and 120 seconds/i);
  });

  await t.test('5. Reject delay exceeding maximum upper limit (> 120 seconds) with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ delayBetweenMessages: 300 });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 400, 'Delay of 300s exceeding 120s limit must return HTTP 400');
    assert.match(getJson().message, /between 1 and 120 seconds/i);
  });

  await t.test('6. Accept valid integer delays within [1, 120] range and persist to database', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      delayBetweenMessages: 6,
      messageTemplate: 'Hello {{name}}'
    });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 200, 'Valid integer delay must return HTTP 200');
    assert.equal(getJson().settings.delayBetweenMessages, 6);

    // Verify in database
    const { data: dbRow } = await supabase.from('settings').select('*').eq('company_id', companyId).single();
    assert.equal(dbRow.delayBetweenMessages, 6, 'Delay must be persisted to database');
  });

  await t.test('7. Accept string integer delay (e.g. "5") and convert to number', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ delayBetweenMessages: '5' });
    await updateSettings(req, res, () => {});

    assert.equal(getStatus(), 200, 'String integer "5" must return HTTP 200');
    assert.strictEqual(getJson().settings.delayBetweenMessages, 5);
  });
});
