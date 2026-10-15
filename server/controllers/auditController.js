const { getAuditLogs, AUDIT_CATEGORIES } = require('../services/audit/auditLogService');

const getAuditLogsHandler = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { category, action, startDate, endDate, limit, offset } = req.query;

    const result = getAuditLogs({
      companyId,
      category,
      action,
      startDate,
      endDate,
      limit,
      offset
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getAuditCategoriesHandler = async (req, res, next) => {
  try {
    res.json({
      categories: Object.values(AUDIT_CATEGORIES)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogsHandler,
  getAuditCategoriesHandler
};
