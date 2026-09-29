const whatsappService = require('../services/whatsapp/whatsappService');

const getStatus = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id;
    const status = whatsappService.getClientStatus(companyId);
    const qrCode = whatsappService.getQrCode(companyId);
    res.json({
      status,
      qrCode,
      isConnected: status === 'CONNECTED'
    });
  } catch (error) {
    next(error);
  }
};

const getQrCode = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id;
    const qrCode = whatsappService.getQrCode(companyId);
    const status = whatsappService.getClientStatus(companyId);
    res.json({ qrCode, status });
  } catch (error) {
    next(error);
  }
};

const connectWhatsApp = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id;
    const io = req.app.get('io');
    const result = await whatsappService.initUserClient(companyId, io);
    res.json({
      message: 'WhatsApp client initializing',
      status: result.status,
      qrCode: result.qrCode
    });
  } catch (error) {
    next(error);
  }
};

const disconnectWhatsApp = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user.id;
    const { logout } = req.body;
    const result = await whatsappService.disconnectUserClient(companyId, logout);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatus,
  getQrCode,
  connectWhatsApp,
  disconnectWhatsApp
};
