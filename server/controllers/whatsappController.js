const { supabase } = require('../services/supabaseClient');
const messagingProvider = require('../services/messaging/messagingProvider');
const gupshupService = require('../services/whatsapp/gupshupService');
const { encrypt, decrypt, maskKey } = require('../services/security/encryptionService');

/**
 * Retrieves the current WhatsApp Business API configuration and connection status.
 */
const getStatus = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const connection = await messagingProvider.checkConnection(companyId);

    // Fetch existing settings to provide masked credentials
    const { data: settings } = await supabase
      .from('settings')
      .select('gupshupAppName, gupshupApiKey, gupshupSourcePhone, gupshupTemplateId, provider')
      .eq('company_id', companyId)
      .maybeSingle();

    let maskedApiKey = '';
    if (settings?.gupshupApiKey) {
      try {
        maskedApiKey = maskKey(decrypt(settings.gupshupApiKey));
      } catch (e) {
        maskedApiKey = '••••••••';
      }
    }

    res.json({
      status: connection.status, // 'CONNECTED' | 'NOT_CONFIGURED' | 'CONFIG_REQUIRED' | 'ERROR'
      provider: connection.provider || 'gupshup',
      message: connection.message,
      appName: settings?.gupshupAppName || '',
      sourcePhone: settings?.gupshupSourcePhone || '',
      templateId: settings?.gupshupTemplateId || '',
      maskedApiKey,
      hasApiKey: Boolean(settings?.gupshupApiKey),
      isSimulation: process.env.SIMULATION_MODE === 'true' && process.env.NODE_ENV !== 'production'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Saves WhatsApp Business API (Gupshup) configuration securely.
 * Masked values are preserved without leaking plaintext secrets.
 */
const saveConfiguration = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { appName, apiKey, sourcePhone, templateId } = req.body;

    const updates = {
      provider: 'gupshup',
      updatedAt: new Date().toISOString()
    };

    if (appName !== undefined) updates.gupshupAppName = appName.trim();
    if (sourcePhone !== undefined) updates.gupshupSourcePhone = sourcePhone.trim();
    if (templateId !== undefined) updates.gupshupTemplateId = templateId.trim();

    // Only update API key if user supplied a new value (not masked dots)
    if (apiKey && !apiKey.includes('••••')) {
      updates.gupshupApiKey = encrypt(apiKey.trim());
    }

    const { data: updated, error } = await supabase
      .from('settings')
      .upsert({ company_id: companyId, ...updates }, { onConflict: 'company_id' })
      .select('gupshupAppName, gupshupSourcePhone, gupshupTemplateId, provider, updatedAt')
      .single();

    if (error) throw error;

    // Verify newly saved configuration
    const check = await messagingProvider.checkConnection(companyId);

    // Emit live status update to user socket room
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${companyId}`).emit('whatsapp:provider_status', check);
    }

    const safeSettings = { ...updated };
    delete safeSettings.gupshupApiKey;
    delete safeSettings.apiKey;

    res.json({
      message: 'WhatsApp Business API configuration saved successfully',
      status: check.status,
      connectionMessage: check.message,
      settings: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifies live connection to the provider without fabricating success.
 */
const verifyConnection = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const result = await messagingProvider.checkConnection(companyId);

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${companyId}`).emit('whatsapp:provider_status', result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Sends an authorized test message to a specified recipient number.
 */
const sendTestMessage = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { recipientPhone, messageText } = req.body;

    if (!recipientPhone) {
      return res.status(400).json({ message: 'Recipient phone number is required for test message.' });
    }

    const result = await messagingProvider.sendTestMessage(
      companyId,
      recipientPhone,
      messageText || 'DocSender Pro: Test verification message from official WhatsApp Business API.'
    );

    res.json({
      message: 'Test message dispatched successfully',
      result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatus,
  saveConfiguration,
  verifyConnection,
  sendTestMessage
};
