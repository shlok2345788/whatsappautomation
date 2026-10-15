const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { validateEnv } = require('./config/validateEnv');
validateEnv();

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
const webhookRoutes = require('./routes/webhookRoutes');
const tallyRoutes = require('./routes/tallyRoutes');
const billingRoutes = require('./routes/billingRoutes');
const { storageProvider } = require('./services/supabaseClient');
const { startRetentionSchedule } = require('./services/pdf/pdfRetentionService');

// Initialize DB Connection
connectDB();

// Start periodic PDF retention and cleanup
startRetentionSchedule();

// Process-level error logging
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

const app = express();
const server = http.createServer(app);

// Strict CORS Origins: parse configured CLIENT_URL and allow standard local dev ports
const parseAllowedOrigins = () => {
  const origins = [];
  if (process.env.CLIENT_URL) {
    process.env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => origins.push(o));
  }
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000');
  }
  return [...new Set(origins)];
};

const allowedOrigins = parseAllowedOrigins();

const corsOriginHandler = (origin, callback) => {
  // Allow non-browser requests (tools, server-to-server) with no origin header
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS policy rejection: Origin ${origin} is not allowed`));
};

const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

socketHandler(io);
app.set('io', io);

// Middleware
app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-connector-key']
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
app.use('/api/webhook', webhookRoutes);
app.use('/api/tally', tallyRoutes);
app.use('/api/billing', billingRoutes);

// Comprehensive Observability & Health Check endpoint
app.get('/api/health', (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: 'ok',
    version: '2.0.0-production',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    storageProvider,
    memory: {
      rssMb: Math.round(memory.rss / (1024 * 1024)),
      heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024))
    },
    services: {
      sqlite: 'operational',
      gupshupWaba: Boolean(process.env.GUPSHUP_API_KEY) ? 'configured' : 'dev-simulation',
      tallyServer: process.env.TALLY_API_URL || 'http://localhost:9000'
    }
  });
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
