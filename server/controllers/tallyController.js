const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { supabase } = require('../services/supabaseClient');
const tallyService = require('../services/tally/tallyService');
const { generateLedgerPdf, buildLedgerHtml } = require('../services/pdf/ledgerGenerator');
const { generateBalanceSheetPdf, buildBalanceSheetHtml } = require('../services/pdf/balanceSheetGenerator');
const { computeLedgerStatement } = require('../services/financial/financialEngine');

/**
 * SSRF Protection Guard: Strictly blocks client-supplied destination URLs.
 */
const blockArbitraryTallyUrl = (req, res) => {
  if (req.query?.tallyUrl || req.body?.tallyUrl) {
    res.status(400).json({
      error: 'Specifying arbitrary destination URLs (tallyUrl) is prohibited for security reasons. Tally communication is handled exclusively via the authenticated local Windows connector.'
    });
    return true;
  }
  return false;
};

/**
 * Checks connection and synchronization status for the tenant.
 * Reads verified status from connector runs, never making arbitrary outbound requests.
 */
const getTallyStatus = async (req, res, next) => {
  try {
    if (blockArbitraryTallyUrl(req, res)) return;

    const companyId = req.companyId;

    // Check if the tenant has uploaded runs from the local connector
    const { data: latestRun } = await supabase
      .from('tally_ledger_runs')
      .select('*')
      .eq('company_id', companyId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRun) {
      return res.json({
        status: 'CONNECTED',
        isOnline: true,
        companyName: latestRun.companyName,
        activeCompanies: [latestRun.companyName],
        lastSyncAt: latestRun.createdAt,
        totalLedgers: latestRun.totalLedgers,
        reconciledCount: latestRun.reconciledCount,
        discrepancyCount: latestRun.discrepancyCount,
        statementPeriod: latestRun.statementPeriod,
        source: 'tally-connector'
      });
    }

    // In non-production environments with local Tally running:
    if (process.env.NODE_ENV !== 'production' && !process.env.CONNECTOR_ONLY) {
      try {
        const localStatus = await tallyService.checkTallyStatus('http://localhost:9000');
        if (localStatus.isOnline) {
          return res.json(localStatus);
        }
      } catch (e) {}
    }

    res.json({
      status: 'AWAITING_CONNECTOR',
      isOnline: false,
      activeCompanies: [],
      message: 'Windows Tally Connector is ready to sync. Configure your API key in the connector client.'
    });
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
    if (blockArbitraryTallyUrl(req, res)) return;

    const companyId = req.companyId;
    const companyName = req.query.companyName;
    const statementPeriod = req.query.statementPeriod;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const isDemoMode = req.query.isDemoMode === 'true';

    // 1. If tenant has connector-uploaded records, return them from tally_ledgers
    if (companyId) {
      let dbQuery = supabase
        .from('tally_ledgers')
        .select('*')
        .eq('company_id', companyId);

      const { data: dbLedgers } = await dbQuery;

      if (dbLedgers && dbLedgers.length > 0) {
        const formatted = dbLedgers.map((l) => ({
          id: l.id,
          name: l.name,
          mobile: l.mobile,
          email: l.email,
          address: l.address,
          gstin: l.gstin,
          openingBalance: l.openingBalance,
          openingBalanceType: l.openingBalanceType,
          closingBalance: l.closingBalance,
          balanceType: l.balanceType,
          totalDebits: l.totalDebits,
          totalCredits: l.totalCredits,
          isReconciled: Boolean(l.isReconciled),
          discrepancyAmount: l.discrepancyAmount,
          statementPeriod: l.statementPeriod,
          transactions: JSON.parse(l.transactionsJson || '[]'),
          source: 'tally-connector'
        }));

        return res.json({
          count: formatted.length,
          ledgers: formatted
        });
      }
    }

    // 2. Fall back to simulation/demo ledgers if requested or dev mode
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

/**
 * Receives validated ledger data from authenticated Windows Tally Connector.
 * Enforces per-client API key authentication, schema validation, payload bounds,
 * reconciliation checks, and historical ledger run preservation.
 */
const uploadConnectorData = async (req, res, next) => {
  try {
    const rawKey = req.headers['x-connector-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : '');
    if (!rawKey) {
      return res.status(401).json({ error: 'Missing x-connector-key authentication header' });
    }

    const keyHash = crypto.createHash('sha256').update(String(rawKey)).digest('hex');
    const { data: credential } = await supabase
      .from('connector_credentials')
      .select('*')
      .eq('apiKeyHash', keyHash)
      .eq('isRevoked', 0)
      .maybeSingle();

    if (!credential) {
      return res.status(401).json({ error: 'Invalid or revoked connector API key' });
    }

    const companyId = credential.company_id;

    // Validate payload schema
    const { companyName, statementPeriod, fromDate, toDate, ledgers } = req.body || {};
    if (!companyName || typeof companyName !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid companyName in connector upload' });
    }

    if (!Array.isArray(ledgers) || ledgers.length === 0) {
      return res.status(400).json({ error: 'Payload must contain a non-empty array of ledgers' });
    }

    if (ledgers.length > 5000) {
      return res.status(413).json({ error: 'Payload exceeds maximum limit of 5000 ledgers per sync run' });
    }

    const nowIso = new Date().toISOString();
    let reconciledCount = 0;
    let discrepancyCount = 0;

    // Reconcile and validate each ledger
    const validatedLedgers = ledgers.map((l) => {
      const opening = parseFloat(l.openingBalance) || 0;
      const closing = parseFloat(l.closingBalance) || 0;
      const txs = Array.isArray(l.transactions) ? l.transactions : [];

      const statement = computeLedgerStatement({
        openingBalance: opening,
        openingBalanceType: l.openingBalanceType || 'Dr',
        transactions: txs,
        tallyClosingBalance: closing,
        tallyClosingBalanceType: l.balanceType || 'Dr'
      });

      if (statement.isReconciled) {
        reconciledCount++;
      } else {
        discrepancyCount++;
      }

      return {
        company_id: companyId,
        name: String(l.name || 'Unnamed Ledger').slice(0, 200),
        mobile: String(l.mobile || '').slice(0, 50),
        email: String(l.email || '').slice(0, 100),
        address: String(l.address || '').slice(0, 300),
        gstin: String(l.gstin || '').slice(0, 50),
        openingBalance: statement.openingBalance,
        openingBalanceType: statement.openingBalanceType,
        closingBalance: statement.closingBalance,
        balanceType: statement.closingBalanceType,
        totalDebits: statement.totalDebits,
        totalCredits: statement.totalCredits,
        isReconciled: statement.isReconciled ? 1 : 0,
        discrepancyAmount: statement.discrepancyAmount || 0,
        transactionsJson: JSON.stringify(statement.transactions || []),
        statementPeriod: statementPeriod || l.statementPeriod || '',
        createdAt: nowIso
      };
    });

    // Save run record to preserve history
    const { data: runRecord } = await supabase
      .from('tally_ledger_runs')
      .insert({
        company_id: companyId,
        companyName: companyName.slice(0, 200),
        statementPeriod: String(statementPeriod || '').slice(0, 100),
        fromDate: String(fromDate || '').slice(0, 20),
        toDate: String(toDate || '').slice(0, 20),
        totalLedgers: validatedLedgers.length,
        reconciledCount,
        discrepancyCount,
        createdAt: nowIso
      })
      .select()
      .single();

    const runId = runRecord?.id;

    // Save individual ledgers with run_id
    const ledgersWithRun = validatedLedgers.map((l) => ({ ...l, run_id: runId }));
    await supabase.from('tally_ledgers').insert(ledgersWithRun);

    // Update connector lastUsedAt
    await supabase
      .from('connector_credentials')
      .update({ lastUsedAt: nowIso })
      .eq('id', credential.id);

    res.status(201).json({
      success: true,
      message: `Connector upload processed successfully: ${validatedLedgers.length} ledgers stored.`,
      runId,
      companyId,
      companyName,
      totalLedgers: validatedLedgers.length,
      reconciledCount,
      discrepancyCount,
      timestamp: nowIso
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generates a unique API key for the client's local Windows connector.
 */
const generateConnectorKey = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const rawKey = 'conn_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const { data: created } = await supabase
      .from('connector_credentials')
      .insert({
        company_id: companyId,
        apiKeyHash: keyHash,
        name: req.body?.name || 'Windows Tally Connector',
        isRevoked: 0,
        createdAt: new Date().toISOString()
      })
      .select()
      .single();

    res.status(201).json({
      message: 'Connector API key generated successfully. Copy this key now as it cannot be shown again.',
      apiKey: rawKey,
      credentialId: created?.id
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revokes a connector API key.
 */
const revokeConnectorKey = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { credentialId } = req.body || {};

    let query = supabase
      .from('connector_credentials')
      .update({ isRevoked: 1 })
      .eq('company_id', companyId);

    if (credentialId) {
      query = query.eq('id', credentialId);
    }

    await query;
    res.json({ message: 'Connector credential revoked successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves connector status and sync history for the tenant.
 */
const getConnectorStatus = async (req, res, next) => {
  try {
    const companyId = req.companyId;

    const { data: credentials } = await supabase
      .from('connector_credentials')
      .select('id, name, isRevoked, createdAt, lastUsedAt')
      .eq('company_id', companyId)
      .order('id', { ascending: false });

    const { data: latestRun } = await supabase
      .from('tally_ledger_runs')
      .select('*')
      .eq('company_id', companyId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      hasConfiguredConnector: (credentials || []).some((c) => !c.isRevoked),
      activeCredentials: (credentials || []).filter((c) => !c.isRevoked),
      latestRun
    });
  } catch (error) {
    next(error);
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
  generateBalanceSheetPdfReport,
  uploadConnectorData,
  generateConnectorKey,
  revokeConnectorKey,
  getConnectorStatus
};
