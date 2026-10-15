const queueService = require('../services/queue/queueService');
const messagingProvider = require('../services/messaging/messagingProvider');
const { supabase } = require('../services/supabaseClient');

const startQueue = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { queueItems, messageTemplate, batchId } = req.body;

    // Check if tenant requires managerial approval for direct dispatches
    if (!batchId) {
      const { data: settingsRow } = await supabase
        .from('settings')
        .select('requireApproval')
        .eq('company_id', companyId)
        .maybeSingle();

      if (settingsRow && (settingsRow.requireApproval === 1 || settingsRow.requireApproval === true)) {
        return res.status(403).json({
          message: 'Direct dispatch denied: Managerial approval is required before sending messages. Please submit batch for review.',
          requiresApproval: true
        });
      }
    }

    const connection = await messagingProvider.checkConnection(companyId);
    if (connection.status !== 'CONNECTED') {
      return res.status(400).json({
        message: `WhatsApp Business API is not ready (${connection.message}). Please verify credentials in WhatsApp Setup.`
      });
    }

    const io = req.app.get('io');

    // If dispatching an existing batch
    if (batchId) {
      const result = await queueService.dispatchBatch(companyId, Number(batchId), io);
      return res.json({
        message: 'Approved batch dispatch started',
        batchId,
        result
      });
    }

    if (!queueItems || !Array.isArray(queueItems) || queueItems.length === 0) {
      return res.status(400).json({ message: 'No items provided for sending queue' });
    }

    // Check if tenant requires managerial approval
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('requireApproval')
      .eq('company_id', companyId)
      .maybeSingle();

    if (settingsRow && (settingsRow.requireApproval === 1 || settingsRow.requireApproval === true)) {
      return res.status(403).json({
        message: 'Direct dispatch denied: Managerial approval is required before sending messages. Please submit batch for review.',
        requiresApproval: true
      });
    }

    // Pre-validate queue items on server before starting dispatch
    const validatedItems = await queueService.validateAndResolveQueueItems(companyId, queueItems);

    queueService.processSendQueue(companyId, validatedItems, messageTemplate, io)
      .catch((err) => console.error('Queue execution error:', err.message));

    res.json({
      message: 'Send queue started successfully',
      itemCount: validatedItems.length
    });
  } catch (error) {
    next(error);
  }
};

const submitForApproval = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { queueItems, messageTemplate } = req.body;

    if (!queueItems || !Array.isArray(queueItems) || queueItems.length === 0) {
      return res.status(400).json({ message: 'No items provided for queue review' });
    }

    const batch = await queueService.prepareBatchForApproval(
      companyId,
      queueItems,
      messageTemplate,
      req.user?.id || companyId
    );

    res.status(201).json({
      message: 'Queue batch successfully submitted for managerial review',
      batch
    });
  } catch (error) {
    next(error);
  }
};

const approveBatch = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({ message: 'Missing batchId parameter' });
    }

    const managerId = req.user?.id || req.user?.name || companyId;
    const result = await queueService.approveBatch(companyId, Number(batchId), managerId);

    res.json({
      message: `Batch #${batchId} approved successfully`,
      approval: result
    });
  } catch (error) {
    next(error);
  }
};

const rejectBatch = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { batchId } = req.params;
    const { reason } = req.body || {};

    if (!batchId) {
      return res.status(400).json({ message: 'Missing batchId parameter' });
    }

    const managerId = req.user?.id || req.user?.name || companyId;
    const result = await queueService.rejectBatch(companyId, Number(batchId), managerId, reason);

    res.json({
      message: `Batch #${batchId} rejected`,
      result
    });
  } catch (error) {
    next(error);
  }
};

const dispatchApprovedBatch = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({ message: 'Missing batchId parameter' });
    }

    const connection = await messagingProvider.checkConnection(companyId);
    if (connection.status !== 'CONNECTED') {
      return res.status(400).json({
        message: `WhatsApp Business API is not ready (${connection.message}). Please verify credentials in WhatsApp Setup.`
      });
    }

    const io = req.app.get('io');
    const result = await queueService.dispatchBatch(companyId, Number(batchId), io);

    res.json({
      message: `Approved batch #${batchId} dispatch initiated`,
      result
    });
  } catch (error) {
    next(error);
  }
};

const listBatches = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { approvalStatus } = req.query || {};

    const batches = await queueService.listBatches(companyId, { approvalStatus });
    res.json(batches);
  } catch (error) {
    next(error);
  }
};

const cancelQueue = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const success = await queueService.cancelQueue(companyId);
    res.json({
      message: success ? 'Queue cancellation requested' : 'No active queue to cancel',
      success
    });
  } catch (error) {
    next(error);
  }
};

const getQueueStatus = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const isRunning = queueService.getQueueStatus(companyId);
    res.json({ isRunning });
  } catch (error) {
    next(error);
  }
};

const resumeQueue = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({ message: 'Missing required batchId' });
    }

    const connection = await messagingProvider.checkConnection(companyId);
    if (connection.status !== 'CONNECTED') {
      return res.status(400).json({
        message: `WhatsApp Business API is not ready (${connection.message}). Please verify credentials in WhatsApp Setup.`
      });
    }

    const io = req.app.get('io');
    const result = await queueService.resumeBatch(companyId, Number(batchId), io);

    res.json({
      message: 'Queue resumption initiated',
      result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startQueue,
  submitForApproval,
  approveBatch,
  rejectBatch,
  dispatchApprovedBatch,
  listBatches,
  cancelQueue,
  getQueueStatus,
  resumeQueue
};
