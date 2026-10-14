import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import {
  Database,
  RefreshCw,
  Users,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Scale,
  Calendar,
  Building2,
  Download,
  Eye,
  X,
  AlertTriangle,
  ShieldCheck,
  Check
} from 'lucide-react';

const TallyIntegration = () => {
  const [tallyStatus, setTallyStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [reportType, setReportType] = useState('ledgers'); // 'ledgers' | 'balanceSheet'
  const [periodType, setPeriodType] = useState('FY2025-26');
  const [fromDate, setFromDate] = useState('20250401');
  const [toDate, setToDate] = useState('20260331');
  const [asOfDate, setAsOfDate] = useState('31-Mar-2026');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Data states
  const [ledgers, setLedgers] = useState([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [selectedPartyFilter, setSelectedPartyFilter] = useState('ALL');
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [loadingBs, setLoadingBs] = useState(false);

  // Action states
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [generatingLedgers, setGeneratingLedgers] = useState(false);
  const [generatingBsPdf, setGeneratingBsPdf] = useState(false);

  // Feedback & Preview Modal states
  const [syncResult, setSyncResult] = useState('');
  const [genResult, setGenResult] = useState('');
  const [error, setError] = useState('');
  const [previewModal, setPreviewModal] = useState({ open: false, title: '', html: '', pdfId: null });

  const navigate = useNavigate();

  // 1. Fetch Tally status and discover companies
  const fetchStatus = async () => {
    setLoadingStatus(true);
    setError('');
    try {
      const res = await API.get('/tally/status');
      setTallyStatus(res.data);
      if (res.data.companies && res.data.companies.length > 0 && !selectedCompany) {
        setSelectedCompany(res.data.companies[0]);
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach Tally Prime server');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // 2. Fetch Customer Ledgers with financial calculations & reconciliation
  const fetchLedgers = async () => {
    setLoadingLedgers(true);
    setError('');
    setGenResult('');
    try {
      const res = await API.get('/tally/ledgers', {
        params: {
          companyName: selectedCompany,
          statementPeriod: getFormattedPeriod(),
          fromDate,
          toDate,
          isDemoMode
        }
      });
      setLedgers(res.data.ledgers || []);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retrieve ledger data');
    } finally {
      setLoadingLedgers(false);
    }
  };

  // 3. Fetch Reconciled Balance Sheet
  const fetchBalanceSheet = async () => {
    setLoadingBs(true);
    setError('');
    try {
      const res = await API.get('/tally/balance-sheet', {
        params: {
          companyName: selectedCompany,
          asOfDate,
          financialYear: periodType === 'FY2025-26' ? '2025-26' : '2024-25',
          isDemoMode
        }
      });
      setBalanceSheet(res.data);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retrieve Balance Sheet data');
    } finally {
      setLoadingBs(false);
    }
  };

  // Auto-fetch data on tab switch or company change
  useEffect(() => {
    if (reportType === 'ledgers') {
      fetchLedgers();
    } else if (reportType === 'balanceSheet') {
      fetchBalanceSheet();
    }
  }, [reportType, selectedCompany, isDemoMode, periodType]);

  const getFormattedPeriod = () => {
    if (periodType === 'FY2025-26') return '01-Apr-2025 to 31-Mar-2026';
    if (periodType === 'FY2024-25') return '01-Apr-2024 to 31-Mar-2025';
    return `${fromDate} to ${toDate}`;
  };

  // 4. Sync Contacts to Database Directory
  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    setSyncResult('');
    setError('');
    try {
      const res = await API.post('/tally/sync-contacts', {
        companyName: selectedCompany,
        isDemoMode
      });
      setSyncResult(res.data.message || 'Contacts synced successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to sync contacts from Tally');
    } finally {
      setSyncingContacts(false);
    }
  };

  // 5. Generate Multi-Page PDF Statements & Register in pdf_files
  const handleGenerateLedgers = async () => {
    setGeneratingLedgers(true);
    setGenResult('');
    setError('');
    try {
      const partyFilter = selectedPartyFilter !== 'ALL' ? [selectedPartyFilter] : [];
      const res = await API.post('/tally/generate-ledgers', {
        clearPrevious: true,
        companyName: selectedCompany,
        statementPeriod: getFormattedPeriod(),
        fromDate,
        toDate,
        partyNames: partyFilter,
        isDemoMode
      });
      setGenResult(res.data.message || 'Ledger statements generated successfully');
      fetchLedgers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate ledgers from Tally');
    } finally {
      setGeneratingLedgers(false);
    }
  };

  // 6. Generate Balance Sheet PDF
  const handleGenerateBalanceSheetPdf = async () => {
    setGeneratingBsPdf(true);
    setGenResult('');
    setError('');
    try {
      const res = await API.post('/tally/generate-balance-sheet', {
        companyName: selectedCompany,
        asOfDate,
        financialYear: periodType === 'FY2025-26' ? '2025-26' : '2024-25',
        isDemoMode
      });
      setGenResult(res.data.message || 'Balance Sheet PDF generated and registered');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate Balance Sheet PDF');
    } finally {
      setGeneratingBsPdf(false);
    }
  };

  // 7. Preview Statement Modal Trigger
  const handlePreviewLedger = async (ledger) => {
    try {
      const res = await API.post('/tally/preview-ledger', {
        ledgerName: ledger.name,
        companyName: selectedCompany,
        statementPeriod: getFormattedPeriod(),
        fromDate,
        toDate,
        isDemoMode
      });
      setPreviewModal({
        open: true,
        title: `Ledger Statement Preview - ${ledger.name}`,
        html: res.data.htmlPreview
      });
    } catch (err) {
      alert('Could not preview statement: ' + (err.response?.data?.message || err.message));
    }
  };

  const filteredLedgers = selectedPartyFilter === 'ALL'
    ? ledgers
    : ledgers.filter((l) => l.name === selectedPartyFilter);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Notifications */}
      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}
      {syncResult && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <div>{syncResult}</div>
        </div>
      )}
      {genResult && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <div>{genResult}</div>
        </div>
      )}

      {/* Tally Server Status Header Card */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header" style={{ paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '6px', color: '#2563eb', display: 'flex' }}>
              <Database size={20} />
            </div>
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Tally Prime Production Integration</h3>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Direct XML Server interface for dynamic ledger statements and audited balance sheets
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={fetchStatus} disabled={loadingStatus} className="btn btn-secondary btn-sm">
              <RefreshCw size={13} className={loadingStatus ? 'spin' : ''} /> Check Connection
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)' }}>Connection Status</div>
            <div style={{ marginTop: '4px' }}>
              {tallyStatus?.connected ? (
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <CheckCircle2 size={12} /> Connected (Port 9000)
                </span>
              ) : (
                <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#b91c1c' }}>
                  <AlertCircle size={12} /> Tally Disconnected
                </span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)' }}>Server URL</div>
            <div style={{ marginTop: '4px', fontFamily: 'monospace', fontWeight: 600, fontSize: '13px' }}>
              {tallyStatus?.tallyUrl || 'http://localhost:9000'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)' }}>Last Synchronized</div>
            <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 500 }}>
              {lastSyncTime || 'Pending connection'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)' }}>Environment Mode</div>
            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={isDemoMode}
                  onChange={(e) => setIsDemoMode(e.target.checked)}
                />
                Sandbox Mode (Simulated Data)
              </label>
            </div>
          </div>
        </div>

        {isDemoMode && (
          <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>Sandbox Demonstration Active:</strong> Reports are rendered from watermarked synthetic financial fixtures. Live Tally substitution is strictly disabled in production.
            </span>
          </div>
        )}
      </div>

      {/* Report Controls Bar (Company, Report Type, Period) */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
          
          {/* Company Selector */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={14} /> Active Tally Company
            </label>
            {tallyStatus?.companies && tallyStatus.companies.length > 0 ? (
              <select
                className="form-select"
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
              >
                {tallyStatus.companies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="form-input"
                placeholder="Company Name (e.g. Acme Corp)"
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
              />
            )}
          </div>

          {/* Report Type Selector */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={14} /> Report Type
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn btn-sm ${reportType === 'ledgers' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setReportType('ledgers')}
              >
                <FileText size={13} /> Ledger Statements
              </button>
              <button
                type="button"
                className={`btn btn-sm ${reportType === 'balanceSheet' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setReportType('balanceSheet')}
              >
                <Scale size={13} /> Balance Sheet
              </button>
            </div>
          </div>

          {/* Period Selector */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} /> Reporting Period
            </label>
            <select
              className="form-select"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
            >
              <option value="FY2025-26">FY 2025-26 (01-Apr-2025 to 31-Mar-2026)</option>
              <option value="FY2024-25">FY 2024-25 (01-Apr-2024 to 31-Mar-2025)</option>
              <option value="Custom">Custom Date Range</option>
            </select>
          </div>

        </div>

        {periodType === 'Custom' && (
          <div style={{ display: 'flex', gap: '16px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label className="form-label">From Date (YYYYMMDD)</label>
              <input
                type="text"
                className="form-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                placeholder="20250401"
              />
            </div>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label className="form-label">To Date (YYYYMMDD)</label>
              <input
                type="text"
                className="form-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                placeholder="20260331"
              />
            </div>
          </div>
        )}
      </div>

      {/* REPORT VIEW 1: CUSTOMER LEDGERS */}
      {reportType === 'ledgers' && (
        <div>
          {/* Action Header for Ledgers */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter Party:</span>
                <select
                  className="form-select"
                  style={{ maxWidth: '280px' }}
                  value={selectedPartyFilter}
                  onChange={(e) => setSelectedPartyFilter(e.target.value)}
                >
                  <option value="ALL">All Sundry Debtors ({ledgers.length})</option>
                  {ledgers.map((l) => (
                    <option key={l.name} value={l.name}>{l.name} ({l.mobile || 'No phone'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleSyncContacts}
                  disabled={syncingContacts || loadingLedgers}
                  className="btn btn-secondary btn-sm"
                  title="Update contacts directory with Tally party phone numbers"
                >
                  <Users size={14} className={syncingContacts ? 'spin' : ''} />
                  {syncingContacts ? 'Syncing...' : '1. Sync Customers'}
                </button>

                <button
                  onClick={handleGenerateLedgers}
                  disabled={generatingLedgers || loadingLedgers}
                  className="btn btn-primary btn-sm"
                >
                  <FileText size={14} className={generatingLedgers ? 'spin' : ''} />
                  {generatingLedgers ? 'Generating Statements...' : '2. Generate Verified PDFs'}
                </button>
              </div>
            </div>
          </div>

          {/* Ledger Statements Table */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Customer Debtor Accounts ({filteredLedgers.length})</h3>
              <button onClick={fetchLedgers} disabled={loadingLedgers} className="btn btn-secondary btn-sm">
                <RefreshCw size={13} className={loadingLedgers ? 'spin' : ''} /> Refresh Ledgers
              </button>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer / Party Name</th>
                    <th>Contact Phone</th>
                    <th style={{ textAlign: 'right' }}>Opening Balance</th>
                    <th style={{ textAlign: 'right' }}>Period Debits</th>
                    <th style={{ textAlign: 'right' }}>Period Credits</th>
                    <th style={{ textAlign: 'right' }}>Closing Balance</th>
                    <th>Reconciliation</th>
                    <th style={{ textAlign: 'right' }}>Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedgers.length > 0 ? (
                    filteredLedgers.map((l, idx) => (
                      <tr key={l.name + idx}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{l.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{l.mobile ? `+${l.mobile}` : '-'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          ₹ {Number(l.openingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {l.openingBalanceType || 'Dr'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#1e40af' }}>
                          ₹ {Number(l.totalDebits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#15803d' }}>
                          ₹ {Number(l.totalCredits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: l.balanceType === 'Cr' ? '#15803d' : '#b91c1c' }}>
                          ₹ {Number(l.closingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {l.balanceType || 'Dr'}
                        </td>
                        <td>
                          {l.isReconciled !== false ? (
                            <span className="badge badge-success" title="Calculated balance matches Tally closing balance">
                              ✓ Reconciled
                            </span>
                          ) : (
                            <span className="badge badge-neutral" style={{ background: '#fee2e2', color: '#b91c1c' }} title={l.validationMessage}>
                              ⚠️ Discrepancy
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handlePreviewLedger(l)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Preview complete multi-page Statement"
                          >
                            <Eye size={13} /> Preview
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                        {loadingLedgers ? 'Fetching live ledger accounts from Tally Prime...' : 'No ledger accounts retrieved. Verify Tally connection or enable Sandbox mode.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT VIEW 2: BALANCE SHEET */}
      {reportType === 'balanceSheet' && (
        <div>
          {/* Balance Sheet Action Bar */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>As at Date:</span>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '150px', padding: '6px 10px' }}
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={fetchBalanceSheet} disabled={loadingBs} className="btn btn-secondary btn-sm">
                  <RefreshCw size={13} className={loadingBs ? 'spin' : ''} /> Recalculate
                </button>
                <button
                  onClick={handleGenerateBalanceSheetPdf}
                  disabled={generatingBsPdf || loadingBs || !balanceSheet}
                  className="btn btn-primary btn-sm"
                >
                  <Download size={13} className={generatingBsPdf ? 'spin' : ''} />
                  {generatingBsPdf ? 'Generating PDF...' : 'Download & Register PDF'}
                </button>
              </div>
            </div>
          </div>

          {/* Balance Sheet Display */}
          {balanceSheet ? (
            <div className="card">
              {/* Verification Seal Banner */}
              <div style={{
                padding: '12px 16px',
                borderRadius: '6px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: balanceSheet.isReconciled ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${balanceSheet.isReconciled ? '#86efac' : '#fca5a5'}`,
                color: balanceSheet.isReconciled ? '#166534' : '#991b1b'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  {balanceSheet.isReconciled ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                  <span>{balanceSheet.validationNotes}</span>
                </div>
                <div style={{ fontSize: '12px' }}>
                  Source: <strong>{balanceSheet.source}</strong>
                </div>
              </div>

              {/* Two-Column Grid: Liabilities vs Assets */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                
                {/* Liabilities Column */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ background: '#0f172a', color: '#fff', padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>Capital & Liabilities</span>
                    <span>Amount</span>
                  </div>

                  <div style={{ padding: '12px' }}>
                    {(balanceSheet.liabilities || []).map((cat, idx) => (
                      <div key={idx} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px', borderLeft: '3px solid #2563eb' }}>
                          <span>{cat.name}</span>
                          <span style={{ fontFamily: 'monospace' }}>{cat.subtotalFormatted}</span>
                        </div>
                        <div style={{ paddingLeft: '8px', marginTop: '4px' }}>
                          {(cat.items || []).map((item, itemIdx) => (
                            <div key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                              <span style={{ fontFamily: 'monospace' }}>{item.amountFormatted}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#f1f5f9', borderTop: '2px solid #0f172a', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '14px' }}>
                    <span>Total Liabilities</span>
                    <span style={{ fontFamily: 'monospace', textDecoration: 'underline double' }}>{balanceSheet.totalLiabilitiesFormatted}</span>
                  </div>
                </div>

                {/* Assets Column */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ background: '#0f172a', color: '#fff', padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>Property & Assets</span>
                    <span>Amount</span>
                  </div>

                  <div style={{ padding: '12px' }}>
                    {(balanceSheet.assets || []).map((cat, idx) => (
                      <div key={idx} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px', borderLeft: '3px solid #16a34a' }}>
                          <span>{cat.name}</span>
                          <span style={{ fontFamily: 'monospace' }}>{cat.subtotalFormatted}</span>
                        </div>
                        <div style={{ paddingLeft: '8px', marginTop: '4px' }}>
                          {(cat.items || []).map((item, itemIdx) => (
                            <div key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                              <span style={{ fontFamily: 'monospace' }}>{item.amountFormatted}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#f1f5f9', borderTop: '2px solid #0f172a', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '14px' }}>
                    <span>Total Assets</span>
                    <span style={{ fontFamily: 'monospace', textDecoration: 'underline double' }}>{balanceSheet.totalAssetsFormatted}</span>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              {loadingBs ? 'Computing dynamic Balance Sheet from Tally records...' : 'No Balance Sheet data loaded. Click Recalculate to generate report.'}
            </div>
          )}
        </div>
      )}

      {/* WhatsApp Dispatch Direct Bridge Banner */}
      {genResult && (
        <div className="card" style={{ marginTop: '20px', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#166534', fontWeight: 600 }}>Documents Ready for WhatsApp Dispatch</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#15803d' }}>
                All generated statements are registered and pre-matched. Review matches or initiate message delivery.
              </p>
            </div>
            <button onClick={() => navigate('/dashboard/matching')} className="btn btn-primary">
              Proceed to Matching <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* HTML Statement Preview Modal */}
      {previewModal.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 20px',
              borderBottom: '1px solid var(--border-color)',
              background: '#f8fafc'
            }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>{previewModal.title}</h3>
              <button
                onClick={() => setPreviewModal({ open: false, title: '', html: '', pdfId: null })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f1f5f9' }}>
              <div
                style={{ background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderRadius: '4px' }}
                dangerouslySetInnerHTML={{ __html: previewModal.html }}
              />
            </div>

            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-color)',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                onClick={() => setPreviewModal({ open: false, title: '', html: '', pdfId: null })}
                className="btn btn-secondary btn-sm"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="btn btn-primary btn-sm"
              >
                Print / Save Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TallyIntegration;
