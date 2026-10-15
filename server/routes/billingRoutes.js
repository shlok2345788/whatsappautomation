const express = require('express');
const router = express.Router();
const {
  getTenantUsage,
  downloadUsageReport,
  getAdminUsageOverview
} = require('../controllers/billingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/usage', protect, getTenantUsage);
router.get('/export', protect, downloadUsageReport);
router.get('/admin/overview', protect, getAdminUsageOverview);

module.exports = router;
