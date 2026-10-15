const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'app.db');
const db = new Database(dbPath);

// Enable Foreign Keys & Write-Ahead Logging
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize database schema tables with company_id architecture
const initDatabase = () => {
  // Ensure foreign keys don't block schema adjustments
  db.pragma('foreign_keys = OFF');

  const checkTableNeedsMigration = (tableName) => {
    try {
      const row = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(tableName);
      return row && row.sql && row.sql.includes('REFERENCES companies');
    } catch (e) {
      return false;
    }
  };

  const checkCompaniesNeedsMigration = () => {
    try {
      const col = db.prepare('PRAGMA table_info(companies)').all().find((c) => c.name === 'id');
      return col && col.type === 'INTEGER';
    } catch (e) {
      return false;
    }
  };

  if (checkCompaniesNeedsMigration()) {
    console.log('[SQLite Migration] Migrating companies to support TEXT string IDs...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies_new (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      INSERT OR IGNORE INTO companies_new SELECT CAST(id AS TEXT), company_name, email, COALESCE(password_hash, ''), COALESCE(created_at, datetime('now')), datetime('now') FROM companies;
      DROP TABLE companies;
      ALTER TABLE companies_new RENAME TO companies;
    `);
  }

  if (checkTableNeedsMigration('pdf_files')) {
    console.log('[SQLite Migration] Migrating pdf_files to remove obsolete companies foreign key...');
    db.exec(`
      CREATE TABLE pdf_files_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL,
        originalFilename TEXT NOT NULL,
        extractedName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        fileSize INTEGER DEFAULT 0,
        fileHash TEXT DEFAULT '',
        matchedContactId INTEGER DEFAULT NULL,
        createdAt TEXT NOT NULL
      );
      INSERT INTO pdf_files_new SELECT id, CAST(company_id AS TEXT), originalFilename, extractedName, filePath, fileSize, fileHash, matchedContactId, createdAt FROM pdf_files;
      DROP TABLE pdf_files;
      ALTER TABLE pdf_files_new RENAME TO pdf_files;
      CREATE INDEX IF NOT EXISTS idx_pdfs_company_filename ON pdf_files(company_id, originalFilename);
    `);
  }

  if (checkTableNeedsMigration('contacts')) {
    console.log('[SQLite Migration] Migrating contacts to remove obsolete companies foreign key...');
    db.exec(`
      CREATE TABLE contacts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        originalMobile TEXT,
        isValid INTEGER NOT NULL DEFAULT 1,
        statusMessage TEXT DEFAULT 'Valid',
        createdAt TEXT NOT NULL
      );
      INSERT INTO contacts_new SELECT id, CAST(company_id AS TEXT), name, mobile, originalMobile, isValid, statusMessage, createdAt FROM contacts;
      DROP TABLE contacts;
      ALTER TABLE contacts_new RENAME TO contacts;
      CREATE INDEX IF NOT EXISTS idx_contacts_company_mobile ON contacts(company_id, mobile);
      CREATE INDEX IF NOT EXISTS idx_contacts_company_name ON contacts(company_id, name);
    `);
  }

  if (checkTableNeedsMigration('message_logs')) {
    console.log('[SQLite Migration] Migrating message_logs to remove obsolete companies foreign key...');
    db.exec(`
      CREATE TABLE message_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL,
        contactId INTEGER DEFAULT NULL,
        contactName TEXT NOT NULL,
        phone TEXT NOT NULL,
        pdfFilename TEXT NOT NULL,
        pdfPath TEXT NOT NULL,
        fileHash TEXT DEFAULT '',
        messageText TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Pending',
        errorReason TEXT DEFAULT '',
        sentAt TEXT DEFAULT NULL,
        createdAt TEXT NOT NULL
      );
      INSERT INTO message_logs_new SELECT id, CAST(company_id AS TEXT), contactId, contactName, phone, pdfFilename, pdfPath, fileHash, messageText, status, errorReason, sentAt, createdAt FROM message_logs;
      DROP TABLE message_logs;
      ALTER TABLE message_logs_new RENAME TO message_logs;
      CREATE INDEX IF NOT EXISTS idx_logs_company_status ON message_logs(company_id, status);
      CREATE INDEX IF NOT EXISTS idx_logs_company_hash_phone ON message_logs(company_id, fileHash, phone);
      CREATE INDEX IF NOT EXISTS idx_logs_company_pdf_phone ON message_logs(company_id, pdfFilename, phone);
    `);
  }

  if (checkTableNeedsMigration('settings')) {
    console.log('[SQLite Migration] Migrating settings to remove obsolete companies foreign key...');
    db.exec(`
      CREATE TABLE settings_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL UNIQUE,
        delayBetweenMessages INTEGER DEFAULT 4,
        messageTemplate TEXT DEFAULT 'Hello {{name}},\n\nPlease find your document attached.\n\nThank you.',
        autoRetryFailed INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL
      );
      INSERT INTO settings_new SELECT id, CAST(company_id AS TEXT), delayBetweenMessages, messageTemplate, autoRetryFailed, updatedAt FROM settings;
      DROP TABLE settings;
      ALTER TABLE settings_new RENAME TO settings;
    `);
  }

  db.pragma('foreign_keys = ON');

  // Create tables if starting fresh
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      email TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      originalMobile TEXT,
      isValid INTEGER NOT NULL DEFAULT 1,
      statusMessage TEXT DEFAULT 'Valid',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_company_mobile ON contacts(company_id, mobile);
    CREATE INDEX IF NOT EXISTS idx_contacts_company_name ON contacts(company_id, name);

    CREATE TABLE IF NOT EXISTS pdf_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      originalFilename TEXT NOT NULL,
      extractedName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      fileHash TEXT DEFAULT '',
      matchedContactId INTEGER DEFAULT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pdfs_company_filename ON pdf_files(company_id, originalFilename);

    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      contactId INTEGER DEFAULT NULL,
      contactName TEXT NOT NULL,
      phone TEXT NOT NULL,
      pdfFilename TEXT NOT NULL,
      pdfPath TEXT NOT NULL,
      fileHash TEXT DEFAULT '',
      messageText TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      errorReason TEXT DEFAULT '',
      sentAt TEXT DEFAULT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_company_status ON message_logs(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_logs_company_hash_phone ON message_logs(company_id, fileHash, phone);
    CREATE INDEX IF NOT EXISTS idx_logs_company_pdf_phone ON message_logs(company_id, pdfFilename, phone);

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL UNIQUE,
      provider TEXT DEFAULT 'gupshup',
      gupshupAppName TEXT DEFAULT '',
      gupshupApiKey TEXT DEFAULT '',
      gupshupSourcePhone TEXT DEFAULT '',
      gupshupTemplateId TEXT DEFAULT '',
      delayBetweenMessages INTEGER DEFAULT 4,
      messageTemplate TEXT DEFAULT 'Hello {{name}},\n\nPlease find your document attached.\n\nThank you.',
      autoRetryFailed INTEGER DEFAULT 0,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      totalItems INTEGER DEFAULT 0,
      processedItems INTEGER DEFAULT 0,
      sentCount INTEGER DEFAULT 0,
      failedCount INTEGER DEFAULT 0,
      skippedCount INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_queue_batches_company ON queue_batches(company_id, status);

    CREATE TABLE IF NOT EXISTS connector_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      apiKeyHash TEXT NOT NULL,
      name TEXT DEFAULT 'Windows Connector',
      isRevoked INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      lastUsedAt TEXT DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_connector_keys ON connector_credentials(apiKeyHash, isRevoked);

    CREATE TABLE IF NOT EXISTS tally_ledger_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      companyName TEXT NOT NULL,
      statementPeriod TEXT DEFAULT '',
      fromDate TEXT DEFAULT '',
      toDate TEXT DEFAULT '',
      totalLedgers INTEGER DEFAULT 0,
      reconciledCount INTEGER DEFAULT 0,
      discrepancyCount INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_runs ON tally_ledger_runs(company_id, createdAt);

    CREATE TABLE IF NOT EXISTS tally_ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      run_id INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      mobile TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      gstin TEXT DEFAULT '',
      openingBalance REAL DEFAULT 0,
      openingBalanceType TEXT DEFAULT 'Dr',
      closingBalance REAL DEFAULT 0,
      balanceType TEXT DEFAULT 'Dr',
      totalDebits REAL DEFAULT 0,
      totalCredits REAL DEFAULT 0,
      isReconciled INTEGER DEFAULT 1,
      discrepancyAmount REAL DEFAULT 0,
      transactionsJson TEXT DEFAULT '[]',
      statementPeriod TEXT DEFAULT '',
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tally_ledgers_company ON tally_ledgers(company_id, run_id);

    CREATE TABLE IF NOT EXISTS queue_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      company_id TEXT NOT NULL,
      contactId INTEGER DEFAULT NULL,
      recipientName TEXT NOT NULL,
      recipientPhone TEXT NOT NULL,
      pdfId INTEGER NOT NULL,
      pdfFilename TEXT NOT NULL,
      pdfPath TEXT NOT NULL,
      fileHash TEXT DEFAULT '',
      messageText TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      deliveryStatus TEXT DEFAULT 'pending',
      attemptCount INTEGER NOT NULL DEFAULT 0,
      providerMessageId TEXT DEFAULT '',
      errorReason TEXT DEFAULT '',
      approvalRef TEXT DEFAULT NULL,
      logId INTEGER DEFAULT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queue_items_batch ON queue_items(batch_id, status);
    CREATE INDEX IF NOT EXISTS idx_queue_items_company_status ON queue_items(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_queue_items_provider_msg ON queue_items(providerMessageId);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      userId TEXT DEFAULT '',
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      ipAddress TEXT DEFAULT '',
      userAgent TEXT DEFAULT '',
      status TEXT DEFAULT 'SUCCESS',
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_company_date ON audit_logs(company_id, createdAt);
    CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs(company_id, category);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(company_id, action);
  `);

  // Run incremental column additions safely if tables existed
  const addColumnSafely = (table, colDef) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    } catch (e) {
      // Column already exists, safe to ignore
    }
  };

  addColumnSafely('settings', "provider TEXT DEFAULT 'gupshup'");
  addColumnSafely('settings', "gupshupAppName TEXT DEFAULT ''");
  addColumnSafely('settings', "gupshupApiKey TEXT DEFAULT ''");
  addColumnSafely('settings', "gupshupSourcePhone TEXT DEFAULT ''");
  addColumnSafely('settings', "gupshupTemplateId TEXT DEFAULT ''");
  addColumnSafely('message_logs', "providerMessageId TEXT DEFAULT ''");
  addColumnSafely('message_logs', "deliveryStatus TEXT DEFAULT ''");
  addColumnSafely('message_logs', "isSimulation INTEGER DEFAULT 0");
  addColumnSafely('queue_batches', "simulatedCount INTEGER DEFAULT 0");
  addColumnSafely('queue_batches', "approvalStatus TEXT DEFAULT 'approved'");
  addColumnSafely('queue_batches', "approvedBy TEXT DEFAULT NULL");
  addColumnSafely('queue_batches', "approvedAt TEXT DEFAULT NULL");
  addColumnSafely('queue_batches', "rejectionReason TEXT DEFAULT NULL");
  addColumnSafely('settings', "requireApproval INTEGER DEFAULT 0");

  console.log('[SQLite Database] Multi-company Schema Initialized at:', dbPath);
};

