import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Lock, Mail, User, Send, RefreshCw, MailCheck } from 'lucide-react';

const SignUp = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const { register, resendVerification } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }

    if (password.length < 6) {
      return setError('Password must be at least 6 characters long');
    }

    setLoading(true);

    try {
      await register(name, email, password, confirmPassword);
      // Do NOT navigate to dashboard — user must verify email first
      setRegisteredEmail(email);
    } catch (err) {
      setError(err.message || err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await resendVerification(registeredEmail);
      setResendSuccess(true);
    } catch (err) {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  // ── Email sent screen ────────────────────────────────────────────────────────
  if (registeredEmail) {
    return (
      <div className="auth-wrapper">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <div className="auth-header">
            <div className="auth-logo" style={{ background: 'var(--success, #22c55e)', color: '#fff' }}>
              <MailCheck size={24} />
            </div>
            <h2 style={{ fontSize: '20px', marginBottom: '6px' }}>Check your inbox</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.6' }}>
              We sent a confirmation link to<br />
              <strong style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{registeredEmail}</strong>
            </p>
          </div>

          <div style={{
            background: 'var(--bg-secondary, rgba(255,255,255,0.05))',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '16px',
            fontSize: '13px',
            color: 'var(--text-muted)',
            lineHeight: '1.7',
            textAlign: 'left',
            marginBottom: '20px',
          }}>
            <p style={{ margin: 0 }}>
              1. Open the email from DocSender<br />
              2. Click the <strong style={{ color: 'var(--text-primary)' }}>Confirm your email</strong> link<br />
              3. Return here and <Link to="/signin" style={{ fontWeight: 600 }}>sign in</Link>
            </p>
          </div>

          {resendSuccess && (
            <div className="alert alert-success" style={{ marginBottom: '14px' }}>
              ✅ Verification email resent. Check your inbox.
            </div>
          )}
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '14px' }}>{error}</div>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="btn btn-secondary btn-lg"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {resendLoading ? (
              <>
                <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                Sending...
              </>
            ) : (
              <>
                <Send size={15} />
                Resend verification email
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Already confirmed? </span>
            <Link to="/signin" style={{ fontWeight: 600 }}>Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form ────────────────────────────────────────────────────────
  return (
    <div className="auth-wrapper">
      <div className="auth-box">
        <div className="auth-header">
          <div className="auth-logo">
            <MessageSquare size={24} />
          </div>
          <h2 style={{ fontSize: '20px', marginBottom: '6px' }}>Create your account</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Start sending PDFs automatically over WhatsApp
          </p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Shlok Lokhande"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
              <User size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            </div>
          </div>

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

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '8px' }}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Already have an account? </span>
          <Link to="/signin" style={{ fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
