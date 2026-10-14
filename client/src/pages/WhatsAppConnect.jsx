import React, { useState, useEffect } from 'react';
import { useWhatsApp } from '../context/WhatsAppContext';
import StatusBadge from '../components/StatusBadge';
import {
  ShieldCheck,
  ShieldAlert,
  Save,
  RefreshCw,
  Send,
  Copy,
  Check,
  Info,
  Key,
  Smartphone,
  Layers,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

const WhatsAppConnect = () => {
  const {
    status,
    appName: currentAppName,
    sourcePhone: currentSourcePhone,
    templateId: currentTemplateId,
    maskedApiKey,
    hasApiKey,
    message: providerMessage,
    loading,
    error: contextError,
    saveConfiguration,
    verifyConnection,
    sendTestMessage
  } = useWhatsApp();

  const [appName, setAppName] = useState('');
  const [sourcePhone, setSourcePhone] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [apiKey, setApiKey] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessageText, setTestMessageText] = useState('DocSender Pro: Test verification message from official WhatsApp Business API.');
  const [testResult, setTestResult] = useState(null);
  const [notification, setNotification] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Sync form state when provider context updates
  useEffect(() => {
    if (currentAppName) setAppName(currentAppName);
    if (currentSourcePhone) setSourcePhone(currentSourcePhone);
    if (currentTemplateId) setTemplateId(currentTemplateId);
  }, [currentAppName, currentSourcePhone, currentTemplateId]);

  const webhookUrl = `${window.location.origin}/api/webhook/gupshup`;

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2500);
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!appName.trim()) {
      return showNotification('error', 'Gupshup App Name is required.');
    }
    if (!sourcePhone.trim()) {
      return showNotification('error', 'Sender Phone Number is required.');
    }

    setIsSaving(true);
    setNotification(null);

    try {
      const payload = {
        appName: appName.trim(),
        sourcePhone: sourcePhone.trim(),
        templateId: templateId.trim()
      };
      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await saveConfiguration(payload);
      setApiKey('');
      showNotification('success', res.message || 'WhatsApp Business API credentials saved successfully.');
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.message || 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setNotification(null);

    try {
      const res = await verifyConnection();
      if (res.status === 'CONNECTED') {
        showNotification('success', 'Connection verified successfully! WhatsApp Business API is active.');
      } else if (res.status === 'CONFIG_REQUIRED' || res.status === 'NOT_CONFIGURED') {
        showNotification('warning', res.message || 'Configuration incomplete. Please provide all required credentials.');
      } else {
        showNotification('error', res.message || 'Verification failed. Please check your credentials.');
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.message || 'Verification check failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendTestMessage = async (e) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      return showNotification('error', 'Please enter a recipient phone number for the test message.');
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await sendTestMessage(testPhone.trim(), testMessageText.trim());
      setTestResult({
        success: true,
        messageId: res.result?.messageId || 'Success',
        recipient: testPhone,
        timestamp: new Date().toLocaleTimeString()
      });
      showNotification('success', 'Test WhatsApp message sent successfully!');
    } catch (err) {
      const errDetail = err.response?.data?.message || err.message || 'Failed to dispatch test message';
      setTestResult({
        success: false,
        error: errDetail,
        timestamp: new Date().toLocaleTimeString()
      });
      showNotification('error', `Test message failed: ${errDetail}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {notification && (
        <div className={`alert alert-${notification.type === 'success' ? 'success' : notification.type === 'warning' ? 'warning' : 'danger'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'inherit' }}>&times;</button>
        </div>
      )}

      {/* Connection State Banner */}
      {status === 'CONNECTED' ? (
        <div className="card" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#15803d', fontSize: '15px' }}>
                Official WhatsApp Business API Connected & Active
              </div>
              <div style={{ fontSize: '13px', color: '#166534', marginTop: '2px' }}>
                {providerMessage || 'Your Gupshup enterprise sender account is authenticated and ready to dispatch PDF ledgers.'}
              </div>
            </div>
          </div>
          <button onClick={handleVerify} disabled={isVerifying} className="btn btn-secondary btn-sm" title="Re-test live connection with Gupshup servers">
            <RefreshCw size={14} className={isVerifying ? 'spin-icon' : ''} />
            {isVerifying ? 'Checking...' : 'Re-verify'}
          </button>
        </div>
      ) : status === 'NOT_CONFIGURED' || status === 'CONFIG_REQUIRED' ? (
        <div className="card" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: '15px' }}>
                Gupshup WhatsApp Business API Setup Required
              </div>
              <div style={{ fontSize: '13px', color: '#b45309', marginTop: '2px' }}>
                {providerMessage || 'Enter your Gupshup App Name, API Key, and Sender Phone Number below to configure enterprise messaging.'}
              </div>
            </div>
          </div>
          <button onClick={handleVerify} disabled={isVerifying || !hasApiKey} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={isVerifying ? 'spin-icon' : ''} />
            {isVerifying ? 'Checking...' : 'Test Connection'}
          </button>
        </div>
      ) : (
        <div className="card" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '15px' }}>
                Provider Connection Notice
              </div>
              <div style={{ fontSize: '13px', color: '#b91c1c', marginTop: '2px' }}>
                {providerMessage || contextError || 'Unable to establish connection with Gupshup. Please check your API credentials.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Settings & Diagnostics */}
      <div className="grid-2">
        {/* Left Column: Provider Configuration Form */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={18} /> Gupshup Provider Credentials
            </h3>
            <StatusBadge status={status} />
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Gupshup App Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. MyEnterpriseWABA"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                The application name registered in your Gupshup Enterprise Portal.
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Sender Phone Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 919876543210 (with country code)"
                value={sourcePhone}
                onChange={(e) => setSourcePhone(e.target.value)}
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Your dedicated WhatsApp Business registered phone number.
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                Gupshup API Key
                {hasApiKey && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 'normal' }}>✓ Key configured ({maskedApiKey})</span>}
              </label>
              <input
                type="password"
                className="form-input"
                placeholder={hasApiKey ? 'Enter new key to update or leave empty to keep current' : 'Enter your Gupshup API Key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Stored encrypted and masked. Secrets are never exposed back in plain text.
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                Approved WhatsApp Template ID <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. statement_ledger_v1"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                If configured, PDF documents will dispatch using your pre-approved WhatsApp Business template.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button type="submit" disabled={isSaving} className="btn btn-primary" style={{ flex: 1 }}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
              <button
                type="button"
                onClick={handleVerify}
                disabled={isVerifying || !hasApiKey}
                className="btn btn-secondary"
                title="Verify credentials with Gupshup API"
              >
                <RefreshCw size={16} className={isVerifying ? 'spin-icon' : ''} />
                {isVerifying ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Webhook & Test Message Dispatch */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Test Message Dispatcher Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} /> Test Message Dispatch
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Verify outbound WhatsApp connectivity by sending an instant test ping to your mobile phone.
            </p>

            <form onSubmit={handleSendTestMessage} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Recipient Phone Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 919876543210"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Message Text</label>
                <input
                  type="text"
                  className="form-input"
                  value={testMessageText}
                  onChange={(e) => setTestMessageText(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isSendingTest || !hasApiKey}
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '4px' }}
              >
                <Send size={15} /> {isSendingTest ? 'Sending Test...' : 'Send Test WhatsApp Message'}
              </button>
            </form>

            {testResult && (
              <div style={{ marginTop: '14px', padding: '12px', borderRadius: '6px', fontSize: '12px', backgroundColor: testResult.success ? '#f0fdf4' : '#fef2f2', border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}` }}>
                {testResult.success ? (
                  <div>
                    <strong style={{ color: '#15803d' }}>Dispatched Successfully!</strong>
                    <div style={{ color: '#166534', marginTop: '2px' }}>
                      Message ID: <code>{testResult.messageId}</code> ({testResult.timestamp})
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: '#b91c1c' }}>Dispatch Failed:</strong>
                    <div style={{ color: '#991b1b', marginTop: '2px' }}>{testResult.error}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Delivery Webhooks Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} /> Delivery Webhook Endpoint
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Configure this Callback URL in your Gupshup Dashboard to automatically receive real-time <strong>Sent</strong>, <strong>Delivered</strong>, and <strong>Read</strong> status updates.
            </p>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="form-input"
                style={{ backgroundColor: '#f8fafc', fontFamily: 'monospace', fontSize: '12px' }}
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Copy Webhook URL"
              >
                {copiedWebhook ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                {copiedWebhook ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} style={{ color: '#16a34a' }} /> Sent
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} style={{ color: '#16a34a' }} /> Delivered
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} style={{ color: '#16a34a' }} /> Read Receipts
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={13} style={{ color: '#dc2626' }} /> Failure Causes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise Benefits Card */}
      <div className="card" style={{ backgroundColor: '#f8fafc' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Info size={16} /> Official WhatsApp Business Platform Advantages
        </h4>
        <div className="grid-3" style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <div>
            <strong>100% Cloud Reliability:</strong> No Chromium browser processes or Puppeteer instances that crash, log out, or freeze memory.
          </div>
          <div>
            <strong>Automated PDF Delivery:</strong> PDF statements are hosted via signed document endpoints and delivered directly into customers' WhatsApp chats.
          </div>
          <div>
            <strong>Guaranteed Multi-Tenant Isolation:</strong> Each company stores its own credentials securely in isolated SQLite / Supabase vaults.
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConnect;
