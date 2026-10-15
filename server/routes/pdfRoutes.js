const express = require('express');
const router = express.Router();
const {
  downloadPdfFile,
  downloadSignedPdf,
  uploadFiles,
  getPdfFiles,
  deletePdfFiles,
  getRetentionSummary,
  triggerRetentionCleanup
} = require('../controllers/pdfController');
const { protect } = require('../middleware/authMiddleware');
const { uploadPdf } = require('../middleware/uploadMiddleware');

router.get('/retention/status', protect, getRetentionSummary);
router.post('/retention/cleanup', protect, triggerRetentionCleanup);
router.get('/download-signed/:identifier', downloadSignedPdf);
router.get('/:id/file', protect, downloadPdfFile);
router.post('/upload-files', protect, uploadPdf.array('files', 500), uploadFiles);
router.get('/', protect, getPdfFiles);
router.delete('/', protect, deletePdfFiles);

module.exports = router;
