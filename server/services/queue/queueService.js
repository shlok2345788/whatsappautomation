const { supabase } = require('../supabaseClient');
const whatsappService = require('../whatsapp/whatsappService');

const activeQueues = {};

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
      const status = whatsappService.getClientStatus(companyId);
      if (status !== 'CONNECTED') {
        throw new Error('WhatsApp connection lost during sending process');
      }

      await whatsappService.sendPdfDocument(
        companyId,
        item.phone,
        item.pdfPath,
        item.pdfFilename,
        messageText
      );

      await supabase.from('message_logs').update({ status: 'Sent', sentAt: new Date().toISOString(), errorReason: '' }).eq('id', logId);
      sentCount++;

      if (io) {
        io.to(roomName).emit('message:sent', { logId, contactName: item.name });
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

  activeQueues[companyId] = { isRunning: false, isCancelled: false };

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

const cancelQueue = (companyId) => {
  if (activeQueues[companyId]) {
    activeQueues[companyId].isCancelled = true;
    return true;
  }
  return false;
};

const getQueueStatus = (companyId) => {
  return activeQueues[companyId] ? activeQueues[companyId].isRunning : false;
};

module.exports = {
  processSendQueue,
  cancelQueue,
  getQueueStatus
};
