import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

const StatusBadge = ({ status }) => {
  switch (status) {
    case 'CONNECTED':
    case 'Connected':
    case 'Sent':
    case 'Delivered':
    case 'Read':
    case 'Valid':
      return (
        <span className="badge badge-success">
          <CheckCircle2 size={13} />
          {status === 'CONNECTED' ? 'Connected ✓' : status}
        </span>
      );
    case 'CONFIG_REQUIRED':
    case 'Setup Required':
    case 'Queued':
    case 'Sending':
    case 'Pending':
    case 'Ready':
      return (
        <span className="badge badge-warning">
          <Clock size={13} />
          {status === 'CONFIG_REQUIRED' ? 'Setup Required' : status}
        </span>
      );
    case 'NOT_CONFIGURED':
    case 'Not Configured':
      return (
        <span className="badge badge-warning" style={{ color: '#b45309', backgroundColor: '#fef3c7', borderColor: '#fde68a' }}>
          <ShieldAlert size={13} />
          Not Configured
        </span>
      );
    case 'DISCONNECTED':
    case 'Disconnected':
    case 'Failed':
    case 'Invalid':
    case 'ERROR':
    case 'Error':
      return (
        <span className="badge badge-danger">
          <XCircle size={13} />
          {status === 'ERROR' ? 'Config Error' : status === 'DISCONNECTED' ? 'Disconnected' : status}
        </span>
      );
    case 'Already Sent':
    case 'Duplicate':
      return (
        <span className="badge badge-neutral">
          <AlertTriangle size={13} />
          {status}
        </span>
      );
    default:
      return <span className="badge badge-neutral">{status || 'Unknown'}</span>;
  }
};

export default StatusBadge;
