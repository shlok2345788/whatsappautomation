import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, Wifi, WifiOff } from 'lucide-react';

const StatusBadge = ({ status }) => {
  switch (status) {
    case 'CONNECTED':
    case 'Connected':
    case 'Sent':
    case 'Valid':
      return (
        <span className="badge badge-success">
          <CheckCircle2 size={13} />
          {status === 'CONNECTED' ? 'Connected ✓' : status}
        </span>
      );
    case 'WAITING_QR':
    case 'Waiting for QR scan':
    case 'CONNECTING':
    case 'Connecting':
    case 'Queued':
    case 'Sending':
    case 'Pending':
    case 'Ready':
      return (
        <span className="badge badge-warning">
          <Clock size={13} />
          {status === 'WAITING_QR' ? 'Waiting for QR scan' : status}
        </span>
      );
    case 'DISCONNECTED':
    case 'Disconnected':
    case 'Failed':
    case 'Invalid':
    case 'LOGGED_OUT':
    case 'Logged out':
      return (
        <span className="badge badge-danger">
          <XCircle size={13} />
          {status === 'DISCONNECTED' ? 'Disconnected' : status === 'LOGGED_OUT' ? 'Logged out' : status}
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
      return <span className="badge badge-neutral">{status}</span>;
  }
};

export default StatusBadge;
