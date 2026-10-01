import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';

const downloadSeenKey = (type) => `talenzo_app_download_seen_${type}`;
const previousDownloadIds = { apk: '1D8vnuerOECQyZuvpjhYSeVG7A4B7ZTKV', exe: '1Xmf6gAeXxaoTmxEjpmrUnYlGHy7dMXM3' };

export default function Settings() {
  const { theme, toggleTheme, accent, setAccent, canInstallApp, installApp, isAppInstalled, isIOS } = useOutletContext();
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [appDownloads, setAppDownloads] = useState({ loading: true, error: '', files: { apk: null, exe: null }, newVersions: { apk: false, exe: false } });

  useEffect(() => {
    let cancelled = false;
    const loadDownloads = () => api.get('/api/dashboard/app-downloads')
      .then((response) => {
        if (!cancelled && response.data?.success) {
          const files = response.data.downloads || { apk: null, exe: null };
          const newVersions = { apk: false, exe: false };
          for (const type of ['apk', 'exe']) {
            const file = files[type];
            if (!file?.versionKey) continue;
            try {
              const seen = localStorage.getItem(downloadSeenKey(type));
              newVersions[type] = seen ? seen !== file.versionKey : file.id !== previousDownloadIds[type] || Number(file.driveVersion || 1) > 1;
              if (!seen && !newVersions[type]) localStorage.setItem(downloadSeenKey(type), file.versionKey);
            } catch { /* The download remains available if browser storage is disabled. */ }
          }
          setAppDownloads({ loading: false, error: '', files, newVersions });
        } else if (!cancelled) setAppDownloads({ loading: false, error: response.data?.message || 'App downloads could not be loaded.', files: { apk: null, exe: null }, newVersions: { apk: false, exe: false } });
      })
      .catch((error) => {
        if (!cancelled) setAppDownloads({ loading: false, error: error.response?.data?.message || 'App downloads could not be loaded from Google Drive.', files: { apk: null, exe: null }, newVersions: { apk: false, exe: false } });
      });
    loadDownloads();
    const refreshTimer = window.setInterval(loadDownloads, 60_000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, []);

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
            <div>
              <h2>Use the portal like an app</h2>
              <p>Download standalone native apps for your devices, or install the portal directly from your browser.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }} aria-live="polite">
            {[
              { type: 'apk', label: 'Download for Android (.apk)', icon: 'ph-android-logo', color: '#34d399' },
              { type: 'exe', label: 'Download for Windows (.exe)', icon: 'ph-windows-logo', color: '#38bdf8' },
            ].map(({ type, label, icon, color }) => {
              const file = appDownloads.files[type];
              return file ? (
                <a key={type} href={file.url} target="_blank" rel="noopener noreferrer" className="btn-action" onClick={() => {
                  try { if (file.versionKey) localStorage.setItem(downloadSeenKey(type), file.versionKey); } catch { /* The download still opens if browser storage is disabled. */ }
                  setAppDownloads((current) => ({ ...current, newVersions: { ...current.newVersions, [type]: false } }));
                }} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151' }}>
                  <i className={`ph ${icon}`} style={{ color, fontSize: '1.2rem' }}></i>
                  <span>{label}<small style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-muted)', fontSize: '.7rem', marginTop: '3px' }}>{file.versionLabel || 'Latest version'}{appDownloads.newVersions[type] && <strong style={{ color: '#34d399', fontSize: '.66rem' }}>New version available</strong>}</small></span>
                </a>
              ) : (
                <button key={type} type="button" className="btn-action" disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', opacity: .72 }}>
                  <i className={`ph ${icon}`} style={{ color, fontSize: '1.2rem' }}></i>
                  {appDownloads.loading ? `Checking ${type.toUpperCase()}…` : `${type.toUpperCase()} not found`}
                </button>
              );
            })}
          </div>
          {appDownloads.error && <p className="portal-note" role="status">{appDownloads.error} Check that the folder is shared with the portal’s Google service account.</p>}

          <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0 0 20px 0' }} />

          {/* Browser PWA Installation */}
          <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-muted)' }}>Browser Installation</h3>
          {isAppInstalled ? (
            <div className="install-status"><i className="ph-fill ph-check-circle"></i><span>This portal is already installed via browser on this device.</span></div>
          ) : canInstallApp ? (
            <button type="button" className="btn-action" onClick={installApp}>Install via Browser</button>
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
