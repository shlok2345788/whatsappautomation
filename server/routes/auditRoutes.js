const express = require('express');
const router = express.Router();
const { getAuditLogsHandler, getAuditCategoriesHandler } = require('../controllers/auditController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getAuditLogsHandler);
router.get('/categories', protect, getAuditCategoriesHandler);

module.exports = router;
