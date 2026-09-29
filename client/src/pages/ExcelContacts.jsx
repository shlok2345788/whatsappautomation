import React, { useState, useEffect } from 'react';
import API from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { Upload, FileSpreadsheet, Trash2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

const ExcelContacts = () => {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [existingContacts, setExistingContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchContacts = async () => {
    try {
      const res = await API.get('/excel/contacts');
      setExistingContacts(res.data || []);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setSuccessMsg('');
    }
  };

  const handleUploadAndParse = async (e) => {
    e.preventDefault();
    if (!file) {
      return setError('Please select an Excel file (.xlsx or .xls)');
    }

    const formData = new FormData();
    formData.append('file', file);

    setParsing(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await API.post('/excel/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreviewData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to parse Excel file');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || !previewData.records) return;

    setImporting(true);
    setError('');

    try {
      const validRecords = previewData.records.filter((r) => r.isValid);
      const res = await API.post('/excel/confirm', {
        contacts: validRecords,
        replaceExisting: false
      });

      setSuccessMsg(res.data.message || 'Contacts imported successfully');
      setPreviewData(null);
      setFile(null);
      fetchContacts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to import contacts');
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteSingle = async (id) => {
    try {
      await API.delete(`/excel/contacts/${id}`);
      setExistingContacts((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError('Failed to delete contact');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete all saved contacts?')) return;
    try {
      await API.delete('/excel/contacts');
      setExistingContacts([]);
      setSuccessMsg('All contacts cleared');
    } catch (err) {
      setError('Failed to clear contacts');
    }
  };

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Excel Upload Card */}
      {!previewData && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Upload Excel File</h3>
          </div>

          <form onSubmit={handleUploadAndParse} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="form-input"
                style={{ padding: '8px' }}
              />
            </div>

            <button type="submit" disabled={parsing || !file} className="btn btn-primary">
              <Upload size={16} />
              {parsing ? 'Parsing Excel...' : 'Upload & Preview'}
            </button>
          </form>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Supports .xlsx and .xls formats. Automatically detects Name and Mobile columns and normalizes phone numbers.
          </p>
        </div>
      )}

      {/* Excel Preview Section */}
      {previewData && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Contacts Import Preview</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPreviewData(null)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button onClick={handleConfirmImport} disabled={importing} className="btn btn-primary btn-sm">
                {importing ? 'Importing...' : 'Import Contacts'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '6px', marginBottom: '16px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
            <span style={{ fontWeight: 600 }}>{previewData.totalRecords} records found</span>
            <span style={{ color: '#15803d', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={14} /> {previewData.validCount} valid
            </span>
            <span style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} /> {previewData.duplicateCount} duplicate numbers
            </span>
            <span style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <XCircle size={14} /> {previewData.invalidCount} invalid numbers
            </span>
          </div>

          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Original Input</th>
                  <th>Normalized Mobile</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.records.map((rec, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 500 }}>{rec.name || '<Empty Name>'}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{rec.originalMobile}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rec.mobile || '-'}</td>
                    <td>
                      <StatusBadge status={rec.isValid ? 'Valid' : rec.statusMessage.includes('Duplicate') ? 'Duplicate' : 'Invalid'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved Database Contacts */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Saved Contacts ({existingContacts.length})</h3>
          {existingContacts.length > 0 && (
            <button onClick={handleDeleteAll} className="btn btn-danger btn-sm">
              <Trash2 size={14} /> Clear All Contacts
            </button>
          )}
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Person Name</th>
                <th>Mobile Number</th>
                <th>Formatted Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {existingContacts.length > 0 ? (
                existingContacts.map((contact, index) => (
                  <tr key={contact._id}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 600 }}>{contact.name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{contact.mobile}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>+{contact.mobile}</td>
                    <td>
                      <button onClick={() => handleDeleteSingle(contact._id)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No saved contacts found. Upload an Excel file to add contacts.
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

export default ExcelContacts;
