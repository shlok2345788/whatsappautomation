import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../services/api';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

const WhatsAppContext = createContext();

export const WhatsAppProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [status, setStatus] = useState('NOT_CONFIGURED');
  const [provider, setProvider] = useState('gupshup');
  const [appName, setAppName] = useState('');
  const [sourcePhone, setSourcePhone] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSimulation, setIsSimulation] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setError('');
      const res = await API.get('/whatsapp/status');
      const data = res.data || {};
      setStatus(data.status || 'NOT_CONFIGURED');
      setProvider(data.provider || 'gupshup');
      setMessage(data.message || '');
      setAppName(data.appName || '');
      setSourcePhone(data.sourcePhone || '');
      setTemplateId(data.templateId || '');
      setMaskedApiKey(data.maskedApiKey || '');
      setHasApiKey(Boolean(data.hasApiKey));
      setIsSimulation(Boolean(data.isSimulation));
    } catch (err) {
      const isAuthError = err.response?.status === 401;
      if (!isAuthError) {
        console.warn('Unable to query WhatsApp provider status:', err.message);
        setError(err.response?.data?.message || 'Unable to communicate with WhatsApp Business API service');
        setStatus('ERROR');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for real-time provider status updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleProviderStatus = (data) => {
      if (data) {
        if (data.status) setStatus(data.status);
        if (data.message) setMessage(data.message);
        if (data.appName) setAppName(data.appName);
        if (data.senderPhone || data.sourcePhone) {
          setSourcePhone(data.senderPhone || data.sourcePhone);
        }
      }
    };

    socket.on('whatsapp:provider_status', handleProviderStatus);
    socket.on('connect', fetchStatus);

    return () => {
      socket.off('whatsapp:provider_status', handleProviderStatus);
      socket.off('connect', fetchStatus);
    };
  }, [fetchStatus, socket]);

  const saveConfiguration = async (configData) => {
    setLoading(true);
    setError('');
    try {
      const res = await API.post('/whatsapp/config', configData);
      await fetchStatus();
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save configuration';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyConnection = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.post('/whatsapp/verify');
      await fetchStatus();
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || 'Verification check failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendTestMessage = async (recipientPhone, messageText) => {
    const res = await API.post('/whatsapp/test-message', { recipientPhone, messageText });
    return res.data;
  };

  return (
    <WhatsAppContext.Provider
      value={{
        status,
        provider,
        appName,
        sourcePhone,
        templateId,
        maskedApiKey,
        hasApiKey,
        isSimulation,
        message,
        loading,
        error,
        fetchStatus,
        saveConfiguration,
        verifyConnection,
        sendTestMessage,
        // Deprecated stubs to prevent runtime crashes if accessed
        qrCode: null,
        connect: () => {},
        disconnect: () => {}
      }}
    >
      {children}
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (!context) {
    return {
      status: 'NOT_CONFIGURED',
      provider: 'gupshup',
      appName: '',
      sourcePhone: '',
      templateId: '',
      maskedApiKey: '',
      hasApiKey: false,
      message: '',
      loading: false,
      error: '',
      fetchStatus: () => {},
      saveConfiguration: async () => {},
      verifyConnection: async () => {},
      sendTestMessage: async () => {},
      qrCode: null,
      connect: () => {},
      disconnect: () => {}
    };
  }
  return context;
};
