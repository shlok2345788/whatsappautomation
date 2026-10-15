const { db } = require('../../database/database');

const AUDIT_CATEGORIES = {
  AUTH: 'AUTH',
  SETTINGS: 'SETTINGS',
  DISPATCH: 'DISPATCH',
  APPROVAL: 'APPROVAL',
  TALLY_SYNC: 'TALLY_SYNC',
  PDF: 'PDF',
  SYSTEM: 'SYSTEM'
};

const SENSITIVE_KEY_PATTERN = /(key|secret|password|token|authorization|credential|cookie)/i;

/**
 * Deeply sanitizes an object to redact any passwords, API keys, or tokens.
 */
const sanitizeAuditDetails = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeAuditDetails);
  }

  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      clean[k] = sanitizeAuditDetails(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
};

/**
 * Record an immutable security or operational audit event.
 *
 * @param {Object} params
 * @param {string} params.companyId - Tenant identifier
 * @param {string} [params.userId] - User or system agent identity
 * @param {string} params.action - Action name (e.g. SETTINGS_UPDATE)
 * @param {string} params.category - Category (e.g. SETTINGS, AUTH)
 * @param {Object} [params.details] - Arbitrary context payload (automatically sanitized)
 * @param {string} [params.ipAddress] - Client IP
 * @param {string} [params.userAgent] - Client user agent
 * @param {string} [params.status='SUCCESS'] - Result status ('SUCCESS', 'FAILED', 'DENIED')
 * @returns {Object} Created audit record
 */
const recordAuditLog = (params = {}) => {
  const {
    companyId,
    userId = 'system',
    action,
    category = AUDIT_CATEGORIES.SYSTEM,
    details = {},
    ipAddress = '',
    userAgent = '',
    status = 'SUCCESS'
  } = params;

  if (!companyId || !action) {
    throw new Error('companyId and action are strictly required to record an audit log');
  }

  const cleanDetails = sanitizeAuditDetails(details);
  const detailsJson = JSON.stringify(cleanDetails);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      company_id, userId, action, category, details, ipAddress, userAgent, status, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    String(companyId),
    String(userId || ''),
    String(action),
    String(category),
    detailsJson,
    String(ipAddress || ''),
    String(userAgent || ''),
    String(status),
    now
  );

  return {
    id: info.lastInsertRowid,
    companyId,
    userId,
    action,
    category,
    details: cleanDetails,
    ipAddress,
    userAgent,
    status,
    createdAt: now
  };
};

/**
 * Query immutable audit logs scoped strictly to the authorized tenant.
 */
const getAuditLogs = (params = {}) => {
  const {
    companyId,
    category,
    action,
    startDate,
    endDate,
    limit = 50,
    offset = 0
  } = params;

  if (!companyId) {
    throw new Error('companyId is required to query audit logs');
  }

  const whereClauses = ['company_id = ?'];
  const sqlParams = [String(companyId)];

  if (category) {
    whereClauses.push('category = ?');
    sqlParams.push(String(category));
  }

  if (action) {
    whereClauses.push('action = ?');
    sqlParams.push(String(action));
  }

  if (startDate) {
    whereClauses.push('createdAt >= ?');
    sqlParams.push(String(startDate));
  }

  if (endDate) {
    whereClauses.push('createdAt <= ?');
    sqlParams.push(String(endDate));
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereSql}`).get(...sqlParams);
  const total = countRow ? countRow.total : 0;

  const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const pageOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const querySql = `
    SELECT * FROM audit_logs
    ${whereSql}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(querySql).all(...sqlParams, pageLimit, pageOffset);

  const logs = rows.map((r) => {
    let parsedDetails = {};
    try {
      parsedDetails = JSON.parse(r.details || '{}');
    } catch (e) {
      parsedDetails = { raw: r.details };
    }

    return {
      id: r.id,
      companyId: r.company_id,
      userId: r.userId,
      action: r.action,
      category: r.category,
      details: parsedDetails,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      status: r.status,
      createdAt: r.createdAt
    };
  });

  return {
    total,
    limit: pageLimit,
    offset: pageOffset,
    logs
  };
};

module.exports = {
  recordAuditLog,
  getAuditLogs,
  AUDIT_CATEGORIES
};
