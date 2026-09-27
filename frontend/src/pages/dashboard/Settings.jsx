import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';

export default function Settings() {
  const { theme, toggleTheme, accent, setAccent, canInstallApp, installApp, isAppInstalled, isIOS } = useOutletContext();
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const updatePassword = async (event) => {
    event.preventDefault();
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Complete all three password fields.' });
      return;
    }
    if (passwords.newPassword.length < 8) {
      setPasswordStatus({ type: 'error', message: 'Your new password must be at least 8 characters.' });
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'The new password and confirmation do not match.' });
      return;
    }

    setSavingPassword(true);
    setPasswordStatus({ type: 'info', message: 'Updating your password…' });
    try {
      const response = await api.post('/api/dashboard/profile/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswordStatus({ type: 'success', message: response.data.message || 'Password updated successfully.' });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordStatus({
        type: 'error',
        message: error.response?.data?.message || 'We could not update your password. Try again.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="portal-page animate-fade-in">
      <header className="portal-page-heading">
        <p className="eyebrow">Your preferences</p>
        <h1>Settings</h1>
        <p>Manage your account security, appearance, and access to the portal on your devices.</p>
      </header>

      <div className="settings-page-grid">
        <section className="portal-panel settings-panel">
          <div className="panel-heading">
            <span className="panel-heading-icon"><i className="ph ph-lock-key"></i></span>
            <div><h2>Change password</h2><p>Use a password you do not reuse on other sites.</p></div>
          </div>
          <form onSubmit={updatePassword}>
            <div className="form-group">
              <label htmlFor="current-password">Current password</label>
              <input id="current-password" autoComplete="current-password" type={showPasswords ? 'text' : 'password'} value={passwords.currentPassword} onChange={(event) => setPasswords((previous) => ({ ...previous, currentPassword: event.target.value }))} />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" autoComplete="new-password" minLength={8} type={showPasswords ? 'text' : 'password'} value={passwords.newPassword} onChange={(event) => setPasswords((previous) => ({ ...previous, newPassword: event.target.value }))} />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" autoComplete="new-password" minLength={8} type={showPasswords ? 'text' : 'password'} value={passwords.confirmPassword} onChange={(event) => setPasswords((previous) => ({ ...previous, confirmPassword: event.target.value }))} />
            </div>
            <label className="check-row password-visibility">
              <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
              <span>Show password fields</span>
            </label>
            <p className="portal-note">Use at least 8 characters. A mix of letters, numbers, and symbols is recommended.</p>
            <button type="submit" className="btn-action" disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update password'}</button>
            {passwordStatus && <div role="status" className={`alert alert-${passwordStatus.type}`}>{passwordStatus.message}</div>}
          </form>
        </section>

        <section className="portal-panel settings-panel">
          <div className="panel-heading">
            <span className="panel-heading-icon"><i className="ph ph-palette"></i></span>
            <div><h2>Appearance</h2><p>Choose the theme that is most comfortable for you.</p></div>
          </div>
          <div className="theme-choice-grid">
            {['light', 'dark'].map((option) => (
              <button
                type="button"
                key={option}
                className={`theme-choice ${theme === option ? 'selected' : ''}`}
                aria-pressed={theme === option}
                onClick={() => { if (theme !== option) toggleTheme(); }}
              >
                <span className={`theme-preview ${option}`}><span></span><span></span><span></span></span>
                <strong>{option === 'light' ? 'Light' : 'Dark'}</strong>
                {theme === option && <small>Current theme</small>}
              </button>
            ))}
          </div>
          <div className="accent-picker">
            <strong>Accent color</strong>
            <p>Choose the highlight color used across the portal.</p>
            <div className="accent-swatches" role="group" aria-label="Accent color">
              {[['cyan', 'Sky'], ['blue', 'Blue'], ['purple', 'Violet'], ['green', 'Green'], ['rose', 'Rose'], ['orange', 'Amber']].map(([value, label]) => (
                <button type="button" key={value} className={`accent-swatch ${accent === value ? 'selected' : ''}`} data-color={value} aria-label={`${label} accent`} aria-pressed={accent === value} onClick={() => setAccent(value)}><span></span>{label}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="portal-panel settings-panel install-panel">
          <div className="panel-heading">
            <span className="panel-heading-icon"><i className="ph ph-device-mobile"></i></span>
            <div><h2>Use the portal like an app</h2><p>Install the portal from your browser for a home-screen or desktop shortcut.</p></div>
          </div>
          {isAppInstalled ? (
            <div className="install-status"><i className="ph-fill ph-check-circle"></i><span>This portal is already installed on this device.</span></div>
          ) : canInstallApp ? (
            <button type="button" className="btn-action" onClick={installApp}>Install IPCS Student Portal</button>
          ) : (
            <div className="install-instructions">
              <strong>{isIOS ? 'Add to your Home Screen' : 'Install from your browser'}</strong>
              <p>{isIOS
                ? 'Open this portal in Safari, tap Share, then choose “Add to Home Screen”.'
                : 'Open your browser menu and choose “Install app” or “Install this site as an app” when available.'}</p>
              <small>The portal remains available on the web if installation is not offered by your browser.</small>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
