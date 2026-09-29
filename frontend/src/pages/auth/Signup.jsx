import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import api from '../../config/axios';
import ipcsGlobalLogo from '../../assets/ipcs-global-logo.png';
import ModalPortal from '../../components/ui/ModalPortal';


const sanitizePhoneNumber = (val) => {
  if (!val) return '';
  let digits = String(val).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits.slice(-10);
};

export default function Signup() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  
  const [courseList, setCourseList] = useState([]);
  const [branchList, setBranchList] = useState([]);
  const [isFetchingData, setIsFetchingData] = useState(true);

  useEffect(() => {
    const fetchDynamicData = async () => {
      try {
        const courseRes = await api.get('/api/auth/courses');
        if (courseRes.data && courseRes.data.success) {
            setCourseList(courseRes.data.groupedCourses);
        }
      } catch (err) {
          console.error("Failed to fetch courses", err);
      }
      
      try {
        const branchRes = await api.get('/api/auth/branches');
        if (branchRes.data && branchRes.data.success) {
            setBranchList(branchRes.data.groupedBranches);
        }
      } catch (err) {
          console.error("Failed to fetch branches", err);
      }
      
      setIsFetchingData(false);
    };
    fetchDynamicData();
  }, []);

  const [showTncModal, setShowTncModal] = useState(false); 
  const [tncScrolled, setTncScrolled] = useState(false); 
  const [tncAccepted, setTncAccepted] = useState(false);
  
  const [showCropModal, setShowCropModal] = useState(false); 
  const [imageSrc, setImageSrc] = useState(null); 
  const [crop, setCrop] = useState({ x: 0, y: 0 }); 
  const [zoom, setZoom] = useState(1); 
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null); 
  const [finalPhotoBase64, setFinalPhotoBase64] = useState('');

  const [formData, setFormData] = useState({ 
      rollNo: '', name: '', phone: '', email: '', age: '', gender: '', branch: '', course: '', 
      joiningDate: '', fresherStatus: '', homeTown: '', linkedin: '', instagram: '', placementReq: '', 
      parentName: '', parentContact: '', friend1Name: '', friend1Phone: '', friend2Name: '', friend2Phone: '', 
      password: '', confirmPassword: '', qualification: '', customQualification: '', stream: '', customStream: '' 
  });

  const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onFileChange = async (e) => { 
      if (e.target.files && e.target.files.length > 0) { 
          const file = e.target.files[0]; 
          const reader = new FileReader(); 
          reader.addEventListener('load', () => { 
              setImageSrc(reader.result); 
              setShowCropModal(true); 
          }); 
          reader.readAsDataURL(file); 
      } 
  };
  
  const onCropComplete = (croppedArea, croppedPixels) => { 
      setCroppedAreaPixels(croppedPixels); 
  };

  const generateCroppedImage = () => {
    if (!croppedAreaPixels || !imageSrc) return;
    
    const canvas = document.createElement('canvas'); 
    const image = new Image(); 
    image.src = imageSrc;
    
    image.onload = () => { 
        canvas.width = 250; 
        canvas.height = 250; 
        const ctx = canvas.getContext('2d'); 
        ctx.drawImage( 
            image, 
            croppedAreaPixels.x, 
            croppedAreaPixels.y, 
            croppedAreaPixels.width, 
            croppedAreaPixels.height, 
            0, 
            0, 
            250, 
            250 
        ); 
        setFinalPhotoBase64(canvas.toDataURL('image/jpeg')); 
        setShowCropModal(false); 
    };
  };

  const handleTncScroll = (e) => { 
      const bottom = e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 25; 
      if (bottom) setTncScrolled(true); 
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (status && status.type === 'info') return; 
    
    const cleanPhone = sanitizePhoneNumber(formData.phone);
    const cleanF1 = sanitizePhoneNumber(formData.friend1Phone);
    const cleanF2 = sanitizePhoneNumber(formData.friend2Phone);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setStatus({ type: 'error', message: 'Please enter a valid email format.' }); return; }
    if (cleanPhone.length !== 10) { setStatus({ type: 'error', message: 'Your phone number must be exactly 10 digits.' }); return; }
    if (cleanF1.length !== 10 || cleanF2.length !== 10) { setStatus({ type: 'error', message: 'Referral phone numbers must be exactly 10 digits.' }); return; }
    if (cleanF1 === cleanF2) { setStatus({ type: 'error', message: 'Friend 1 and Friend 2 referral phone numbers cannot be the same.' }); return; }
    if (formData.password !== formData.confirmPassword) { setStatus({ type: 'error', message: 'Passwords do not match!' }); return; }
    if (!tncAccepted) { setStatus({ type: 'error', message: 'You must accept the Terms & Conditions.' }); return; }

    const resolvedQualification = formData.qualification === 'Other' ? formData.customQualification : formData.qualification;
    const resolvedStream = formData.stream === 'Other' ? formData.customStream : formData.stream;

    if (!resolvedQualification.trim()) { setStatus({ type: 'error', message: 'Please specify your qualification.' }); return; }
    if (!finalPhotoBase64) { setStatus({ type: 'error', message: 'Profile Photo is mandatory. Please upload a photo.' }); return; }

    const finalRollNo = `IPCS - ${formData.rollNo.trim()}`;

    setStatus({ type: 'info', message: 'Uploading photo & registering account...' });
    
    const payload = { 
        ...formData, 
        phone: cleanPhone, 
        friend1Phone: cleanF1, 
        friend2Phone: cleanF2, 
        rollNo: finalRollNo, 
        qualification: resolvedQualification, 
        stream: resolvedStream, 
        photoBase64: finalPhotoBase64 
    };

    try {
      const response = await api.post('/api/auth/register', payload);
      if (response.data.success) { 
          setStatus({ type: 'success', message: 'Account created! Redirecting to login...' }); 
          setTimeout(() => navigate('/'), 2500); 
      }
    } catch (error) { 
        setStatus({ type: 'error', message: error.response?.data?.message || 'Server Error.' }); 
    }
  };
  
  return (
    <div className="auth-wrapper" style={{ background: '#0b0f17' }}>
      <div className="profile-reg-card">
        <div className="reg-header">
          <div>
              <h2 style={{ margin: '0 0 4px 0' }}>Create Student Profile</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Register records, course details, and placement preferences</p>
          </div>
          <div className="brand-logo-container" style={{ marginBottom: 0 }}>
              <img src={ipcsGlobalLogo} alt="IPCS Global" style={{ height: '38px', width: '110px', objectFit: 'contain' }} />
          </div>
        </div>

        <form onSubmit={handleSignup}>
          <div className="section-title" style={{ color: '#38bdf8' }}><i className="ph ph-user" style={{ fontSize: '1.2rem' }}></i> PRIMARY DETAILS</div>
          <div className="primary-layout-row">
            <div className="avatar-upload-box" onClick={() => document.getElementById('photoUpload').click()}>
              <input type="file" id="photoUpload" accept="image/*" className="hidden" onChange={onFileChange} />
              <div className="avatar-preview-circle">
                  {finalPhotoBase64 ? <img src={finalPhotoBase64} alt="Profile" /> : (formData.name ? formData.name.charAt(0).toUpperCase() : 'U')}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>Tap to Upload</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2col">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>IPCS Roll Number *</label>
                  <div style={{ display: 'flex', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '10px', overflow: 'hidden' }}>
                    <span style={{ padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.05)', borderRight: '1px solid var(--input-border)', color: 'var(--text-muted)', fontWeight: 700 }}>IPCS -</span>
                    <input type="text" name="rollNo" placeholder="XXXXXX" onChange={handleChange} required style={{ border: 'none', borderRadius: 0, backgroundColor: 'transparent' }} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Full Name *</label>
                    <input type="text" name="name" placeholder="e.g. Vishnu Kumar" onChange={handleChange} required />
                </div>
              </div>
              <div className="grid-2col">
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Phone Number *</label>
                    <input type="tel" name="phone" placeholder="10 Digit Number" onChange={handleChange} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Email ID *</label>
                    <input type="email" name="email" placeholder="student@ipcsglobal.com" onChange={handleChange} required />
                </div>
              </div>
            </div>
          </div>

          <div className="grid-3col" style={{ marginTop: '1.1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Age</label>
                <input type="number" name="age" placeholder="e.g. 22" onChange={handleChange} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Gender</label>
                <select name="gender" onChange={handleChange} defaultValue="">
                    <option value="" disabled>Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Branch Campus *</label>
              <select name="branch" onChange={handleChange} defaultValue="" required>
                <option value="" disabled>{isFetchingData ? "Loading Branches..." : "Select Branch"}</option>
                {branchList?.map((group, idx) => (
                  <optgroup key={idx} label={group?.region || "Region"}>
                    {group?.branches?.map((bName, bIdx) => (
                      <option key={bIdx} value={bName}>{bName}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2col" style={{ marginTop: '1.1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Parent/Guardian Name</label>
                <input type="text" name="parentName" placeholder="Full Name" onChange={handleChange} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Parent Contact No.</label>
                <input type="tel" name="parentContact" placeholder="10 Digit Number" onChange={handleChange} />
            </div>
          </div>

          <div className="section-title" style={{ color: '#4ade80', marginTop: '2rem' }}><i className="ph ph-graduation-cap" style={{ fontSize: '1.2rem' }}></i> ACADEMIC & COURSE DETAILS</div>
          <div className="grid-3col">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Course Category *</label>
              <select name="course" onChange={handleChange} defaultValue="" required>
                <option value="" disabled>{isFetchingData ? "Loading Courses..." : "Select Course Category"}</option>
                {courseList?.map((group, idx) => (
                  <optgroup key={idx} label={group?.category || "Category"}>
                    {group?.courses?.map((cName, cIdx) => (<option key={cIdx} value={cName}>{cName}</option>))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Joining Date *</label>
                <input type="date" name="joiningDate" onChange={handleChange} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Qualification *</label>
              <select name="qualification" onChange={handleChange} defaultValue="" required>
                <option value="" disabled>Select Qualification</option>
                <option value="SSLC">SSLC</option><option value="HSE">HSE</option><option value="ITI">ITI</option>
                <option value="Diploma">Diploma</option><option value="B.Tech">B.Tech</option><option value="Bsc">Bsc</option>
                <option value="PG">PG</option><option value="Other">Other</option>
              </select>
              {formData.qualification === 'Other' && (<input type="text" name="customQualification" placeholder="Specify Qualification" onChange={handleChange} required style={{ marginTop: '0.6rem' }} />)}
            </div>
          </div>

          <div className="grid-3col" style={{ marginTop: '1.1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Stream / Branch *</label>
              <select name="stream" onChange={handleChange} defaultValue="" required>
                <option value="" disabled>Select Stream</option>
                <option value="IT">IT</option><option value="EEE">EEE</option><option value="EC">EC</option>
                <option value="Mechanical">Mechanical</option><option value="Science">Science</option><option value="Other">Other</option>
              </select>
              {formData.stream === 'Other' && (<input type="text" name="customStream" placeholder="Specify Stream / Branch" onChange={handleChange} required style={{ marginTop: '0.6rem' }} />)}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Experience Status *</label>
                <select name="fresherStatus" onChange={handleChange} defaultValue="" required>
                    <option value="" disabled>Select Status</option>
                    <option value="Fresher">Fresher</option>
                    <option value="Experienced">Experienced</option>
                </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Home Town *</label>
                <input type="text" name="homeTown" placeholder="e.g. Kozhikode" onChange={handleChange} required />
            </div>
          </div>

          <div className="grid-2col" style={{ marginTop: '1.1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>LinkedIn Link</label>
                <input type="text" name="linkedin" placeholder="www.linkedin.com/in/..." onChange={handleChange} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Instagram Handle</label>
                <input type="text" name="instagram" placeholder="@username" onChange={handleChange} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '1.1rem' }}>
              <label>Placement Requirements</label>
              <textarea name="placementReq" rows="2" placeholder="Preferred location, salary expectation..." onChange={handleChange}></textarea>
          </div>

          <div className="section-title" style={{ color: '#c084fc', marginTop: '2rem' }}><i className="ph ph-users" style={{ fontSize: '1.2rem' }}></i> REFERRALS & SECURITY CREDENTIALS</div>
          <div className="grid-2col">
            <div style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
              <span style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 700, display: 'block', marginBottom: '0.6rem', textTransform: 'uppercase' }}>FRIEND 1 REFERRAL *</span>
              <input type="text" name="friend1Name" placeholder="Full Name" style={{ marginBottom: '0.6rem' }} onChange={handleChange} required />
              <input type="tel" name="friend1Phone" placeholder="10 Digit Contact Number" onChange={handleChange} required />
            </div>
            <div style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
              <span style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 700, display: 'block', marginBottom: '0.6rem', textTransform: 'uppercase' }}>FRIEND 2 REFERRAL *</span>
              <input type="text" name="friend2Name" placeholder="Full Name" style={{ marginBottom: '0.6rem' }} onChange={handleChange} required />
              <input type="tel" name="friend2Phone" placeholder="10 Digit Contact Number" onChange={handleChange} required />
            </div>
          </div>

          <div className="grid-2col" style={{ marginTop: '1.1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Password *</label>
              <div className="pwd-wrapper">
                <input type={showPassword ? "text" : "password"} name="password" placeholder="Create account password" onChange={handleChange} required style={{ paddingRight: '40px' }} />
                <span className="pwd-toggle" onClick={() => setShowPassword(!showPassword)}><i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`}></i></span>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Confirm Password *</label>
              <div className="pwd-wrapper">
                  <input type={showPassword ? "text" : "password"} name="confirmPassword" placeholder="Re-enter password" onChange={handleChange} required style={{ paddingRight: '40px' }} />
              </div>
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '20px' }}>
            <input type="checkbox" style={{ width: '22px', height: '22px', flexShrink: 0, marginTop: '3px', cursor: tncScrolled ? 'pointer' : 'not-allowed', opacity: tncScrolled ? 1 : 0.5 }} checked={tncAccepted} disabled={!tncScrolled} onChange={(e) => setTncAccepted(e.target.checked)} />
            <label style={{ margin: 0, fontSize: '0.85rem', textTransform: 'none', lineHeight: 1.4, opacity: tncScrolled ? 1 : 0.7 }}>
              I have read and accepted the <span className="tnc-link" onClick={() => setShowTncModal(true)}>Terms & Conditions</span>
              {!tncScrolled && <span style={{display: 'block', fontSize: '0.75rem', color: '#f59e0b', marginTop: '2px'}}>(Please open and read the terms to enable this checkbox)</span>}
            </label>
          </div>

          {status && <div className={`alert alert-${status.type}`}>{status.message}</div>}

          <div className="form-footer-bar">
            <button type="button" className="btn-cancel" onClick={() => navigate('/')}>Cancel</button>
            <button type="submit" className="btn-action" disabled={status && status.type === 'info'} style={{ padding: '0.8rem 2rem', background: (status && status.type === 'info') ? '#475569' : '#2563eb' }}>
              {(status && status.type === 'info') ? 'Creating...' : 'Create Account \u2192'}
            </button>
          </div>
        </form>
      </div>

      {showCropModal && (
        <ModalPortal>
        <div className="report-modal-overlay">
          <div className="report-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header-border">
              <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Adjust Profile Photo</h3>
              <i className="ph ph-x" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowCropModal(false)}></i>
            </div>
            <div style={{ position: 'relative', width: '100%', height: '250px', background: '#333', borderRadius: '12px', overflow: 'hidden' }}>
              <Cropper 
                  image={imageSrc} 
                  crop={crop} 
                  zoom={zoom} 
                  aspect={1} 
                  cropShape="round" 
                  onCropChange={setCrop} 
                  onZoomChange={setZoom} 
                  onCropComplete={onCropComplete} 
              />
            </div>
            <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(e.target.value)} style={{ margin: '20px 0', width: '100%' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-action" style={{ flex: 1, background: '#22c55e' }} onClick={generateCroppedImage}>Confirm Photo</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {showTncModal && (
        <ModalPortal>
        <div className="report-modal-overlay">
          <div className="report-card" style={{ maxWidth: '650px' }}>
            <div className="modal-header-border">
              <h3 style={{ margin: 0, color: 'var(--text-main)' }}>IPCS Placement Rule Set</h3>
              <i className="ph ph-x" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowTncModal(false)}></i>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '1.5rem' }}>Below mentioned are the Rules to be followed by students for getting Placement Support from IPCS. Please scroll to the bottom to accept.</p>
            <div className="tnc-content-box" onScroll={handleTncScroll}>
              <h4>ELIGIBILITY CRITERIA FOR ATTENDING THE INTERVIEWS</h4><ul><li>Students who have completed at least 90% of the course.</li><li>Students who have paid the full fees.</li><li>Students who have passion for working & take their career seriously.</li><li>Candidates should be ready for any location.</li></ul>
              <h4>DOS & DON’TS FOR THE CANDIDATES</h4><strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>During Job applications & Interview:</strong><ul><li>Check all criteria mentioned in the employment news, if everything suits to you then only APPLY.</li><li>Students should attend the interview on the date and time as allotted.</li><li>It is mandatory for Students to update the placement coordinator of their attendance.</li><li>Students not attending 3 interviews will be barred from Placement Support.</li><li>Students not applying for more than 15 days with a valid reason will be removed.</li></ul>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>During Joining:</strong><ul><li>Students after being selected & given a date to join should adhere to that.</li><li>2 times after accepting the offer and not joining will be considered a Black Mark.</li><li>1 year commitment to the company getting recruited is mandatory.</li></ul>
              <h4>DECLARATION</h4><p>I hereby declare that I have read & understood the terms & conditions of IPCS Placement Cell. I adhere to follow the rules & incase of any failure to do so; I understand that I won’t be eligible for Placement Support.</p>
            </div>
            {!tncScrolled ? (
              <div style={{ textAlign: 'center', color: '#f59e0b', fontSize: '0.88rem', fontWeight: 700, marginTop: '15px' }}>↓ Please scroll to the end of the rules to Accept ↓</div>
            ) : (
              <div style={{ display: 'flex', marginTop: '20px' }}>
                <button type="button" className="btn-action" style={{ width: '100%', background: '#22c55e' }} onClick={() => { setTncScrolled(true); setTncAccepted(true); setShowTncModal(false); }}>Accept & Enable Checkbox</button>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
