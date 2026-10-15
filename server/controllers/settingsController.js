const { supabase } = require('../services/supabaseClient');
const { encrypt, decrypt, maskKey } = require('../services/security/encryptionService');

const getSettings = async (req, res, next) => {
  try {
    const companyId = req.companyId;

    const { data: settings, error } = await supabase
      .from('settings')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!settings) {
      const defaultTpl = "Hello {{name}},\n\nPlease find your document attached.\n\nThank you.";
      const { data: created, error: insertErr } = await supabase
        .from('settings')
        .insert({
          company_id: companyId,
          provider: 'gupshup',
          gupshupAppName: process.env.GUPSHUP_APP_NAME || '',
          gupshupApiKey: '',
          gupshupSourcePhone: process.env.GUPSHUP_SOURCE_PHONE || '',
          delayBetweenMessages: 4,
          messageTemplate: defaultTpl,
          autoRetryFailed: false,
          updatedAt: new Date().toISOString()
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      const safeCreated = { ...created };
      delete safeCreated.gupshupApiKey;
      safeCreated.hasApiKey = Boolean(process.env.GUPSHUP_API_KEY);
      safeCreated.maskedApiKey = process.env.GUPSHUP_API_KEY ? maskKey(process.env.GUPSHUP_API_KEY) : '';
      safeCreated.gupshupApiKeyMasked = safeCreated.maskedApiKey;
      return res.json(safeCreated);
    }

    // Mask sensitive API Key for security in response and strip raw secret
    const safeSettings = { ...settings };
    let hasKey = false;
    let masked = '';

    if (safeSettings.gupshupApiKey) {
      try {
        const decryptedKey = decrypt(safeSettings.gupshupApiKey);
        if (decryptedKey) {
          hasKey = true;
          masked = maskKey(decryptedKey);
        }
      } catch (e) {
        hasKey = true;
        masked = '••••••••';
      }
    } else if (process.env.GUPSHUP_API_KEY) {
      hasKey = true;
      masked = maskKey(process.env.GUPSHUP_API_KEY);
    }

    delete safeSettings.gupshupApiKey;
    safeSettings.hasApiKey = hasKey;
    safeSettings.maskedApiKey = masked;
    safeSettings.gupshupApiKeyMasked = masked;

    res.json(safeSettings);
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const {
      provider,
      gupshupAppName,
      gupshupApiKey,
      gupshupSourcePhone,
      delayBetweenMessages,
      messageTemplate,
      autoRetryFailed
    } = req.body;

    const updates = {};
    if (provider !== undefined) updates.provider = provider;
    if (gupshupAppName !== undefined) updates.gupshupAppName = gupshupAppName;
    if (gupshupSourcePhone !== undefined) updates.gupshupSourcePhone = gupshupSourcePhone;
    if (gupshupApiKey !== undefined && !gupshupApiKey.includes('••••')) {
      updates.gupshupApiKey = encrypt(gupshupApiKey.trim());
    }
    if (delayBetweenMessages !== undefined) {
      const delayNum = Number(delayBetweenMessages);
      if (
        isNaN(delayNum) ||
        !Number.isInteger(delayNum) ||
        delayNum < 1 ||
        delayNum > 120
      ) {
        return res.status(400).json({
          message: 'Delay between messages must be an integer between 1 and 120 seconds'
        });
      }
      updates.delayBetweenMessages = delayNum;
    }
    if (messageTemplate !== undefined) updates.messageTemplate = messageTemplate;
    if (autoRetryFailed !== undefined) updates.autoRetryFailed = Boolean(autoRetryFailed);
    updates.updatedAt = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('settings')
      .upsert({ company_id: companyId, ...updates }, { onConflict: 'company_id' })
      .select()
      .single();

    if (error) throw error;

    const safeUpdated = { ...updated };
    const hasKey = Boolean(safeUpdated.gupshupApiKey || process.env.GUPSHUP_API_KEY);
    let masked = '';
    if (safeUpdated.gupshupApiKey) {
      try {
        masked = maskKey(decrypt(safeUpdated.gupshupApiKey));
      } catch (e) {
        masked = '••••••••';
      }
    } else if (process.env.GUPSHUP_API_KEY) {
      masked = maskKey(process.env.GUPSHUP_API_KEY);
    }

    delete safeUpdated.gupshupApiKey;
    safeUpdated.hasApiKey = hasKey;
    safeUpdated.maskedApiKey = masked;
    safeUpdated.gupshupApiKeyMasked = masked;

    res.json({ message: 'Settings updated successfully', settings: safeUpdated });
  } catch (error) {
    next(error);
  }
};

const { updateProfile } = require('./authController');

module.exports = {
  getSettings,
  updateSettings,
  updateProfile
};
