const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const SupabaseSessionManager = require('./SupabaseSessionManager');

// In-memory store for WhatsApp instances per company
// clientsMap[companyId] = { client, status, qrCode, qrRaw, io }
const clientsMap = {};

const getSessionsDir = () => {
  const dir = path.join(__dirname, '../../../whatsapp_sessions');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getClientStatus = (companyId) => {
  const instance = clientsMap[companyId];
  if (!instance) return 'DISCONNECTED';
  return instance.status || 'DISCONNECTED';
};

const getQrCode = (companyId) => {
  const instance = clientsMap[companyId];
  if (!instance) return null;
  return instance.qrCode || null;
};

const initCompanyClient = async (companyId, io) => {
  if (clientsMap[companyId] && clientsMap[companyId].client) {
    const status = clientsMap[companyId].status;
    if (status === 'CONNECTED' || status === 'CONNECTING' || status === 'WAITING_QR') {
      return clientsMap[companyId];
    }
  }

  const sessionsDir = getSessionsDir();
  const clientId = `company_${companyId}`;

  clientsMap[companyId] = {
    client: null,
    status: 'CONNECTING',
    qrCode: null,
    qrRaw: null,
    io: io
  };

  const roomName = `user_${companyId}`;

  if (io) {
    io.to(roomName).emit('whatsapp:status', { status: 'CONNECTING' });
  }

  try {
    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionsDir,
        clientId: clientId
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    clientsMap[companyId].client = client;

    client.on('qr', async (qr) => {
      console.log(`[WhatsApp company_${companyId}] Fresh QR received`);
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        clientsMap[companyId].status = 'WAITING_QR';
        clientsMap[companyId].qrCode = qrDataUrl;
        clientsMap[companyId].qrRaw = qr;

        if (io) {
          io.to(roomName).emit('whatsapp:qr', { qrCode: qrDataUrl, status: 'WAITING_QR' });
          io.to(roomName).emit('whatsapp:status', { status: 'WAITING_QR' });
        }
      } catch (err) {
        console.error(`Error generating QR data URL: ${err.message}`);
      }
    });

    client.on('authenticated', async () => {
      console.log(`[WhatsApp company_${companyId}] Authenticated`);
      clientsMap[companyId].status = 'CONNECTING';
      clientsMap[companyId].qrCode = null;
      if (io) {
        io.to(roomName).emit('whatsapp:status', { status: 'CONNECTING' });
      }
      
      // Upload session to Supabase so it's persisted across restarts
      try {
        const companySessionDir = path.join(sessionsDir, `session-${clientId}`);
        await SupabaseSessionManager.uploadSession(companyId, companySessionDir);
      } catch (err) {
        console.error(`[WhatsApp company_${companyId}] Failed to upload session:`, err.message);
      }
    });

    client.on('ready', () => {
      console.log(`[WhatsApp company_${companyId}] Client is ready!`);
      clientsMap[companyId].status = 'CONNECTED';
      clientsMap[companyId].qrCode = null;
      if (io) {
        io.to(roomName).emit('whatsapp:connected', { status: 'CONNECTED' });
        io.to(roomName).emit('whatsapp:status', { status: 'CONNECTED' });
      }
    });

    client.on('auth_failure', (msg) => {
      console.error(`[WhatsApp company_${companyId}] Auth Failure:`, msg);
      clientsMap[companyId].status = 'DISCONNECTED';
      clientsMap[companyId].qrCode = null;
      if (io) {
        io.to(roomName).emit('whatsapp:disconnected', { status: 'DISCONNECTED', message: msg });
        io.to(roomName).emit('whatsapp:status', { status: 'DISCONNECTED' });
      }
    });

    client.on('disconnected', async (reason) => {
      console.log(`[WhatsApp company_${companyId}] Client disconnected:`, reason);
      clientsMap[companyId].status = 'DISCONNECTED';
      clientsMap[companyId].qrCode = null;
      if (io) {
        io.to(roomName).emit('whatsapp:disconnected', { status: 'DISCONNECTED', reason });
        io.to(roomName).emit('whatsapp:status', { status: 'DISCONNECTED' });
      }
      try {
        await client.destroy();
      } catch (e) {
        // ignore
      }
      clientsMap[companyId].client = null;
    });

    // Try to download existing session before initialize
    const companySessionDir = path.join(sessionsDir, `session-${clientId}`);
    if (!fs.existsSync(companySessionDir)) {
      await SupabaseSessionManager.downloadSession(companyId, companySessionDir);
    }

    await client.initialize();
    return clientsMap[companyId];
  } catch (error) {
    console.error(`[WhatsApp company_${companyId}] Initialize error:`, error.message);
    clientsMap[companyId].status = 'DISCONNECTED';
    if (io) {
      io.to(roomName).emit('whatsapp:status', { status: 'DISCONNECTED', error: error.message });
    }
    throw error;
  }
};

