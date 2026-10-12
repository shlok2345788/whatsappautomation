const gupshupService = require('../services/whatsapp/gupshupService');

const handleGupshupWebhook = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const result = await gupshupService.handleWebhookEvent(req.body, io);
    res.json({ status: 'ok', result });
  } catch (error) {
    console.error('[Gupshup Webhook Handler Error]:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  handleGupshupWebhook
};
