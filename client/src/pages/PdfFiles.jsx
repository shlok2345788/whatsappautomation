import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { Folder, Upload, Trash2, FileText, CheckCircle2 } from 'lucide-react';

const PdfFiles = () => {
  const [folderPath, setFolderPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pdfs, setPdfs] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchPdfs = async () => {
    try {
      const res = await API.get('/pdfs');
      setPdfs(res.data || []);
    } catch (err) {
      console.error('Error fetching PDFs:', err);
    }
  };

  useEffect(() => {
    fetchPdfs();
  }, []);

  const handleScanFolder = async (e) => {
    e.preventDefault();
    if (!folderPath) {
      return setError('Please enter a valid Windows local folder path');
    }

    setScanning(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await API.post('/pdfs/scan-folder', {
        folderPath,
        clearPrevious: true
      });
      setSuccessMsg(res.data.message || 'Folder scanned successfully');
      fetchPdfs();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to scan folder');
    } finally {
      setScanning(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('clearPrevious', 'true');

    setUploading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await API.post('/pdfs/upload-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccessMsg(res.data.message || 'Files uploaded successfully');
      fetchPdfs();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload PDF files');
    } finally {
      setUploading(false);
    }
  };

  const handleClearPdfs = async () => {
    if (!window.confirm('Are you sure you want to clear all loaded PDF file records?')) return;
    try {
      await API.delete('/pdfs');
      setPdfs([]);
      setSuccessMsg('All PDF records cleared');
    } catch (err) {
      setError('Failed to clear PDFs');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 KB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="grid-2">
        {/* Local Folder Scan Form (For Local Windows Setup) */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Scan Local Computer Folder</h3>
          </div>
          <form onSubmit={handleScanFolder}>
            <div className="form-group">
              <label className="form-label">Full Windows Directory Path</label>
              <input
                type="text"
                className="form-input"
                placeholder="C:\Users\Username\Documents\PDFs"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
              />
            </div>
            <button type="submit" disabled={scanning || !folderPath} className="btn btn-primary" style={{ width: '100%' }}>
              <Folder size={16} />
              {scanning ? 'Scanning Directory...' : 'Scan Local Folder'}
            </button>
          </form>
        </div>

        {/* Browser File / Folder Upload */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Select / Upload PDF Files</h3>
          </div>
          <div className="form-group">
            <label className="form-label">Choose PDF Files or Folder</label>
            <input
              type="file"
              multiple
              accept=".pdf"
              onChange={handleFileUpload}
              className="form-input"
              style={{ padding: '8px' }}
            />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Select multiple PDF files directly from your file browser.
          </p>
        </div>
      </div>

      {/* PDF List Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Loaded PDF Documents ({pdfs.length})</h3>
          {pdfs.length > 0 && (
            <button onClick={handleClearPdfs} className="btn btn-danger btn-sm">
              <Trash2 size={14} /> Clear PDF List
            </button>
          )}
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Original PDF Filename</th>
                <th>Extracted Person Name</th>
                <th>File Size</th>
                <th>Match Status</th>
              </tr>
            </thead>
            <tbody>
              {pdfs.length > 0 ? (
                pdfs.map((pdf, index) => (
                  <tr key={pdf._id}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} style={{ color: 'var(--accent)' }} />
                      {pdf.originalFilename}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{pdf.extractedName}</td>
                    <td style={{ fontFamily: 'monospace' }}>{formatSize(pdf.fileSize)}</td>
                    <td>
                      {pdf.matchedContactId ? (
                        <span className="badge badge-success">Matched</span>
                      ) : (
                        <span className="badge badge-neutral">Unmatched</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No PDF files loaded. Scan a local folder or upload PDF files above.
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

export default PdfFiles;
