const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
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

const getClientError = (companyId) => {
  const instance = clientsMap[companyId];
  return instance?.error || null;
};

const findChromeExecutable = (rootDir) => {
  if (!fs.existsSync(rootDir)) return null;

  const executableNames = process.platform === 'win32'
    ? new Set(['chrome.exe', 'chromium.exe'])
    : new Set(['chrome', 'chrome-headless-shell', 'chromium', 'chromium-browser']);
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (executableNames.has(entry.name)) {
        return entryPath;
      }
    }
  }

  return null;
};

const ensureChromeInstalled = () => {
  let executablePath = puppeteer.executablePath();
  if (fs.existsSync(executablePath)) return executablePath;

  const serverDir = path.join(__dirname, '../..');
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(serverDir, '.cache', 'puppeteer');
  executablePath = findChromeExecutable(cacheDir);
  if (executablePath) return executablePath;

  const systemExecutable = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find((candidate) => fs.existsSync(candidate));
  if (systemExecutable) return systemExecutable;

  executablePath = puppeteer.executablePath();
  console.log(`[WhatsApp] Chrome missing at ${executablePath}; installing browser binary...`);
  execFileSync('npx', ['puppeteer', 'browsers', 'install', 'chrome'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
    stdio: 'inherit',
  });

  executablePath = puppeteer.executablePath();
  if (!fs.existsSync(executablePath)) {
    executablePath = findChromeExecutable(cacheDir);
  }
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Chrome installation completed but executable is still missing at ${executablePath}`);
  }
  return executablePath;
};

const cleanStaleChromeLocks = (sessionDir) => {
  if (!fs.existsSync(sessionDir)) return;
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort'];
  for (const lockFile of lockFiles) {
    const lockPath = path.join(sessionDir, lockFile);
    try {
      const stat = fs.lstatSync(lockPath);
      if (stat.isFile() || stat.isSymbolicLink()) {
        fs.unlinkSync(lockPath);
        console.log(`[WhatsApp] Cleared stale Chrome lock: ${lockFile}`);
      }
    } catch (e) {
      // ignore if file doesn't exist
    }
  }
};

const initCompanyClient = async (companyId, io, cleanSession = false) => {
  const sessionsDir = getSessionsDir();
  const clientId = `company_${companyId}`;
  const companySessionDir = path.join(sessionsDir, `session-${clientId}`);

  if (clientsMap[companyId]?.client) {
    const currentStatus = clientsMap[companyId].status;
    if (!cleanSession && (currentStatus === 'CONNECTED' || currentStatus === 'CONNECTING' || currentStatus === 'WAITING_QR')) {
      return clientsMap[companyId];
    }
    try {
      console.log(`[WhatsApp company_${companyId}] Stopping previous browser client...`);
      await clientsMap[companyId].client.destroy();
    } catch (e) {}
    clientsMap[companyId].client = null;
  }

  if (cleanSession) {
    console.log(`[WhatsApp company_${companyId}] Clean session requested. Removing old session cache...`);
    delete clientsMap[companyId];
    if (fs.existsSync(companySessionDir)) {
      try {
        fs.rmSync(companySessionDir, { recursive: true, force: true });
        console.log(`[WhatsApp company_${companyId}] Removed old session folder at ${companySessionDir}`);
      } catch (e) {
        console.error(`Error deleting session directory: ${e.message}`);
      }
    }
  }

  // Clear any dangling lock files created by crashed Chromium processes (Render / Linux / Windows)
  cleanStaleChromeLocks(companySessionDir);

  clientsMap[companyId] = {
    client: null,
    status: 'CONNECTING',
    qrCode: null,
    qrRaw: null,
    error: null,
    io: io
  };

  const roomName = `user_${companyId}`;

  if (io) {
    io.to(roomName).emit('whatsapp:status', { status: 'CONNECTING' });
  }

  try {
    const chromeExecutablePath = ensureChromeInstalled();
    console.log(`[WhatsApp company_${companyId}] Launching Chromium instance...`);
    console.log(`[WhatsApp company_${companyId}] Chrome executable: ${chromeExecutablePath}`);
    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionsDir,
        clientId: clientId
      }),
      webVersionCache: {
        type: 'none'
      },
      bypassCSP: true,
      takeoverOnConflict: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || chromeExecutablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      }
    });

    clientsMap[companyId].client = client;

    let readyCheckInterval = null;

    client.on('qr', async (qr) => {
      console.log(`\n======================================================`);
      console.log(`[WhatsApp company_${companyId}] Fresh QR Code Generated!`);
      console.log(`Scan this QR code with WhatsApp (Linked Devices):`);
      console.log(`======================================================`);
      try {
        const qrTerminal = await qrcode.toString(qr, { type: 'terminal', small: true });
        console.log(qrTerminal);
      } catch (e) {
        // terminal qr format fallback
      }
      console.log(`[WhatsApp company_${companyId}] Waiting for scan...\n`);

      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        clientsMap[companyId].status = 'WAITING_QR';
        clientsMap[companyId].qrCode = qrDataUrl;
        clientsMap[companyId].qrRaw = qr;
        clientsMap[companyId].error = null;

        if (io) {
          io.to(roomName).emit('whatsapp:qr', { qrCode: qrDataUrl, status: 'WAITING_QR' });
          io.to(roomName).emit('whatsapp:status', { status: 'WAITING_QR' });
        }
      } catch (err) {
        console.error(`[WhatsApp company_${companyId}] Error generating QR data URL: ${err.message}`);
      }
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`[WhatsApp company_${companyId}] Sync Progress: ${percent}% - "${message || 'Syncing chats'}"`);
      if (io) {
        io.to(roomName).emit('whatsapp:loading', { percent, message });
        io.to(roomName).emit('whatsapp:status', { status: 'CONNECTING', percent });
      }
    });

    client.on('change_state', (state) => {
      console.log(`[WhatsApp company_${companyId}] State Changed -> ${state}`);
      if (state === 'CONNECTED') {
        clientsMap[companyId].status = 'CONNECTED';
        clientsMap[companyId].qrCode = null;
        clientsMap[companyId].error = null;
        if (readyCheckInterval) clearInterval(readyCheckInterval);
        if (io) {
          io.to(roomName).emit('whatsapp:connected', { status: 'CONNECTED' });
          io.to(roomName).emit('whatsapp:status', { status: 'CONNECTED' });
        }
      }
    });

    client.on('authenticated', () => {
      console.log(`\n======================================================`);
      console.log(`[WhatsApp company_${companyId}] >>> AUTHENTICATED! Phone successfully scanned QR <<<`);
      console.log(`[WhatsApp company_${companyId}] Syncing WhatsApp Web session and chats...`);
      console.log(`======================================================\n`);
      clientsMap[companyId].status = 'CONNECTING';
      clientsMap[companyId].qrCode = null;
      clientsMap[companyId].error = null;
      if (io) {
        io.to(roomName).emit('whatsapp:status', { status: 'CONNECTING' });
      }

      // Watchdog: Give WhatsApp 10 seconds to finish post-auth page navigation before checking state
      if (readyCheckInterval) clearInterval(readyCheckInterval);
      setTimeout(() => {
        if (clientsMap[companyId]?.status === 'CONNECTED') return;

        readyCheckInterval = setInterval(async () => {
          try {
            if (clientsMap[companyId]?.status === 'CONNECTED') {
              clearInterval(readyCheckInterval);
              return;
            }
            if (client && client.pupPage && !client.pupPage.isClosed()) {
              const state = await client.getState().catch((err) => {
                // Ignore transient context destruction while page is navigating
                return null;
              });

              if (state) {
                console.log(`[WhatsApp company_${companyId}] Watchdog State: ${state}`);
                if (state === 'CONNECTED') {
                  console.log(`[WhatsApp company_${companyId}] >>> WATCHDOG: CONNECTED STATE CONFIRMED! <<<`);
                  clearInterval(readyCheckInterval);
                  clientsMap[companyId].status = 'CONNECTED';
                  clientsMap[companyId].qrCode = null;
                  clientsMap[companyId].error = null;
                  if (io) {
                    io.to(roomName).emit('whatsapp:connected', { status: 'CONNECTED' });
                    io.to(roomName).emit('whatsapp:status', { status: 'CONNECTED' });
                  }
                }
              }
            }
          } catch (e) {
            // ignore transient evaluation errors
          }
        }, 4000);
      }, 10000);
    });

    client.on('ready', () => {
      if (readyCheckInterval) clearInterval(readyCheckInterval);
      console.log(`\n======================================================`);
      console.log(`[WhatsApp company_${companyId}] >>> SUCCESS: WhatsApp Client is READY and CONNECTED! <<<`);
      console.log(`[WhatsApp company_${companyId}] You can now send WhatsApp PDF messages.`);
      console.log(`======================================================\n`);
      clientsMap[companyId].status = 'CONNECTED';
      clientsMap[companyId].qrCode = null;
      clientsMap[companyId].error = null;
      if (io) {
        io.to(roomName).emit('whatsapp:connected', { status: 'CONNECTED' });
        io.to(roomName).emit('whatsapp:status', { status: 'CONNECTED' });
      }

      // Persist session to Supabase in the background after browser settles
      setTimeout(async () => {
        try {
          const companySessionDir = path.join(sessionsDir, `session-${clientId}`);
          await SupabaseSessionManager.uploadSession(companyId, companySessionDir);
        } catch (err) {
          console.warn(`[WhatsApp company_${companyId}] Background session upload skipped:`, err.message);
        }
      }, 5000);
    });

    client.on('auth_failure', (msg) => {
      if (readyCheckInterval) clearInterval(readyCheckInterval);
      console.error(`\n[WhatsApp company_${companyId}] !!! AUTHENTICATION FAILURE:`, msg);
      clientsMap[companyId].status = 'DISCONNECTED';
      clientsMap[companyId].qrCode = null;
      clientsMap[companyId].error = msg;
      if (io) {
        io.to(roomName).emit('whatsapp:disconnected', { status: 'DISCONNECTED', message: msg });
        io.to(roomName).emit('whatsapp:status', { status: 'DISCONNECTED' });
      }
    });

    client.on('disconnected', async (reason) => {
      if (readyCheckInterval) clearInterval(readyCheckInterval);
      console.warn(`\n[WhatsApp company_${companyId}] !!! DISCONNECTED: ${reason}`);
      clientsMap[companyId].status = 'DISCONNECTED';
      clientsMap[companyId].qrCode = null;
      clientsMap[companyId].error = reason;
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

    // Try to download existing session before initialize if not starting fresh
    const companySessionDir = path.join(sessionsDir, `session-${clientId}`);
    if (!cleanSession && !fs.existsSync(companySessionDir)) {
      await SupabaseSessionManager.downloadSession(companyId, companySessionDir);
    }

    console.log(`[WhatsApp company_${companyId}] Starting client.initialize()...`);
    await client.initialize();
    console.log(`[WhatsApp company_${companyId}] client.initialize() call completed.`);
    return clientsMap[companyId];
  } catch (error) {
    console.error(`[WhatsApp company_${companyId}] Initialize error:`, error.message);
    clientsMap[companyId].status = 'DISCONNECTED';
    clientsMap[companyId].error = error.message;
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

  const client = instance.client;

  // Restore pupPage reference if lost, closed, or detached
  if (!client.pupPage || client.pupPage.isClosed()) {
    if (client.pupBrowser && client.pupBrowser.isConnected()) {
      try {
        const pages = await client.pupBrowser.pages();
        if (pages.length > 0) {
          client.pupPage = pages[0];
          console.log(`[WhatsApp company_${companyId}] Successfully recovered active browser page reference.`);
        }
      } catch (e) {
        console.warn(`[WhatsApp company_${companyId}] Error checking browser pages: ${e.message}`);
      }
    }
  }

  if (!client.pupPage || client.pupPage.isClosed()) {
    throw new Error('WhatsApp browser page is not active or closed. Please reconnect WhatsApp.');
  }

  // Ensure WhatsApp Web runtime injection is ready
  try {
    await client.pupPage.waitForFunction(
      () => typeof window.WWebJS !== 'undefined',
      { timeout: 8000 }
    );
  } catch (e) {
    if (typeof client.inject === 'function') {
      try {
        await client.inject();
      } catch (injectErr) {
        // continue to attempt send
      }
    }
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at path: ${pdfPath}`);
  }

  let formattedPhone = phone.trim();
  if (formattedPhone.startsWith('+')) {
    formattedPhone = formattedPhone.substring(1);
  }
  let targetChatId = formattedPhone.includes('@c.us') ? formattedPhone : `${formattedPhone}@c.us`;

  // Resolve official WhatsApp WID
  try {
    if (typeof client.getNumberId === 'function') {
      const numberId = await client.getNumberId(formattedPhone);
      if (numberId && numberId._serialized) {
        targetChatId = numberId._serialized;
        console.log(`[WhatsApp company_${companyId}] Resolved official WID: ${targetChatId}`);
      }
    }
  } catch (e) {
    // fallback to targetChatId
  }

  const media = MessageMedia.fromFilePath(pdfPath);
  if (filename) {
    media.filename = filename;
  }

  const result = await client.sendMessage(targetChatId, media, {
    caption: caption || '',
    sendMediaAsDocument: true
  });

  return result;
};

module.exports = {
  getClientStatus,
  getQrCode,
  getClientError,
  initUserClient: initCompanyClient,
  disconnectUserClient: disconnectCompanyClient,
  checkNumberHasWhatsApp,
  sendPdfDocument
};
