import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../../config/axios';
import DriveImage from '../ui/DriveImage';
import ModalPortal from '../ui/ModalPortal';
import ipcsGlobalLogo from '../../assets/ipcs-global-logo.png';
import { formatPortalDate, isEventPast } from '../../utils/portalDate';

const COVER_BANNER_URL = 'https://lh3.googleusercontent.com/d/1eiP135HOsuG3MEaEplNblmcLewjnKXp6';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const readLocalValue = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.warn(`Could not read ${key} from local storage:`, error);
    return fallback;
  }
};

const photoCacheVersion = (photoUrl) => {
  try {
    return Number(new URL(String(photoUrl || ''), window.location.origin).searchParams.get('v')) || 0;
  } catch {
    return 0;
  }
};

const eventKey = (event) => String(event.id || event['Drive ID'] || event.driveId || `${event.title || event.Title || 'event'}-${event.date || event['Date of the Event'] || ''}`);
const eventTitle = (event) => event.title || event.Title || 'Upcoming IPCS event';
const eventDateLabel = (event) => {
  return formatPortalDate(event.date || event['Date of the Event']) || 'Date to be announced';
};

const NAV_GROUPS = [
  { label: 'Start', items: [
    { label: 'Dashboard', path: '/dashboard', icon: 'ph-house' },
  ] },
  { label: 'Learning', items: [
    { label: 'Study Material', path: '/dashboard/materials', icon: 'ph-books' },
    { label: 'Assessment Center', path: '/dashboard/aptitude', icon: 'ph-brain' },
    { label: 'GamePal Hub', path: '/dashboard/gamepal', icon: 'ph-game-controller' },
  ] },
  { label: 'Campus life', items: [
    { label: 'Events', path: '/dashboard/events', icon: 'ph-calendar-blank' },
    { label: 'Talentino Attendance', path: '/dashboard/talentino', icon: 'ph-user-check' },
  ] },
  { label: 'Career', items: [
    { label: 'Job Openings', path: '/dashboard/vacancies', icon: 'ph-briefcase' },
    { label: 'Job Tracker', path: '/dashboard/status', icon: 'ph-list-checks' },
    { label: 'Guide & Resume', path: '/dashboard/guide', icon: 'ph-book-open' },
    { label: 'Industry & Careers', path: '/dashboard/industry-feed', icon: 'ph-newspaper-clipping' },
  ] },
  { label: 'Account & support', items: [
    { label: 'Profile', path: '/dashboard/profile', icon: 'ph-user' },
    { label: 'Contact TPO', path: '/dashboard/help#contact-tpo', icon: 'ph-address-book' },
    { label: 'Request Help', path: '/dashboard/help#request-help', icon: 'ph-headset' },
    { label: 'Settings', path: '/dashboard/settings', icon: 'ph-gear' },
  ] },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => readLocalValue('talentino_student_user', {}));
  const [theme, setTheme] = useState(() => readLocalValue('talentino_student_theme', 'dark'));
  const [accent, setAccent] = useState(() => readLocalValue('talentino_student_accent', 'cyan'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(() => (
    typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    )
  ));
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  ));
  const [drivePopup, setDrivePopup] = useState(null);
  const [driveActionStatus, setDriveActionStatus] = useState(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const readNotificationsKey = `talentino_read_notifications_${user?.email || 'student'}`;
  const [readNotifications, setReadNotifications] = useState(() => {
    const saved = readLocalValue(readNotificationsKey, null);
    const legacy = readLocalValue('talentino_read_notifs', []);
    return Array.isArray(saved) ? saved : Array.isArray(legacy) ? legacy : [];
  });

  useEffect(() => {
    if (!user?.email) navigate('/', { replace: true });
  }, [navigate, user?.email]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-accent', accent);
    try {
      localStorage.setItem('talentino_student_theme', JSON.stringify(theme));
      localStorage.setItem('talentino_student_accent', JSON.stringify(accent));
    } catch (error) {
      console.warn('Could not save appearance preferences:', error);
    }
  }, [theme, accent]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const timeout = window.setTimeout(() => setNotificationsOpen(false), 10_000);
    return () => window.clearTimeout(timeout);
  }, [notificationsOpen]);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsAppInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      setNotificationsOpen(false);
      if (drivePopup) {
        const key = `talentino_drive_snoozes_${user?.email || 'student'}`;
        const snoozes = readLocalValue(key, {}) || {};
        try { localStorage.setItem(key, JSON.stringify({ ...snoozes, [eventKey(drivePopup)]: Date.now() })); } catch (error) { console.warn('Could not snooze drive reminder:', error); }
        setDrivePopup(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [drivePopup, user?.email]);

  useEffect(() => {
    if (!user?.email) return undefined;

    let cancelled = false;
    const refreshDashboardData = async () => {
      try {
        const response = await api.post('/api/dashboard/data', {
          email: user.email,
          branch: user.branch,
          course: user.course,
          joiningDate: user.joiningDate,
        });
        if (cancelled || !response.data.success) return;

        setDashboardData(response.data);
        if (response.data.userInfo) {
          const latestLocalUser = readLocalValue('talentino_student_user', user);
          const mergedUser = { ...latestLocalUser, ...response.data.userInfo };
          if (photoCacheVersion(latestLocalUser.photo) > photoCacheVersion(response.data.userInfo.photo)) {
            mergedUser.photo = latestLocalUser.photo;
          }
          if (JSON.stringify(mergedUser) !== JSON.stringify(latestLocalUser)) {
            setUser(mergedUser);
            try {
              localStorage.setItem('talentino_student_user', JSON.stringify(mergedUser));
            } catch (error) {
              console.warn('Could not save refreshed profile:', error);
            }
          }
        }
      } catch (error) {
        console.error('Could not refresh student dashboard:', error);
      }
    };

    refreshDashboardData();
    const interval = window.setInterval(refreshDashboardData, REFRESH_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshDashboardData();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, user?.email, user?.branch, user?.course, user?.joiningDate]);

  const notifications = useMemo(() => {
    const applicationUpdates = (dashboardData?.appliedJobs || []).map((job) => {
      const company = job.company || job.Company || 'a company';
      const status = job.status || job.Status || 'updated';
      const id = job.jobId || job.id || job.jobTitle || company;
      return {
        id: `job-${id}-${status}`,
        title: `Status Update: ${company}`,
        description: `Your application status: ${status}.`,
        type: 'Application',
        path: '/dashboard/status',
      };
    });
    const eventUpdates = (dashboardData?.events || []).map((event, index) => ({ event, index }))
      .filter(({ event }) => {
        const date = event.date || event['Date of the Event'];
        return date && !isEventPast(date, event.time || event['Time of the Event'], clockNow);
      })
      .map(({ event, index }) => ({
        id: `ev-${index}-${eventTitle(event)}`,
        title: `Event: ${eventTitle(event)}`,
        description: `Scheduled for ${eventDateLabel(event)}.`,
        date: eventDateLabel(event),
        type: event.type || event.Event || 'Event',
        path: '/dashboard/events',
      }));

    return [...applicationUpdates, ...eventUpdates]
      .sort((a, b) => Number(readNotifications.includes(a.id)) - Number(readNotifications.includes(b.id)));
  }, [dashboardData?.appliedJobs, dashboardData?.events, readNotifications, clockNow]);
  const unreadCount = notifications.filter((item) => !readNotifications.includes(item.id)).length;

  useEffect(() => {
    try {
      localStorage.setItem(readNotificationsKey, JSON.stringify(readNotifications));
    } catch (error) {
      console.warn('Could not save notification preferences:', error);
    }
  }, [readNotifications, readNotificationsKey]);

  useEffect(() => {
    if (notificationPermission !== 'granted' || !drivePopup || !user?.email) return;
    const sentKey = `talentino_sent_browser_notifications_${user.email}`;
    const storedSentIds = readLocalValue(sentKey, []);
    const sentIds = Array.isArray(storedSentIds) ? storedSentIds : [];
    const driveId = eventKey(drivePopup);
    if (sentIds.includes(driveId)) return;

    try {
      new Notification(`New Placement Drive: ${eventTitle(drivePopup)}`, {
        body: `${drivePopup.branch || drivePopup.Branch || 'IPCS'} · ${eventDateLabel(drivePopup)}`,
        icon: '/icons/app-icon-192.png',
      });
      localStorage.setItem(sentKey, JSON.stringify([...sentIds, driveId]));
    } catch (error) {
      console.warn('Could not show browser notification:', error);
    }
  }, [drivePopup, notificationPermission, user?.email]);

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    let requestPending = false;
    const pollForDrives = async () => {
      if (cancelled || requestPending || document.visibilityState !== 'visible' || drivePopup) return;
      requestPending = true;
      try {
        const response = await api.get('/api/dashboard/drive-alerts');
        if (cancelled || !response.data.success) return;
        const responses = response.data.driveRSVPs || [];
        const snoozeKey = `talentino_drive_snoozes_${user.email}`;
        const savedSnoozes = readLocalValue(snoozeKey, null);
        const snoozes = savedSnoozes && typeof savedSnoozes === 'object' ? savedSnoozes : {};
        const localResponses = readLocalValue('talentino_drive_responses', {}) || {};
        setDashboardData((previous) => previous ? { ...previous, driveRSVPs: responses } : previous);
        const nextDrive = (response.data.drives || []).find((event) => {
          const id = eventKey(event);
          const alreadyResponded = responses.some((item) => String(item.driveId) === id) || Boolean(localResponses[id]);
          const snoozedRecently = Date.now() - Number(snoozes[id] || 0) < 60 * 60 * 1000;
          return !alreadyResponded && !snoozedRecently;
        });
        if (nextDrive) {
          window.setTimeout(() => {
            if (!cancelled && !isEventPast(nextDrive.date || nextDrive['Date of the Event'], nextDrive.time || nextDrive['Time of the Event'])) {
              setDrivePopup((previous) => previous || nextDrive);
              setDriveActionStatus(null);
            }
          }, 500);
        }
      } catch (error) {
        console.warn('Could not check for placement drives:', error);
      } finally {
        requestPending = false;
      }
    };
    pollForDrives();
    const interval = window.setInterval(pollForDrives, 5000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') pollForDrives(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [drivePopup, user?.email]);

  useEffect(() => {
    if (!drivePopup) return undefined;
    const dismissExpiredDrive = () => {
      if (isEventPast(drivePopup.date || drivePopup['Date of the Event'], drivePopup.time || drivePopup['Time of the Event'])) {
        setDrivePopup(null);
        setDriveActionStatus(null);
      }
    };
    dismissExpiredDrive();
    const timer = window.setInterval(dismissExpiredDrive, 1000);
    return () => window.clearInterval(timer);
  }, [drivePopup]);

  const toggleTheme = () => setTheme((previous) => previous === 'dark' ? 'light' : 'dark');
  const handleLogout = () => {
    localStorage.removeItem('talentino_student_token');
    localStorage.removeItem('talentino_student_user');
    navigate('/', { replace: true });
  };
  const navigateTo = (path) => {
    navigate(path);
    setDrawerOpen(false);
    setNotificationsOpen(false);
  };
  const isActive = (path) => {
    const basePath = path.split('#')[0];
    return location.pathname === basePath || (basePath !== '/dashboard' && location.pathname.startsWith(`${basePath}/`)) ? 'active' : '';
  };
  const markNotificationsRead = () => {
    setReadNotifications((previous) => [...new Set([...previous, ...notifications.map((item) => item.id)])]);
  };
  const enableBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    try {
      setNotificationPermission(await Notification.requestPermission());
    } catch (error) {
      console.warn('Could not request browser notification permission:', error);
      setNotificationPermission('unsupported');
    }
  };
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setIsAppInstalled(true);
    setInstallPrompt(null);
  };

  const snoozeDrive = () => {
    if (!drivePopup) return;
    const key = `talentino_drive_snoozes_${user.email}`;
    const legacySnoozes = readLocalValue('talentino_drive_snoozes', {}) || {};
    const savedSnoozes = readLocalValue(key, legacySnoozes);
    const snoozes = savedSnoozes && typeof savedSnoozes === 'object' ? savedSnoozes : {};
    try {
      localStorage.setItem(key, JSON.stringify({ ...snoozes, [eventKey(drivePopup)]: Date.now() }));
    } catch (error) {
      console.warn('Could not snooze drive reminder:', error);
    }
    setDrivePopup(null);
    setDriveActionStatus(null);
  };

  const respondToDrive = async (status) => {
    if (!drivePopup) return;
    if (status === 'Registered' && (!user.resume || user.resume === 'N/A')) {
      setDriveActionStatus({ type: 'error', message: 'Upload your resume in Profile before registering.' });
      return;
    }

    const id = eventKey(drivePopup);
    setDriveActionStatus({ type: 'info', message: 'Saving your response…' });
    try {
      const response = await api.post('/api/dashboard/drive-response', {
        driveId: id,
        title: eventTitle(drivePopup),
        status,
      });
      if (!response.data.success) throw new Error(response.data.message || 'Could not save your response.');
      const localResponses = readLocalValue('talentino_drive_responses', {}) || {};
      try {
        localStorage.setItem('talentino_drive_responses', JSON.stringify({ ...localResponses, [id]: status }));
      } catch (error) {
        console.warn('Could not save local drive response:', error);
      }
      setDashboardData((previous) => previous ? {
        ...previous,
        driveRSVPs: [...(previous.driveRSVPs || []), { driveId: id, status }],
      } : previous);
      setDrivePopup(null);
      setDriveActionStatus(null);
    } catch (error) {
      setDriveActionStatus({
        type: 'error',
        message: error.response?.data?.message || error.message || 'Could not save your response.',
      });
    }
  };

  const hasPhoto = user?.photo && user.photo !== 'N/A';
  const firstName = (user?.name || 'Student').trim().split(/\s+/)[0];
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <div className="app-layout">
      <header className="top-header">
        <div className="header-left">
          <img src={ipcsGlobalLogo} alt="IPCS Global" className="header-logo-img" />
        </div>
        <div className="header-right">
          <button className="header-icon-btn" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>
            <i className={`ph ${theme === 'dark' ? 'ph-moon' : 'ph-sun'}`}></i>
          </button>
          <div className="notification-menu-wrap">
            <button
              className="header-icon-btn notification-trigger"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <i className="ph ph-bell"></i>
              {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {notificationsOpen && (
              <div className="notification-panel" role="dialog" aria-label="Notifications">
                <div className="notification-panel-heading">
                  <div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : 'You are all caught up'}</span></div>
                  {notifications.length > 0 && <button type="button" className="text-action" onClick={markNotificationsRead}>Mark all read</button>}
                </div>
                {notifications.length ? (
                  <div className="notification-list">
                    {notifications.map((notification) => (
                      <button
                        type="button"
                        className={`notification-item ${readNotifications.includes(notification.id) ? 'read' : 'unread'}`}
                        key={notification.id}
                        onClick={() => {
                          setReadNotifications((previous) => [...new Set([...previous, notification.id])]);
                          navigateTo(notification.path);
                        }}
                      >
                        <span className="notification-item-icon"><i className="ph ph-calendar-star"></i></span>
                        <span><strong>{notification.title}</strong><small>{notification.description || `${notification.type}${notification.date ? ` · ${notification.date}` : ''}`}</small></span>
                      </button>
                    ))}
                  </div>
                ) : <p className="notification-empty">No upcoming events or drives.</p>}
                <div className="notification-panel-footer">
                  {notificationPermission === 'default' && <button type="button" className="text-action" onClick={enableBrowserNotifications}>Enable browser alerts</button>}
                  {notificationPermission === 'granted' && <span>Browser alerts are enabled</span>}
                  {notificationPermission === 'denied' && <span>Browser alerts are blocked in browser settings</span>}
                  {notificationPermission === 'unsupported' && <span>Browser alerts are unavailable on this device</span>}
                  <button type="button" className="text-action" onClick={() => navigateTo('/dashboard/events')}>View events</button>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="user-profile-badge" aria-label="Open profile and navigation" onClick={() => setDrawerOpen(true)}>
            <span className="avatar-circle">
              {hasPhoto ? <DriveImage src={user.photo} alt={`${firstName}'s profile`}>{initial}</DriveImage> : <span>{initial}</span>}
            </span>
          </button>
        </div>
      </header>

      <main className="main-body">
        <div className="dashboard-content">
          {location.pathname !== '/dashboard' && (
            <Link className="portal-back-dashboard" to="/dashboard">
              <i className="ph ph-arrow-left" aria-hidden="true"></i>
              <span>Back to dashboard</span>
            </Link>
          )}
          <Outlet context={{ user, setUser, theme, toggleTheme, accent, setAccent, dashboardData, canInstallApp: Boolean(installPrompt), installApp, isAppInstalled, isIOS }} />
        </div>
      </main>

      {drivePopup && (
        <ModalPortal>
        <div className="report-modal-overlay drive-reminder-overlay" role="presentation">
          <section className="report-card drive-reminder-card" role="dialog" aria-modal="true" aria-labelledby="drive-reminder-title">
            <div className="drive-reminder-icon"><i className="ph-fill ph-megaphone"></i></div>
            {drivePopup.posterLink && <DriveImage className="drive-reminder-poster" src={drivePopup.posterLink} alt={`${eventTitle(drivePopup)} poster`} />}
            <p className="eyebrow">Placement drive reminder</p>
            <h2 id="drive-reminder-title">{eventTitle(drivePopup)}</h2>
            <p className="drive-reminder-meta">{eventDateLabel(drivePopup)}{(drivePopup.time || drivePopup['Time of the Event']) ? ` · ${drivePopup.time || drivePopup['Time of the Event']}` : ''}</p>
            <p className="drive-reminder-description">{drivePopup.description || drivePopup.Description || 'Review the role details and let the placement team know if you plan to attend.'}</p>
            {driveActionStatus && <div className={`alert alert-${driveActionStatus.type}`}>{driveActionStatus.message}</div>}
            <div className="drive-reminder-actions">
              <button type="button" className="btn-cancel" onClick={snoozeDrive}>Remind me later</button>
              <button type="button" className="btn-cancel" onClick={() => respondToDrive('Not Interested')}>Not interested</button>
              {!user.resume || user.resume === 'N/A' ? (
                <button type="button" className="btn-action" onClick={() => navigateTo('/dashboard/profile')}>Upload resume</button>
              ) : (
                <button type="button" className="btn-action" onClick={() => respondToDrive('Registered')}>Register</button>
              )}
            </div>
          </section>
        </div>
        </ModalPortal>
      )}

      <div className={`drawer-overlay ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen} inert={!drawerOpen} onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
        <aside className="drawer-card" id="main-navigation" aria-label="Main navigation">
          <div className="drawer-header-cover" style={{ backgroundImage: `url(${COVER_BANNER_URL})` }}>
            <button type="button" className="drawer-close-btn" aria-label="Close navigation menu" onClick={() => setDrawerOpen(false)}><i className="ph ph-x"></i></button>
            <div className="drawer-profile-row">
              <div className="drawer-avatar">
                {hasPhoto ? <DriveImage src={user.photo} alt={`${firstName}'s profile`}>{initial}</DriveImage> : <span>{initial}</span>}
              </div>
              <div>
                <strong className="drawer-profile-name">{firstName}</strong>
                <span className="drawer-roll-number">{user?.rollNo || 'IPCS-XXXX'}</span>
              </div>
            </div>
          </div>
          <nav className="drawer-menu">
            {NAV_GROUPS.map((group) => (
              <div className="drawer-menu-group" key={group.label}>
                <div className="drawer-section-label">{group.label}</div>
                {group.items.map((item) => {
                  const [path, hash] = item.path.split('#');
                  return (
                    <button
                      type="button"
                      key={item.label}
                      className={`drawer-item ${isActive(item.path)}`}
                      onClick={() => navigateTo(hash ? `${path}#${hash}` : path)}
                    >
                      <span className="drawer-item-label"><i className={`ph ${item.icon}`}></i>{item.label}</span><span aria-hidden="true">&rsaquo;</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="drawer-footer">
            <button type="button" className="btn-logout-drawer" onClick={handleLogout}>Log Out</button>
              <div className="drawer-copyright">Copyright © 2026 IPCS Global Talenzo</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
