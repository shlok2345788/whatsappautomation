const fs = require('fs');
const path = require('path');
const { supabase } = require('../supabaseClient');
const { decrypt } = require('../security/encryptionService');

/**
 * Normalizes phone numbers to standard Gupshup format (country code + number without +, spaces or special chars).
 * Example: "+91 98765-43210" -> "919876543210"
 */
const normalizePhone = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  // Default to India country code 91 if 10 digits
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
};

/**
 * Resolves Gupshup credentials for a given company, falling back to environment variables.
 */
const getCredentials = async (companyId) => {
  let appName = process.env.GUPSHUP_APP_NAME || '';
  let apiKey = process.env.GUPSHUP_API_KEY || '';
  let sourcePhone = process.env.GUPSHUP_SOURCE_PHONE || '';
  let templateId = process.env.GUPSHUP_TEMPLATE_ID || '';
  let baseUrl = process.env.GUPSHUP_BASE_URL || 'https://api.gupshup.io/wa/api/v1';

  if (companyId) {
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (settings) {
        if (settings.gupshupAppName) appName = settings.gupshupAppName;
        if (settings.gupshupApiKey) {
          try {
            apiKey = decrypt(settings.gupshupApiKey);
          } catch (e) {
            console.warn(`[Gupshup] Failed to decrypt API key for company ${companyId}:`, e.message);
          }
        }
        if (settings.gupshupSourcePhone) sourcePhone = settings.gupshupSourcePhone;
        if (settings.gupshupTemplateId) templateId = settings.gupshupTemplateId;
      }
    } catch (err) {
      console.warn(`[Gupshup] Could not load settings for company ${companyId}:`, err.message);
    }
  }

  return {
    appName,
    apiKey,
    sourcePhone: normalizePhone(sourcePhone),
    templateId,
    baseUrl: baseUrl.replace(/\/+$/, '')
  };
};

/**
 * Sends a PDF ledger document via Gupshup Enterprise WhatsApp Business API.
 */
const sendPdfDocument = async (companyId, recipientPhone, filePath, originalFilename, caption = '') => {
  const creds = await getCredentials(companyId);
  const destination = normalizePhone(recipientPhone);

  if (!destination || destination.length < 10) {
    throw new Error(`Invalid recipient phone number: ${recipientPhone}`);
  }

  // Validate that the PDF file exists on local storage
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`PDF document does not exist at path: ${filePath}`);
  }

  const isConfigured = Boolean(creds.apiKey && creds.apiKey !== 'your_gupshup_api_key_here');

  if (!isConfigured) {
    // Development / Sandbox Simulation Mode:
    // Gupshup credentials are not yet provisioned. Simulate successful submission.
    const mockMessageId = `mock_gup_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[Gupshup Dev-Mode] Simulating PDF dispatch to ${destination} for ${originalFilename} (MessageId: ${mockMessageId})`);
    return {
      success: true,
      messageId: mockMessageId,
      status: 'submitted',
      provider: 'gupshup-simulated'
    };
  }

  // Build document download URL for WhatsApp server
  const serverBase = (process.env.PUBLIC_SERVER_URL || process.env.CLIENT_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const documentUrl = `${serverBase}/api/pdfs/download-signed/${encodeURIComponent(path.basename(filePath))}`;

  // Message payload structure
  let messagePayload;
  if (creds.templateId) {
    messagePayload = {
      type: 'template',
      template: {
        id: creds.templateId,
        params: [caption || originalFilename || 'Account Statement']
      }
    };
  } else {
    messagePayload = {
      type: 'file',
      url: documentUrl,
      filename: originalFilename || path.basename(filePath),
      caption: caption || ''
    };
  }

  // Live Gupshup API Dispatch
  const url = `${creds.baseUrl}/msg`;
  const bodyParams = new URLSearchParams();
  bodyParams.append('channel', 'whatsapp');
  bodyParams.append('source', creds.sourcePhone);
  bodyParams.append('destination', destination);
  bodyParams.append('src.name', creds.appName);
  bodyParams.append('message', JSON.stringify(messagePayload));

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
    throw new Error(`Gupshup API HTTP error ${response.status}: ${result.message || responseText}`);
  }

  if (result.status === 'error') {
    throw new Error(`Gupshup error: ${result.message || JSON.stringify(result)}`);
  }

  const messageId = result.messageId || result.id || `gup_${Date.now()}`;
  return {
    success: true,
    messageId,
    status: result.status || 'submitted',
    raw: result
  };
};

/**
 * Processes incoming webhook delivery reports from Gupshup.
 */
const handleWebhookEvent = async (eventBody, io) => {
  if (!eventBody) return { handled: false, reason: 'Empty payload' };

  // Support both Gupshup nested format { type: 'message-event', payload: { ... } }
  // and flat format { id, type }
  const payload = eventBody.payload || eventBody;
  const messageId = payload.id || payload.messageId || eventBody.id;
  const deliveryStatus = payload.type || payload.status || eventBody.type; // 'sent', 'delivered', 'read', 'failed'

  if (!messageId || !deliveryStatus) {
    return { handled: false, reason: 'Not a message delivery event or missing messageId' };
  }

  console.log(`[Gupshup Webhook] Received ${deliveryStatus} event for messageId: ${messageId}`);

  // Find matching message log entry
  const { data: logEntry, error } = await supabase
    .from('message_logs')
    .select('*')
    .eq('providerMessageId', messageId)
    .maybeSingle();

  if (error || !logEntry) {
    console.warn(`[Gupshup Webhook] No matching log entry found for messageId: ${messageId}`);
    return { handled: false, reason: 'Log entry not found' };
  }

  let mappedStatus = logEntry.status;
  if (deliveryStatus === 'delivered') mappedStatus = 'Delivered';
  else if (deliveryStatus === 'read') mappedStatus = 'Read';
  else if (deliveryStatus === 'failed') mappedStatus = 'Failed';
  else if (deliveryStatus === 'sent') mappedStatus = 'Sent';

  const updates = {
    deliveryStatus,
    status: mappedStatus
  };

  if (deliveryStatus === 'failed' && (payload.cause || payload.reason)) {
    updates.errorReason = payload.cause || payload.reason;
  }

  await supabase
    .from('message_logs')
    .update(updates)
    .eq('id', logEntry.id);

  // Notify client via tenant Socket.IO room
  if (io && logEntry.company_id) {
    const roomName = `user_${logEntry.company_id}`;
    io.to(roomName).emit('message:status_update', {
      logId: logEntry.id,
      providerMessageId: messageId,
      status: mappedStatus,
      deliveryStatus,
      contactName: logEntry.contactName,
      phone: logEntry.phone
    });
  }

  return {
    handled: true,
    logId: logEntry.id,
    newStatus: mappedStatus,
    deliveryStatus
  };
};

module.exports = {
  normalizePhone,
  getCredentials,
  sendPdfDocument,
  handleWebhookEvent
};
