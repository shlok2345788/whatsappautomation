import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Lock, Mail, Send, RefreshCw } from 'lucide-react';

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const { login, resendVerification } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUnconfirmedEmail(null);
    setResendSuccess(false);
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      if (err.code === 'email_not_confirmed') {
        setUnconfirmedEmail(err.email || email);
        setError(err.message);
      } else {
        setError(err.message || err.response?.data?.message || 'Failed to sign in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unconfirmedEmail) return;
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await resendVerification(unconfirmedEmail);
      setResendSuccess(true);
    } catch (err) {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-box">
        <div className="auth-header">
          <div className="auth-logo">
            <MessageSquare size={24} />
          </div>
          <h2 style={{ fontSize: '20px', marginBottom: '6px' }}>Sign in to DocSender</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Automated WhatsApp PDF Sender for your business
          </p>
        </div>

        {error && (
          <div
            className="alert alert-danger"
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <span>{error}</span>

            {unconfirmedEmail && !resendSuccess && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: '1px solid currentColor',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: resendLoading ? 'not-allowed' : 'pointer',
                  color: 'inherit',
                  opacity: resendLoading ? 0.6 : 1,
                  alignSelf: 'flex-start',
                }}
              >
                {resendLoading ? (
                  <>
                    <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    Resend verification email
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {resendSuccess && (
          <div className="alert alert-success">
            ✅ Verification email sent to <strong>{unconfirmedEmail}</strong>. Please check your inbox (and spam folder).
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="form-input"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
              <Mail size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '8px' }}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Don't have an account? </span>
          <Link to="/signup" style={{ fontWeight: 600 }}>Create account</Link>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
