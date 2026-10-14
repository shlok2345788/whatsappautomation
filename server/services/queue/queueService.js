const fs = require('fs');
const crypto = require('crypto');
const { supabase } = require('../supabaseClient');
const messagingProvider = require('../messaging/messagingProvider');

const computeFileSha256 = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return '';
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (e) {
    return '';
  }
};

const activeQueues = {};

/**
 * Validates queue items against server database records and resolves all recipient
 * and file metadata exclusively from authorized server-side tables.
 */
const validateAndResolveQueueItems = async (companyId, rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Queue items must be a non-empty array');
  }

  const validated = [];

  for (const item of rawItems) {
    const pdfId = item.pdfId || item.id;
    if (!pdfId) {
      throw new Error('Missing required server-generated pdfId');
    }

    // 1. Resolve and verify PDF ownership strictly from database
    const { data: pdfRow, error: pdfErr } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('id', pdfId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (pdfErr || !pdfRow) {
      throw new Error(`Unauthorized or invalid PDF identifier: ${pdfId}`);
    }

    if (!fs.existsSync(pdfRow.filePath)) {
      throw new Error(`PDF document '${pdfRow.originalFilename}' is not available on storage`);
    }

    // 2. Resolve authorized recipient contact strictly from server database
    const contactId = item.contactId || pdfRow.matchedContactId;
    if (!contactId) {
      throw new Error(`PDF '${pdfRow.originalFilename}' has no authorized matched contact`);
    }

    const { data: contactRow, error: contactErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (contactErr || !contactRow) {
      throw new Error(`Unauthorized contact: Contact record does not belong to authorized company`);
    }

    if (!contactRow.mobile || String(contactRow.mobile).replace(/\D/g, '').length < 10) {
      throw new Error(`Contact '${contactRow.name}' does not have a valid mobile phone number`);
    }

    // 3. Assemble validated server-authoritative record
    const shaHash = computeFileSha256(pdfRow.filePath) || pdfRow.fileHash || '';
    validated.push({
      pdfId: pdfRow.id,
      contactId: contactRow.id,
      name: contactRow.name,
      phone: contactRow.mobile,
      pdfFilename: pdfRow.originalFilename,
      pdfPath: pdfRow.filePath,
      fileHash: shaHash,
      forceSend: Boolean(item.forceSend)
    });
  }

  return validated;
};

/**
 * Crash Recovery: Recovers interrupted queue batches, queue items, and message logs from ungraceful server restarts.
 */
const recoverOrphanedQueues = async () => {
  try {
    const nowIso = new Date().toISOString();

    // 1. Mark dangling "Sending" logs so they can be safely retried without being locked
    await supabase
      .from('message_logs')
      .update({
        status: 'Failed',
        errorReason: 'Dispatch interrupted by server restart — safe to retry'
      })
      .eq('status', 'Sending');

    // 2. Reconcile queue_items in 'processing' state:
    // If providerMessageId exists, the message was accepted by provider! Mark 'sent'. Do NOT resend.
    // If no providerMessageId exists, the dispatch died before submission. Reset to 'pending' to allow safe resumption.
    try {
      const { data: processingItems } = await supabase
        .from('queue_items')
        .select('*')
        .eq('status', 'processing');

      if (processingItems && processingItems.length > 0) {
        for (const it of processingItems) {
          if (it.providerMessageId && it.providerMessageId.trim().length > 0) {
            await supabase.from('queue_items').update({
              status: 'sent',
              deliveryStatus: 'submitted',
              updatedAt: nowIso
            }).eq('id', it.id);
          } else {
            await supabase.from('queue_items').update({
              status: 'pending',
              errorReason: 'Worker interrupted during dispatch — queued for resumption',
              updatedAt: nowIso
            }).eq('id', it.id);
          }
        }
      }
    } catch (e) {
      // safe fallback if table not yet initialized
    }

    // 3. Mark interrupted running batches
    await supabase
      .from('queue_batches')
      .update({ status: 'interrupted', updatedAt: nowIso })
      .eq('status', 'running');

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

/**
 * Sequential queue processing engine with atomic item state transitions
 */
const processQueueItems = async (
  companyId,
  batchId,
  itemsToProcess,
  templateToUse,
  delayMs,
  total,
  initialSent = 0,
  initialSimulated = 0,
  initialFailed = 0,
  initialSkipped = 0,
  io = null
) => {
  let sentCount = initialSent;
  let simulatedCount = initialSimulated;
  let failedCount = initialFailed;
  let skippedCount = initialSkipped;

  const roomName = `user_${companyId}`;

  for (let i = 0; i < itemsToProcess.length; i++) {
    if (activeQueues[companyId]?.isCancelled) {
      console.log(`[Queue company_${companyId}] Sending cancelled by user`);
      break;
    }

    const item = itemsToProcess[i];
    const currentIndex = (sentCount + simulatedCount + failedCount + skippedCount) + 1;
    const nowIso = new Date().toISOString();

    // Mark item in 'processing' state before dispatch
    if (item.queueItemId) {
      await supabase.from('queue_items').update({
        status: 'processing',
        attemptCount: (item.attemptCount || 0) + 1,
        updatedAt: nowIso
      }).eq('id', item.queueItemId);
    }

    // Cryptographic SHA-256 content-hash duplicate detection scoped to company_id and recipient phone
    const activeFileHash = item.fileHash || computeFileSha256(item.pdfPath);

    if (!item.forceSend) {
      let existingSent = null;

      if (activeFileHash) {
        const { data: hashMatch } = await supabase
          .from('message_logs')
          .select('id, pdfFilename')
          .eq('company_id', companyId)
          .eq('phone', item.phone)
          .eq('fileHash', activeFileHash)
          .in('status', ['Sent', 'Simulated'])
          .maybeSingle();

        if (hashMatch) {
          existingSent = hashMatch;
        }
      }

      if (existingSent) {
        console.log(`[Queue company_${companyId}] Skipping ${item.pdfFilename} to ${item.name} - Duplicate Content Detected (matching previously sent ${existingSent.pdfFilename || 'file'})`);
        await supabase.from('message_logs').insert({
          company_id: companyId,
          contactId: item.contactId || null,
          contactName: item.name,
          phone: item.phone,
          pdfFilename: item.pdfFilename,
          pdfPath: item.pdfPath || '',
          fileHash: activeFileHash || '',
          messageText: '',
          status: 'Already Sent',
          errorReason: 'Document with identical cryptographic content hash already sent to this recipient',
          sentAt: nowIso,
          createdAt: nowIso
        });

        if (item.queueItemId) {
          await supabase.from('queue_items').update({
            status: 'skipped',
            errorReason: 'Document with identical cryptographic content hash already sent to this recipient',
            updatedAt: nowIso
          }).eq('id', item.queueItemId);
        }

        skippedCount++;
        if (io) {
          io.to(roomName).emit('queue:progress', {
            current: currentIndex,
            total,
            percentage: Math.round((currentIndex / total) * 100),
            currentContact: item.name,
            sentCount,
            simulatedCount,
            failedCount,
            skippedCount,
            pendingCount: total - currentIndex,
            lastStatus: 'Already Sent'
          });
        }
        continue;
      }
    }

    const messageText = item.messageText || formatTemplate(templateToUse, { name: item.name, phone: item.phone });

    const { data: insertedLog } = await supabase.from('message_logs').insert({
      company_id: companyId,
      contactId: item.contactId || null,
      contactName: item.name,
      phone: item.phone,
      pdfFilename: item.pdfFilename,
      pdfPath: item.pdfPath || '',
      fileHash: activeFileHash || '',
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
        simulatedCount,
        failedCount,
        skippedCount,
        pendingCount: total - currentIndex,
        lastStatus: 'Sending'
      });
    }

    try {
      // Re-verify PDF ownership and file existence strictly at execution time
      const { data: verifiedPdf } = await supabase
        .from('pdf_files')
        .select('id, filePath, originalFilename')
        .eq('id', item.pdfId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (!verifiedPdf || !fs.existsSync(verifiedPdf.filePath)) {
        throw new Error('Document access authorization revoked or file removed before dispatch');
      }

      const templateParams = [
        item.name,
        verifiedPdf.originalFilename
      ];

      const sendResult = await messagingProvider.sendPdfDocument(
        companyId,
        item.phone,
        verifiedPdf.filePath,
        verifiedPdf.originalFilename,
        messageText,
        verifiedPdf.id,
        templateParams
      );
      const messageId = sendResult?.messageId || '';
      const isSimulated = Boolean(sendResult?.isSimulation || sendResult?.provider === 'gupshup-simulated' || sendResult?.status === 'simulated');

      const finalStatus = isSimulated ? 'Simulated' : 'Sent';
      const finalDeliveryStatus = isSimulated ? 'simulated' : 'submitted';
      const simulationNotice = isSimulated ? 'Dispatched in development simulation mode (not delivered to real carrier)' : '';

      await supabase.from('message_logs').update({
        status: finalStatus,
        deliveryStatus: finalDeliveryStatus,
        providerMessageId: messageId,
        sentAt: new Date().toISOString(),
        errorReason: simulationNotice,
        isSimulation: isSimulated ? 1 : 0
      }).eq('id', logId);

      if (item.queueItemId) {
        await supabase.from('queue_items').update({
          status: isSimulated ? 'simulated' : 'sent',
          deliveryStatus: finalDeliveryStatus,
          providerMessageId: messageId,
          logId: logId,
          updatedAt: new Date().toISOString()
        }).eq('id', item.queueItemId);
      }

      if (isSimulated) {
        simulatedCount++;
      } else {
        sentCount++;
      }

      if (io) {
        io.to(roomName).emit('message:sent', {
          logId,
          providerMessageId: messageId,
          contactName: item.name,
          isSimulation: isSimulated,
          status: finalStatus
        });
      }
    } catch (err) {
      console.error(`[Queue company_${companyId}] Failed to send to ${item.name} (${item.phone}): ${err.message}`);
      await supabase.from('message_logs').update({ status: 'Failed', errorReason: err.message || 'Failed to send WhatsApp message' }).eq('id', logId);

      if (item.queueItemId) {
        await supabase.from('queue_items').update({
          status: 'failed',
          errorReason: err.message || 'Failed to send WhatsApp message',
          logId: logId,
          updatedAt: new Date().toISOString()
        }).eq('id', item.queueItemId);
      }

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
        simulatedCount,
        failedCount,
        skippedCount,
        pendingCount: total - currentIndex
      });
    }

    // Update batch in real-time
    if (batchId) {
      await supabase.from('queue_batches').update({
        processedItems: sentCount + simulatedCount + failedCount + skippedCount,
        sentCount,
        simulatedCount,
        failedCount,
        skippedCount,
        updatedAt: new Date().toISOString()
      }).eq('id', batchId);
    }

    if (i < itemsToProcess.length - 1 && !activeQueues[companyId]?.isCancelled) {
      await delay(delayMs);
    }
  }

  const wasCancelled = activeQueues[companyId]?.isCancelled;
  activeQueues[companyId] = { isRunning: false, isCancelled: false };

  // Update persistent batch record
  if (batchId) {
    const isFinished = (sentCount + simulatedCount + failedCount + skippedCount) >= total;
    await supabase
      .from('queue_batches')
      .update({
        status: wasCancelled ? 'cancelled' : (isFinished ? 'completed' : 'interrupted'),
        processedItems: sentCount + simulatedCount + failedCount + skippedCount,
        sentCount,
        simulatedCount,
        failedCount,
        skippedCount,
        updatedAt: new Date().toISOString()
      })
      .eq('id', batchId);
  }

  const finalSummary = {
    total,
    sentCount,
    simulatedCount,
    failedCount,
    skippedCount
  };

  if (io) {
    io.to(roomName).emit('queue:completed', finalSummary);
  }

  return finalSummary;
};

const processSendQueue = async (companyId, rawQueueItems, customMessageTemplate, io) => {
  if (activeQueues[companyId] && activeQueues[companyId].isRunning) {
    throw new Error('A sending process is already running for this company');
  }

  // Validate template configuration before queue processing
  await messagingProvider.validateTemplateConfig(companyId);

  // Validate and resolve items strictly against server database records
  const queueItems = await validateAndResolveQueueItems(companyId, rawQueueItems);

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
      simulatedCount: 0,
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

  // Persist each individual queue item in database before dispatch
  const itemsToProcess = [];
  for (const item of queueItems) {
    const itemMsgText = formatTemplate(templateToUse, { name: item.name, phone: item.phone });
    const { data: createdItem } = await supabase
      .from('queue_items')
      .insert({
        batch_id: batchId,
        company_id: companyId,
        contactId: item.contactId || null,
        recipientName: item.name,
        recipientPhone: item.phone,
        pdfId: item.pdfId,
        pdfFilename: item.pdfFilename,
        pdfPath: item.pdfPath,
        fileHash: item.fileHash || '',
        messageText: itemMsgText,
        status: 'pending',
        deliveryStatus: 'pending',
        attemptCount: 0,
        providerMessageId: '',
        errorReason: '',
        approvalRef: item.approvalRef || null,
        createdAt: now,
        updatedAt: now
      })
      .select()
      .single();

    itemsToProcess.push({
      ...item,
      messageText: itemMsgText,
      queueItemId: createdItem?.id
    });
  }

  console.log(`[Queue company_${companyId}] Starting queue for ${queueItems.length} items with delay ${delayMs}ms`);

  return processQueueItems(
    companyId,
    batchId,
    itemsToProcess,
    templateToUse,
    delayMs,
    queueItems.length,
    0, 0, 0, 0,
    io
  );
};

/**
 * Resumes an interrupted or partially completed queue batch safely without duplicating sent messages
 */
const resumeBatch = async (companyId, batchId, io) => {
  if (activeQueues[companyId] && activeQueues[companyId].isRunning) {
    throw new Error('A sending process is already running for this company');
  }

  // 1. Fetch batch and verify company ownership
  const { data: batch, error } = await supabase
    .from('queue_batches')
    .select('*')
    .eq('id', batchId)
    .eq('company_id', companyId)
    .single();

  if (error || !batch) {
    throw new Error('Queue batch not found or unauthorized');
  }

  if (batch.status === 'completed') {
    return { message: 'Batch is already completed', batch };
  }

  // 2. Fetch all pending queue_items for this batch
  const { data: pendingItems } = await supabase
    .from('queue_items')
    .select('*')
    .eq('batch_id', batchId)
    .eq('company_id', companyId)
    .eq('status', 'pending');

  if (!pendingItems || pendingItems.length === 0) {
    // If no items are pending, mark batch completed
    await supabase.from('queue_batches').update({
      status: 'completed',
      updatedAt: new Date().toISOString()
    }).eq('id', batchId);
    return { message: 'No remaining pending items in batch. Batch marked completed.', batch };
  }

  // 3. Set batch to running
  await supabase.from('queue_batches').update({
    status: 'running',
    updatedAt: new Date().toISOString()
  }).eq('id', batchId);

  activeQueues[companyId] = { isRunning: true, isCancelled: false };

  // 4. Fetch settings for message template and delay
  let { data: settingsRow } = await supabase
    .from('settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  const delayMs = ((settingsRow ? settingsRow.delayBetweenMessages : 4) || 4) * 1000;
  const templateToUse = settingsRow?.messageTemplate || '';

  // 5. Format pending items
  const itemsToProcess = pendingItems.map(pi => ({
    queueItemId: pi.id,
    pdfId: pi.pdfId,
    contactId: pi.contactId,
    name: pi.recipientName,
    phone: pi.recipientPhone,
    pdfFilename: pi.pdfFilename,
    pdfPath: pi.pdfPath,
    fileHash: pi.fileHash,
    messageText: pi.messageText,
    attemptCount: pi.attemptCount || 0,
    forceSend: false
  }));

  console.log(`[Queue company_${companyId}] Resuming batch ${batchId} for ${itemsToProcess.length} pending items`);

  return processQueueItems(
    companyId,
    batch.id,
    itemsToProcess,
    templateToUse,
    delayMs,
    batch.totalItems,
    batch.sentCount || 0,
    batch.simulatedCount || 0,
    batch.failedCount || 0,
    batch.skippedCount || 0,
    io
  );
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
  validateAndResolveQueueItems,
  processSendQueue,
  resumeBatch,
  cancelQueue,
  getQueueStatus,
  recoverOrphanedQueues,
  computeFileSha256
};
