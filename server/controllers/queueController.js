const queueService = require('../services/queue/queueService');
const whatsappService = require('../services/whatsapp/whatsappService');

const startQueue = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const { queueItems, messageTemplate } = req.body;

    if (!queueItems || !Array.isArray(queueItems) || queueItems.length === 0) {
      return res.status(400).json({ message: 'No items provided for sending queue' });
    }

    const wsStatus = whatsappService.getClientStatus(companyId);
    if (wsStatus !== 'CONNECTED') {
      return res.status(400).json({ message: 'WhatsApp is not connected for this company. Please scan QR code first.' });
    }

    const io = req.app.get('io');

    queueService.processSendQueue(companyId, queueItems, messageTemplate, io)
      .catch((err) => console.error('Queue execution error:', err.message));

    res.json({
      message: 'Send queue started successfully',
      itemCount: queueItems.length
    });
  } catch (error) {
    next(error);
  }
};

const cancelQueue = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id || req.user._id;
    const success = queueService.cancelQueue(companyId);
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

module.exports = {
  startQueue,
  cancelQueue,
  getQueueStatus
};
