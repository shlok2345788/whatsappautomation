import React, { useState, useEffect } from 'react';
import API from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { Search, RefreshCw, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

const History = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'All') params.status = statusFilter;
      if (search) params.search = search;

      const res = await API.get('/history', { params });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchHistory();
  };

  const handleRetry = async (logId) => {
    setRetryingId(logId);
    setError('');
    setSuccessMsg('');

    try {
      const res = await API.post(`/history/${logId}/retry`);
      setSuccessMsg(res.data.message || 'Retry successful!');
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all message logs?')) return;
    try {
      await API.delete('/history');
      setLogs([]);
      setTotal(0);
      setSuccessMsg('History cleared successfully');
    } catch (err) {
      setError('Failed to clear history');
    }
  };

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Filters and Search Header Card */}
      <div className="card">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search by name, number, or PDF filename..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            </div>
            <button type="submit" className="btn btn-secondary">
              Search
            </button>
          </form>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['All', 'Sent', 'Failed', 'Pending'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`btn btn-sm ${statusFilter === filter ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {logs.length > 0 && (
              <button onClick={handleClearHistory} className="btn btn-danger btn-sm">
                <Trash2 size={14} /> Clear History
              </button>
            )}
          </div>
        </div>
      </div>

      {/* History Log Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Message Records ({total})</h3>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Person Name</th>
                <th>Mobile Number</th>
                <th>PDF Filename</th>
                <th>Status</th>
                <th>Failure Reason</th>
                <th>Sent At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => {
                  const sentTime = log.sentAt || log.createdAt;
                  const formattedTime = new Date(sentTime).toLocaleString();

                  return (
                    <tr key={log._id}>
                      <td style={{ fontWeight: 600 }}>{log.contactName}</td>
                      <td style={{ fontFamily: 'monospace' }}>+{log.phone}</td>
                      <td>{log.pdfFilename}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td style={{ color: 'var(--danger)', fontSize: '12px', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {log.errorReason || '-'}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formattedTime}</td>
                      <td>
                        {log.status === 'Failed' && (
                          <button
                            onClick={() => handleRetry(log._id)}
                            disabled={retryingId === log._id}
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--accent)' }}
                          >
                            <RotateCcw size={14} className={retryingId === log._id ? 'spin' : ''} />
                            {retryingId === log._id ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No message history records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default History;
