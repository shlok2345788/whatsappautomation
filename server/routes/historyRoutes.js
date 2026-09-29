const express = require('express');
const router = express.Router();
const { getHistory, retryMessage, clearHistory } = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getHistory);
router.post('/:id/retry', protect, retryMessage);
router.delete('/', protect, clearHistory);

module.exports = router;
