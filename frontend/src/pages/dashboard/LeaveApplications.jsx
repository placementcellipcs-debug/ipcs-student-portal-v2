import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import { formatPortalDate, formatPortalDateTime } from '../../utils/portalDate';

const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDate = (value) => {
  if (!value) return 'Date not available';
  return formatPortalDate(value) || String(value);
};

export default function LeaveApplications() {
  const { user } = useOutletContext();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({ type: 'Leave Request', startDate: localToday(), endDate: localToday(), reason: '' });

  const loadRecords = useCallback(async () => {
    try {
      const response = await api.get('/api/dashboard/leave');
      setRecords(response.data.records || []);
    } catch (error) {
      setNotice({ type: 'error', message: error.response?.data?.message || 'Could not load your leave history.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => { if (!cancelled) loadRecords(); }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [loadRecords, user?.email]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice({ type: 'info', message: 'Submitting your request…' });
    try {
      const response = await api.post('/api/dashboard/leave', form);
      setNotice({ type: 'success', message: response.data.message || 'Your request was saved.' });
      setForm((previous) => ({ ...previous, startDate: localToday(), endDate: localToday(), reason: '' }));
      await loadRecords();
    } catch (error) {
      setNotice({ type: 'error', message: error.response?.data?.message || 'Could not submit the request.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="leave-page animate-fade-in">
      <header className="portal-page-heading">
        <p className="eyebrow">CLASS ATTENDANCE</p>
        <h1>Leave & absence</h1>
        <p>Request time away ahead of class or let IPCS know when you cannot attend.</p>
      </header>
      <div className="leave-page-grid">
        <section className="portal-panel leave-form-panel">
          <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-calendar-plus" aria-hidden="true"></i></span><div><h2>Submit a notice</h2><p>Your student and course details are attached automatically.</p></div></div>
          {notice && <div className={`alert alert-${notice.type}`} role="status">{notice.message}</div>}
          <form onSubmit={submit}>
            <div className="form-group"><label htmlFor="leave-type">Request type</label><select id="leave-type" value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}><option>Leave Request</option><option>Absence Notice</option></select><small>Leave requests are marked Pending. An absence notice is recorded as Notified.</small></div>
            <div className="leave-date-grid"><div className="form-group"><label htmlFor="leave-start">From</label><input id="leave-start" type="date" lang="en-GB" required value={form.startDate} onChange={(event) => setForm((previous) => ({ ...previous, startDate: event.target.value }))} /></div><div className="form-group"><label htmlFor="leave-end">Through</label><input id="leave-end" type="date" lang="en-GB" min={form.startDate} required value={form.endDate} onChange={(event) => setForm((previous) => ({ ...previous, endDate: event.target.value }))} /></div></div>
            <div className="form-group"><label htmlFor="leave-reason">Reason</label><textarea id="leave-reason" rows="5" maxLength={1000} required minLength={10} value={form.reason} onChange={(event) => setForm((previous) => ({ ...previous, reason: event.target.value }))} placeholder="Share the reason for your absence or leave request." /><small>{form.reason.length}/1000 characters</small></div>
            <button className="btn-action leave-submit" type="submit" disabled={saving}>{saving ? 'Submitting…' : form.type === 'Absence Notice' ? 'Record absence' : 'Request leave'} <i className="ph ph-arrow-right" aria-hidden="true"></i></button>
          </form>
          <p className="portal-note leave-policy-note">A leave request is not approved until its status is updated by IPCS staff. An absence notice records that you informed the team.</p>
        </section>

        <section className="portal-panel leave-history-panel">
          <div className="panel-heading"><span className="panel-heading-icon"><i className="ph ph-clock-counter-clockwise" aria-hidden="true"></i></span><div><h2>Your requests</h2><p>Recent leave requests and absence notices</p></div></div>
          {loading ? <div className="dashboard-loading"><i className="ph ph-spinner animate-spin"></i> Loading your history…</div> : records.length ? (
            <div className="leave-record-list">{records.map((record, index) => (
            <article className="leave-record-card" key={`${record.timestamp}-${record.startDate}-${index}`}>
                <div className="leave-record-icon"><i className={`ph ${record.type === 'Absence Notice' ? 'ph-info' : 'ph-calendar-x'}`} aria-hidden="true"></i></div>
                <div className="leave-record-copy"><div><strong>{record.type}</strong><span className={`leave-status ${String(record.status).toLowerCase().replace(/\s+/g, '-')}`}>{record.status}</span></div><p>{formatDate(record.startDate)}{record.endDate && record.endDate !== record.startDate ? ` – ${formatDate(record.endDate)}` : ''}</p><small>{record.reason}</small><time>{formatPortalDateTime(record.timestamp) || record.timestamp}</time></div>
              </article>
            ))}</div>
          ) : <div className="empty-panel-message"><i className="ph ph-calendar-blank" aria-hidden="true"></i><strong>No leave history</strong><span>Your requests and absence notices will appear here.</span></div>}
        </section>
      </div>
    </section>
  );
}
