const path = require('path');
const { supabase } = require('../services/supabaseClient');
const tallyService = require('../services/tally/tallyService');
const { generateLedgerPdf } = require('../services/pdf/ledgerGenerator');

/**
 * Checks connection status to Tally Prime XML server.
 */
const getTallyStatus = async (req, res, next) => {
  try {
    const status = await tallyService.checkTallyStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
};

/**
 * Syncs debtor customer records from Tally Prime into the tenant's contacts table.
 */
const syncTallyContacts = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const ledgers = await tallyService.getCustomerLedgers();

    let addedCount = 0;
    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const ledger of ledgers) {
      if (!ledger.name || !ledger.mobile) continue;

      // Check if contact already exists by mobile
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('mobile', ledger.mobile)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('contacts')
          .update({ name: ledger.name })
          .eq('id', existing.id);
        updatedCount++;
      } else {
        await supabase.from('contacts').insert({
          company_id: companyId,
          name: ledger.name,
          mobile: ledger.mobile,
          originalMobile: ledger.mobile,
          isValid: 1,
          statusMessage: 'Synced from Tally Prime',
          createdAt: nowIso
        });
        addedCount++;
      }
    }

    const { data: allContacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });

    res.json({
      message: `Tally Sync complete: ${addedCount} added, ${updatedCount} updated.`,
      addedCount,
      updatedCount,
      totalContacts: (allContacts || []).length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generates automated PDF ledger statements from Tally and registers them in pdf_files.
 */
const generateLedgerStatements = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { clearPrevious } = req.body;

    const ledgers = await tallyService.getCustomerLedgers();
    const uploadsDir = path.resolve(
      process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'),
      'pdfs',
      `tenant_${String(companyId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
    );

    if (clearPrevious) {
      await supabase.from('pdf_files').delete().eq('company_id', companyId);
    }

    // Load existing contacts to auto-match
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, mobile')
      .eq('company_id', companyId);

    const contactByMobile = new Map((contacts || []).map((c) => [c.mobile, c.id]));
    const contactByName = new Map((contacts || []).map((c) => [c.name.toLowerCase().trim(), c.id]));

    const generatedPdfs = [];
    const createdAt = new Date().toISOString();

    for (const ledger of ledgers) {
      const generated = await generateLedgerPdf(
        {
          companyName: req.user?.company_name || 'Accounts Department',
          customerName: ledger.name,
          mobile: ledger.mobile,
          statementPeriod: ledger.statementPeriod || 'Current FY 2025-26',
          closingBalance: ledger.closingBalance,
          balanceType: ledger.balanceType,
          transactions: ledger.transactions || []
        },
        uploadsDir
      );

      // Pre-match contact if available
      const matchedContactId = contactByMobile.get(ledger.mobile) ||
                               contactByName.get(ledger.name.toLowerCase().trim()) ||
                               null;

      const { data: insertedRecord, error: insertErr } = await supabase
        .from('pdf_files')
        .insert({
          company_id: companyId,
          originalFilename: generated.originalFilename,
          extractedName: generated.extractedName,
          filePath: generated.filePath,
          fileSize: generated.fileSize,
          fileHash: generated.fileHash,
          matchedContactId,
          createdAt
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      generatedPdfs.push(insertedRecord);
    }

    res.status(201).json({
      message: `Generated ${generatedPdfs.length} customer ledger statements from Tally`,
      count: generatedPdfs.length,
      pdfs: generatedPdfs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTallyStatus,
  syncTallyContacts,
  generateLedgerStatements
};
