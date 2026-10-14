import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API from '../services/api';
import { useWhatsApp } from '../context/WhatsAppContext';
import StatusBadge from '../components/StatusBadge';
import { Users, FileText, Send, AlertCircle, MessageSquare, Settings, ArrowRight } from 'lucide-react';

const Dashboard = () => {
  const { status } = useWhatsApp();
  const [stats, setStats] = useState({
    contactsCount: 0,
    pdfsCount: 0,
    sentTodayCount: 0,
    failedCount: 0
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [contactsRes, pdfsRes, historyRes] = await Promise.all([
          API.get('/excel/contacts'),
          API.get('/pdfs'),
          API.get('/history?limit=10')
        ]);

        const contacts = contactsRes.data || [];
        const pdfs = pdfsRes.data || [];
        const historyData = historyRes.data || { logs: [] };

        const today = new Date().toDateString();
        const sentToday = historyData.logs.filter(
          (l) => l.status === 'Sent' && new Date(l.createdAt).toDateString() === today
        ).length;
        const failed = historyData.logs.filter((l) => l.status === 'Failed').length;

        setStats({
          contactsCount: contacts.length,
          pdfsCount: pdfs.length,
          sentTodayCount: sentToday,
          failedCount: failed
        });

        setRecentLogs(historyData.logs.slice(0, 5));
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div>
      {/* WhatsApp Status Alert Banner if not configured or connected */}
      {status !== 'CONNECTED' && (
        <div className="card" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} style={{ color: '#d97706' }} />
            <div>
              <div style={{ fontWeight: 600, color: '#92400e' }}>
                {status === 'NOT_CONFIGURED' ? 'WhatsApp Business API Not Configured' : 'WhatsApp API Setup Required'}
              </div>
              <div style={{ fontSize: '13px', color: '#b45309' }}>
                Configure your Gupshup WhatsApp Business API credentials to start sending PDF invoices and statements.
              </div>
            </div>
          </div>
          <Link to="/dashboard/whatsapp" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={14} /> Configure WhatsApp API
          </Link>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: status === 'CONNECTED' ? '#f0fdf4' : '#fef3c7', color: status === 'CONNECTED' ? '#16a34a' : '#d97706' }}>
            <MessageSquare size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">WhatsApp API</span>
            <div style={{ marginTop: '2px' }}>
              <StatusBadge status={status} />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
            <Users size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Contacts</span>
            <span className="stat-value">{stats.contactsCount}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#f5f3ff', color: '#7c3aed' }}>
            <FileText size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">PDFs Ready</span>
            <span className="stat-value">{stats.pdfsCount}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
            <Send size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Sent Today</span>
            <span className="stat-value">{stats.sentTodayCount}</span>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
          <Link to="/history" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: 500 }}>
            View Full History <ArrowRight size={14} />
          </Link>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>PDF File</th>
                <th>Mobile Number</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => {
                  const formattedPhone = log.phone ? `+${log.phone}` : '-';
                  const timeStr = new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={log._id}>
                      <td style={{ fontWeight: 600 }}>{log.contactName}</td>
                      <td>{log.pdfFilename}</td>
                      <td style={{ fontFamily: 'monospace' }}>{formattedPhone}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td style={{ color: 'var(--text-muted)' }}>{timeStr}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No recent message activity found.
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

export default Dashboard;
