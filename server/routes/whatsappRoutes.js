const express = require('express');
const router = express.Router();
const { getStatus, getQrCode, connectWhatsApp, disconnectWhatsApp } = require('../controllers/whatsappController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getStatus);
router.get('/qr', protect, getQrCode);
router.post('/connect', protect, connectWhatsApp);
router.post('/disconnect', protect, disconnectWhatsApp);

module.exports = router;
