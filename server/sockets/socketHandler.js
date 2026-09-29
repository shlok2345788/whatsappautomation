const jwt = require('jsonwebtoken');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join', (userId) => {
      if (userId) {
        const roomName = `user_${userId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} joined room ${roomName}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
