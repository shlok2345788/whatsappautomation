const { verifyToken } = require('../middleware/authMiddleware');
const whatsappService = require('../services/whatsapp/whatsappService');

const socketHandler = (io) => {
  // Enforce socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const user = await verifyToken(token);
      socket.user = user;
      socket.companyId = user.companyId;
      next();
    } catch (err) {
      console.warn(`[Socket.IO Auth Failed] ${socket.id}: ${err.message}`);
      next(new Error('Unauthorized: ' + err.message));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedUserId = socket.user?.id;
    console.log(`[Socket.IO] Authenticated client connected: ${socket.id} (user: ${authenticatedUserId})`);

    // Auto-join authenticated tenant room
    if (authenticatedUserId) {
      const userRoom = `user_${authenticatedUserId}`;
      socket.join(userRoom);
    }

    socket.on('join', (requestedUserId) => {
      // Security check: Client can only join their own user/company room
      if (requestedUserId && String(requestedUserId) !== String(authenticatedUserId)) {
        console.warn(`[Socket.IO Security Alert] Socket ${socket.id} (user ${authenticatedUserId}) attempted unauthorized join to user_${requestedUserId}`);
        socket.emit('error', { message: 'Unauthorized room join request' });
        return;
      }

      const userId = authenticatedUserId;
      const roomName = `user_${userId}`;
      socket.join(roomName);
      console.log(`[Socket.IO] Socket ${socket.id} verified and joined room ${roomName}`);

      // Replay state
      const status = whatsappService.getClientStatus(userId);
      const qrCode = whatsappService.getQrCode(userId);
      const error = whatsappService.getClientError(userId);
      console.log(`[Socket.IO] State replay for ${roomName}: status=${status}, qrAvailable=${!!qrCode}`);
      socket.emit('whatsapp:status', { status, error });
      if (qrCode) {
        socket.emit('whatsapp:qr', { qrCode, status: 'WAITING_QR' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });
};

module.exports = socketHandler;
