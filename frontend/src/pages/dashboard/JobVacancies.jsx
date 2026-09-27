import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';

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
  const visibleVacancies = (activeTab === 'active' ? activeVacancies : expiredVacancies).filter((vacancy) => (
    `${vacancy.position} ${vacancy.company} ${vacancy.location} ${vacancy.state}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
  ));
  const requiresExperience = (vacancy) => /experienced|\d\s*\+?\s*years?|\d+\s*to\s*\d+\s*years?/i.test(String(vacancy.experience || ''));
  const studentIsFresher = /fresher|no experience|entry.level/i.test(String(user?.fresherStatus || ''));

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
             <label className="vacancy-search"><i className="ph ph-magnifying-glass" aria-hidden="true"></i><span className="sr-only">Search openings</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search role, company, location" /></label>
           </div>

           {vacancies.length === 0 ? (
             <div className="vacancy-empty-state"><span><i className="ph ph-briefcase"></i></span><h2>No openings yet</h2><p>New roles matched to your course will appear here.</p></div>
           ) : visibleVacancies.length === 0 ? (
             <div className="vacancy-empty-state"><span><i className="ph ph-magnifying-glass"></i></span><h2>{searchQuery ? 'No matching openings' : `No ${activeTab} openings`}</h2><p>{searchQuery ? 'Try a different title, company, or location.' : 'Choose the other tab to review openings in that status.'}</p></div>
           ) : (
             <div className="vacancy-card-grid">
               {visibleVacancies.map((vacancy) => {
                 const isApplied = appliedJobs.some((job) => String(job.jobId) === String(vacancy.newsletterId));
                 const isExpired = isEventExpired(vacancy.lastDate);
                 return (
                   <article className={`vacancy-card ${isExpired ? 'expired' : ''}`} key={vacancy.newsletterId}>
                     <div className="vacancy-card-topline"><span className="vacancy-id">{vacancy.newsletterId}</span><span className={`vacancy-status ${isExpired ? 'expired' : 'active'}`}>{isExpired ? 'Expired' : isApplied ? 'Applied' : 'Accepting applications'}</span></div>
                     <div className="vacancy-title-block"><h2>{vacancy.position}</h2><p>{vacancy.company}</p></div>
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
           )}
         </>
       )}

      {/* PLACEMENT JOB MODAL */}
      {jobModal && (
        <div className="report-modal-overlay">
          <div className="report-card" style={{ maxWidth: '600px', width: '90%', padding: '0', overflow: 'hidden', position: 'relative' }}>
            
            {showConfetti && (
              <div className="celebration-overlay">
                <div className="celebration-content">
                  <span className="party-emoji">🎉</span>
                  <h2 style={{ color: 'white', marginBottom: '10px', fontSize: '2rem' }}>Application Successful!</h2>
                  <p style={{ color: '#a5b4fc', margin: 0, fontSize: '1.1rem' }}>Track this in Application Status.</p>
                </div>
              </div>
            )}

            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem', lineHeight: '1.2' }}>
                  {jobModal.position} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>Newsletter ID: {jobModal.newsletterId}</span>
                </h3>
                <i className="ph ph-x" style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.4rem' }} onClick={() => { setJobModal(null); setShowConsent(false); setQ1(false); setQ2(false); setShowConfetti(false); }}></i>
              </div>
              <strong style={{ color: 'var(--accent-cyan)', fontSize: '1.2rem' }}>{jobModal.company}</strong>
            </div>
            
            <div style={{ padding: '2rem', maxHeight: '75vh', overflowY: 'auto' }}>
              <div style={{ background: 'var(--input-bg)', padding: '1.2rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '0.95rem', border: '1px solid var(--input-border)' }}>
                <div><strong style={{ color: 'var(--text-muted)' }}>Location:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{jobModal.location}</span></div>
                <div><strong style={{ color: 'var(--text-muted)' }}>Mode of Work:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{jobModal.modeOfWork}</span></div>
                <div><strong style={{ color: 'var(--text-muted)' }}>Openings:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{jobModal.openings}</span></div>
                <div><strong style={{ color: 'var(--text-muted)' }}>Experience:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{jobModal.experience}</span></div>
                <div><strong style={{ color: 'var(--text-muted)' }}>Salary:</strong> <span style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>{jobModal.salary}</span></div>
                <div><strong style={{ color: 'var(--text-muted)' }}>Interview Date:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{jobModal.interviewDate}</span></div>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '6px', fontSize: '1rem' }}>Qualification Required:</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5' }}>{jobModal.qualification}</div>
              </div>

              {jobModal.description && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '8px', fontSize: '1rem' }}>Job Description:</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', whiteSpace: 'pre-line', background: 'var(--bg-dark)', padding: '16px', borderRadius: '12px', border: '1px solid var(--card-border)', lineHeight: '1.6' }}>
                    {jobModal.description}
                  </div>
                </div>
              )}

              {showConsent ? (
                <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '16px', border: '1px solid var(--card-border)' }}>
                  {actionStatus && actionStatus.type === 'error' && actionStatus.message.includes('Resume') ? (
                    <div className="alert alert-error" style={{ margin: 0, padding: '1.5rem', textAlign: 'left', fontSize: '0.9rem', lineHeight: '1.5' }}>
                      <i className="ph-fill ph-warning-circle" style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}></i>
                      {actionStatus.message}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', background: 'var(--input-bg)', padding: '12px', borderRadius: '10px' }}>
                        <input type="checkbox" checked={q1} onChange={e => setQ1(e.target.checked)} style={{ width: '22px', height: '22px', flexShrink: 0, marginTop: '2px', cursor: 'pointer' }} />
                        <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
                          1. As I am applying for this job, I agree that I will attend the interview whenever the company calls me without fail.
                        </p>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', background: 'var(--input-bg)', padding: '12px', borderRadius: '10px' }}>
                        <input type="checkbox" checked={q2} onChange={e => setQ2(e.target.checked)} style={{ width: '22px', height: '22px', flexShrink: 0, marginTop: '2px', cursor: 'pointer' }} />
                        <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
                          2. I agree as per Placement rules if I fail to attend this company interview, I will be removed from placement support.
                        </p>
                      </div>
                      
                      {actionStatus && <div className={`alert alert-${actionStatus.type}`} style={{ marginBottom: '15px' }}>{actionStatus.message}</div>}
                      
                      <button 
                        className="btn-action" 
                        style={{ width: '100%', background: (q1 && q2) ? '#10b981' : 'var(--input-border)', color: (q1 && q2) ? '#fff' : 'var(--text-muted)', padding: '1rem', fontSize: '1rem', cursor: (q1 && q2) ? 'pointer' : 'not-allowed', transition: 'background 0.3s' }} 
                        onClick={handleApply}
                      >
                        {actionStatus?.type === 'info' ? 'Submitting...' : 'Confirm & Submit Application'}
                      </button>
                    </>
                  )}
                </div>
              ) : requiresExperience(jobModal) && studentIsFresher ? (
                <div className="vacancy-eligibility-note"><i className="ph ph-info"></i><span>This opening requires prior experience. You can review the details, but your current profile is marked as a fresher, so applications are disabled.</span><button className="btn-cancel" onClick={() => setJobModal(null)}>Close</button></div>
              ) : (
                <div style={{ display: 'flex', gap: '15px', marginTop: '2rem' }}>
                  <button className="btn-action" style={{ flex: 2, background: '#10b981', padding: '1rem', fontSize: '1rem' }} onClick={openApplyConfirm}>Apply Now &rarr;</button>
                  <button className="btn-cancel" style={{ flex: 1, padding: '1rem', fontSize: '1rem' }} onClick={() => { setJobModal(null); setShowConsent(false); setQ1(false); setQ2(false); }}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
