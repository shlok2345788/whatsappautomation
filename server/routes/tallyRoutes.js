const express = require('express');
const router = express.Router();
const {
  getTallyStatus,
  getTallyCompanyInfo,
  getLedgers,
  syncTallyContacts,
  generateLedgerStatements,
  previewLedger,
  getBalanceSheet,
  generateBalanceSheetPdfReport
} = require('../controllers/tallyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getTallyStatus);
router.get('/company-info', protect, getTallyCompanyInfo);
router.get('/ledgers', protect, getLedgers);
router.post('/sync-contacts', protect, syncTallyContacts);
router.post('/generate-ledgers', protect, generateLedgerStatements);
router.post('/preview-ledger', protect, previewLedger);
router.get('/balance-sheet', protect, getBalanceSheet);
router.post('/generate-balance-sheet', protect, generateBalanceSheetPdfReport);

module.exports = router;
