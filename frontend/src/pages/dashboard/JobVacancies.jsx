import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import DriveImage from '../../components/ui/DriveImage';

function CompanyLogo({ src, company, className = '' }) {
  return (
    <span className={`company-logo-frame ${className}`} role="img" aria-label={`${company || 'Company'} logo`}>
      {src
        ? <DriveImage src={src} alt="" aria-hidden="true"><i className="ph-fill ph-buildings" aria-hidden="true"></i></DriveImage>
        : <i className="ph-fill ph-buildings" aria-hidden="true"></i>}
    </span>
  );
}

const parseSafeDate = (dateStr) => {
  if (!dateStr || dateStr === "N/A" || dateStr === "undefined" || String(dateStr).toUpperCase() === "TBA") return null;
  let cleanStr = String(dateStr).replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const parts = cleanStr.split(/[-/]/);
  if (parts.length === 3) {
      const yearFirst = parts[0].length === 4;
      const year = Number(yearFirst ? parts[0] : parts[2]);
      const month = Number(yearFirst ? parts[1] : parts[0]);
      const day = Number(yearFirst ? parts[2] : parts[1]);
      const parsedDate = new Date(year, month - 1, day);
      if (parsedDate.getFullYear() === year && parsedDate.getMonth() === month - 1 && parsedDate.getDate() === day) return parsedDate;
  }
  const parsedDate = new Date(cleanStr);
  if (!isNaN(parsedDate.getTime())) return parsedDate;
  return null;
};

