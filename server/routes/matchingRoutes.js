const express = require('express');
const router = express.Router();
const { previewMatches, confirmManualMatch } = require('../controllers/matchingController');
const { protect } = require('../middleware/authMiddleware');

router.post('/preview', protect, previewMatches);
router.post('/confirm-manual', protect, confirmManualMatch);

module.exports = router;
