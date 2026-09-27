import { useEffect, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import api from '../../config/axios';

export default function HelpCenter() {
  const { user, dashboardData, getDriveImageUrl } = useOutletContext();
  const location = useLocation();
  const [issueDetails, setIssueDetails] = useState('');
  const [issueStatus, setIssueStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const tpo = dashboardData?.tpoInfo || {};
  const tpoName = tpo.name || tpo['TPO Name'] || 'Placement Officer';
  const tpoEmail = tpo.email || tpo.mailId || tpo['Mail ID'] || 'placement@ipcsglobal.com';
  const tpoPhone = tpo.phone || tpo.contactNumber || tpo['Contact Number'] || '';
  const tpoBranch = tpo.sittingBranch || tpo['Sitting Branch'] || 'Contact the IPCS placement team';
  const tpoRegions = tpo.assignedBranches || tpo.assignedRegions || tpo['Assigned Branches'] || '';
  const tpoPhoto = tpo.profilePhoto || tpo.photo || tpo['Profile Photo'];
  const phoneDigits = String(tpoPhone).replace(/\D/g, '');

  useEffect(() => {
    const target = location.hash.slice(1);
    if (!target) return;
    const timeout = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => window.clearTimeout(timeout);
  }, [location.hash]);

  const submitIssue = async (event) => {
    event.preventDefault();
    const details = issueDetails.trim();
    if (details.length < 10) {
      setIssueStatus({ type: 'error', message: 'Please describe the issue in at least 10 characters.' });
      return;
    }

    setSubmitting(true);
    setIssueStatus({ type: 'info', message: 'Sending your request to the placement team…' });
    try {
      const response = await api.post('/api/dashboard/support/issue', {
        email: user.email,
        name: user.name,
        phone: user.phone,
        rollNo: user.rollNo,
        branch: user.branch,
        course: user.course,
        issueDetails: details,
      });
      setIssueStatus({ type: 'success', message: response.data.message || 'Your request was sent successfully.' });
      setIssueDetails('');
    } catch (error) {
      setIssueStatus({ type: 'error', message: error.response?.data?.message || 'Your request could not be sent. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="portal-page animate-fade-in">
      <header className="portal-page-heading">
        <p className="eyebrow">Student support</p>
        <h1>Contact & Help</h1>
        <p>Reach your placement officer or send a question to the IPCS placement team.</p>
      </header>

      <div className="help-page-grid">
        <section className="portal-panel tpo-panel" id="contact-tpo">
          <div className="tpo-profile">
            <div className="tpo-avatar">
              {tpoPhoto && tpoPhoto !== 'N/A' && !photoError
                ? <img src={getDriveImageUrl(tpoPhoto)} alt={`${tpoName} profile`} onError={() => setPhotoError(true)} />
                : <i className="ph ph-user-tie" aria-hidden="true"></i>}
            </div>
            <div><p className="eyebrow">Your placement contact</p><h2>{tpoName}</h2><p>{tpoBranch}</p></div>
          </div>
          <dl className="contact-details">
            <div><dt>Email</dt><dd><a href={`mailto:${tpoEmail}`}>{tpoEmail}</a></dd></div>
            <div><dt>Phone</dt><dd>{tpoPhone || 'Contact details not available'}</dd></div>
            {tpoRegions && <div><dt>Assigned regions</dt><dd>{tpoRegions}</dd></div>}
          </dl>
          <div className="contact-actions">
            {phoneDigits && <a className="btn-action" href={`tel:${phoneDigits}`}><i className="ph ph-phone"></i> Call</a>}
            {phoneDigits && <a className="btn-action whatsapp-action" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer"><i className="ph ph-whatsapp-logo"></i> WhatsApp</a>}
            <a className="btn-cancel" href={`mailto:${tpoEmail}?cc=placementcell.ipcs@gmail.com&subject=${encodeURIComponent(`Student inquiry: ${user?.name || 'IPCS student'} (${user?.rollNo || ''})`)}`}><i className="ph ph-envelope"></i> Email</a>
          </div>
          {!dashboardData && <p className="portal-note">Loading branch contact details…</p>}
        </section>

        <section className="portal-panel help-form-panel" id="request-help">
          <div className="panel-heading">
            <span className="panel-heading-icon"><i className="ph ph-headset"></i></span>
            <div><h2>Request help</h2><p>Your report will be forwarded to the placement team.</p></div>
          </div>
          <form onSubmit={submitIssue}>
            <div className="form-group">
              <label htmlFor="issue-details">Describe your issue or inquiry</label>
              <textarea id="issue-details" rows="7" maxLength={2000} required value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder="Tell us what happened and how we can help…"></textarea>
              <small className="character-count">{issueDetails.length}/2000</small>
            </div>
            <button type="submit" className="btn-action" disabled={submitting}>{submitting ? 'Sending…' : 'Submit request'}</button>
            {issueStatus && <div role="status" className={`alert alert-${issueStatus.type}`}>{issueStatus.message}</div>}
          </form>
        </section>
      </div>
    </section>
  );
}