initDatabase();

// Format database row to include id, _id, name, company_name for compatibility
const formatRow = (row) => {
  if (!row) return null;
  const formatted = { ...row, _id: row.id, companyId: row.company_id || row.id };
  if (row.company_name) {
    formatted.name = row.company_name;
  }
  if (row.isValid !== undefined) {
    formatted.isValid = Boolean(row.isValid);
  }
  if (row.autoRetryFailed !== undefined) {
    formatted.autoRetryFailed = Boolean(row.autoRetryFailed);
  }
  return formatted;
};

const formatRows = (rows) => {
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map(formatRow);
};

const migratePlaintextSettings = () => {
  try {
    const { encrypt, decrypt } = require('../services/security/encryptionService');
    const rows = db.prepare("SELECT id, company_id, gupshupApiKey FROM settings WHERE gupshupApiKey != '' AND gupshupApiKey NOT LIKE 'enc:v1:%'").all();
    for (const row of rows) {
      if (row.gupshupApiKey && !row.gupshupApiKey.startsWith('enc:v1:')) {
        const encrypted = encrypt(row.gupshupApiKey);
        const verified = decrypt(encrypted);
        if (verified === row.gupshupApiKey) {
          db.prepare("UPDATE settings SET gupshupApiKey = ? WHERE id = ?").run(encrypted, row.id);
        }
      }
    }
  } catch (err) {
    console.warn('[SQLite Database] Settings encryption migration notice:', err.message);
  }
};

migratePlaintextSettings();

module.exports = {
  db,
  formatRow,
  formatRows,
  migratePlaintextSettings
};
