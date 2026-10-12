import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { Database, RefreshCw, Users, FileText, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

const TallyIntegration = () => {
  const [tallyStatus, setTallyStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [generatingLedgers, setGeneratingLedgers] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [genResult, setGenResult] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const fetchStatus = async () => {
    setLoadingStatus(true);
    setError('');
    try {
      const res = await API.get('/tally/status');
      setTallyStatus(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not verify Tally Prime status');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    setSyncResult('');
    setError('');
    try {
      const res = await API.post('/tally/sync-contacts');
      setSyncResult(res.data.message || 'Contacts synced successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to sync contacts from Tally');
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleGenerateLedgers = async () => {
    setGeneratingLedgers(true);
    setGenResult('');
    setError('');
    try {
      const res = await API.post('/tally/generate-ledgers', { clearPrevious: true });
      setGenResult(res.data.message || 'Ledgers generated successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate ledgers from Tally');
    } finally {
      setGeneratingLedgers(false);
    }
  };

  return (
    <div style={{ maxWidth: '950px' }}>
      {error && <div className="alert alert-danger">{error}</div>}
      {syncResult && <div className="alert alert-success">{syncResult}</div>}
      {genResult && <div className="alert alert-success">{genResult}</div>}

      {/* Tally Connection Header */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="card-title">Tally Prime XML Server Connection</h3>
          </div>
          <button onClick={fetchStatus} disabled={loadingStatus} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={loadingStatus ? 'spin' : ''} /> Check Status
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Connection State</div>
            {tallyStatus?.connected ? (
              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={13} /> Connected to Tally Prime ({tallyStatus.tallyUrl})
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={13} /> Simulation Mode Ready (Tally offline on port 9000)
              </span>
            )}
          </div>

          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Active Company</div>
            <div style={{ fontWeight: 600 }}>
              {tallyStatus?.companies ? tallyStatus.companies.join(', ') : 'Demo Company'}
            </div>
          </div>
        </div>
      </div>

      {/* Two action cards */}
      <div className="grid-2" style={{ marginBottom: '24px' }}>
        {/* Sync Customers Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} /> 1. Sync Customers
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Fetch all Sundry Debtor accounts, contact names, and mobile numbers from Tally and update your contact directory.
          </p>
          <button
            onClick={handleSyncContacts}
            disabled={syncingContacts}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {syncingContacts ? 'Syncing with Tally...' : 'Sync Customers from Tally'}
          </button>
        </div>

        {/* Generate Ledgers Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} /> 2. Generate PDF Ledgers
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Automatically extract closing balances and vouchers from Tally and render branded PDF statements for each debtor.
          </p>
          <button
            onClick={handleGenerateLedgers}
            disabled={generatingLedgers}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {generatingLedgers ? 'Generating Statements...' : 'Generate Ledger PDFs'}
          </button>
        </div>
      </div>

      {/* Next Step Banner */}
      {genResult && (
        <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#166534', fontWeight: 600 }}>Ledger Statements are Ready for Dispatch</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#15803d' }}>
                PDFs have been created and pre-matched to your customers. Review and launch WhatsApp sending now.
              </p>
            </div>
            <button onClick={() => navigate('/dashboard/matching')} className="btn btn-primary">
              Proceed to Matching <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TallyIntegration;
