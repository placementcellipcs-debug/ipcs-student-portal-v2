import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../config/axios';
import ipcsGlobalLogo from '../../assets/ipcs-global-logo.png';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const submitNewPassword = async (event) => {
    event.preventDefault();
    if (!token) {
      setStatus({ type: 'error', message: 'This reset link is missing or invalid. Request a new one from the login page.' });
      return;
    }
    if (password.length < 8) {
      setStatus({ type: 'error', message: 'Your new password must contain at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setStatus({ type: 'error', message: 'The passwords do not match.' });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const response = await api.post('/api/auth/reset-password', { token, newPassword: password });
      setStatus({ type: 'success', message: response.data?.message || 'Password updated. Please sign in again.' });
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setStatus({ type: 'error', message: error.response?.data?.message || 'This reset link could not be used. Request a new one and try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="password-reset-wrapper">
      <section className="auth-card password-reset-card">
        <div className="brand-logo-container"><img src={ipcsGlobalLogo} alt="IPCS Global" className="auth-logo-img" /></div>
        <h1 style={{ margin: '0 0 8px', color: '#fff', fontSize: '1.45rem', textAlign: 'center' }}>Choose a new password</h1>
        <p>Reset your Talenzo student portal password. The link is valid for 5 minutes and can only be used once.</p>
        {token ? (
          <form onSubmit={submitNewPassword}>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <input id="confirm-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
            <button type="submit" className="btn-action" disabled={saving || status?.type === 'success'}>{saving ? 'Updating password…' : status?.type === 'success' ? 'Password updated' : 'Update password'}</button>
            {status && <div className={`login-auth-status ${status.type}`} role={status.type === 'error' ? 'alert' : 'status'} aria-live="polite"><i className={`ph ${status.type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'}`} aria-hidden="true"></i><span>{status.message}</span></div>}
            {status?.type === 'success' && <div className="switch-mode"><Link to="/">Return to sign in</Link></div>}
          </form>
        ) : (
          <div className="login-auth-status error" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"></i><span>This reset link is missing. Request a new one from the login page.</span></div>
        )}
        {!status?.type || status.type !== 'success' ? <div className="switch-mode"><Link to="/">Back to sign in</Link></div> : null}
      </section>
    </main>
  );
}
