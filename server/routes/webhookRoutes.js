const express = require('express');
const router = express.Router();
const { handleGupshupWebhook } = require('../controllers/webhookController');

router.post('/gupshup', handleGupshupWebhook);
router.get('/gupshup', (req, res) => res.send('Gupshup Webhook Active'));

module.exports = router;
