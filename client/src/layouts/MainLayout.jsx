import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/dashboard/whatsapp': 'WhatsApp Connection',
  '/dashboard/contacts': 'Excel Contacts',
  '/dashboard/pdfs': 'PDF Files',
  '/dashboard/matching': 'Document Matching',
  '/dashboard/queue': 'Send Queue',
  '/dashboard/history': 'Message History',
  '/dashboard/settings': 'Settings'
};

const MainLayout = () => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Dashboard';

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <TopBar title={title} />
        <main className="content-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
