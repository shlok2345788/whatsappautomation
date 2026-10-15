const test = require('node:test');
const assert = require('node:assert/strict');
const { updateProfile: authUpdateProfile, getMe } = require('../controllers/authController');
const { updateProfile: settingsUpdateProfile } = require('../controllers/settingsController');
const { supabase } = require('../services/supabaseClient');

test('Task 1.11 — Profile Update Repair & Management Suite', async (t) => {
  const companyId = 'company_profile_' + Date.now();

  const createMockReqRes = (body, customCompanyId = companyId) => {
    const req = {
      companyId: customCompanyId,
      user: {
        id: customCompanyId,
        companyId: customCompanyId,
        name: 'Initial Name',
        company_name: 'Initial Company',
        email: 'initial@example.com'
      },
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

  await t.test('1. Reject invalid email format with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ email: 'not-an-email' });
    await authUpdateProfile(req, res, () => {});

    assert.equal(getStatus(), 400);
    assert.match(getJson().message, /valid email address/i);
  });

  await t.test('2. Reject empty or invalid name with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ name: '   ' });
    await authUpdateProfile(req, res, () => {});

    assert.equal(getStatus(), 400);
    assert.match(getJson().message, /non-empty string/i);
  });

  await t.test('3. Reject short new password (< 6 chars) with HTTP 400', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ newPassword: '123' });
    await authUpdateProfile(req, res, () => {});

    assert.equal(getStatus(), 400);
    assert.match(getJson().message, /at least 6 characters/i);
  });

  await t.test('4. Update profile name and email persists to database and returns user object', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      name: 'Acme Global Traders',
      email: 'ops@acmeglobal.com'
    });
    await authUpdateProfile(req, res, () => {});

    assert.equal(getStatus(), 200);
    const body = getJson();
    assert.equal(body.message, 'Profile updated successfully');
    assert.equal(body.user.name, 'Acme Global Traders');
    assert.equal(body.user.company_name, 'Acme Global Traders');
    assert.equal(body.user.email, 'ops@acmeglobal.com');

    // Verify persisted in DB
    const { data: dbCompany } = await supabase
      .from('companies')
      .eq('id', companyId)
      .maybeSingle();

    assert.ok(dbCompany, 'Company record must exist in DB');
    assert.equal(dbCompany.company_name, 'Acme Global Traders');
    assert.equal(dbCompany.email, 'ops@acmeglobal.com');
  });

  await t.test('5. Backward compatibility: updateProfile via settingsController delegates cleanly', async () => {
    const altCompanyId = 'company_settings_delegate_' + Date.now();
    const { req, res, getStatus, getJson } = createMockReqRes({
      name: 'Zenith Logistics',
      email: 'info@zenithlogistics.com'
    }, altCompanyId);

    await settingsUpdateProfile(req, res, () => {});

    assert.equal(getStatus(), 200);
    const body = getJson();
    assert.equal(body.message, 'Profile updated successfully');
    assert.equal(body.user.company_name, 'Zenith Logistics');

    // Verify persisted
    const { data: dbCompany } = await supabase
      .from('companies')
      .eq('id', altCompanyId)
      .maybeSingle();
    assert.equal(dbCompany.company_name, 'Zenith Logistics');
  });

  await t.test('6. getMe retrieves updated profile data', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({}, companyId);
    await getMe(req, res, () => {});

    assert.equal(getStatus(), 200);
    const user = getJson();
    assert.equal(user.name, 'Acme Global Traders');
    assert.equal(user.email, 'ops@acmeglobal.com');
  });

  await t.test('7. Unauthorized request without companyId returns HTTP 401', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({ name: 'Unauthorized' }, null);
    await authUpdateProfile(req, res, () => {});

    assert.equal(getStatus(), 401);
  });
});
