const {
  getUsageSummary,
  exportUsageReportExcel,
  getAllTenantsUsageOverview
} = require('../services/billing/usageService');

const getTenantUsage = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { month, year, startDate, endDate, ratePerMessage } = req.query;

    const summary = await getUsageSummary({
      companyId,
      month,
      year,
      startDate,
      endDate,
      ratePerMessage: ratePerMessage ? parseFloat(ratePerMessage) : undefined
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
};

const downloadUsageReport = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { month, year, startDate, endDate, ratePerMessage } = req.query;

    const { buffer, filename, contentType } = await exportUsageReportExcel({
      companyId,
      month,
      year,
      startDate,
      endDate,
      ratePerMessage: ratePerMessage ? parseFloat(ratePerMessage) : undefined
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

const getAdminUsageOverview = async (req, res, next) => {
  try {
    const { month, year, startDate, endDate } = req.query;
    const overview = await getAllTenantsUsageOverview({
      month,
      year,
      startDate,
      endDate
    });

    res.json(overview);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTenantUsage,
  downloadUsageReport,
  getAdminUsageOverview
};
