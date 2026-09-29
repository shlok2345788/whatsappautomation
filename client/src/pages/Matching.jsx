import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { GitCompare, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, UserCheck } from 'lucide-react';

const Matching = () => {
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingManual, setUpdatingManual] = useState({});
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const runMatching = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.post('/matching/preview');
      setMatchData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to execute document matching');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runMatching();
  }, []);

  const handleManualSelect = async (pdfId, contactId) => {
    setUpdatingManual((prev) => ({ ...prev, [pdfId]: true }));
    try {
      await API.post('/matching/confirm-manual', { pdfId, contactId });
      await runMatching();
    } catch (err) {
      setError('Failed to update manual match');
    } finally {
      setUpdatingManual((prev) => ({ ...prev, [pdfId]: false }));
    }
  };

  const handleProceedToQueue = () => {
    navigate('/queue');
  };

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Summary Header */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Matching Engine Summary</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={runMatching} disabled={loading} className="btn btn-secondary btn-sm">
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Re-run Matching
            </button>
            {matchData && matchData.matched.length > 0 && (
              <button onClick={handleProceedToQueue} className="btn btn-primary btn-sm">
                Proceed to Queue ({matchData.matched.length}) <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        {matchData && (
          <div style={{ display: 'flex', gap: '32px', padding: '16px 20px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label">Total PDFs</span>
              <span className="stat-value">{matchData.summary.totalPdfs}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#15803d' }}>Matched</span>
              <span className="stat-value" style={{ color: '#15803d' }}>{matchData.summary.matchedCount}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#b91c1c' }}>Unmatched</span>
              <span className="stat-value" style={{ color: '#b91c1c' }}>{matchData.summary.unmatchedCount}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#b45309' }}>Previously Sent</span>
              <span className="stat-value" style={{ color: '#b45309' }}>{matchData.summary.duplicateSentCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Matched Documents */}
      {matchData && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Matched Documents ({matchData.matched.length})</h3>
          </div>

          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>PDF Filename</th>
                  <th>Extracted Name</th>
                  <th>Matched Contact</th>
                  <th>Mobile Number</th>
                  <th>Sent Protection</th>
                </tr>
              </thead>
              <tbody>
                {matchData.matched.length > 0 ? (
                  matchData.matched.map((item) => (
                    <tr key={item.pdfId}>
                      <td style={{ fontWeight: 600 }}>{item.pdfFilename}</td>
                      <td>{item.extractedName}</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{item.contactName}</td>
                      <td style={{ fontFamily: 'monospace' }}>+{item.phone}</td>
                      <td>
                        {item.alreadySent ? (
                          <span className="badge badge-neutral">Already Sent</span>
                        ) : (
                          <span className="badge badge-success">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No automatic matches found. Check unmatched items below or verify PDF filenames match Excel contact names.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unmatched Documents with Manual Selector */}
      {matchData && matchData.unmatched.length > 0 && (
        <div className="card" style={{ borderColor: '#fecaca' }}>
          <div className="card-header" style={{ backgroundColor: '#fef2f2' }}>
            <h3 className="card-title" style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} /> Unmatched PDF Documents ({matchData.unmatched.length})
            </h3>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            The following PDFs could not be matched automatically to any contact name. You can manually assign a contact using the dropdown.
          </p>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unmatched PDF Filename</th>
                  <th>Extracted String</th>
                  <th>Manually Assign Contact</th>
                </tr>
              </thead>
              <tbody>
                {matchData.unmatched.map((item) => (
                  <tr key={item.pdfId}>
                    <td style={{ fontWeight: 600 }}>{item.pdfFilename}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.extractedName}</td>
                    <td>
                      <select
                        className="form-select"
                        defaultValue=""
                        disabled={updatingManual[item.pdfId]}
                        onChange={(e) => handleManualSelect(item.pdfId, e.target.value)}
                        style={{ maxWidth: '280px' }}
                      >
                        <option value="">-- Select Contact to Match --</option>
                        {matchData.contacts.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} ({c.mobile})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Matching;
