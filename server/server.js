const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const connectDB = require('./config/db');
const socketHandler = require('./sockets/socketHandler');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const excelRoutes = require('./routes/excelRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const matchingRoutes = require('./routes/matchingRoutes');
const queueRoutes = require('./routes/queueRoutes');
const historyRoutes = require('./routes/historyRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { storageProvider } = require('./services/supabaseClient');

// Initialize DB Connection
connectDB();

// Global resilience handlers for Puppeteer headless browser navigation
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason || '');
  if (
    msg.includes('Execution context was destroyed') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Protocol error')
  ) {
    console.warn('[Puppeteer Navigation] Page transitioned/navigated during evaluation, continuing...');
    return;
  }
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err || '');
  if (msg.includes('Execution context was destroyed') || msg.includes('Target closed')) {
    console.warn('[Puppeteer Exception Handled] Context navigated:', msg);
    return;
  }
  console.error('[Uncaught Exception]', err);
});

const app = express();
const server = http.createServer(app);

// Configure Socket.IO
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://whatsappautomation-eight.vercel.app',
  'http://localhost:5173',
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

socketHandler(io);
app.set('io', io);

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Terminal Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  const time = new Date().toLocaleTimeString();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP ${time}] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/pdfs', pdfRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/messages', queueRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/settings', settingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', storageProvider, timestamp: new Date() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '../client/dist');
  if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.resolve(clientDistPath, 'index.html'));
    });
  }
}

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`WhatsApp PDF Sender Server Running`);
  console.log(`Port: ${PORT}`);
  console.log(`Client URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
  console.log(`=================================`);
});
