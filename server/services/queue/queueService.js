const { supabase } = require('../supabaseClient');
const messagingProvider = require('../messaging/messagingProvider');

const activeQueues = {};

/**
 * Crash Recovery: Recovers interrupted queue batches and message logs from ungraceful server restarts.
 */
const recoverOrphanedQueues = async () => {
  try {
    const nowIso = new Date().toISOString();
    // Mark interrupted batches
    await supabase
      .from('queue_batches')
      .update({ status: 'interrupted', updatedAt: nowIso })
      .eq('status', 'running');

    // Mark dangling "Sending" logs so they can be safely retried without being locked
    await supabase
      .from('message_logs')
      .update({
        status: 'Failed',
        errorReason: 'Dispatch interrupted by server restart — safe to retry'
      })
      .eq('status', 'Sending');

    console.log('[Queue Service] Crash recovery completed: orphaned jobs reconciled.');
  } catch (err) {
    console.warn('[Queue Service] Notice during crash recovery check:', err.message);
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatTemplate = (template, data) => {
  if (!template) return '';
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
};

const processSendQueue = async (companyId, queueItems, customMessageTemplate, io) => {
  if (activeQueues[companyId] && activeQueues[companyId].isRunning) {
    throw new Error('A sending process is already running for this company');
  }

  activeQueues[companyId] = { isRunning: true, isCancelled: false };

  // Create persistent batch record in SQLite
  const now = new Date().toISOString();
  const { data: batchRecord } = await supabase
    .from('queue_batches')
    .insert({
      company_id: companyId,
      status: 'running',
      totalItems: queueItems.length,
      processedItems: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      createdAt: now,
      updatedAt: now
    })
    .select()
    .single();

  const batchId = batchRecord?.id;

  let { data: settingsRow } = await supabase
    .from('settings')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!settingsRow) {
    const defaultTpl = "Hello {{name}},\n\nPlease find your document attached.\n\nThank you.";
    const { data: created } = await supabase
      .from('settings')
      .insert({ company_id: companyId, delayBetweenMessages: 4, messageTemplate: defaultTpl, autoRetryFailed: false })
      .select()
      .single();
    settingsRow = created;
  }

  const delayMs = ((settingsRow ? settingsRow.delayBetweenMessages : 4) || 4) * 1000;
  const templateToUse = customMessageTemplate || (settingsRow ? settingsRow.messageTemplate : '');

  const total = queueItems.length;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  console.log(`[Queue company_${companyId}] Starting queue for ${total} items with delay ${delayMs}ms`);

  const roomName = `user_${companyId}`;

  for (let i = 0; i < queueItems.length; i++) {
    if (activeQueues[companyId].isCancelled) {
      console.log(`[Queue company_${companyId}] Sending cancelled by user`);
      break;
    }

    const item = queueItems[i];
    const currentIndex = i + 1;
    const nowIso = new Date().toISOString();

    if (!item.forceSend) {
      const { data: existingSent } = await supabase
        .from('message_logs')
        .select('id')
        .eq('company_id', companyId)
        .eq('phone', item.phone)
        .eq('pdfFilename', item.pdfFilename)
        .eq('status', 'Sent')
        .maybeSingle();

      if (existingSent) {
        console.log(`[Queue company_${companyId}] Skipping ${item.pdfFilename} to ${item.name} - Already Sent`);
        await supabase.from('message_logs').insert({
          company_id: companyId,
          contactId: item.contactId || null,
          contactName: item.name,
          phone: item.phone,
          pdfFilename: item.pdfFilename,
          pdfPath: item.pdfPath || '',
          fileHash: item.fileHash || '',
          messageText: '',
          status: 'Already Sent',
          errorReason: 'Document already sent previously',
          sentAt: nowIso,
          createdAt: nowIso
        });

        skippedCount++;
        if (io) {
          io.to(roomName).emit('queue:progress', {
            current: currentIndex,
            total,
            percentage: Math.round((currentIndex / total) * 100),
            currentContact: item.name,
            sentCount,
            failedCount,
            skippedCount,
            pendingCount: total - currentIndex,
            lastStatus: 'Already Sent'
          });
        }
        continue;
      }
    }

    const messageText = formatTemplate(templateToUse, { name: item.name, phone: item.phone });

    const { data: insertedLog } = await supabase.from('message_logs').insert({
      company_id: companyId,
      contactId: item.contactId || null,
      contactName: item.name,
      phone: item.phone,
      pdfFilename: item.pdfFilename,
      pdfPath: item.pdfPath || '',
      fileHash: item.fileHash || '',
      messageText,
      status: 'Sending',
      errorReason: '',
      sentAt: null,
      createdAt: nowIso
    }).select().single();

    const logId = insertedLog?.id;

    if (io) {
      io.to(roomName).emit('message:sending', { logId, contactName: item.name, phone: item.phone });
      io.to(roomName).emit('queue:progress', {
        current: currentIndex,
        total,
        percentage: Math.round((currentIndex / total) * 100),
        currentContact: item.name,
        sentCount,
        failedCount,
        skippedCount,
        pendingCount: total - currentIndex,
        lastStatus: 'Sending'
      });
    }

    try {
      const sendResult = await messagingProvider.sendPdfDocument(
        companyId,
        item.phone,
        item.pdfPath,
        item.pdfFilename,
        messageText
      );
      const messageId = sendResult?.messageId || '';

      await supabase.from('message_logs').update({
        status: 'Sent',
        providerMessageId: messageId,
        sentAt: new Date().toISOString(),
        errorReason: ''
      }).eq('id', logId);
      sentCount++;

      if (io) {
        io.to(roomName).emit('message:sent', { logId, providerMessageId: messageId, contactName: item.name });
      }
    } catch (err) {
      console.error(`[Queue company_${companyId}] Failed to send to ${item.name} (${item.phone}): ${err.message}`);
      await supabase.from('message_logs').update({ status: 'Failed', errorReason: err.message || 'Failed to send WhatsApp message' }).eq('id', logId);
      failedCount++;

      if (io) {
        io.to(roomName).emit('message:failed', { logId, contactName: item.name, error: err.message });
      }
    }

    if (io) {
      io.to(roomName).emit('queue:progress', {
        current: currentIndex,
        total,
        percentage: Math.round((currentIndex / total) * 100),
        currentContact: item.name,
        sentCount,
        failedCount,
        skippedCount,
        pendingCount: total - currentIndex
      });
    }

    if (i < queueItems.length - 1 && !activeQueues[companyId].isCancelled) {
      await delay(delayMs);
    }
  }

  const wasCancelled = activeQueues[companyId]?.isCancelled;
  activeQueues[companyId] = { isRunning: false, isCancelled: false };

  // Update persistent batch record
  if (batchId) {
    await supabase
      .from('queue_batches')
      .update({
        status: wasCancelled ? 'cancelled' : 'completed',
        processedItems: total,
        sentCount,
        failedCount,
        skippedCount,
        updatedAt: new Date().toISOString()
      })
      .eq('id', batchId);
  }

  const finalSummary = {
    total,
    sentCount,
    failedCount,
    skippedCount
  };

  if (io) {
    io.to(roomName).emit('queue:completed', finalSummary);
  }

  return finalSummary;
};

const cancelQueue = async (companyId) => {
  if (activeQueues[companyId]) {
    activeQueues[companyId].isCancelled = true;
    try {
      await supabase
        .from('queue_batches')
        .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('status', 'running');
    } catch (e) {}
    return true;
  }
  return false;
};

const getQueueStatus = (companyId) => {
  return activeQueues[companyId] ? activeQueues[companyId].isRunning : false;
};

// Auto-run crash recovery on module startup
recoverOrphanedQueues();

module.exports = {
  processSendQueue,
  cancelQueue,
  getQueueStatus,
  recoverOrphanedQueues
};
