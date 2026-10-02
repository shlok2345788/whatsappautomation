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

// Initialize DB Connection
connectDB();

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

// Static uploads directory for serving uploaded media if needed
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
  res.json({ status: 'ok', timestamp: new Date() });
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
