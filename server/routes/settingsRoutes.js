const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, updateProfile } = require('../controllers/settingsController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getSettings);
router.put('/', protect, updateSettings);
router.put('/profile', protect, updateProfile);

module.exports = router;
