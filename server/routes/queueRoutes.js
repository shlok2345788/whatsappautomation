const express = require('express');
const router = express.Router();
const {
  startQueue,
  submitForApproval,
  approveBatch,
  rejectBatch,
  dispatchApprovedBatch,
  listBatches,
  cancelQueue,
  getQueueStatus,
  resumeQueue
} = require('../controllers/queueController');
const { protect } = require('../middleware/authMiddleware');

router.post('/start', protect, startQueue);
router.post('/submit-approval', protect, submitForApproval);
router.get('/batches', protect, listBatches);
router.post('/batches/:batchId/approve', protect, approveBatch);
router.post('/batches/:batchId/reject', protect, rejectBatch);
router.post('/batches/:batchId/dispatch', protect, dispatchApprovedBatch);
router.post('/cancel', protect, cancelQueue);
router.post('/resume/:batchId', protect, resumeQueue);
router.get('/status', protect, getQueueStatus);

module.exports = router;
