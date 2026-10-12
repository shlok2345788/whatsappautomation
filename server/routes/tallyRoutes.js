const express = require('express');
const router = express.Router();
const { getTallyStatus, syncTallyContacts, generateLedgerStatements } = require('../controllers/tallyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getTallyStatus);
router.post('/sync-contacts', protect, syncTallyContacts);
router.post('/generate-ledgers', protect, generateLedgerStatements);

module.exports = router;
