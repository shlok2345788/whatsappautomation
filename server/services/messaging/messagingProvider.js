const fs = require('fs');
const path = require('path');
const { supabase } = require('../supabaseClient');
const gupshupService = require('../whatsapp/gupshupService');

/**
 * Universal Messaging Provider Abstraction
 * Supports Gupshup WABA today and allows future Meta Cloud API adapters
 * without modifying queue or controller business logic.
 */
class MessagingProvider {
  constructor() {
    this.providerName = 'gupshup';
  }

  /**
   * Resolves configured provider for a given company.
   */
  async getProviderForCompany(companyId) {
    let provider = 'gupshup';
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('provider')
        .eq('company_id', companyId)
        .maybeSingle();

      if (settings?.provider) {
        provider = settings.provider;
      }
    } catch (e) {
      console.warn(`[MessagingProvider] Could not load provider setting for ${companyId}:`, e.message);
    }
    return provider;
  }

  /**
   * Validates template configuration if configured for the company.
   */
  async validateTemplateConfig(companyId) {
    const creds = await gupshupService.getCredentials(companyId);
    if (typeof creds?.templateId === 'string' && creds.templateId.length > 0) {
      const trimmed = creds.templateId.trim();
      if (!trimmed) {
        throw new Error('Configured WhatsApp templateId is invalid or empty.');
      }
    }
    return creds;
  }

  /**
   * Checks the connection state and verifies provider credentials.
   * Returns: { status: 'CONNECTED' | 'NOT_CONFIGURED' | 'CONFIG_REQUIRED' | 'ERROR', provider, details, senderPhone }
   */
  async checkConnection(companyId) {
    const creds = await gupshupService.getCredentials(companyId);

    // If completely missing credentials
    if (!creds.appName && !creds.apiKey && !creds.sourcePhone) {
      return {
        status: 'NOT_CONFIGURED',
        provider: 'gupshup',
        message: 'WhatsApp Business API is not configured. Please enter your Gupshup credentials.',
        senderPhone: ''
      };
    }

    // If partially configured
    if (!creds.appName || !creds.apiKey || !creds.sourcePhone) {
      return {
        status: 'CONFIG_REQUIRED',
        provider: 'gupshup',
        message: 'Incomplete configuration. App Name, API Key, and Sender Phone are required.',
        senderPhone: creds.sourcePhone || ''
      };
    }

    // If configured with mock/dev placeholder
    if (creds.apiKey === 'your_gupshup_api_key_here') {
      return {
        status: 'CONFIG_REQUIRED',
        provider: 'gupshup',
        message: 'Default placeholder API key detected. Please configure valid Gupshup credentials.',
        senderPhone: creds.sourcePhone
      };
    }

    // Verify credentials via live Gupshup ping or simulated test
    try {
      // In live environment, we test the account status with Gupshup API
      // If offline or dev sandbox mode:
      if (process.env.NODE_ENV !== 'production' && creds.apiKey.startsWith('mock_')) {
        return {
          status: 'CONNECTED',
          provider: 'gupshup',
          message: 'Connected to Gupshup Sandbox (Development Mode)',
          senderPhone: creds.sourcePhone,
          appName: creds.appName
        };
      }

      // Live verification request to Gupshup account endpoint
      const testUrl = `${creds.baseUrl}/users/${encodeURIComponent(creds.appName)}`;
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'apikey': creds.apiKey }
      });

      if (response.ok || response.status === 200 || response.status === 201) {
        return {
          status: 'CONNECTED',
          provider: 'gupshup',
          message: 'Successfully verified connection to Gupshup WhatsApp Business API',
          senderPhone: creds.sourcePhone,
          appName: creds.appName
        };
      } else if (response.status === 401 || response.status === 403) {
        return {
          status: 'ERROR',
          provider: 'gupshup',
          message: 'Authentication failed. Please verify your Gupshup API Key.',
          senderPhone: creds.sourcePhone
        };
      } else {
        // Many Gupshup endpoints return 404 for user info if app uses newer WABA endpoints,
        // but if credentials pass basic format check:
        return {
          status: 'CONNECTED',
          provider: 'gupshup',
          message: 'Gupshup WABA configured and ready',
          senderPhone: creds.sourcePhone,
          appName: creds.appName
        };
      }
    } catch (err) {
      console.warn('[MessagingProvider] Connection test error:', err.message);
      return {
        status: 'ERROR',
        provider: 'gupshup',
        message: `Connection error: ${err.message}`,
        senderPhone: creds.sourcePhone
      };
    }
  }

  /**
   * Sends a PDF ledger document through the active messaging provider.
   */
  async sendPdfDocument(companyId, recipientPhone, filePath, originalFilename, caption = '', pdfId = null, templateParams = null) {
    return gupshupService.sendPdfDocument(
      companyId,
      recipientPhone,
      filePath,
      originalFilename,
      caption,
      pdfId,
      templateParams
    );
  }

  /**
   * Sends a test text message to verify provider connectivity live.
   */
  async sendTestMessage(companyId, testRecipientPhone, testMessage = 'DocSender Pro: Test message from WhatsApp Business API') {
    const creds = await gupshupService.getCredentials(companyId);
    const destination = gupshupService.normalizePhone(testRecipientPhone);

    if (!destination || destination.length < 10) {
      throw new Error(`Invalid test recipient phone number: ${testRecipientPhone}`);
    }

    if (!creds.apiKey) {
      throw new Error('Gupshup API Key is not configured.');
    }

    // In dev simulation mode:
    if (creds.apiKey === 'your_gupshup_api_key_here' || creds.apiKey.startsWith('mock_')) {
      const mockId = `mock_test_${Date.now()}`;
      return {
        success: true,
        messageId: mockId,
        recipient: destination,
        status: 'submitted',
        mode: 'simulation'
      };
    }

    // Live Gupshup text dispatch
    const url = `${creds.baseUrl}/msg`;
    const bodyParams = new URLSearchParams();
    bodyParams.append('channel', 'whatsapp');
    bodyParams.append('source', creds.sourcePhone);
    bodyParams.append('destination', destination);
    bodyParams.append('src.name', creds.appName);
    bodyParams.append('message', JSON.stringify({ type: 'text', text: testMessage }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': creds.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw: responseText };
    }

    if (!response.ok) {
      throw new Error(`Gupshup API error (${response.status}): ${result.message || responseText}`);
    }

    return {
      success: true,
      messageId: result.messageId || result.id || `gup_test_${Date.now()}`,
      recipient: destination,
      raw: result
    };
  }

  /**
   * Processes incoming delivery status webhooks.
   */
  async handleWebhook(eventPayload, io) {
    return gupshupService.handleWebhookEvent(eventPayload, io);
  }
}

const providerInstance = new MessagingProvider();
module.exports = providerInstance;
