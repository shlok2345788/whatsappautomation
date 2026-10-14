const path = require('path');
const fs = require('fs');
const { supabase } = require('../services/supabaseClient');
const tallyService = require('../services/tally/tallyService');
const { generateLedgerPdf, buildLedgerHtml } = require('../services/pdf/ledgerGenerator');
const { generateBalanceSheetPdf, buildBalanceSheetHtml } = require('../services/pdf/balanceSheetGenerator');
const { computeLedgerStatement } = require('../financial/financialEngine');

/**
 * Checks connection status to Tally Prime XML server.
 */
const getTallyStatus = async (req, res, next) => {
  try {
    const tallyUrl = req.query.tallyUrl || process.env.TALLY_API_URL || 'http://localhost:9000';
    const status = await tallyService.checkTallyStatus(tallyUrl);
    res.json(status);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves company profile details from Tally Prime.
 */
const getTallyCompanyInfo = async (req, res, next) => {
  try {
    const companyName = req.query.companyName;
    const isDemoMode = req.query.isDemoMode === 'true';
    const info = await tallyService.getCompanyInfo({
      companyName,
      allowSimulation: isDemoMode
    });
    res.json(info);
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
};

/**
 * Fetches debtor customer ledgers with calculated balances and reconciliation status.
 */
const getLedgers = async (req, res, next) => {
  try {
    const companyName = req.query.companyName;
    const statementPeriod = req.query.statementPeriod;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const isDemoMode = req.query.isDemoMode === 'true';

    const ledgers = await tallyService.getCustomerLedgers({
      companyName,
      statementPeriod,
      fromDate,
      toDate,
      allowSimulation: isDemoMode,
      isDemoMode
    });

    res.json({
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
};

/**
 * Syncs debtor customer records from Tally Prime into the tenant's contacts table.
 */
const syncTallyContacts = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const isDemoMode = req.body?.isDemoMode === true || req.query?.isDemoMode === 'true';
    const companyName = req.body?.companyName || req.query?.companyName;

    const ledgers = await tallyService.getCustomerLedgers({
      companyName,
      allowSimulation: isDemoMode,
      isDemoMode,
      includeTransactions: false
    });

    let addedCount = 0;
    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const ledger of ledgers) {
      if (!ledger.name || !ledger.mobile) continue;

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
          statusMessage: isDemoMode ? 'Synced from Tally (Sandbox)' : 'Synced from Live Tally Prime',
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
    res.status(503).json({ message: error.message });
  }
};

/**
 * Generates automated PDF ledger statements from Tally and registers them in pdf_files.
 */
const generateLedgerStatements = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const {
      clearPrevious,
      companyName,
      statementPeriod,
      fromDate,
      toDate,
      partyNames,
      isDemoMode
    } = req.body;

    const ledgers = await tallyService.getCustomerLedgers({
      companyName,
      statementPeriod,
      fromDate,
      toDate,
      allowSimulation: Boolean(isDemoMode),
      isDemoMode: Boolean(isDemoMode)
    });

    // Filter by specific parties if provided
    const targetLedgers = Array.isArray(partyNames) && partyNames.length > 0
      ? ledgers.filter((l) => partyNames.includes(l.name))
      : ledgers;

    if (targetLedgers.length === 0) {
      return res.status(404).json({ message: 'No customer ledgers found matching criteria' });
    }

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

    for (const ledger of targetLedgers) {
      const generated = await generateLedgerPdf(
        {
          companyName: companyName || req.user?.company_name || 'Accounts Department',
          customerName: ledger.name,
          customerMobile: ledger.mobile,
          customerEmail: ledger.email,
          customerAddress: ledger.address,
          customerGstin: ledger.gstin,
          statementPeriod: statementPeriod || ledger.statementPeriod || 'Current Financial Year',
          openingBalance: ledger.openingBalance,
          openingBalanceType: ledger.openingBalanceType,
          closingBalance: ledger.closingBalance,
          balanceType: ledger.balanceType,
          totalDebits: ledger.totalDebits,
          totalCredits: ledger.totalCredits,
          transactions: ledger.transactions || [],
          isReconciled: ledger.isReconciled,
          discrepancyAmount: ledger.discrepancyAmount,
          source: ledger.source || (isDemoMode ? 'DEMO / SYNTHETIC - NOT LIVE' : 'tally-live')
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
      message: `Generated ${generatedPdfs.length} customer ledger statement(s) from Tally`,
      count: generatedPdfs.length,
      pdfs: generatedPdfs
    });
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
};

/**
 * On-demand preview endpoint: returns HTML and computed statement data for instant preview.
 */
const previewLedger = async (req, res, next) => {
  try {
    const {
      ledgerName,
      companyName,
      statementPeriod,
      fromDate,
      toDate,
      isDemoMode
    } = req.body;

    if (!ledgerName) {
      return res.status(400).json({ message: 'Ledger name is required' });
    }

    const ledgers = await tallyService.getCustomerLedgers({
      companyName,
      statementPeriod,
      fromDate,
      toDate,
      allowSimulation: Boolean(isDemoMode),
      isDemoMode: Boolean(isDemoMode)
    });

    const targetLedger = ledgers.find((l) => l.name.toLowerCase() === ledgerName.toLowerCase()) || ledgers[0];
    if (!targetLedger) {
      return res.status(404).json({ message: `Ledger '${ledgerName}' not found` });
    }

    const html = buildLedgerHtml({
      companyName: companyName || req.user?.company_name || 'Accounts Department',
      customerName: targetLedger.name,
      customerMobile: targetLedger.mobile,
      customerEmail: targetLedger.email,
      customerAddress: targetLedger.address,
      statementPeriod: statementPeriod || targetLedger.statementPeriod,
      openingBalance: targetLedger.openingBalance,
      openingBalanceType: targetLedger.openingBalanceType,
      closingBalance: targetLedger.closingBalance,
      balanceType: targetLedger.balanceType,
      totalDebits: targetLedger.totalDebits,
      totalCredits: targetLedger.totalCredits,
      transactions: targetLedger.transactions || [],
      isReconciled: targetLedger.isReconciled,
      discrepancyAmount: targetLedger.discrepancyAmount,
      source: targetLedger.source
    });

    res.json({
      ledger: targetLedger,
      htmlPreview: html
    });
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
};

/**
 * Balance Sheet API: computes and returns structured Balance Sheet data.
 */
const getBalanceSheet = async (req, res, next) => {
  try {
    const companyName = req.query.companyName;
    const asOfDate = req.query.asOfDate;
    const financialYear = req.query.financialYear;
    const isDemoMode = req.query.isDemoMode === 'true';

    const bsData = await tallyService.getBalanceSheetData({
      companyName,
      asOfDate,
      financialYear,
      allowSimulation: isDemoMode,
      isDemoMode
    });

    res.json(bsData);
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
};

/**
 * Generates Balance Sheet PDF document and registers it in pdf_files for dispatch/download.
 */
const generateBalanceSheetPdfReport = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const {
      companyName,
      asOfDate,
      financialYear,
      isDemoMode
    } = req.body;

    const bsData = await tallyService.getBalanceSheetData({
      companyName,
      asOfDate,
      financialYear,
      allowSimulation: Boolean(isDemoMode),
      isDemoMode: Boolean(isDemoMode)
    });

    const uploadsDir = path.resolve(
      process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'),
      'pdfs',
      `tenant_${String(companyId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
    );

    const generated = await generateBalanceSheetPdf(bsData, uploadsDir);
    const createdAt = new Date().toISOString();

    const { data: insertedRecord, error: insertErr } = await supabase
      .from('pdf_files')
      .insert({
        company_id: companyId,
        originalFilename: generated.originalFilename,
        extractedName: generated.extractedName,
        filePath: generated.filePath,
        fileSize: generated.fileSize,
        fileHash: generated.fileHash,
        matchedContactId: null,
        createdAt
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.status(201).json({
      message: `Balance Sheet PDF generated successfully (${bsData.isReconciled ? 'Reconciled & Verified' : 'Warning: Unreconciled'})`,
      pdf: insertedRecord,
      balanceSheet: bsData
    });
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
};

module.exports = {
  getTallyStatus,
  getTallyCompanyInfo,
  getLedgers,
  syncTallyContacts,
  generateLedgerStatements,
  previewLedger,
  getBalanceSheet,
  generateBalanceSheetPdfReport
};
