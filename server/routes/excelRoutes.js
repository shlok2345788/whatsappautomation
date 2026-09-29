const express = require('express');
const router = express.Router();
const {
  uploadAndParseExcel,
  confirmImportContacts,
  getContacts,
  deleteContact,
  deleteAllContacts
} = require('../controllers/excelController');
const { protect } = require('../middleware/authMiddleware');
const { uploadExcel } = require('../middleware/uploadMiddleware');

router.post('/upload', protect, uploadExcel.single('file'), uploadAndParseExcel);
router.post('/confirm', protect, confirmImportContacts);
router.get('/contacts', protect, getContacts);
router.delete('/contacts/:id', protect, deleteContact);
router.delete('/contacts', protect, deleteAllContacts);

module.exports = router;
