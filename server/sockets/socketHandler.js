const whatsappService = require('../services/whatsapp/whatsappService');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join', (userId) => {
      if (userId) {
        const roomName = `user_${userId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} joined room ${roomName}`);

        // Replay the current state so reconnecting clients do not depend on
        // having received the one-time WhatsApp "ready" event.
        const status = whatsappService.getClientStatus(userId);
        const qrCode = whatsappService.getQrCode(userId);
        const error = whatsappService.getClientError(userId);
        socket.emit('whatsapp:status', { status, error });
        if (qrCode) {
          socket.emit('whatsapp:qr', { qrCode, status: 'WAITING_QR' });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
