import React from 'react';
import { useWhatsApp } from '../context/WhatsAppContext';
import StatusBadge from '../components/StatusBadge';
import { QrCode, RefreshCw, Power, CheckCircle, Smartphone } from 'lucide-react';

const WhatsAppConnect = () => {
  const { status, qrCode, loading, connect, disconnect } = useWhatsApp();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Connection Flow Bar */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 className="card-title">WhatsApp Session Flow</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', textAlign: 'center', fontSize: '12px' }}>
          <div style={{ flex: 1, color: 'var(--text-secondary)', fontWeight: 600 }}>1. Dashboard</div>
          <div style={{ color: 'var(--text-muted)' }}>→</div>
          <div style={{ flex: 1, color: status === 'WAITING_QR' ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: 600 }}>2. QR Code</div>
          <div style={{ color: 'var(--text-muted)' }}>→</div>
          <div style={{ flex: 1, color: status === 'CONNECTING' ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: 600 }}>3. Scanning</div>
          <div style={{ color: 'var(--text-muted)' }}>→</div>
          <div style={{ flex: 1, color: status === 'CONNECTED' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>4. Ready</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Connection Control Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Account Connection</h3>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Current State:</span>
            <div style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <StatusBadge status={status} />
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
            {status === 'CONNECTED' ? (
              'Your WhatsApp session is active and authenticated. LocalAuth persists your session locally.'
            ) : status === 'WAITING_QR' ? (
              'Scan the generated QR code using WhatsApp on your phone (Linked Devices).'
            ) : (
              'Click "Initialize & Scan QR" below to generate a real-time authentication QR code.'
            )}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {status !== 'CONNECTED' ? (
              <button
                onClick={connect}
                disabled={loading}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                <QrCode size={18} />
                {loading ? 'Initializing WhatsApp...' : 'Initialize & Scan QR'}
              </button>
            ) : (
              <button
                onClick={() => disconnect(true)}
                disabled={loading}
                className="btn btn-danger btn-lg"
                style={{ width: '100%' }}
              >
                <Power size={18} />
                {loading ? 'Disconnecting...' : 'Logout WhatsApp Session'}
              </button>
            )}
          </div>
        </div>

        {/* QR Code Scanner Display Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '320px', textAlign: 'center' }}>
          {status === 'CONNECTED' ? (
            <div style={{ padding: '24px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle size={36} />
              </div>
              <h3 style={{ fontSize: '18px', color: '#15803d', marginBottom: '8px' }}>WhatsApp Connected</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Your device is connected and ready to process PDF sending queues.
              </p>
            </div>
          ) : qrCode ? (
            <div style={{ padding: '16px' }}>
              <div style={{ border: '2px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#fff', display: 'inline-block', boxShadow: 'var(--shadow-sm)' }}>
                <img src={qrCode} alt="WhatsApp QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
              </div>
              <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Smartphone size={16} /> Open WhatsApp → Linked Devices → Link a Device
              </div>
            </div>
          ) : (
            <div style={{ padding: '32px', color: 'var(--text-muted)' }}>
              <QrCode size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontSize: '13px' }}>
                {loading ? 'Generating QR Code...' : 'No QR code active. Click Initialize to scan.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConnect;
