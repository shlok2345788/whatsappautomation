const express = require('express');
const router = express.Router();
const { scanFolder, uploadFiles, getPdfFiles, deletePdfFiles } = require('../controllers/pdfController');
const { protect } = require('../middleware/authMiddleware');
const { uploadPdf } = require('../middleware/uploadMiddleware');

router.post('/scan-folder', protect, scanFolder);
router.post('/upload-files', protect, uploadPdf.array('files', 500), uploadFiles);
router.get('/', protect, getPdfFiles);
router.delete('/', protect, deletePdfFiles);

module.exports = router;
