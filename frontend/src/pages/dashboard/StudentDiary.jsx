import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import { formatPortalDate, formatPortalDateTime } from '../../utils/portalDate';

const formatDate = (value) => {
  if (!value) return 'Date not available';
  return formatPortalDate(value) || String(value).trim();
};

export default function StudentDiary() {
  const { user } = useOutletContext();
  const [diary, setDiary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gps, setGps] = useState(null);
  const [gpsMessage, setGpsMessage] = useState('Capture your location at the branch to mark attendance.');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadDiary = useCallback(async () => {
    try {
      const response = await api.get('/api/dashboard/student-diary');
      if (!response.data.success) throw new Error(response.data.message || 'Unable to load your diary.');
      setDiary(response.data);
    } catch (error) {
      setStatus({ type: 'error', message: error.response?.data?.message || error.message || 'Unable to load your diary.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) loadDiary();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadDiary, user?.email]);

  const captureLocation = () => {
    setStatus(null);
    if (!navigator.geolocation) {
      setGpsMessage('Location is not supported by this device or browser.');
      return;
    }
    setGpsMessage('Checking your current location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setGps(coordinates);
        setGpsMessage(`Location captured (${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}).`);
      },
      (error) => setGpsMessage(error.code === 1 ? 'Location permission was denied. Allow location access and retry.' : 'Could not get your location. Move to an open area and retry.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const markAttendance = async (event) => {
    event.preventDefault();
    if (!gps || saving) return;
    setSaving(true);
    setStatus({ type: 'info', message: 'Verifying branch location and saving attendance…' });
    try {
      const response = await api.post('/api/dashboard/student-diary/attendance', gps);
      setStatus({ type: 'success', message: response.data.message || 'Attendance marked successfully.' });
      setGps(null);
      await loadDiary();
    } catch (error) {
      setStatus({ type: 'error', message: error.response?.data?.message || 'Could not mark attendance. Please retry.' });
    } finally {
      setSaving(false);
    }
  };

  const student = diary?.student || user || {};
  const attendance = diary?.attendanceRecords || [];
  const syllabus = diary?.syllabus || { progress: 0, entries: [] };

  if (loading) return <div className="diary-loading"><i className="ph ph-spinner animate-spin" aria-hidden="true"></i><span>Loading your student diary…</span></div>;

  return (
    <div className="student-diary-page animate-fade-in">
      <header className="student-diary-heading">
        <div>
          <p className="eyebrow">YOUR LEARNING JOURNEY</p>
          <h1>Student diary</h1>
          <p>Keep track of class attendance and course progress in one place.</p>
        </div>
        <span className="diary-heading-icon"><i className="ph ph-notebook" aria-hidden="true"></i></span>
      </header>

      {status && <div className={`diary-notice ${status.type}`} role="status">{status.message}</div>}

      <section className="diary-student-card portal-panel" aria-label="Student details">
        <div className="diary-student-avatar"><i className="ph-fill ph-student" aria-hidden="true"></i></div>
        <div className="diary-student-identity"><span>STUDENT DETAILS</span><h2>{student.name || 'Student'}</h2><p>{student.rollNo || 'Roll number not available'}</p></div>
        <dl className="diary-student-facts">
          <div><dt>Course</dt><dd>{student.course || 'Not set'}</dd></div>
          <div><dt>Branch</dt><dd>{student.branch || 'Not set'}</dd></div>
          <div><dt>Joining date</dt><dd>{formatDate(student.joiningDate)}</dd></div>
        </dl>
      </section>

      <div className="student-diary-grid">
        <section className="portal-panel diary-progress-panel">
          <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-chart-line-up" aria-hidden="true"></i></span><div><h2>Course progress</h2><p>Progress updated by your academic team</p></div></div>
          <div className="diary-progress-meter" role="img" aria-label={`${syllabus.progress}% of syllabus completed`}><span style={{ width: `${syllabus.progress}%` }} /></div>
          <div className="diary-progress-label"><strong>{syllabus.progress}%</strong><span>syllabus completed</span></div>
          {syllabus.topic ? <div className="diary-current-topic"><span>RECENTLY COVERED</span><strong>{syllabus.topic}</strong>{syllabus.remarks && <p>{syllabus.remarks}</p>}</div> : <p className="diary-muted">Your course progress will appear here when your academic team adds an update.</p>}
          {syllabus.updatedAt && <p className="diary-updated">Last updated {formatDate(syllabus.updatedAt)}</p>}
        </section>

        <section className="portal-panel diary-mark-panel">
          <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-map-pin-line" aria-hidden="true"></i></span><div><h2>Today’s class attendance</h2><p>Attendance is available at your registered branch.</p></div></div>
          {diary?.hasMarkedToday ? (
            <div className="diary-already-marked"><i className="ph-fill ph-check-circle" aria-hidden="true"></i><div><strong>You’re marked present</strong><span>{formatDate(diary.today)} · Class attendance saved</span></div></div>
          ) : (
            <form onSubmit={markAttendance}>
              <button className={`diary-location-button ${gps ? 'captured' : ''}`} type="button" onClick={captureLocation}><i className={`ph ${gps ? 'ph-check-circle' : 'ph-crosshair'}`} aria-hidden="true"></i><span>{gps ? 'Location captured' : 'Verify branch location'}</span><i className="ph ph-arrow-right" aria-hidden="true"></i></button>
              <p className="diary-location-message">{gpsMessage}</p>
              <button type="submit" className="btn-action diary-submit-button" disabled={!gps || saving}>{saving ? 'Saving attendance…' : 'Mark present'}</button>
              <p className="diary-privacy-note">Your location is checked against the branch coordinates and stored with this attendance entry.</p>
            </form>
          )}
        </section>

        <section className="portal-panel diary-history-panel">
          <div className="panel-heading panel-heading-with-link"><div className="panel-heading-main"><span className="panel-heading-icon"><i className="ph ph-calendar-check" aria-hidden="true"></i></span><div><h2>Attendance history</h2><p>{attendance.length} class {attendance.length === 1 ? 'day' : 'days'} recorded</p></div></div></div>
          {attendance.length ? (
            <div className="diary-attendance-list">{attendance.slice(0, 30).map((record, index) => (
              <article className="diary-attendance-row" key={`${record.date}-${record.timestamp}-${index}`}><span className="diary-attendance-check"><i className="ph-fill ph-check" aria-hidden="true"></i></span><div><strong>{formatDate(record.date)}</strong><span>{formatPortalDateTime(record.timestamp) || 'Attendance recorded'}</span></div><span className="diary-present-pill">{record.status}</span></article>
            ))}</div>
          ) : <div className="empty-panel-message"><i className="ph ph-calendar-blank" aria-hidden="true"></i><strong>No class attendance yet</strong><span>Your branch check-ins will be listed here.</span></div>}
        </section>

        <section className="portal-panel diary-syllabus-history-panel">
          <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-books" aria-hidden="true"></i></span><div><h2>Progress updates</h2><p>Your recent syllabus updates</p></div></div>
          {syllabus.entries?.length ? (
            <div className="diary-syllabus-list">{syllabus.entries.slice().reverse().slice(0, 12).map((entry, index) => (
              <article className="diary-syllabus-row" key={`${entry.date}-${entry.topic}-${index}`}><div><strong>{entry.topic || 'Course progress'}</strong><span>{formatDate(entry.date || entry.timestamp)}{entry.remarks ? ` · ${entry.remarks}` : ''}</span></div><b>{entry.progress}%</b></article>
            ))}</div>
          ) : <div className="empty-panel-message"><i className="ph ph-books" aria-hidden="true"></i><strong>No progress updates yet</strong><span>Your academic team can add syllabus entries to your student diary.</span></div>}
        </section>
      </div>
    </div>
  );
}
