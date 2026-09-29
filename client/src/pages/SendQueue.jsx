import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useWhatsApp } from '../context/WhatsAppContext';
import StatusBadge from '../components/StatusBadge';
import { Send, Play, Square, MessageSquare, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

const SendQueue = () => {
  const { socket } = useSocket();
  const { status: wsStatus } = useWhatsApp();

  const [queueItems, setQueueItems] = useState([]);
  const [messageTemplate, setMessageTemplate] = useState("Hello {{name}},\n\nPlease find your document attached.\n\nThank you.");
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [completedSummary, setCompletedSummary] = useState(null);

  const loadQueue = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch match results
      const res = await API.post('/matching/preview');
      const matched = res.data.matched || [];

      // Format into queue items
      const items = matched.map((m) => ({
        contactId: m.contactId,
        name: m.contactName,
        phone: m.phone,
        pdfFilename: m.pdfFilename,
        pdfPath: m.filePath,
        fileHash: m.fileHash,
        alreadySent: m.alreadySent,
        forceSend: false
      }));

      setQueueItems(items);

      // Check if queue is already running on server
      const statusRes = await API.get('/messages/status');
      setIsSending(statusRes.data.isRunning);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to prepare send queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();

    // Fetch user settings for default template
    API.get('/settings')
      .then((res) => {
        if (res.data && res.data.messageTemplate) {
          setMessageTemplate(res.data.messageTemplate);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleProgress = (data) => {
      setProgress(data);
      setIsSending(true);
    };

    const handleCompleted = (summary) => {
      setIsSending(false);
      setCompletedSummary(summary);
      setProgress(null);
    };

    socket.on('queue:progress', handleProgress);
    socket.on('queue:completed', handleCompleted);

    return () => {
      socket.off('queue:progress', handleProgress);
      socket.off('queue:completed', handleCompleted);
    };
  }, [socket]);

  const handleStartSending = async () => {
    if (wsStatus !== 'CONNECTED') {
      return setError('WhatsApp is not connected. Please scan QR code first.');
    }

    if (queueItems.length === 0) {
      return setError('No items ready in queue to send.');
    }

    setIsSending(true);
    setCompletedSummary(null);
    setError('');

    try {
      await API.post('/messages/start', {
        queueItems,
        messageTemplate
      });
    } catch (err) {
      setIsSending(false);
      setError(err.response?.data?.message || 'Failed to start send queue');
    }
  };

  const handleCancelSending = async () => {
    try {
      await API.post('/messages/cancel');
      setIsSending(false);
    } catch (err) {
      console.error('Cancel queue error:', err);
    }
  };

  const toggleForceSend = (index) => {
    setQueueItems((prev) => {
      const copy = [...prev];
      copy[index].forceSend = !copy[index].forceSend;
      return copy;
    });
  };

  const readyCount = queueItems.filter((i) => !i.alreadySent || i.forceSend).length;

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}

      {/* WhatsApp Disconnected Warning */}
      {wsStatus !== 'CONNECTED' && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          <span>WhatsApp is currently disconnected. You must connect WhatsApp before starting the queue.</span>
        </div>
      )}

      {/* Real-time Sending Progress Box */}
      {(isSending || progress) && (
        <div className="card" style={{ borderColor: 'var(--primary-border)', backgroundColor: '#f0fdf4' }}>
          <div className="card-header" style={{ borderBottomColor: '#bbf7d0' }}>
            <h3 className="card-title" style={{ color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={18} /> Sending PDFs in Progress...
            </h3>
            <button onClick={handleCancelSending} className="btn btn-danger btn-sm">
              <Square size={14} /> Stop Queue
            </button>
          </div>

          {progress && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                <span>{progress.percentage}% Completed</span>
                <span>{progress.current} / {progress.total}</span>
              </div>

              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress.percentage}%` }}></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '12px' }}>
                <div>
                  Current: <strong style={{ color: 'var(--text-primary)' }}>Sending to {progress.currentContact || '...'}</strong>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <span style={{ color: '#15803d' }}>Sent: <strong>{progress.sentCount}</strong></span>
                  <span style={{ color: '#b91c1c' }}>Failed: <strong>{progress.failedCount}</strong></span>
                  <span style={{ color: '#b45309' }}>Skipped: <strong>{progress.skippedCount || 0}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>Pending: <strong>{progress.pendingCount}</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Execution Finished Summary */}
      {completedSummary && (
        <div className="alert alert-success" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={18} /> Queue Execution Completed!
          </div>
          <div style={{ fontSize: '13px' }}>
            Total Processed: <strong>{completedSummary.total}</strong> |
            Sent: <strong style={{ color: '#15803d' }}>{completedSummary.sentCount}</strong> |
            Failed: <strong style={{ color: '#b91c1c' }}>{completedSummary.failedCount}</strong> |
            Skipped: <strong style={{ color: '#b45309' }}>{completedSummary.skippedCount}</strong>
          </div>
        </div>
      )}

      {/* Message Template Editor */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Message Template</h3>
        </div>
        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label className="form-label">WhatsApp Caption Template</label>
          <textarea
            rows={4}
            className="form-textarea"
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            disabled={isSending}
          />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Available Placeholders: <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>&#123;&#123;name&#123;&#123;</code>, <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>&#123;&#123;phone&#123;&#123;</code>
        </p>
      </div>

      {/* Queue Preview Table & Start Button */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Send Queue ({queueItems.length})</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Ready to send: <strong>{readyCount}</strong>
            </span>
          </div>

          <button
            onClick={handleStartSending}
            disabled={isSending || readyCount === 0 || wsStatus !== 'CONNECTED'}
            className="btn btn-primary btn-lg"
          >
            <Play size={18} />
            {isSending ? 'Sending in progress...' : 'Start Sending'}
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Person</th>
                <th>PDF File</th>
                <th>Number</th>
                <th>Duplicate Check</th>
                <th>Override Duplicate</th>
              </tr>
            </thead>
            <tbody>
              {queueItems.length > 0 ? (
                queueItems.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>{item.pdfFilename}</td>
                    <td style={{ fontFamily: 'monospace' }}>+{item.phone}</td>
                    <td>
                      {item.alreadySent && !item.forceSend ? (
                        <span className="badge badge-neutral">Already Sent</span>
                      ) : (
                        <span className="badge badge-success">Ready</span>
                      )}
                    </td>
                    <td>
                      {item.alreadySent && (
                        <button
                          onClick={() => toggleForceSend(index)}
                          className={`btn btn-sm ${item.forceSend ? 'btn-danger' : 'btn-secondary'}`}
                        >
                          {item.forceSend ? 'Send Again (Active)' : 'Send Again'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No matched documents in queue. Go to <strong>Matching</strong> to review matched files first.
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

export default SendQueue;
