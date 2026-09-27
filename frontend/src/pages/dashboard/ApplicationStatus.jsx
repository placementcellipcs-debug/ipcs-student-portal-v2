import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';

const getStatusGroup = (status = '') => {
  const value = String(status).toLowerCase();
  if (/reject|declin|not selected|unsuccessful/.test(value)) return 'Rejected';
  if (/offer|placed|selected|joined|hired/.test(value)) return 'Offer';
  if (/process|review|shortlist|interview|schedul|pending|assessment|round|in progress|test/.test(value)) return 'Processing';
  return 'Applied';
};

const getJobValue = (job, keys, fallback = '') => {
  for (const key of keys) if (job?.[key] !== undefined && job[key] !== null && String(job[key]).trim()) return job[key];
  return fallback;
};

export default function ApplicationStatus() {
  const { user } = useOutletContext();
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user?.email));
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) { setLoading(true); setError(''); }
    });
    api.post('/api/dashboard/data', {})
      .then((res) => {
        if (cancelled) return;
        if (!res.data.success) throw new Error(res.data.message || 'Could not load your applications.');
        setAppliedJobs(res.data.appliedJobs || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.message || requestError.message || 'Could not load your applications.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.email]);

  const counts = useMemo(() => appliedJobs.reduce((total, job) => {
    total[getStatusGroup(getJobValue(job, ['status', 'Status'], 'Applied'))] += 1;
    return total;
  }, { Applied: 0, Processing: 0, Rejected: 0, Offer: 0 }), [appliedJobs]);
  const visibleJobs = appliedJobs.filter((job) => filter === 'All' || getStatusGroup(getJobValue(job, ['status', 'Status'], 'Applied')) === filter);
  const tabs = [
    { label: 'All applications', key: 'All', count: appliedJobs.length },
    { label: 'Applied', key: 'Applied', count: counts.Applied },
    { label: 'Processing', key: 'Processing', count: counts.Processing },
    { label: 'Rejected', key: 'Rejected', count: counts.Rejected },
    { label: 'Offers', key: 'Offer', count: counts.Offer },
  ];

  return (
    <div className="job-tracker animate-fade-in">
      <section className="job-tracker-hero">
        <div>
          <p className="eyebrow">Your placement journey</p>
          <h1>Job Tracker</h1>
          <p>See every application, review the latest status, and know what needs your attention.</p>
        </div>
        <div className="job-tracker-hero-icon" aria-hidden="true"><i className="ph-fill ph-briefcase"></i></div>
      </section>

      <section className="job-tracker-summary" aria-label="Application summary">
        <div className="job-tracker-summary-card"><span className="job-tracker-summary-icon blue"><i className="ph ph-paper-plane-tilt"></i></span><div><small>Total applications</small><strong>{loading ? '—' : appliedJobs.length}</strong></div></div>
        <div className="job-tracker-summary-card"><span className="job-tracker-summary-icon cyan"><i className="ph ph-hourglass-medium"></i></span><div><small>In progress</small><strong>{loading ? '—' : counts.Processing}</strong></div></div>
        <div className="job-tracker-summary-card"><span className="job-tracker-summary-icon green"><i className="ph ph-confetti"></i></span><div><small>Offers</small><strong>{loading ? '—' : counts.Offer}</strong></div></div>
      </section>

      <section className="job-tracker-panel">
        <div className="job-tracker-panel-heading">
          <div><p className="eyebrow">Application pipeline</p><h2>Your applications</h2></div>
          <span className="job-tracker-total">{appliedJobs.length} total</span>
        </div>
        <div className="job-tracker-tabs" role="tablist" aria-label="Filter applications">
          {tabs.map((tab) => (
            <button type="button" role="tab" aria-selected={filter === tab.key} className={filter === tab.key ? 'active' : ''} key={tab.key} onClick={() => setFilter(tab.key)}>
              {tab.label}<span>{tab.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="job-tracker-empty"><i className="ph ph-spinner animate-spin"></i><p>Loading your application history…</p></div>
        ) : error ? (
          <div className="job-tracker-empty error"><i className="ph ph-warning-circle"></i><p>{error}</p></div>
        ) : visibleJobs.length === 0 ? (
          <div className="job-tracker-empty"><i className="ph ph-briefcase"></i><h3>{appliedJobs.length ? 'No applications in this stage' : 'Your next opportunity starts here'}</h3><p>{appliedJobs.length ? 'Choose another status to see more of your applications.' : 'When you apply to an IPCS opening, its progress will appear here.'}</p></div>
        ) : (
          <div className="job-tracker-list">
            {visibleJobs.map((job, index) => {
              const status = getJobValue(job, ['status', 'Status'], 'Applied');
              const group = getStatusGroup(status);
              const company = getJobValue(job, ['company', 'companyName', 'Company Name', 'Company'], 'Company details pending');
              const position = getJobValue(job, ['position', 'Position', 'jobTitle', 'Job Title'], 'Role details pending');
              const jobId = getJobValue(job, ['jobId', 'Job ID', 'id'], 'Application');
              const date = getJobValue(job, ['date', 'TimeStamp', 'Timestamp', 'time'], 'Date unavailable');
              const remarks = getJobValue(job, ['remarks', 'Remarks', 'HR Remarks'], 'The placement team will share updates here.');
              return (
                <article className="job-tracker-card" key={`${jobId}-${company}-${index}`}>
                  <div className="job-tracker-company-icon"><i className="ph-fill ph-buildings"></i></div>
                  <div className="job-tracker-card-main">
                    <div className="job-tracker-card-title"><div><h3>{position}</h3><p>{company}</p></div><span className={`job-tracker-status ${group.toLowerCase()}`}><i className={`ph ${group === 'Rejected' ? 'ph-x-circle' : group === 'Offer' ? 'ph-check-circle' : group === 'Processing' ? 'ph-hourglass-medium' : 'ph-paper-plane-tilt'}`}></i>{status}</span></div>
                    <div className="job-tracker-card-meta"><span><i className="ph ph-hash"></i>{jobId}</span><span><i className="ph ph-calendar-blank"></i>{date}</span></div>
                    <p className="job-tracker-remarks"><strong>Update</strong>{remarks}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
