import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  QrCode,
  FileSpreadsheet,
  FileText,
  GitCompare,
  Send,
  History as HistoryIcon,
  Settings as SettingsIcon,
  LogOut,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWhatsApp } from '../context/WhatsAppContext';

const Sidebar = () => {
  const { logout } = useAuth();
  const { disconnect } = useWhatsApp();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await disconnect(false);
    logout();
    navigate('/signin');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'WhatsApp', path: '/dashboard/whatsapp', icon: QrCode },
    { label: 'Excel Contacts', path: '/dashboard/contacts', icon: FileSpreadsheet },
    { label: 'PDF Files', path: '/dashboard/pdfs', icon: FileText },
    { label: 'Matching', path: '/dashboard/matching', icon: GitCompare },
    { label: 'Send Queue', path: '/dashboard/queue', icon: Send },
    { label: 'History', path: '/dashboard/history', icon: HistoryIcon },
    { label: 'Settings', path: '/dashboard/settings', icon: SettingsIcon },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ background: '#16a34a', color: '#fff', padding: '6px', borderRadius: '6px', display: 'flex' }}>
          <MessageSquare size={20} />
        </div>
        <span className="sidebar-brand">DocSender Pro</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              end={item.path === '/dashboard'}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          onClick={handleLogout}
          className="nav-item"
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
