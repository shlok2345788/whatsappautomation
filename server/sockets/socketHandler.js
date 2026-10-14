const { verifyToken } = require('../middleware/authMiddleware');
const messagingProvider = require('../services/messaging/messagingProvider');

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

    // Auto-join authenticated tenant room and emit current provider status
    if (authenticatedUserId) {
      const userRoom = `user_${authenticatedUserId}`;
      socket.join(userRoom);
      messagingProvider.checkConnection(authenticatedUserId)
        .then((status) => socket.emit('whatsapp:provider_status', status))
        .catch((err) => console.warn('[Socket.IO] Status check notice on connect:', err.message));
    }

    socket.on('join', async (requestedUserId) => {
      // Security check: Client can only join their own user/company room
      if (requestedUserId && String(requestedUserId) !== String(authenticatedUserId)) {
        console.warn(`[Socket.IO Security Alert] Socket ${socket.id} (user ${authenticatedUserId}) attempted unauthorized join to user_${requestedUserId}`);
        socket.emit('error', { message: 'Unauthorized room join request' });
        return;
      }

      const userId = authenticatedUserId;
      const roomName = `user_${userId}`;
      socket.join(roomName);

      // Replay provider connection status
      try {
        const providerStatus = await messagingProvider.checkConnection(userId);
        socket.emit('whatsapp:provider_status', providerStatus);
      } catch (err) {
        console.warn('[Socket.IO] Could not replay provider status:', err.message);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });
};

module.exports = socketHandler;
