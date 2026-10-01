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
  // Drop and recreate tables with TEXT company_id to support Firebase UID strings
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
      createdAt TEXT NOT NULL,
      FOREIGN KEY (matchedContactId) REFERENCES contacts(id) ON DELETE SET NULL
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
      delayBetweenMessages INTEGER DEFAULT 4,
      messageTemplate TEXT DEFAULT 'Hello {{name}},\n\nPlease find your document attached.\n\nThank you.',
      autoRetryFailed INTEGER DEFAULT 0,
      updatedAt TEXT NOT NULL
    );
  `);

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
