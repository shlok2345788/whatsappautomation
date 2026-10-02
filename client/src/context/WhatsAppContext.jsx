import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../services/api';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

const WhatsAppContext = createContext();

export const WhatsAppProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [status, setStatus] = useState('DISCONNECTED');
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await API.get('/whatsapp/status');
      setStatus(res.data.status || 'DISCONNECTED');
      setQrCode(res.data.qrCode || null);
      setError(res.data.error || '');
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to fetch WhatsApp status';
      setError(message);
      console.error('Error fetching WhatsApp status:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!user || (status !== 'CONNECTING' && status !== 'WAITING_QR')) return undefined;

    const intervalId = window.setInterval(fetchStatus, 2000);
    return () => window.clearInterval(intervalId);
  }, [fetchStatus, status, user]);

  useEffect(() => {
    if (!socket) return;

    const handleStatus = (data) => {
      if (data && data.status) {
        setStatus(data.status);
      }
      if (data?.error) setError(data.error);
    };

    const handleQr = (data) => {
      if (data && data.qrCode) {
        setQrCode(data.qrCode);
        setStatus('WAITING_QR');
      }
    };

    const handleConnected = () => {
      setStatus('CONNECTED');
      setQrCode(null);
    };

    const handleDisconnected = () => {
      setStatus('DISCONNECTED');
      setQrCode(null);
    };

    socket.on('whatsapp:status', handleStatus);
    socket.on('whatsapp:qr', handleQr);
    socket.on('whatsapp:connected', handleConnected);
    socket.on('whatsapp:disconnected', handleDisconnected);

    return () => {
      socket.off('whatsapp:status', handleStatus);
      socket.off('whatsapp:qr', handleQr);
      socket.off('whatsapp:connected', handleConnected);
      socket.off('whatsapp:disconnected', handleDisconnected);
    };
  }, [socket]);

  const connect = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.post('/whatsapp/connect');
      setStatus(res.data.status || 'CONNECTING');
      if (res.data.qrCode) {
        setQrCode(res.data.qrCode);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'WhatsApp initialization failed');
      console.error('Connect WhatsApp failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async (logout = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await API.post('/whatsapp/disconnect', { logout });
      setStatus(res.data.status || 'DISCONNECTED');
      setQrCode(null);
    } catch (err) {
      console.error('Disconnect WhatsApp failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <WhatsAppContext.Provider value={{ status, qrCode, loading, error, connect, disconnect, fetchStatus }}>
      {children}
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (!context) {
    // Safe default — prevents crash if called outside provider or during HMR
    return { status: 'DISCONNECTED', qrCode: null, loading: false, connect: () => {}, disconnect: () => {}, fetchStatus: () => {} };
  }
  return context;
};
