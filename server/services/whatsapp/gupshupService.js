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
 * Resolves Gupshup credentials for a given company strictly from the tenant's connected settings.
 * Automatic fallback to global environment sender/API keys is disabled for tenant messaging (D5).
 */
const getCredentials = async (companyId) => {
  if (!companyId) {
    throw new Error('Tenant companyId is required to resolve messaging credentials.');
  }

  let appName = '';
  let apiKey = '';
  let sourcePhone = '';
  let templateId = '';
  let baseUrl = process.env.GUPSHUP_BASE_URL || 'https://api.gupshup.io/wa/api/v1';

  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    if (settings) {
      if (settings.gupshupAppName) appName = settings.gupshupAppName.trim();
      if (settings.gupshupApiKey) {
        try {
          apiKey = decrypt(settings.gupshupApiKey).trim();
        } catch (e) {
          console.warn(`[Gupshup] Failed to decrypt API key for company ${companyId}:`, e.message);
          apiKey = '';
        }
      }
      if (settings.gupshupSourcePhone) sourcePhone = settings.gupshupSourcePhone.trim();
      if (settings.gupshupTemplateId !== undefined && settings.gupshupTemplateId !== null) {
        templateId = settings.gupshupTemplateId;
      } else if (settings.templateId !== undefined && settings.templateId !== null) {
        templateId = settings.templateId;
      }
    }
  } catch (err) {
    console.warn(`[Gupshup] Could not load settings for company ${companyId}:`, err.message);
  }

  return {
    companyId,
    appName,
    apiKey,
    sourcePhone: sourcePhone ? normalizePhone(sourcePhone) : '',
    templateId,
    baseUrl: baseUrl.replace(/\/+$/, '')
  };
};

/**
 * Sends a PDF ledger document via Gupshup Enterprise WhatsApp Business API.
 */
