const express = require('express');
const router = express.Router();
const { startQueue, cancelQueue, getQueueStatus, resumeQueue } = require('../controllers/queueController');
const { protect } = require('../middleware/authMiddleware');

router.post('/start', protect, startQueue);
router.post('/cancel', protect, cancelQueue);
router.post('/resume/:batchId', protect, resumeQueue);
router.get('/status', protect, getQueueStatus);

module.exports = router;
