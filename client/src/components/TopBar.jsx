import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useWhatsApp } from '../context/WhatsAppContext';
import StatusBadge from './StatusBadge';
import { User as UserIcon } from 'lucide-react';

const TopBar = ({ title }) => {
  const { user } = useAuth();
  const { status } = useWhatsApp();

  return (
    <header className="top-bar">
      <h1 className="page-title">{title}</h1>

      <div className="top-bar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>WhatsApp Status:</span>
          <StatusBadge status={status} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontWeight: 600
          }}>
            {user && user.name ? user.name.charAt(0).toUpperCase() : <UserIcon size={16} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user ? user.name : 'User'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {user ? user.email : ''}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