const isEventExpired = (dateStr) => {
  if (!dateStr || String(dateStr).toUpperCase() === "TBA") return false;
  const eventDate = parseSafeDate(dateStr);
  if (!eventDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
};

export default function JobVacancies() {
  const { user } = useOutletContext();
  const [vacancies, setVacancies] = useState([]);
  const [appliedJobs, setAppliedJobs] = useState([]);
  
  // Modal States
  const [jobModal, setJobModal] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  const [q1, setQ1] = useState(false);
  const [q2, setQ2] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  const fetchData = useCallback(async () => {
    if (!user || !user.email) return;
    try {
      const res = await api.post('/api/dashboard/data', { 
        email: user.email, branch: user.branch, course: user.course, joiningDate: user.joiningDate 
      });
      if (res.data.success) {
        setVacancies(res.data.vacancies || []);
        setAppliedJobs(res.data.appliedJobs || []);
      }
    } catch (err) {
      console.error('Failed to load vacancies:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.email) return undefined;

    let cancelled = false;
    api.post('/api/dashboard/data', {
      email: user.email, branch: user.branch, course: user.course, joiningDate: user.joiningDate
    })
      .then((res) => {
        if (!cancelled && res.data.success) {
          setVacancies(res.data.vacancies || []);
          setAppliedJobs(res.data.appliedJobs || []);
        }
      })
      .catch((error) => console.error('Failed to load vacancies:', error));

    return () => { cancelled = true; };
  }, [user]);

  const openApplyConfirm = () => {
    if (requiresExperience(jobModal) && studentIsFresher) {
      setActionStatus({ type: 'warning', message: 'This opening requires prior experience. Your profile is marked as a fresher, so applications are disabled.' });
      return;
    }
    if (!user.resume || user.resume === "N/A" || !user.resume.startsWith("http")) { 
      setActionStatus({ type: 'error', message: 'Resume Required! Please upload your PDF Resume document in your Profile before applying.' }); 
      setShowConsent(true); 
    } else { 
      setShowConsent(true); 
      setActionStatus(null); 
    }
  };

  const handleApply = async () => {
    if (!q1 || !q2) { setActionStatus({ type: 'error', message: 'You must check both consent boxes to apply.' }); return; }
    setActionStatus({ type: 'info', message: 'Submitting application...' });
    try {
      const res = await api.post('/api/dashboard/apply', { 
        email: user.email, jobId: jobModal.newsletterId, companyName: jobModal.company, 
        name: user.name, phone: user.phone, rollNo: user.rollNo, course: user.course, 
        branch: user.branch, qualification: user.qualification, resume: user.resume 
      });
      if(res.data.success) { 
        setAppliedJobs((current) => current.some((job) => String(job.jobId) === String(jobModal.newsletterId))
          ? current
          : [...current, { jobId: jobModal.newsletterId, company: jobModal.company, position: jobModal.position, status: 'Applied' }]);
        setShowConfetti(true); 
        fetchData(); 
        setTimeout(() => { 
          setJobModal(null); setActionStatus(null); setShowConsent(false); setQ1(false); setQ2(false); setShowConfetti(false); 
        }, 2500); 
      } else { 
        setActionStatus({ type: 'error', message: res.data.message }); 
      }
    } catch(err) {
      console.error('Failed to submit job application:', err);
      setActionStatus({ type: 'error', message: 'Server Error applying for job' }); 
    }
  };

  const processedVacancies = [...vacancies].sort((a, b) => {
    const aExp = isEventExpired(a.lastDate);
    const bExp = isEventExpired(b.lastDate);
    return Number(aExp) - Number(bExp);
  });
  const activeVacancies = processedVacancies.filter((vacancy) => !isEventExpired(vacancy.lastDate));
  const expiredVacancies = processedVacancies.filter((vacancy) => isEventExpired(vacancy.lastDate));
  const stateOptions = [...new Map(vacancies.map((vacancy) => {
    const label = String(vacancy.state || 'Other locations').trim() || 'Other locations';
    return [label.toLocaleLowerCase(), label];
  })).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([, label]) => label);
  const visibleVacancies = (activeTab === 'active' ? activeVacancies : expiredVacancies).filter((vacancy) => (
    (stateFilter === 'all' || String(vacancy.state || 'Other locations').trim().toLocaleLowerCase() === stateFilter)
    && `${vacancy.position} ${vacancy.company} ${vacancy.location} ${vacancy.state}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
  ));
  const groupedVacancies = [...visibleVacancies.reduce((groups, vacancy) => {
    const label = String(vacancy.state || 'Other locations').trim() || 'Other locations';
    const key = label.toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { label, vacancies: [] });
    groups.get(key).vacancies.push(vacancy);
    return groups;
  }, new Map()).values()].sort((a, b) => a.label.localeCompare(b.label));
  const requiresExperience = (vacancy) => /experienced|\d\s*\+?\s*years?|\d+\s*to\s*\d+\s*years?/i.test(String(vacancy.experience || ''));
  const studentIsFresher = /fresher|no experience|entry.level/i.test(String(user?.fresherStatus || ''));
  const modalJobExpired = jobModal ? isEventExpired(jobModal.lastDate) : false;
  const modalJobApplied = jobModal ? appliedJobs.some((job) => String(job.jobId) === String(jobModal.newsletterId)) : false;
  const closeJobModal = () => {
    setJobModal(null);
    setActionStatus(null);
    setShowConsent(false);
    setQ1(false);
    setQ2(false);
    setShowConfetti(false);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div className="vacancies-hero vacancies-hero-premium">
        <div className="vacancies-hero-copy"><p className="eyebrow">Career opportunities</p><h1>Job openings</h1><p>Explore roles matched to your course and track every application from one place.</p></div>
        <div className="vacancies-hero-icon"><i className="ph-fill ph-briefcase"></i></div>
      </div>
      
      {(!user.vacancyOpen || !/^(yes|true|1)$/i.test(user.vacancyOpen.toString().trim())) ? (
         <div className="alert alert-error" style={{ margin: '2rem auto', maxWidth: '600px', padding: '2rem', borderRadius: '16px' }}>
             <i className="ph-fill ph-lock-key" style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}></i> 
             <h3>Access Restricted</h3>
             <p>Your access to view Job Vacancies is currently restricted. Please contact your Placement Officer.</p>
         </div>
       ) : (
         <>
           <div className="vacancy-toolbar">
             <div className="vacancy-tabs" role="tablist" aria-label="Opening status">
               <button type="button" role="tab" aria-selected={activeTab === 'active'} className={activeTab === 'active' ? 'active' : ''} onClick={() => setActiveTab('active')}>
                 <span>Active openings</span><strong>{activeVacancies.length}</strong>
               </button>
               <button type="button" role="tab" aria-selected={activeTab === 'expired'} className={activeTab === 'expired' ? 'active' : ''} onClick={() => setActiveTab('expired')}>
                 <span>Expired</span><strong>{expiredVacancies.length}</strong>
               </button>
             </div>
             <div className="vacancy-toolbar-filters">
               <label className="vacancy-state-select"><span>State</span><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="all">All states</option>{stateOptions.map((state) => <option value={state.toLocaleLowerCase()} key={state}>{state}</option>)}</select></label>
               <label className="vacancy-search"><i className="ph ph-magnifying-glass" aria-hidden="true"></i><span className="sr-only">Search openings</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search role, company, location" /></label>
             </div>
           </div>

           {vacancies.length === 0 ? (
             <div className="vacancy-empty-state"><span><i className="ph ph-briefcase"></i></span><h2>No openings yet</h2><p>New roles matched to your course will appear here.</p></div>
           ) : visibleVacancies.length === 0 ? (
             <div className="vacancy-empty-state"><span><i className="ph ph-magnifying-glass"></i></span><h2>{searchQuery ? 'No matching openings' : `No ${activeTab} openings`}</h2><p>{searchQuery ? 'Try a different title, company, or location.' : 'Choose the other tab to review openings in that status.'}</p></div>
           ) : (
             <div className="vacancy-state-groups">
               {groupedVacancies.map(({ label, vacancies: stateVacancies }) => (
                 <section className="vacancy-state-group" key={label} aria-label={`${label} openings`}>
                   <header><h2><i className="ph-fill ph-map-pin" aria-hidden="true"></i>{label}</h2><span>{stateVacancies.length} {stateVacancies.length === 1 ? 'opening' : 'openings'}</span></header>
                   <div className="vacancy-card-grid">
                     {stateVacancies.map((vacancy) => {
                       const isApplied = appliedJobs.some((job) => String(job.jobId).trim() === String(vacancy.newsletterId).trim());
                       const isExpired = isEventExpired(vacancy.lastDate);
                       return (
                         <article className={`vacancy-card ${isExpired ? 'expired' : ''}`} key={vacancy.newsletterId}>
                           <div className="vacancy-card-topline"><span className="vacancy-id">{vacancy.newsletterId}</span><span className={`vacancy-status ${isApplied ? 'applied' : isExpired ? 'expired' : 'active'}`}>{isApplied ? 'Applied' : isExpired ? 'Expired' : 'Accepting applications'}</span></div>
                           <div className="vacancy-title-row">
                             <CompanyLogo src={vacancy.companyLogo} company={vacancy.company} className="vacancy-company-logo" />
                             <div className="vacancy-title-block"><h2>{vacancy.position}</h2><p>{vacancy.company}</p></div>
                           </div>
                           <div className="vacancy-chip-row"><span><i className="ph ph-map-pin"></i>{vacancy.location}</span><span><i className="ph ph-buildings"></i>{vacancy.modeOfWork}</span></div>
                           <dl className="vacancy-detail-grid">
                             <div><dt>Openings</dt><dd>{vacancy.openings}</dd></div>
                             <div><dt>Experience</dt><dd>{vacancy.experience}</dd></div>
                             <div><dt>Salary</dt><dd>{vacancy.salary}</dd></div>
                             <div><dt>Apply by</dt><dd>{vacancy.lastDate}</dd></div>
                           </dl>
                           <div className="vacancy-card-footer">
                             <button type="button" className="btn-action vacancy-view-button" onClick={() => { setJobModal(vacancy); setActionStatus(null); setShowConsent(false); setQ1(false); setQ2(false); }}>View details <i className="ph ph-arrow-up-right"></i></button>
                           </div>
                         </article>
                       );
                     })}
                   </div>
                 </section>
               ))}
             </div>
           )}
         </>
       )}

      {/* PLACEMENT JOB MODAL */}
      {jobModal && createPortal(
        <div className="report-modal-overlay vacancy-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeJobModal(); }}>
          <section className="report-card vacancy-modal-card" role="dialog" aria-modal="true" aria-labelledby="vacancy-modal-title">
            {showConfetti && (
              <div className="celebration-overlay">
                <div className="celebration-content">
                  <span className="party-emoji">🎉</span>
                  <h2>Application successful!</h2>
                  <p>Track this in Application Status.</p>
                </div>
              </div>
            )}
            <header className="vacancy-modal-header">
              <div className="vacancy-modal-company-lockup">
                <CompanyLogo src={jobModal.companyLogo} company={jobModal.company} className="vacancy-modal-logo" />
                <div className="vacancy-modal-heading">
                  <p>Opening details <span>·</span> {jobModal.newsletterId}</p>
                  <h2 id="vacancy-modal-title">{jobModal.position}</h2>
                  <strong>{jobModal.company}</strong>
                </div>
              </div>
              <button type="button" className="vacancy-modal-close" aria-label="Close opening details" onClick={closeJobModal}><i className="ph ph-x" aria-hidden="true"></i></button>
            </header>
            <div className="vacancy-modal-body">
              <dl className="vacancy-modal-meta">
                <div><dt>Location</dt><dd>{jobModal.location}</dd></div>
                <div><dt>Work mode</dt><dd>{jobModal.modeOfWork}</dd></div>
                <div><dt>Openings</dt><dd>{jobModal.openings}</dd></div>
                <div><dt>Experience</dt><dd>{jobModal.experience}</dd></div>
                <div><dt>Salary</dt><dd>{jobModal.salary}</dd></div>
                <div><dt>Interview date</dt><dd>{jobModal.interviewDate}</dd></div>
                <div><dt>Apply by</dt><dd>{jobModal.lastDate}</dd></div>
              </dl>
              <section className="vacancy-modal-section">
                <h3>Qualification required</h3>
                <p>{jobModal.qualification || 'Details will be shared by the placement team.'}</p>
              </section>
              {jobModal.description && (
                <section className="vacancy-modal-section">
                  <h3>Job description</h3>
                  <div className="vacancy-modal-description">{jobModal.description}</div>
                </section>
              )}
              {modalJobApplied ? (
                <div className="vacancy-modal-notice applied"><i className="ph-fill ph-check-circle" aria-hidden="true"></i><span>You’ve applied for this opening. You can review the details here and track updates in Application Status.</span></div>
              ) : modalJobExpired ? (
                <div className="vacancy-modal-notice expired"><i className="ph-fill ph-clock-countdown" aria-hidden="true"></i><span>This opening has expired. Applications are closed, but you can still review its details.</span></div>
              ) : requiresExperience(jobModal) && studentIsFresher ? (
                <div className="vacancy-modal-notice"><i className="ph ph-info" aria-hidden="true"></i><span>This role requires prior experience. You can review its details, but applications are disabled for your fresher profile.</span></div>
              ) : showConsent ? (
                <section className="vacancy-consent-panel" aria-label="Application consent">
                  {actionStatus?.type === 'error' && actionStatus.message.includes('Resume') ? (
                    <div className="alert alert-error"><i className="ph-fill ph-warning-circle" aria-hidden="true"></i><span>{actionStatus.message}</span></div>
                  ) : (
                    <>
                      <label><input type="checkbox" checked={q1} onChange={(event) => setQ1(event.target.checked)} /><span>I agree to attend the interview whenever the company contacts me.</span></label>
                      <label><input type="checkbox" checked={q2} onChange={(event) => setQ2(event.target.checked)} /><span>I understand that missing the interview may affect my placement support.</span></label>
                      {actionStatus && <div className={'alert alert-' + actionStatus.type} role={actionStatus.type === 'error' ? 'alert' : 'status'}>{actionStatus.message}</div>}
                    </>
                  )}
                </section>
              ) : null}
            </div>
            <footer className="vacancy-modal-footer">
              {modalJobApplied || modalJobExpired || (requiresExperience(jobModal) && studentIsFresher) ? (
                <button type="button" className="btn-cancel" onClick={closeJobModal}>Close</button>
              ) : showConsent ? actionStatus?.type === 'error' && actionStatus.message.includes('Resume') ? (
                <><Link className="btn-action" to="/dashboard/profile" onClick={closeJobModal}>Go to profile</Link><button type="button" className="btn-cancel" onClick={closeJobModal}>Close</button></>
              ) : (
                <><button type="button" className="btn-action vacancy-apply-confirm" onClick={handleApply} disabled={!q1 || !q2 || actionStatus?.type === 'info'}>{actionStatus?.type === 'info' ? 'Submitting…' : 'Confirm & submit application'}</button><button type="button" className="btn-cancel" onClick={closeJobModal}>Cancel</button></>
              ) : (
                <><button type="button" className="btn-action" onClick={openApplyConfirm}>Apply now <i className="ph ph-arrow-right" aria-hidden="true"></i></button><button type="button" className="btn-cancel" onClick={closeJobModal}>Close</button></>
              )}
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
