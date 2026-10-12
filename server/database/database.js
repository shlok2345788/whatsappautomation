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
  addColumnSafely('message_logs', "providerMessageId TEXT DEFAULT ''");
  addColumnSafely('message_logs', "deliveryStatus TEXT DEFAULT ''");

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

module.exports = {
  db,
  formatRow,
  formatRows
};
