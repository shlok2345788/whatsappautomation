import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { WhatsAppProvider } from './context/WhatsAppContext';

import MainLayout from './layouts/MainLayout';
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import WhatsAppConnect from './pages/WhatsAppConnect';
import ExcelContacts from './pages/ExcelContacts';
import PdfFiles from './pages/PdfFiles';
import Matching from './pages/Matching';
import SendQueue from './pages/SendQueue';
import History from './pages/History';
import Settings from './pages/Settings';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: '16px',
        background: 'var(--bg-primary, #0f1117)', color: 'var(--text-secondary, #9ca3af)'
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid #374151', borderTopColor: '#6366f1',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: '14px' }}>Loading...</span>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const PublicAuthRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Landing page — public */}
      <Route path="/" element={<Landing />} />

      {/* Auth routes — redirect to dashboard if already logged in */}
      <Route
        path="/signin"
        element={
          <PublicAuthRoute>
            <SignIn />
          </PublicAuthRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicAuthRoute>
            <SignUp />
          </PublicAuthRoute>
        }
      />

      {/* Protected app routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SocketProvider>
              <WhatsAppProvider>
                <MainLayout />
              </WhatsAppProvider>
            </SocketProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="whatsapp" element={<WhatsAppConnect />} />
        <Route path="contacts" element={<ExcelContacts />} />
        <Route path="pdfs" element={<PdfFiles />} />
        <Route path="matching" element={<Matching />} />
        <Route path="queue" element={<SendQueue />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/whatsapp" element={<Navigate to="/dashboard/whatsapp" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
