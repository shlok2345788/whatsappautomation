import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

import { auth } from '../services/firebase';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    let activeSocket = null;
    let isSubscribed = true;

    const connectSocket = async () => {
      if (!user || !user.id) {
        setSocket(null);
        return;
      }

      let token = '';
      try {
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (err) {
        console.warn('Could not retrieve auth token for socket:', err.message);
      }

      if (!isSubscribed) return;

      const newSocket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
        auth: { token },
        transports: ['polling', 'websocket'],
        tryAllTransports: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
      });

      newSocket.on('connect', () => {
        console.log('Socket authenticated and connected to backend:', newSocket.id);
        newSocket.emit('join', user.id);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
      });

      activeSocket = newSocket;
      setSocket(newSocket);
    };

    connectSocket();

    return () => {
      isSubscribed = false;
      if (activeSocket) {
        activeSocket.disconnect();
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
