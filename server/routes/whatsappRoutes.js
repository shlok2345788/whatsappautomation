const express = require('express');
const router = express.Router();
const {
  getStatus,
  saveConfiguration,
  verifyConnection,
  sendTestMessage
} = require('../controllers/whatsappController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getStatus);
router.post('/config', protect, saveConfiguration);
router.post('/verify', protect, verifyConnection);
router.post('/test-message', protect, sendTestMessage);

// Graceful fallback for obsolete WhatsApp Web endpoints
router.all('/connect', (req, res) => {
  res.status(200).json({
    status: 'NOT_CONFIGURED',
    message: 'QR-based WhatsApp Web sessions are deprecated and replaced by Gupshup WhatsApp Business API.'
  });
});

router.all('/disconnect', (req, res) => {
  res.status(200).json({
    status: 'NOT_CONFIGURED',
    message: 'WhatsApp Web sessions are obsolete. Gupshup WhatsApp Business API is active.'
  });
});

module.exports = router;