const disconnectCompanyClient = async (companyId, logout = false) => {
  const instance = clientsMap[companyId];
  const roomName = `user_${companyId}`;
  const sessionsDir = getSessionsDir();
  const companySessionDir = path.join(sessionsDir, `session-company_${companyId}`);

  try {
    if (instance && instance.client) {
      if (logout) {
        await instance.client.logout();
        instance.status = 'LOGGED_OUT';
      } else {
        await instance.client.destroy();
        instance.status = 'DISCONNECTED';
      }
    }
  } catch (error) {
    console.error(`Disconnect error for company_${companyId}:`, error.message);
  } finally {
    if (instance) {
      instance.client = null;
      instance.qrCode = null;
      if (instance.io) {
        instance.io.to(roomName).emit('whatsapp:status', { status: instance.status || 'DISCONNECTED' });
      }
    }
    delete clientsMap[companyId];

    // Clean up session directory AND remote session if logout requested
    if (logout && fs.existsSync(companySessionDir)) {
      try {
        fs.rmSync(companySessionDir, { recursive: true, force: true });
        console.log(`[WhatsApp company_${companyId}] Session directory cleared for fresh QR next scan.`);
      } catch (e) {
        console.error(`Error deleting session directory: ${e.message}`);
      }
      // Delete from Supabase Storage too
      try {
        await SupabaseSessionManager.deleteSession(companyId);
      } catch (e) {
        console.error(`Error deleting remote session: ${e.message}`);
      }
    }
  }

  return { success: true, status: 'DISCONNECTED' };
};

const checkNumberHasWhatsApp = async (companyId, phone) => {
  const instance = clientsMap[companyId];
  if (!instance || !instance.client || instance.status !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected for this company');
  }

  let formattedPhone = phone.trim();
  if (formattedPhone.startsWith('+')) {
    formattedPhone = formattedPhone.substring(1);
  }
  const chatId = formattedPhone.includes('@c.us') ? formattedPhone : `${formattedPhone}@c.us`;

  try {
    const isRegistered = await instance.client.isRegisteredUser(chatId);
    return isRegistered;
  } catch (error) {
    console.error(`Check number error for ${phone}:`, error.message);
    return false;
  }
};

const sendPdfDocument = async (companyId, phone, pdfPath, filename, caption = '') => {
  const instance = clientsMap[companyId];
  if (!instance || !instance.client || instance.status !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected for this company. Please scan QR code first.');
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at path: ${pdfPath}`);
  }

  let formattedPhone = phone.trim();
  if (formattedPhone.startsWith('+')) {
    formattedPhone = formattedPhone.substring(1);
  }
  const chatId = formattedPhone.includes('@c.us') ? formattedPhone : `${formattedPhone}@c.us`;

  const isRegistered = await instance.client.isRegisteredUser(chatId);
  if (!isRegistered) {
    throw new Error('WhatsApp unavailable for this phone number');
  }

  const media = MessageMedia.fromFilePath(pdfPath);
  if (filename) {
    media.filename = filename;
  }

  const result = await instance.client.sendMessage(chatId, media, {
    caption: caption || '',
    sendMediaAsDocument: true
  });

  return result;
};

module.exports = {
  getClientStatus,
  getQrCode,
  initUserClient: initCompanyClient,
  disconnectUserClient: disconnectCompanyClient,
  checkNumberHasWhatsApp,
  sendPdfDocument
};