const sendPdfDocument = async (companyId, recipientPhone, filePath, originalFilename, caption = '', pdfId = null, templateParams = null) => {
  const creds = await getCredentials(companyId);
  const destination = normalizePhone(recipientPhone);

  if (!destination || destination.length < 10) {
    throw new Error(`Invalid recipient phone number: ${recipientPhone}`);
  }

  // Validate that the PDF file exists on local storage
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`PDF document does not exist at path: ${filePath}`);
  }

  // Build secure HMAC-signed document download URL for WhatsApp server
  let resolvedPdfId = pdfId;
  if (!resolvedPdfId) {
    try {
      const { data: foundPdf } = await supabase
        .from('pdf_files')
        .select('id')
        .eq('company_id', companyId)
        .eq('originalFilename', originalFilename)
        .maybeSingle();
      if (foundPdf?.id) resolvedPdfId = foundPdf.id;
    } catch (e) {
      // Fallback
    }
  }

  const serverBase = (process.env.PUBLIC_SERVER_URL || process.env.CLIENT_URL || 'http://localhost:5000').replace(/\/+$/, '');
  let documentUrl;
  if (resolvedPdfId) {
    const { createSignedPdfToken } = require('../security/signedUrlService');
    const { token, expires } = createSignedPdfToken(resolvedPdfId, companyId, 900);
    documentUrl = `${serverBase}/api/pdfs/download-signed/${resolvedPdfId}?token=${token}&expires=${expires}`;
  } else {
    documentUrl = `${serverBase}/api/pdfs/download-signed/${encodeURIComponent(path.basename(filePath))}`;
  }

  // Message payload structure
  let messagePayload;
  if (creds.templateId) {
    const trimmedTplId = String(creds.templateId).trim();
    if (!trimmedTplId) {
      throw new Error('Configured WhatsApp templateId is invalid or empty.');
    }

    const rawParams = (templateParams && Array.isArray(templateParams) && templateParams.length > 0)
      ? templateParams
      : [caption || originalFilename || 'Account Statement'];
    const resolvedParams = rawParams.map(p => (p === null || p === undefined) ? '' : String(p));

    messagePayload = {
      type: 'template',
      template: {
        id: trimmedTplId,
        params: resolvedParams
      },
      attachment: {
        type: 'file',
        url: documentUrl,
        filename: originalFilename || path.basename(filePath)
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

  const isConfigured = Boolean(
    creds.apiKey &&
    creds.apiKey !== 'your_gupshup_api_key_here' &&
    creds.sourcePhone &&
    creds.appName
  );

  const isProduction = process.env.NODE_ENV === 'production';
  const isSimulationExplicit = process.env.SIMULATION_MODE === 'true';

  if (isProduction && isSimulationExplicit) {
    throw new Error('Simulation mode is strictly prohibited in production environment.');
  }

  if (!isConfigured) {
    // Only allow simulation if explicitly enabled in non-production environments
    if (!isProduction && isSimulationExplicit) {
      const mockMessageId = `sim_gup_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      console.log(`[Gupshup SIMULATION] Dispatched simulated PDF to ${destination} for ${originalFilename} (ID: ${mockMessageId})`);
      return {
        success: true,
        isSimulation: true,
        messageId: mockMessageId,
        status: 'simulated',
        provider: 'gupshup-simulated',
        payload: messagePayload
      };
    }

    const missing = [];
    if (!creds.apiKey || creds.apiKey === 'your_gupshup_api_key_here') missing.push('API Key');
    if (!creds.sourcePhone) missing.push('Source Phone');
    if (!creds.appName) missing.push('App Name');

    throw new Error(`Gupshup credentials are missing or incomplete (${missing.join(', ')}). Set valid credentials or configure SIMULATION_MODE in non-production.`);
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
    raw: result,
    payload: messagePayload
  };
};

const STATUS_HIERARCHY = {
  'pending': 1,
  'sending': 2,
  'sent': 3,
  'simulated': 3,
  'delivered': 4,
  'read': 5
};

/**
 * Processes incoming webhook delivery reports from Gupshup.
 * Features idempotency, out-of-order progression protection, and tenant isolation.
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

  const safeMsgId = String(messageId).slice(0, 32);
  console.log(`[Gupshup Webhook] Received ${deliveryStatus} event for messageId: ${safeMsgId}`);

  // Find matching message log entry strictly by provider message ID
  const { data: logEntry, error } = await supabase
    .from('message_logs')
    .select('*')
    .eq('providerMessageId', messageId)
    .maybeSingle();

  if (error || !logEntry) {
    console.warn(`[Gupshup Webhook] No matching log entry found for messageId: ${safeMsgId}`);
    return { handled: false, reason: 'Log entry not found' };
  }

  const currentDelivery = (logEntry.deliveryStatus || logEntry.status || '').toLowerCase();
  const newDelivery = String(deliveryStatus).toLowerCase();

  // 1. Idempotency check: duplicate webhook events
  if (currentDelivery === newDelivery) {
    return {
      handled: true,
      duplicate: true,
      logId: logEntry.id,
      status: logEntry.status,
      deliveryStatus: logEntry.deliveryStatus
    };
  }

  // 2. Out-of-order check: prevent status regression (e.g. Read -> Delivered or Delivered -> Sent)
  const currentRank = STATUS_HIERARCHY[currentDelivery] || 0;
  const newRank = STATUS_HIERARCHY[newDelivery] || 0;

  if (newRank > 0 && currentRank > newRank) {
    console.warn(`[Gupshup Webhook] Ignored out-of-order status regression from ${currentDelivery} to ${newDelivery} for message ${logEntry.id}`);
    return {
      handled: true,
      ignoredRegression: true,
      logId: logEntry.id,
      currentStatus: logEntry.status,
      deliveryStatus: logEntry.deliveryStatus
    };
  }

  let mappedStatus = logEntry.status;
  if (newDelivery === 'delivered') mappedStatus = 'Delivered';
  else if (newDelivery === 'read') mappedStatus = 'Read';
  else if (newDelivery === 'failed') mappedStatus = 'Failed';
  else if (newDelivery === 'sent') mappedStatus = 'Sent';

  const updates = {
    deliveryStatus: newDelivery,
    status: mappedStatus
  };

  if (newDelivery === 'failed' && (payload.cause || payload.reason)) {
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
      deliveryStatus: newDelivery,
      contactName: logEntry.contactName,
      phone: logEntry.phone
    });
  }

  return {
    handled: true,
    logId: logEntry.id,
    newStatus: mappedStatus,
    deliveryStatus: newDelivery
  };
};

module.exports = {
  normalizePhone,
  getCredentials,
  sendPdfDocument,
  handleWebhookEvent
};
