import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { Upload, Trash2, FileText, CheckCircle2, Eye, Download } from 'lucide-react';

const PdfFiles = () => {
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

  const handleDownloadPdf = async (pdf) => {
    try {
      const res = await API.get(`/pdfs/${pdf.id}/file`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', pdf.originalFilename || `ledger-${pdf.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to retrieve PDF file: ' + (err.response?.data?.message || err.message));
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

      {/* Browser File Upload Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 className="card-title">Upload Customer PDF Documents</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Select PDF Files from your computer</label>
            <input
              type="file"
              multiple
              accept=".pdf"
              disabled={uploading}
              onChange={handleFileUpload}
              className="form-input"
              style={{ padding: '10px' }}
            />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            {uploading
              ? 'Processing and uploading PDF files...'
              : 'Select one or more PDF statements to upload and match against your contact list.'}
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
                <th>Extracted Name</th>
                <th>File Size</th>
                <th>Match Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pdfs.length > 0 ? (
                pdfs.map((pdf, index) => (
                  <tr key={pdf.id || pdf._id || index}>
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
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDownloadPdf(pdf)}
                        className="btn btn-secondary btn-sm"
                        title="Download / View PDF"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                      >
                        <Download size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No PDF files loaded. Upload PDF files above to begin matching.
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
