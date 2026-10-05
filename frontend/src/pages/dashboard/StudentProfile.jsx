import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import { formatPortalDate, portalDateInputValue } from '../../utils/portalDate';
import DriveImage from '../../components/ui/DriveImage';
import ModalPortal from '../../components/ui/ModalPortal';

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('The selected file could not be read.'));
  reader.readAsDataURL(file);
});

const prepareProfilePhoto = async (file) => {
  const source = await readFileAsDataUrl(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('This image format could not be opened. Please choose a JPG or PNG photo.'));
    image.src = source;
  });

  const maxSize = 800;
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare this photo.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
};

export default function StudentProfile() {
  const { user, setUser } = useOutletContext();
  
  // Modals & Status
  const [editModal, setEditModal] = useState(false);
  const [epData, setEpData] = useState({});
  const [epStatus, setEpStatus] = useState(null);
  
  const [docStatus, setDocStatus] = useState({ type: '', msg: '' });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoStatus, setPhotoStatus] = useState({ type: '', msg: '' });

  const openEditModal = () => {
    setEpData({
        age: user?.age || '', gender: user?.gender || 'Male', parentName: user?.parentName || '', 
        parentContact: user?.parentContact || '', studyStatus: user?.studyStatus || 'Currently Studying', 
        completedDate: user?.completedDate && user.completedDate !== 'N/A' && !user.completedDate.includes('google') ? portalDateInputValue(user.completedDate) : '',
        stream: user?.stream || '', homeTown: user?.homeTown || '', fresherStatus: user?.fresherStatus || 'Fresher', 
        qualification: user?.qualification || '', linkedin: user?.linkedin || '', instagram: user?.instagram || '', 
        placementReq: user?.placementReq || ''
    });
    setEditModal(true);
  };

  const handleProfileUpdate = async () => {
    setEpStatus({ type: 'info', message: 'Saving changes securely...' });
    try {
        const res = await api.post('/api/dashboard/profile/update', { email: user.email, ...epData });
        if(res.data.success) {
            setEpStatus({ type: 'success', message: 'Profile updated!' });
            const updatedUser = { ...user, ...res.data.user };
            setUser(updatedUser);
            localStorage.setItem('talentino_student_user', JSON.stringify(updatedUser));
            setTimeout(() => { setEditModal(false); setEpStatus(null); }, 1500);
        }
    } catch(err) {
      console.error('Profile update failed:', err);
      setEpStatus({ type: 'error', message: 'Server Error updating profile.' }); 
    }
  };

  const handleDocumentUpload = async (e, docType) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    
    if (docType !== 'Photo' && file.type !== "application/pdf") { 
      setDocStatus({ type: 'error', msg: 'Only PDF allowed for documents' }); input.value = ''; return;
    }
    if (docType === 'Photo' && !file.type.startsWith("image/")) { 
      setPhotoStatus({ type: 'error', msg: 'Choose an image file for your profile photo.' }); input.value = ''; return;
    }
    
    if (docType === 'Photo') {
      setPhotoUploading(true);
      setPhotoStatus({ type: 'info', msg: 'Preparing and saving your photo…' });
    }
    else setDocStatus({ type: 'info', msg: `Processing and uploading ${docType}...` });

    try {
      const finalBase64 = docType === 'Photo' ? await prepareProfilePhoto(file) : await readFileAsDataUrl(file);
      const res = await api.post('/api/dashboard/profile/document', { email: user.email, rollNo: user.rollNo, base64: finalBase64, docType });
      if (!res.data?.success || !res.data?.url) throw new Error(res.data?.message || 'The upload did not return a saved file.');

      const key = docType === 'Resume' ? 'resume' : docType === 'Photo' ? 'photo' : 'certificate';
      const updatedUser = { ...user, [key]: res.data.url };
      setUser(updatedUser);
      localStorage.setItem('talentino_student_user', JSON.stringify(updatedUser));

      if (docType === 'Photo') setPhotoStatus({ type: 'success', msg: 'Profile photo updated.' });
      else {
        setDocStatus({ type: 'success', msg: `${docType} uploaded successfully!` });
        setTimeout(() => setDocStatus({ type: '', msg: '' }), 3000);
      }
    } catch (error) {
      console.error('Document upload failed:', error);
      const message = error.response?.data?.message || error.message || 'Upload failed. Please try again.';
      if (docType === 'Photo') setPhotoStatus({ type: 'error', msg: message });
      else setDocStatus({ type: 'error', msg: message });
    } finally {
      if (docType === 'Photo') setPhotoUploading(false);
      input.value = '';
    }
  };

  const hasPhoto = Boolean(user?.photo && user.photo !== 'N/A');
  const initial = (user?.name || 'U').charAt(0).toUpperCase();

  return (
    <div className="profile-page animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '2.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Student Profile</h2>
          <p style={{ color: '#94a3b8', fontSize: '1rem', margin: 0 }}>Manage your personal records and upload placement documents.</p>
        </div>
        <button className="btn-action" onClick={openEditModal}><i className="ph-bold ph-pencil-simple"></i> Edit Profile</button>
      </div>

      <div className="profile-grid-new">
        
        {/* LEFT COLUMN: Identity Card */}
        <div>
          <div className="info-bento" style={{ textAlign: 'center', background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.9))', padding: '3rem 2rem' }}>
            <div style={{ position: 'relative', width: '140px', height: '140px', margin: '0 auto 1.5rem auto' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '4px solid #38bdf8', padding: '4px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 0 30px rgba(56, 189, 248, 0.3)' }}>
                 {photoUploading ? <i className="ph ph-spinner animate-spin" style={{ fontSize: '3rem', color: '#38bdf8' }}></i> : (
                     hasPhoto ? <DriveImage src={user.photo} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%', borderRadius: '50%' }} alt="Profile"><span style={{ fontSize: '4rem', fontWeight: 900, color: '#38bdf8' }}>{initial}</span></DriveImage>
                     : <span style={{ fontSize: '4rem', fontWeight: 900, color: '#38bdf8' }}>{initial}</span>
                 )}
              </div>
              <div onClick={() => document.getElementById('photoUploadInput').click()} style={{ position: 'absolute', bottom: '0', right: '0', background: '#3b82f6', color: '#fff', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '4px solid var(--card-bg)', zIndex: 10, transition: 'transform 0.2s' }}>
                <i className="ph-fill ph-camera" style={{ fontSize: '1.2rem' }}></i>
              </div>
              <input type="file" id="photoUploadInput" accept="image/*" className="hidden" onChange={(e) => handleDocumentUpload(e, 'Photo')} />
            </div>
            {photoStatus.msg && <div className={`alert alert-${photoStatus.type}`} role="status" style={{ margin: '-0.5rem 0 1.25rem' }}>{photoStatus.msg}</div>}
            
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>{user?.name}</h2>
            <div style={{ color: '#38bdf8', fontWeight: 800, letterSpacing: '1px', marginBottom: '15px' }}>{user?.rollNo}</div>
            <div style={{ display: 'inline-block', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '6px 16px', borderRadius: '30px', fontSize: '0.85rem', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              {user?.studyStatus || 'Active'}
            </div>
            
            <div style={{ background: 'var(--input-bg)', borderRadius: '16px', padding: '1.5rem', marginTop: '2.5rem', textAlign: 'left', border: '1px solid var(--input-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', fontSize: '0.95rem' }}><i className="ph-fill ph-envelope" style={{ color: '#94a3b8', fontSize: '1.2rem' }}></i> <div style={{ color: '#fff', fontWeight: 600, wordBreak: 'break-all' }}>{user?.email}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', fontSize: '0.95rem' }}><i className="ph-fill ph-phone" style={{ color: '#94a3b8', fontSize: '1.2rem' }}></i> <div style={{ color: '#fff', fontWeight: 600 }}>{user?.phone}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', fontSize: '0.95rem' }}><i className="ph-fill ph-map-pin" style={{ color: '#94a3b8', fontSize: '1.2rem' }}></i> <div style={{ color: '#fff', fontWeight: 600 }}>{user?.homeTown && user.homeTown !== 'N/A' ? user.homeTown : 'Not Provided'}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '0.95rem' }}><i className="ph-fill ph-buildings" style={{ color: '#94a3b8', fontSize: '1.2rem' }}></i> <div style={{ color: '#fff', fontWeight: 600 }}>{user?.branch}</div></div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Info Grids */}
        <div>
          <div className="info-bento">
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: '0 0 2rem 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>Academic & Course Details</h3>
            <div className="info-bento-grid">
              <div><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Course Category</div><div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '1.05rem' }}>{user?.course || 'N/A'}</div></div>
              <div><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Study Status</div><div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '1.05rem' }}>{user?.studyStatus || 'Currently Studying'}</div></div>
              <div><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Joining Date</div><div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '1.05rem' }}>{user?.joiningDate && user.joiningDate !== 'N/A' && user.joiningDate !== 'undefined' ? (formatPortalDate(user.joiningDate) || user.joiningDate) : 'Not Provided'}</div></div>
              <div><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Qualification</div><div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '1.05rem' }}>{user?.qualification || 'Not Provided'}</div></div>
              <div><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Stream / Branch</div><div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '1.05rem' }}>{user?.stream || 'Not Provided'}</div></div>
              <div><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Experience Status</div><div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '1.05rem' }}>{user?.fresherStatus || 'Not Provided'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Placement Requirements</div><div style={{ fontWeight: 600, color: '#e2e8f0', background: 'var(--bg-dark)', padding: '15px', borderRadius: '12px', border: '1px solid var(--input-border)' }}>{user?.placementReq || 'None specified'}</div></div>
            </div>
          </div>

          <div className="info-bento">
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: '0 0 1.4rem 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>Personal information</h3>
            <div className="profile-detail-grid">
              <div><span>Age</span><strong>{user?.age && user.age !== 'N/A' ? user.age : 'Not provided'}</strong></div>
              <div><span>Gender</span><strong>{user?.gender && user.gender !== 'N/A' ? user.gender : 'Not provided'}</strong></div>
              <div><span>Parent / guardian</span><strong>{user?.parentName && user.parentName !== 'N/A' ? user.parentName : 'Not provided'}</strong></div>
              <div><span>Guardian contact</span><strong>{user?.parentContact && user.parentContact !== 'N/A' ? user.parentContact : 'Not provided'}</strong></div>
              <div><span>LinkedIn</span>{user?.linkedin && user.linkedin !== 'N/A' ? <a href={user.linkedin.startsWith('http') ? user.linkedin : `https://${user.linkedin}`} target="_blank" rel="noreferrer">View profile <i className="ph ph-arrow-square-out"></i></a> : <strong>Not provided</strong>}</div>
              <div><span>Instagram</span>{user?.instagram && user.instagram !== 'N/A' ? <a href={`https://instagram.com/${user.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">{user.instagram.startsWith('@') ? user.instagram : `@${user.instagram}`} <i className="ph ph-arrow-square-out"></i></a> : <strong>Not provided</strong>}</div>
            </div>
            <div className="profile-referrals">
              <div><span>Referral 1</span><strong>{user?.friend1Name && user.friend1Name !== 'N/A' ? user.friend1Name : 'Not provided'}</strong><small>{user?.friend1Phone && user.friend1Phone !== 'N/A' ? user.friend1Phone : 'No contact added'}</small></div>
              <div><span>Referral 2</span><strong>{user?.friend2Name && user.friend2Name !== 'N/A' ? user.friend2Name : 'Not provided'}</strong><small>{user?.friend2Phone && user.friend2Phone !== 'N/A' ? user.friend2Phone : 'No contact added'}</small></div>
            </div>
          </div>

          <div className="info-bento">
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: '0 0 2rem 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>Placement Documents</h3>
            
            <div className="doc-upload-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <i className="ph-fill ph-file-pdf" style={{ fontSize: '2.5rem', color: '#ef4444' }}></i>
                <div>
                  <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem', marginBottom: '4px' }}>Professional Resume</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Status: {user?.resume && user.resume !== 'N/A' && user.resume.includes('http') ? <span style={{color: '#10b981'}}>Uploaded Successfully</span> : 'Missing Document'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="file" id="resumeUploadInput" accept=".pdf" className="hidden" onChange={(e) => handleDocumentUpload(e, 'Resume')} />
                <button className="btn-cancel" onClick={() => document.getElementById('resumeUploadInput').click()}><i className="ph-bold ph-upload-simple"></i> Upload</button>
                {user?.resume && user.resume !== 'N/A' && user.resume.includes('http') && <a href={user.resume} target="_blank" rel="noreferrer" className="btn-action" style={{ textDecoration: 'none' }}><i className="ph-bold ph-eye"></i> View</a>}
              </div>
            </div>  
            
            <div className="doc-upload-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <i className="ph-fill ph-certificate" style={{ fontSize: '2.5rem', color: '#f59e0b' }}></i>
                <div>
                  <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem', marginBottom: '4px' }}>Course Certificate</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Status: {user?.certificate && user.certificate !== 'N/A' && user.certificate.includes('http') ? <span style={{color: '#10b981'}}>Uploaded Successfully</span> : 'Missing Document'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="file" id="certUploadInput" accept=".pdf" className="hidden" onChange={(e) => handleDocumentUpload(e, 'Certificate')} />
                <button className="btn-cancel" onClick={() => document.getElementById('certUploadInput').click()}><i className="ph-bold ph-upload-simple"></i> Upload</button>
                {user?.certificate && user.certificate !== 'N/A' && user.certificate.includes('http') && <a href={user.certificate} target="_blank" rel="noreferrer" className="btn-action" style={{ textDecoration: 'none' }}><i className="ph-bold ph-eye"></i> View</a>}
              </div>
            </div>
            {docStatus.msg && <div className={`alert alert-${docStatus.type}`}>{docStatus.msg}</div>}
          </div>
        </div>

      </div>

      {/* EDIT PROFILE MODAL */}
      {editModal && (
        <ModalPortal>
        <div className="report-modal-overlay">
          <div className="report-card" style={{ maxWidth: '750px', padding: '3rem' }}>
            <div className="modal-header-border">
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', fontWeight: 900 }}><i className="ph-fill ph-pencil-simple" style={{ color: '#38bdf8' }}></i> Update Profile Details</h3>
              <i className="ph ph-x" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '1.5rem' }} onClick={() => setEditModal(false)}></i>
            </div>
            
            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '2rem', background: 'rgba(56, 189, 248, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <strong>Secure Vault:</strong> Core ID details (Name, Roll No, Branch, Email, Course) are strictly uneditable by students to prevent database fragmentation. Contact your admin for structural corrections.
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div className="form-group"><label>Age</label><input type="number" value={epData.age} onChange={(e) => setEpData({...epData, age: e.target.value})} /></div>
              <div className="form-group"><label>Gender</label><select value={epData.gender} onChange={(e) => setEpData({...epData, gender: e.target.value})}><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
              <div className="form-group"><label>Parent / Guardian Name</label><input type="text" value={epData.parentName} onChange={(e) => setEpData({...epData, parentName: e.target.value})} /></div>
              <div className="form-group"><label>Parent Contact No.</label><input type="tel" value={epData.parentContact} onChange={(e) => setEpData({...epData, parentContact: e.target.value})} /></div>
              <div className="form-group"><label>Studying Status</label><select value={epData.studyStatus} onChange={(e) => setEpData({...epData, studyStatus: e.target.value})}><option value="Currently Studying">Currently Studying</option><option value="Completed Course">Completed Course</option></select></div>
              <div className="form-group"><label>Course Completed Date</label><input type="date" lang="en-GB" value={epData.completedDate} onChange={(e) => setEpData({...epData, completedDate: e.target.value})} /></div>
              <div className="form-group"><label>Stream</label><input type="text" value={epData.stream} onChange={(e) => setEpData({...epData, stream: e.target.value})} /></div>
              <div className="form-group"><label>Home Town</label><input type="text" value={epData.homeTown} onChange={(e) => setEpData({...epData, homeTown: e.target.value})} /></div>
              <div className="form-group"><label>Fresher Status</label><select value={epData.fresherStatus} onChange={(e) => setEpData({...epData, fresherStatus: e.target.value})}><option value="Fresher">Fresher</option><option value="Experienced">Experienced</option></select></div>
              <div className="form-group"><label>Qualification</label><input type="text" value={epData.qualification} onChange={(e) => setEpData({...epData, qualification: e.target.value})} /></div>
              <div className="form-group"><label>LinkedIn Link</label><input type="text" value={epData.linkedin} onChange={(e) => setEpData({...epData, linkedin: e.target.value})} /></div>
              <div className="form-group"><label>Instagram Handle</label><input type="text" value={epData.instagram} onChange={(e) => setEpData({...epData, instagram: e.target.value})} /></div>
            </div>
            
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Placement Requirements</label>
              <textarea rows="3" value={epData.placementReq} onChange={(e) => setEpData({...epData, placementReq: e.target.value})}></textarea>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '2rem', borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
              <button className="btn-cancel" style={{ padding: '1rem 2rem' }} onClick={() => setEditModal(false)}>Cancel</button>
              <button className="btn-action" style={{ padding: '1rem 2rem', background: '#10b981' }} onClick={handleProfileUpdate}>Save Changes</button>
            </div>
            {epStatus && <div className={`alert alert-${epStatus.type}`} style={{marginTop: '15px'}}>{epStatus.message}</div>}
          </div>
        </div>
        </ModalPortal>
      )}

    </div>
  );
}
