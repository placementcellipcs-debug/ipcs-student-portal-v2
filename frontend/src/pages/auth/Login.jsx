import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/axios';
import Counter from '../../components/ui/Counter';

// Import Assets
import loadingVideo from '../../assets/video.mp4';
import talenzoLogo from '../../assets/TALENZO111.png';

const GLOBAL_LOGO_URL = 'https://lh3.googleusercontent.com/d/1VqmH9-l2lBHErJPW1tCjtCu-SrTEMPtN';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [fadeVideo, setFadeVideo] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const transitionStarted = useRef(false);
  const fallbackTimer = useRef(null);
  const navigationTimer = useRef(null);

  const [showAuthForm, setShowAuthForm] = useState(false);

  const [liveUpdates] = useState([
    { name: "Anand Manikantan", role: "Data Analyst & Python Developer" },
    { name: "Sreejith S", role: "Automation Engineer" },
    { name: "Akhil Krishnan", role: "Embedded Systems Intern" },
    { name: "Mohammed Sinan", role: "Digital Marketing Executive" },
    { name: "Vishnu Kumar", role: "PLC Programmer" }
  ]);
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    if (liveUpdates.length > 0) {
      const interval = setInterval(() => {
        setTickerIndex((prev) => (prev + 1) % liveUpdates.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [liveUpdates.length]);

  const setSafeLocalStorage = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("LocalStorage write failed:", e);
    }
  };

  const finishLoginTransition = () => {
    if (transitionStarted.current) return;
    transitionStarted.current = true;
    window.clearTimeout(fallbackTimer.current);
    setFadeVideo(true);
    navigationTimer.current = window.setTimeout(() => navigate('/dashboard'), 550);
  };

  useEffect(() => () => {
    window.clearTimeout(fallbackTimer.current);
    window.clearTimeout(navigationTimer.current);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) { 
        setStatus({ type: 'error', message: 'Please enter both email and password.' }); 
        return; 
    }
    setStatus({ type: 'info', message: 'Verifying credentials...' });

    try {
      // Using our configured Axios instance
      const response = await api.post('/api/auth/login', { email, password });
      
      if (response.data.success) {
        setSafeLocalStorage('talentino_student_token', response.data.token);
        setSafeLocalStorage('talentino_student_user', response.data.user);
        
        transitionStarted.current = false;
        setFadeVideo(false);
        setIsVideoReady(false);
        setIsLoggingIn(true);
        fallbackTimer.current = window.setTimeout(finishLoginTransition, 12_000);
      }
    } catch (error) {
      setStatus({ type: 'error', message: error.response?.data?.message || 'Server Error. Is the backend running?' });
    }
  };

  if (isLoggingIn) {
    return (
      <div className={`video-loader-overlay ${fadeVideo ? 'fade-out' : ''}`}>
        <video
          src={loadingVideo}
          autoPlay
          muted
          playsInline
          preload="auto"
          onLoadedData={() => setIsVideoReady(true)}
          onCanPlay={() => setIsVideoReady(true)}
          onEnded={finishLoginTransition}
          onError={() => { setIsVideoReady(true); finishLoginTransition(); }}
          className={isVideoReady ? 'ready' : ''}
          aria-hidden="true"
        />
        <div className="login-loader-desktop" role="status" aria-live="polite">
          <img src={GLOBAL_LOGO_URL} alt="IPCS Global" />
          <div className="login-loader-desktop-copy">
            <span>Welcome to IPCS Global</span>
            <h1>Your learning space is ready.</h1>
            <p>Loading your classes, student resources, and placement journey.</p>
            <div className="login-loader-progress"><i></i></div>
            <small>Preparing your dashboard…</small>
          </div>
          <div className="login-loader-desktop-mark"><i className="ph-fill ph-graduation-cap"></i><span>Student Portal</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-wrapper" style={{ position: 'relative' }}>
      <div className="animate-pulse-glow" style={{ position: 'absolute', top: '25%', left: '5%', width: '380px', height: '380px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '50%', filter: 'blur(80px)', zIndex: 0, pointerEvents: 'none' }}></div>
      <div className="login-ambient-orb login-ambient-orb-one" aria-hidden="true"></div>
      <div className="login-ambient-orb login-ambient-orb-two" aria-hidden="true"></div>
      <div className="login-grid-glow" aria-hidden="true"></div>

      <div className="landing-nav">
        <img src={GLOBAL_LOGO_URL} alt="Talenzo" style={{ height: '50px', objectFit: 'contain' }} />
      </div>
      
      <div className="landing-grid">
        <div className="hero-section login-copy-animate">
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '1.5rem' }}>
            <span style={{ position: 'relative', display: 'flex', width: '14px', height: '14px', flexShrink: 0, marginTop: '-20px' }}>
              <span className="animate-ping" style={{ position: 'absolute', display: 'inline-flex', height: '100%', width: '100%', borderRadius: '50%', background: '#38bdf8', opacity: 0.75 }}></span>
              <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', height: '14px', width: '14px', background: '#38bdf8' }}></span>
            </span>
            
            <img className="login-brand-animate" src={talenzoLogo} alt="Talenzo: Connecting Talent with Opportunity" style={{ height: '110px', objectFit: 'contain' }} />
          </div>
          
          <h1 className="hero-title">Unlock Global Tech<br/><span style={{ color: '#38bdf8' }}>Careers with IPCS</span></h1>
          <p className="hero-desc">IPCS Global connects future-ready talent in Industrial Automation, Embedded Systems, IoT, and Digital Tech with leading blue-chip global firms. Experience zero-barrier career transitions.</p>
          <button className="btn-glow" onClick={() => setShowAuthForm(true)}>Login / Signup <i className="ph-bold ph-caret-right"></i></button>
          
          <div className="ticker-container">
            <div className="ticker-icon animate-bounce"><i className="ph-fill ph-lightning"></i></div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>Live Hiring Updates</div>
              <div key={tickerIndex} className="ticker-animate" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {liveUpdates.length > 0 ? (
                  <span>{liveUpdates[tickerIndex].name} got hired as a {liveUpdates[tickerIndex].role}.</span>
                ) : (
                  <span>Loading recent placements...</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="right-panel-wrapper">
          {!showAuthForm ? (
            <div className="hiring-dashboard-card animate-fade-in animate-float login-card-animate">
              <div className="hiring-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div className="hover-scale" style={{ background: '#0284c7', color: '#ffffff', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                    <i className="ph-fill ph-lightning"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#ffffff' }}>Hiring Dashboard</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Realtime Campus Intake</span>
                  </div>
                </div>
                <div className="animate-opacity-pulse" style={{ border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', padding: '6px 14px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px' }}>
                  ACTIVE STAGE
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="hiring-stat-box">
                  <div className="hover-scale" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}><i className="ph-fill ph-users"></i></div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Students Hired</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                      <Counter target={1.5} suffix=" M +" isDecimal={true} />
                    </div>
                  </div>
                </div>
                <div className="hiring-stat-box">
                  <div className="hover-scale" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}><i className="ph-fill ph-buildings"></i></div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Enterprise Recruiters</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                      <Counter target={25} suffix=" K +" />
                    </div>
                  </div>
                </div>
                <div className="hiring-stat-box">
                  <div className="hover-scale" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}><i className="ph-fill ph-medal"></i></div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Presence Across Countries</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                      <Counter target={50} suffix=" +" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="auth-card animate-fade-in login-form-animate">
              <div className="brand-logo-container"><img src={GLOBAL_LOGO_URL} alt="IPCS Global Logo" className="auth-logo-img" /></div>
              <h2 style={{ textAlign: 'center', margin: '0 0 6px 0', color: '#ffffff' }}>Welcome</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center', marginBottom: '1.8rem' }}>Sign in to continue to your student portal</p>
              <form onSubmit={handleLogin}>
                <div className="form-group"><label>Email ID</label><input type="email" placeholder="student@ipcsglobal.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="form-group"><label>Password</label>
                  <div className="pwd-wrapper">
                    <input type={showPassword ? "text" : "password"} placeholder="Enter password" style={{ paddingRight: '40px' }} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <span className="pwd-toggle" onClick={() => setShowPassword(!showPassword)}><i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`}></i></span>
                  </div>
                </div>
                <button type="submit" className="btn-action" style={{ width: '100%', marginTop: '0.8rem', padding: '1rem', borderRadius: '10px' }}>Sign in &rarr;</button>
              </form>
              {status && <div className={`alert alert-${status.type}`}>{status.message}</div>}
              <div className="switch-mode">Don't have an account? <span onClick={() => navigate('/signup')}>Create account</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
