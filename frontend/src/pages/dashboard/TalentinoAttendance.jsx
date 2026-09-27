import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';

export default function TalentinoAttendance() {
  const { user } = useOutletContext();
  const [data, setData] = useState({ stats: {}, attendanceHistory: [], isScheduledToday: false, hasMarkedToday: false });
  const [loading, setLoading] = useState(true);

  // Form States
  const [gpsCoords, setGpsCoords] = useState(null);
  const [locStatus, setLocStatus] = useState("Click to Capture GPS Location");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [attStatus, setAttStatus] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user || !user.email) return;
    try {
      const res = await api.post('/api/dashboard/data', { 
        email: user.email, branch: user.branch, course: user.course, joiningDate: user.joiningDate 
      });
      if (res.data.success) {
        setData(res.data);
      }
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.email) return undefined;

    let cancelled = false;
    api.post('/api/dashboard/data', {
      email: user.email, branch: user.branch, course: user.course, joiningDate: user.joiningDate
    })
      .then((res) => {
        if (!cancelled && res.data.success) setData(res.data);
      })
      .catch((error) => console.error('Dashboard fetch error:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  const captureGPS = () => {
    if (!data.isScheduledToday || data.hasMarkedToday) return; 
    setLocStatus("Capturing Satellite Data...");
    
    if (!navigator.geolocation) { 
      setLocStatus("GPS Not Supported by Browser"); 
      return; 
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => { 
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); 
        setLocStatus(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (GPS Verified)`); 
      }, 
      (error) => {
        setLocStatus(error.code === 1
          ? 'GPS permission denied. Please enable location.'
          : 'Could not determine your location. Please try again.');
      }
    );
  };

  const submitAttendance = async () => {
    setAttStatus({ type: 'info', message: 'Verifying location and syncing with server...' });
    try {
      const res = await api.post('/api/dashboard/attendance', { 
        email: user.email, name: user.name, branch: user.branch, course: user.course, 
        rating, location: locStatus, userLat: gpsCoords?.lat || null, userLng: gpsCoords?.lng || null, feedback 
      });
      
      if(res.data.success) { 
        setAttStatus({ type: 'success', message: 'Attendance marked successfully!' }); 
        fetchDashboardData(); // Refresh to show "Already Marked"
      }
    } catch(err) { 
      setAttStatus({ type: 'error', message: err.response?.data?.message || 'Failed to submit attendance.' }); 
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '5rem', color: '#10b981' }}><i className="ph ph-spinner animate-spin" style={{ fontSize: '3rem' }}></i></div>;

  const totalConducted = data.stats?.totalConducted || 0;
  const attended = data.stats?.attended || 0;
  const onLeave = data.stats?.onLeave || 0;
  const percentage = totalConducted > 0 ? Math.round((attended / totalConducted) * 100) : 0;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '2.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Talentino Attendance</h2>
        <p style={{ color: '#94a3b8', fontSize: '1rem', margin: 0 }}>Securely log your daily presence via GPS Geofencing.</p>
      </div>
      
      {/* Top Stats */}
      <div className="talentino-summary-grid">
        <div className="tilt-card" style={{ padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '15px' }}>
            <i className="ph-fill ph-check-circle" style={{ color: '#10b981', fontSize: '1.4rem' }}></i> Present Check-ins
          </div>
          <div className="t-stat-num">{attended}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 700 }}>
            <span>Progress</span><span style={{ color: '#10b981' }}>{percentage}%</span>
          </div>
          <div className="t-progress-bar" style={{ marginTop: '8px' }}>
            <div className="t-progress-fill" style={{ width: `${percentage}%` }}></div>
          </div>
        </div>
        
        <div className="tilt-card" style={{ padding: '2rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '15px' }}>
            <i className="ph-fill ph-calendar-check" style={{ color: '#3b82f6', fontSize: '1.4rem' }}></i> Total Conducted
          </div>
          <div className="t-stat-num">{totalConducted}</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Sessions in your branch since joining</div>
        </div>
        
        <div className="tilt-card" style={{ padding: '2rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '15px' }}>
            <i className="ph-fill ph-coffee" style={{ color: '#f59e0b', fontSize: '1.4rem' }}></i> On Leave
          </div>
          <div className="t-stat-num">{onLeave}</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Total missed or approved leaves</div>
        </div>
      </div>

      {/* Main Action Area */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '24px', padding: '3rem 2.5rem', marginBottom: '3rem', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }}>
        
        <h3 style={{ margin: '0 0 2rem 0', fontSize: '1.5rem', color: '#fff', fontWeight: 800 }}>Initialize Today's Check-in</h3>
        
        {data.hasMarkedToday ? (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '15px', color: '#10b981', fontWeight: 700, fontSize: '1.2rem' }}>
               <i className="ph-fill ph-check-circle" style={{ fontSize: '2.5rem' }}></i> Attendance Registered for Today.
            </div>
        ) : (
            <div className="attendance-action-grid" style={{ opacity: data.isScheduledToday ? 1 : 0.5, pointerEvents: data.isScheduledToday ? 'auto' : 'none' }}>
              
              {/* Left Form Col */}
              <div>
                <div style={{ background: data.isScheduledToday ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${data.isScheduledToday ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', color: '#fff', fontWeight: 700, marginBottom: '2rem', fontSize: '1rem' }}>
                  <i className="ph-fill ph-broadcast" style={{ color: data.isScheduledToday ? '#3b82f6' : '#ef4444', fontSize: '1.6rem', animation: data.isScheduledToday ? 'pulse 2s infinite' : 'none' }}></i>
                  {data.isScheduledToday ? <span>Secure Network Active <span style={{ color: '#94a3b8', fontWeight: 500 }}>(Closes at 19:00 IST)</span></span> : <span style={{ color: '#ef4444' }}>No Session Configured for Today</span>}
                </div>
                
                <div className="form-group">
                  <label>Step 1: Geofence Verification</label>
                  <button type="button" className="attendance-gps-button" disabled={!data.isScheduledToday || data.hasMarkedToday} onClick={captureGPS} style={{ background: gpsCoords ? 'rgba(16, 185, 129, 0.15)' : 'var(--input-bg)', color: gpsCoords ? '#10b981' : 'var(--text-main)', border: `1px solid ${gpsCoords ? '#10b981' : 'var(--input-border)'}`, boxShadow: gpsCoords ? '0 0 20px rgba(16, 185, 129, 0.2)' : 'none' }}>
                    <i className="ph-fill ph-map-pin" style={{ marginRight: '10px' }}></i> {locStatus}
                  </button>
                </div>
              </div>

              {/* Right Form Col */}
              <div>
                <div className="form-group" style={{ textAlign: 'center' }}>
                  <label style={{ textAlign: 'center' }}>Step 2: Session Rating</label>
                  <div className="star-rating" role="radiogroup" aria-label="Rate today's session">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" role="radio" aria-checked={rating === s} aria-label={`${s} out of 5 stars`} className={`star ${rating >= s ? 'selected' : ''}`} onClick={() => setRating(s)}>★</button>
                    ))}
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Step 3: Feedback Log (Optional)</label>
                  <textarea rows="3" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Submit any technical issues or feedback here..."></textarea>
                </div>

                <button 
                  className="btn-action" 
                  style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', background: (data.isScheduledToday && gpsCoords && rating > 0) ? '#10b981' : 'var(--input-border)', color: (data.isScheduledToday && gpsCoords && rating > 0) ? '#fff' : '#64748b' }} 
                  disabled={!(data.isScheduledToday && gpsCoords && rating > 0)} 
                  onClick={submitAttendance}
                >
                  Confirm & Sync Attendance &rarr;
                </button>
                {attStatus && <div className={`alert alert-${attStatus.type}`} style={{marginTop: '15px'}}>{attStatus.message}</div>}
              </div>

            </div>
        )}
      </div>

      {/* History Log */}
      <h3 style={{ margin: '0 0 1.5rem 0', color: '#fff', fontWeight: 800, fontSize: '1.3rem' }}><i className="ph-bold ph-clock-counter-clockwise" style={{ color: '#38bdf8' }}></i> Audit Log</h3>
      
      <div>
         {(data.attendanceHistory || []).length === 0 ? (
           <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem', background: 'var(--card-bg)', borderRadius: '20px', border: '1px dashed var(--input-border)', fontWeight: 600 }}>No encrypted audit logs found.</div>
         ) : (
           (data.attendanceHistory || []).map((hist, idx) => {
              // Same parsing logic as your old code
              let parsedDate = hist.dateStr || "Unknown";
              const rawDate = String(hist.dateStr || '');
              let safeD = new Date(rawDate.replace(/,/g, '').replace(/\s+/g, ' ').trim());
              if (isNaN(safeD.getTime())) {
                 const parts = rawDate.split(/[-/]/);
                 if (parts.length === 3) safeD = new Date(parts[2], parts[1] - 1, parts[0]);
              }
              if (!isNaN(safeD.getTime())) parsedDate = safeD.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

              const rawTimestamp = String(hist.timestamp || '');
              const timeMatch = rawTimestamp.match(/\d{1,2}:\d{2}:\d{2}\s?(AM|PM|am|pm)/);
              const parsedTime = timeMatch ? timeMatch[0] : rawTimestamp.split(' ')[1] || '';
              
              let statusText = hist.rating >= 4 ? 'Optimal' : (hist.rating === 3 ? 'Standard' : 'Sub-Optimal');

              return (
                <div key={idx} className="history-card">
                   <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', width: '50px', height: '50px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <i className="ph-fill ph-shield-check"></i>
                      </div>
                      <div>
                         <strong style={{ display: 'block', color: '#fff', fontSize: '1.1rem', marginBottom: '4px' }}>{parsedDate}</strong>
                         <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>SYNC TIME: {parsedTime} <span style={{margin: '0 8px'}}>|</span> STATE: {statusText}</span>
                      </div>
                   </div>
                   <div style={{ color: '#f59e0b', fontSize: '1.5rem', letterSpacing: '4px', textShadow: '0 0 10px rgba(245, 158, 11, 0.4)' }}>
                      {'★'.repeat(hist.rating)}{'☆'.repeat(5 - hist.rating)}
                   </div>
                </div>
              )
           })
         )}
      </div>
    </div>
  );
}
