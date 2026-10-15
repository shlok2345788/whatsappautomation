import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API from '../services/api';
import { useWhatsApp } from '../context/WhatsAppContext';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { Save, Lock, User, Clock, MessageSquare, ExternalLink } from 'lucide-react';

const Settings = () => {
  const { status: wsStatus } = useWhatsApp();
  const { user, updateUserProfile } = useAuth();

  // Sending settings state
  const [provider, setProvider] = useState('gupshup');
  const [gupshupAppName, setGupshupAppName] = useState('');
  const [gupshupApiKey, setGupshupApiKey] = useState('');
  const [gupshupSourcePhone, setGupshupSourcePhone] = useState('');
  const [delayBetweenMessages, setDelayBetweenMessages] = useState(4);
  const [messageTemplate, setMessageTemplate] = useState("Hello {{name}},\n\nPlease find your document attached.\n\nThank you.");
  const [savingSettings, setSavingSettings] = useState(false);

  // Profile settings state
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    API.get('/settings')
      .then((res) => {
        if (res.data) {
          if (res.data.provider) setProvider(res.data.provider);
          if (res.data.gupshupAppName) setGupshupAppName(res.data.gupshupAppName);
          if (res.data.gupshupApiKeyMasked) setGupshupApiKey(res.data.gupshupApiKeyMasked);
          if (res.data.gupshupSourcePhone) setGupshupSourcePhone(res.data.gupshupSourcePhone);
          setDelayBetweenMessages(res.data.delayBetweenMessages || 4);
          if (res.data.messageTemplate) setMessageTemplate(res.data.messageTemplate);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    setSuccessMsg('');

    try {
      await API.put('/settings', {
        provider,
        gupshupAppName,
        gupshupApiKey,
        gupshupSourcePhone,
        delayBetweenMessages: Number(delayBetweenMessages),
        messageTemplate
      });
      setSuccessMsg('Configuration saved successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setError('');
    setSuccessMsg('');

    try {
      let res;
      try {
        res = await API.put('/auth/profile', {
          name,
          email,
          currentPassword,
          newPassword
        });
      } catch (err) {
        if (err.response?.status === 404) {
          res = await API.put('/settings/profile', {
            name,
            email,
            currentPassword,
            newPassword
          });
        } else {
          throw err;
        }
      }

      if (res.data?.user) {
        updateUserProfile(res.data.user);
      }
      setSuccessMsg('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div style={{ maxWidth: '850px' }}>
      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* WhatsApp Provider & Credentials */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">WhatsApp Provider Configuration</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
            <StatusBadge status={wsStatus} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Delivery Provider</label>
          <select
            className="form-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={{ maxWidth: '360px' }}
          >
            <option value="gupshup">Official WhatsApp Business API (Gupshup WABA)</option>
          </select>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            Enterprise Cloud API with high throughput, delivery receipts, and full multi-tenant isolation.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Gupshup App Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. MyEnterpriseApp"
              value={gupshupAppName}
              onChange={(e) => setGupshupAppName(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Gupshup API Key</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your Gupshup API Key"
              value={gupshupApiKey}
              onChange={(e) => setGupshupApiKey(e.target.value)}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Leave empty to keep existing encrypted credentials.
            </span>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sender Phone Number (with Country Code)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 919876543210"
              value={gupshupSourcePhone}
              onChange={(e) => setGupshupSourcePhone(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <Link to="/dashboard/whatsapp" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ExternalLink size={14} /> Open Full WhatsApp API Dashboard & Test Dispatch
            </Link>
          </div>
        </div>
      </div>

      {/* Sending Configuration */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Sending Queue Settings</h3>
        </div>

        <form onSubmit={handleSaveSettings}>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} /> Delay Between Messages (Seconds)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              className="form-input"
              value={delayBetweenMessages}
              onChange={(e) => setDelayBetweenMessages(e.target.value)}
              style={{ maxWidth: '200px' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Recommended: 3 to 6 seconds delay between consecutive messages to prevent WhatsApp rate limits.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageSquare size={16} /> Default Message Template
            </label>
            <textarea
              rows={4}
              className="form-textarea"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
            />
          </div>

          <button type="submit" disabled={savingSettings} className="btn btn-primary">
            <Save size={16} /> {savingSettings ? 'Saving...' : 'Save Queue Settings'}
          </button>
        </form>
      </div>

      {/* Account Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Account & Profile</h3>
        </div>

        <form onSubmit={handleSaveProfile}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '14px' }}>Change Password (Optional)</h4>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={savingProfile} className="btn btn-secondary">
            <User size={16} /> {savingProfile ? 'Updating Profile...' : 'Update Account Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;
