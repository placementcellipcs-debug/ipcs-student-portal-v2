import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import Counter from '../../components/ui/Counter';
import DriveImage from '../../components/ui/DriveImage';

const QUICK_LINKS = [
  { label: 'Mark attendance', detail: 'Check in to your Talentino session', path: '/dashboard/talentino', icon: 'ph-user-check', color: '#10b981' },
  { label: 'Assessments', detail: 'Continue your aptitude and course tests', path: '/dashboard/aptitude', icon: 'ph-brain', color: '#ec4899' },
  { label: 'Application status', detail: 'Follow your placement applications', path: '/dashboard/status', icon: 'ph-list-checks', color: '#818cf8' },
  { label: 'Study material', detail: 'Open notes and course resources', path: '/dashboard/materials', icon: 'ph-books', color: '#38bdf8' },
  { label: 'Contact', detail: 'Reach your placement officer', path: '/dashboard/help#contact-tpo', icon: 'ph-address-book', color: '#f59e0b' },
];

const parseDate = (value) => {
  if (!value || String(value).toUpperCase() === 'TBA') return null;
  const text = String(value).replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const parts = text.split(/[-/]/);
  if (parts.length === 3) {
    const date = parts[0].length === 4
      ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      : new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    const year = Number(parts[0].length === 4 ? parts[0] : parts[2]);
    const month = Number(parts[0].length === 4 ? parts[1] : parts[0]);
    const day = Number(parts[0].length === 4 ? parts[2] : parts[1]);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const showDate = (event) => {
  const date = parseDate(event.date || event['Date of the Event']);
  return date ? date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date to be announced';
};

const indiaDateKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);

export default function DashboardHome() {
  const { user, dashboardData } = useOutletContext();
  const [gamepalStats, setGamepalStats] = useState(null);
  const stats = dashboardData?.stats || {};
  const firstName = (user?.name || 'Student').trim().split(/\s+/)[0];
  const hasPhoto = user?.photo && user.photo !== 'N/A';
  const attended = Number(stats.attended) || 0;
  const currentDate = new Date();
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const todayKey = indiaDateKey(currentDate);
  const upcomingEvents = (dashboardData?.events || [])
    .map((event) => ({ ...event, parsedDate: parseDate(event.date || event['Date of the Event']) }))
    .filter((event) => !event.parsedDate || event.parsedDate >= today)
    .sort((a, b) => {
      if (!a.parsedDate) return 1;
      if (!b.parsedDate) return -1;
      return a.parsedDate - b.parsedDate;
    })
    .slice(0, 4);
  const vacancyAccess = dashboardData
    ? Boolean(dashboardData.vacancyAccess)
    : /^(yes|true|1)$/i.test(String(user?.vacancyOpen || ''));

  let workoutPlanned = 3;
  let workoutCompleted = 0;
  if (typeof window !== 'undefined') {
    try {
      const goals = JSON.parse(localStorage.getItem(`talenzo_gamepal_goals_${user?.email || 'student'}`) || 'null');
      if (Array.isArray(goals) && goals.length) workoutPlanned = Math.min(3, goals.length);
      const completions = JSON.parse(localStorage.getItem(`talenzo_gamepal_daily_${user?.email || 'student'}_${todayKey}`) || '[]');
      if (Array.isArray(completions)) workoutCompleted = Math.min(workoutPlanned, completions.length);
    } catch {
      // Use the default three-session workout if saved progress is unavailable.
    }
  }

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    api.post('/api/gamepal/dashboard', {})
      .then((response) => {
        if (!cancelled && response.data.success) setGamepalStats(response.data.stats);
      })
      .catch(() => {
        if (!cancelled) setGamepalStats(null);
      });
    return () => { cancelled = true; };
  }, [user?.email]);

  const statCards = [
    { label: 'Sessions attended', value: attended, icon: 'ph-check-circle', color: '#10b981' },
    { label: 'Jobs applied', value: stats.applied || 0, icon: 'ph-briefcase', color: '#38bdf8' },
    { label: 'Interviews', value: stats.interviews || 0, icon: 'ph-calendar-check', color: '#f59e0b' },
    { label: 'Offers received', value: stats.offers || 0, icon: 'ph-certificate', color: '#a855f7' },
  ];

  return (
    <div className="dashboard-home animate-fade-in">
      <div className="dashboard-overview-grid">
        <div className="dashboard-overview-primary">
          <section className="dashboard-welcome-card">
            <div className="dashboard-welcome-copy">
              <p className="eyebrow">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(currentDate)}</p>
              <h1>Welcome back, <span>{firstName}</span></h1>
              <p>Your classes, placement journey, and student resources are all in one place.</p>
              <div className="welcome-actions">
                <Link className="btn-action" to="/dashboard/events">Explore events <i className="ph ph-arrow-right"></i></Link>
                <Link className="welcome-secondary-action" to="/dashboard/profile">View profile</Link>
              </div>
            </div>
            <div className="welcome-student-avatar">
              {hasPhoto ? <DriveImage src={user.photo} alt={`${firstName}'s profile`}>{firstName.charAt(0).toUpperCase()}</DriveImage> : <span>{firstName.charAt(0).toUpperCase()}</span>}
            </div>
          </section>

          <Link className="dashboard-vacancy-card" to="/dashboard/vacancies">
            <span className="dashboard-vacancy-icon"><i className="ph-fill ph-briefcase"></i></span>
            <span className="dashboard-vacancy-copy">
              <strong>Latest placement vacancies</strong>
              <small>{vacancyAccess
                ? dashboardData ? `${dashboardData.vacancies?.length || 0} active openings matched to your course` : 'Explore active openings matched to your course'
                : 'View your opening access or contact the placement team'}</small>
            </span>
            <span className="dashboard-vacancy-action">View openings <i className="ph ph-arrow-right"></i></span>
          </Link>
        </div>

        <div className="dashboard-overview-secondary">
          <section className="portal-panel upcoming-events-panel">
            <div className="panel-heading panel-heading-with-link">
              <div className="panel-heading-main"><span className="panel-heading-icon"><i className="ph ph-calendar-star"></i></span><div><h2>Upcoming events</h2><p>Drives, classes, and IPCS events</p></div></div>
              <Link className="panel-link compact-panel-link" to="/dashboard/events">All events <i className="ph ph-arrow-right"></i></Link>
            </div>
            {!dashboardData ? (
              <div className="dashboard-loading"><i className="ph ph-spinner animate-spin"></i> Loading events…</div>
            ) : upcomingEvents.length ? (
              <div className="upcoming-event-list">
                {upcomingEvents.map((event, index) => (
                  <Link className="upcoming-event-row" to="/dashboard/events" key={event.id || event['Drive ID'] || `${event.title || event.Title}-${index}`}>
                    <span className="upcoming-event-date">{showDate(event)}</span>
                    <span className="upcoming-event-copy"><strong>{event.title || event.Title || 'IPCS event'}</strong><small>{event.type || event.Event || 'General event'}{(event.time || event['Time of the Event']) ? ` · ${event.time || event['Time of the Event']}` : ''}</small></span>
                    <i className="ph ph-caret-right" aria-hidden="true"></i>
                  </Link>
                ))}
              </div>
            ) : <div className="empty-panel-message"><i className="ph ph-calendar-blank"></i><strong>No upcoming events</strong><span>New branch events and placement drives will show here.</span></div>}
          </section>

          <section className="portal-panel quick-actions-panel">
            <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-squares-four"></i></span><div><h2>Quick actions</h2><p>Jump into the tools you use most</p></div></div>
            <div className="dashboard-quick-links">
              {QUICK_LINKS.map((item) => (
                <Link className="dashboard-quick-link" to={item.path} key={item.label}>
                  <span className="quick-link-icon" style={{ color: item.color, background: `${item.color}1a` }}><i className={`ph-fill ${item.icon}`}></i></span>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <i className="ph ph-arrow-up-right" aria-hidden="true"></i>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="dashboard-stat-grid" aria-label="Student summary">
        {statCards.map((item) => (
          <article className="dashboard-stat-card" key={item.label}>
            <span className="dashboard-stat-icon" style={{ color: item.color, background: `${item.color}1a` }}><i className={`ph-fill ${item.icon}`}></i></span>
            <div><strong><Counter target={Number(item.value) || 0} /></strong><span>{item.label}</span></div>
          </article>
        ))}
      </section>

      <section className="portal-panel placement-progress-panel">
        <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-trend-up"></i></span><div><h2>Placement progress</h2><p>Your application activity at a glance</p></div></div>
        <div className="placement-progress-list">
          <div><span>Applications</span><strong>{stats.applied || 0}</strong></div>
          <div className="placement-progress-track"><span style={{ width: `${stats.applied ? 100 : 0}%` }}></span></div>
          <div><span>Interviews</span><strong>{stats.interviews || 0}</strong></div>
          <div className="placement-progress-track interview-track"><span style={{ width: `${stats.applied ? Math.min(100, Math.round(((stats.interviews || 0) / stats.applied) * 100)) : 0}%` }}></span></div>
          <div><span>Offers</span><strong>{stats.offers || 0}</strong></div>
          <div className="placement-progress-track offer-track"><span style={{ width: `${stats.applied ? Math.min(100, Math.round(((stats.offers || 0) / stats.applied) * 100)) : 0}%` }}></span></div>
        </div>
        <Link className="panel-link" to="/dashboard/status">View application history <i className="ph ph-arrow-right"></i></Link>
      </section>

      <section className="gamepal-hero dashboard-workout-reminder">
        <div className="gamepal-hero-copy">
          <p className="eyebrow">Your personal routine · {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(currentDate)}</p>
          <h2>{workoutCompleted >= workoutPlanned ? `You showed up today, ${firstName}.` : `A fresh start, ${firstName}.`}</h2>
          <p>{workoutCompleted >= workoutPlanned ? 'Your focus sessions are complete for today. Keep your streak moving tomorrow.' : 'Take a few minutes for a focused brain workout. Your routine adapts as you play.'}</p>
          <Link className="gamepal-primary-action" to="/dashboard/gamepal"><i className="ph-fill ph-play"></i> {workoutCompleted ? 'Continue today’s workout' : 'Start today’s workout'}</Link>
        </div>
        <div className="gamepal-hero-score">
          <span className="gamepal-score-ring"><strong>{gamepalStats ? Number(gamepalStats.overallScore) || 0 : '—'}</strong><small>Brain score</small></span>
          <span className="gamepal-workout-count">{workoutCompleted}<i>/</i>{workoutPlanned} sessions today</span>
        </div>
      </section>
    </div>
  );
}
