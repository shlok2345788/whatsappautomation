const queueService = require('../services/queue/queueService');
const messagingProvider = require('../services/messaging/messagingProvider');

const startQueue = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { queueItems, messageTemplate } = req.body;

    if (!queueItems || !Array.isArray(queueItems) || queueItems.length === 0) {
      return res.status(400).json({ message: 'No items provided for sending queue' });
    }

    const connection = await messagingProvider.checkConnection(companyId);
    if (connection.status !== 'CONNECTED') {
      return res.status(400).json({
        message: `WhatsApp Business API is not ready (${connection.message}). Please verify credentials in WhatsApp Setup.`
      });
    }

    const io = req.app.get('io');

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
  cancelQueue,
  getQueueStatus,
  resumeQueue
};
