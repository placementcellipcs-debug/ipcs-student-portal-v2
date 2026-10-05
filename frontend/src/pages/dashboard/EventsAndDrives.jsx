import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import DriveImage from '../../components/ui/DriveImage';
import ModalPortal from '../../components/ui/ModalPortal';
import { formatPortalDate, isEventPast, parsePortalDate } from '../../utils/portalDate';

export default function EventsAndDrives() {
  const { user } = useOutletContext();
  const [data, setData] = useState({ events: [], driveRSVPs: [] });
  const [loading, setLoading] = useState(() => Boolean(user?.email));
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [clockNow, setClockNow] = useState(() => new Date());
  
  // Modal & RSVP States
  const [eventModal, setEventModal] = useState(null);
  const [rsvpStatus, setRsvpStatus] = useState(null);

  // Calendar Engine States
  const [calDate, setCalDate] = useState(new Date());
  const [view, setView] = useState('calendar');

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.email) return undefined;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) { setLoading(true); setLoadError(''); }
    });
    api.post('/api/dashboard/data', {})
      .then((res) => {
        if (cancelled) return;
        if (!res.data.success) throw new Error(res.data.message || 'Events could not be loaded.');
        setData({ events: res.data.events || [], driveRSVPs: res.data.driveRSVPs || [] });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Dashboard fetch error:', error);
        setLoadError(error.response?.data?.message || error.message || 'Events could not be loaded. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.email, reloadKey]);

  const handleEventRSVP = async (status) => {
    if (status === 'Registered' && (!user.resume || user.resume === 'N/A' || user.resume.trim() === '')) { 
      setRsvpStatus({ type: 'error', message: 'You must upload your Resume in your Profile before registering for an event.' }); 
      return; 
    }
    setRsvpStatus({ type: 'info', message: 'Recording response...' });
    try {
        const currentDriveId = eventModal.id || eventModal.title || eventModal.driveId;
        const res = await api.post('/api/dashboard/drive-response', { 
          driveId: currentDriveId, title: eventModal.title, name: user.name, phone: user.phone, 
          email: user.email, course: user.course, branch: user.branch, qualification: user.qualification, 
          resume: user.resume || "N/A", status: status, tpoBranch: user.branch 
        });
        
        if(res.data.success) { 
          setRsvpStatus({ type: 'success', message: `Status updated to: ${status}` }); 
          setData(prev => ({ 
            ...prev, 
            driveRSVPs: [...(prev.driveRSVPs || []), { driveId: currentDriveId, status: status }] 
          })); 
          setTimeout(() => { setEventModal(null); setRsvpStatus(null); }, 2000); 
        }
    } catch(error) {
      console.error('Event RSVP failed:', error);
      setRsvpStatus({ type: 'error', message: 'Failed to record response.' }); 
    }
  };

  // Calendar Math
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const blanks = Array.from({ length: getFirstDayOfMonth(calYear, calMonth) }, (_, i) => i);
  const days = Array.from({ length: getDaysInMonth(calYear, calMonth) }, (_, i) => i + 1);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const prevMonth = () => setCalDate(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCalDate(new Date(calYear, calMonth + 1, 1));
  const upcomingEvents = data.events.map((event) => ({ ...event, parsedDate: parsePortalDate(event.date || event['Date of the Event']) }))
    .filter((event) => !event.parsedDate || !isEventPast(event.date || event['Date of the Event'], event.time || event['Time of the Event'], clockNow))
    .sort((a, b) => !a.parsedDate ? 1 : !b.parsedDate ? -1 : a.parsedDate - b.parsedDate);
  const eventModalIsPast = eventModal
    ? isEventPast(eventModal.date || eventModal['Date of the Event'], eventModal.time || eventModal['Time of the Event'], clockNow)
    : false;

  if (loading) return <div style={{ textAlign: 'center', padding: '5rem', color: '#38bdf8' }}><i className="ph ph-spinner animate-spin" style={{ fontSize: '3rem' }}></i></div>;

  if (loadError) return (
    <section className="events-load-error">
      <span><i className="ph ph-calendar-x"></i></span>
      <h2>Events didn’t load</h2>
      <p>{loadError}</p>
      <button className="btn-action" type="button" onClick={() => setReloadKey((key) => key + 1)}><i className="ph ph-arrow-clockwise"></i> Try again</button>
    </section>
  );

  return (
    <div className="events-page animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '2.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Events</h2>
        <p style={{ color: '#94a3b8', fontSize: '1rem', margin: 0 }}>Discover placement drives, technical sessions, and masterclasses.</p>
      </div>

      <nav className="events-view-tabs" aria-label="Events views">
        <button type="button" className={view === 'calendar' ? 'active' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><i className="ph ph-calendar-blank"></i> Calendar</button>
        <button type="button" className={view === 'upcoming' ? 'active' : ''} aria-pressed={view === 'upcoming'} onClick={() => setView('upcoming')}><i className="ph ph-clock-countdown"></i> Upcoming events <span>{upcomingEvents.length}</span></button>
      </nav>

      {data.events.length === 0 && view === 'calendar' && (
        <div className="events-empty-note"><i className="ph ph-calendar-blank"></i><div><strong>No events are scheduled for your branch yet.</strong><span>New drives and campus sessions will appear on this calendar when they are published.</span></div></div>
      )}

      {view === 'calendar' ? <div className="cal-layout">
        
        {/* Sidebar Legend */}
        <div className="cal-sidebar">
          <div className="tilt-card" style={{ padding: '1.5rem', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)' }}>
            <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1.1rem', color: '#fff', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Event Protocols</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', fontWeight: 700, color: '#cbd5e1' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }}></div> Placement Drives
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', fontWeight: 700, color: '#cbd5e1' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#10b981', boxShadow: '0 0 10px #10b981' }}></div> Training Sessions
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', fontWeight: 700, color: '#cbd5e1' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#a855f7', boxShadow: '0 0 10px #a855f7' }}></div> General Events
              </div>
            </div>
          </div>
        </div>

        {/* Main Calendar Grid */}
        <div className="cal-main-board">
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#fff', fontWeight: 900 }}>{monthNames[calMonth]} <span style={{ color: '#38bdf8' }}>{calYear}</span></h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-cancel" style={{ padding: '0.6rem', borderRadius: '12px' }} onClick={prevMonth}><i className="ph-bold ph-caret-left" style={{ fontSize: '1.2rem' }}></i></button>
                <button className="btn-cancel" style={{ padding: '0.6rem', borderRadius: '12px' }} onClick={nextMonth}><i className="ph-bold ph-caret-right" style={{ fontSize: '1.2rem' }}></i></button>
              </div>
           </div>

           <div className="cal-grid-header"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
           <div className="cal-grid-body">
              {blanks.map(b => <div key={`blank-${b}`} className="cal-day-cell" style={{opacity: 0.1}}></div>)}
              {days.map(d => {
                  const dayEvents = (data.events || []).filter(ev => {
                      const ed = parsePortalDate(ev.date || ev['Date of the Event']); 
                      if(!ed) return false; 
                      return ed.getDate() === d && ed.getMonth() === calMonth && ed.getFullYear() === calYear;
                  });
                  const isToday = new Date().getDate() === d && new Date().getMonth() === calMonth && new Date().getFullYear() === calYear;

                  return (
                      <div key={`day-${d}`} className={`cal-day-cell ${isToday ? 'today' : ''}`}>
                          <div className="cal-day-number">{d}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {dayEvents.map((ev, i) => {
                                let typeColor = '#a855f7'; // General
                                let evType = (ev.type || ev.Event || '').toLowerCase();
                                if (evType.includes('drive') || evType.includes('placement')) typeColor = '#3b82f6';
                                else if (evType.includes('train')) typeColor = '#10b981';
                                
                                return (
                                    <div key={i} className="cal-event-pill" style={{ background: `${typeColor}22`, border: `1px solid ${typeColor}66`, color: typeColor }} onClick={() => {setEventModal(ev); setRsvpStatus(null);}}>
                                        <div className="pill-dot" style={{ background: typeColor }}></div>{ev.title || ev.Title}
                                    </div>
                                )
                            })}
                          </div>
                      </div>
                  )
              })}
           </div>
        </div>

      </div> : <section className="upcoming-events-list" aria-label="Upcoming events">
        {upcomingEvents.length ? upcomingEvents.map((event, index) => (
          <button type="button" className="upcoming-event-card" key={event.id || event['Drive ID'] || `${event.title}-${index}`} onClick={() => { setEventModal(event); setRsvpStatus(null); }}>
            <span className="upcoming-event-date-label">{formatPortalDate(event.date || event['Date of the Event']) || 'Date to be announced'}</span>
            <strong>{event.title || event.Title || 'IPCS event'}</strong>
            <span>{event.type || event.Event || 'General event'}{(event.time || event['Time of the Event']) ? ` · ${event.time || event['Time of the Event']}` : ''}</span>
            <span>{event.location || event['Event Hapening in'] || 'Location to be announced'} <i className="ph ph-arrow-up-right"></i></span>
          </button>
        )) : <div className="events-empty-note"><i className="ph ph-calendar-blank"></i><div><strong>No upcoming events.</strong><span>New branch events and placement drives will show here.</span></div></div>}
      </section>}

      {/* EVENT MODAL */}
      {eventModal && (
        <ModalPortal>
        <div className="report-modal-overlay event-modal-overlay" onClick={() => setEventModal(null)}>
           <div className="report-card event-modal-card" role="dialog" aria-modal="true" aria-labelledby="event-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="event-modal-header">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 id="event-modal-title" style={{ margin: '0 12px 10px 0', color: 'var(--text-main)', fontSize: '1.6rem', lineHeight: 1.2 }}>{eventModal.title || eventModal.Title}</h3>
                    <button type="button" className="event-modal-close" aria-label="Close event details" onClick={() => setEventModal(null)}><i className="ph ph-x"></i></button>
                 </div>
                 <div style={{ display: 'inline-block', padding: '6px 14px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {eventModal.type || eventModal.Event}
                 </div>
              </div>

              <div className="event-modal-body">
                  {!eventModalIsPast && (eventModal.posterLink || eventModal['Poster Link']) && <DriveImage className="event-modal-poster" src={eventModal.posterLink || eventModal['Poster Link']} alt={`${eventModal.title || eventModal.Title} poster`} />}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', background: 'var(--input-bg)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--input-border)', marginBottom: '1.5rem' }}>
                      <div><strong style={{ display:'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform:'uppercase', marginBottom: '4px' }}>Date</strong><span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{formatPortalDate(eventModal.date || eventModal['Date of the Event']) || eventModal.date || eventModal['Date of the Event'] || 'TBA'}</span></div>
                      <div><strong style={{ display:'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform:'uppercase', marginBottom: '4px' }}>Time</strong><span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{eventModal.time || eventModal['Time of the Event'] || 'TBA'}</span></div>
                      <div style={{ gridColumn: '1 / -1' }}><strong style={{ display:'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform:'uppercase', marginBottom: '4px' }}>Location</strong><span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '1rem' }}>{eventModal.location || eventModal['Event Hapening in'] || 'TBA'}</span></div>
                  </div>
                  
                  {(eventModal.description || eventModal.Description) && (
                      <div style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {eventModal.description || eventModal.Description}
                      </div>
                  )}

                  {(() => {
                      const isPast = eventModalIsPast;
                      
                      const driveId = eventModal.id || eventModal.title || eventModal['Drive ID'];
                      const userRSVP = data.driveRSVPs?.find(r => r.driveId === driveId);
                      
                      if (userRSVP) {
                          const statusColor = userRSVP.status.toLowerCase() === 'registered' ? '#10b981' : '#ef4444';
                          const statusIcon = userRSVP.status.toLowerCase() === 'registered' ? 'ph-check-circle' : 'ph-x-circle';
                          return (
                              <div style={{ padding: '1.2rem', background: `${statusColor}15`, color: statusColor, textAlign: 'center', borderRadius: '12px', fontWeight: 700, border: `1px solid ${statusColor}44`, fontSize: '1.1rem' }}>
                                  <i className={`ph-fill ${statusIcon}`} style={{ marginRight: '8px', fontSize: '1.4rem', verticalAlign: 'middle' }}></i> 
                                  RSVP Confirmed: {userRSVP.status}
                              </div>
                          );
                      }

                      if (isPast) {
                          return (
                              <div style={{ padding: '1.2rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', textAlign: 'center', borderRadius: '12px', fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '1.1rem' }}>
                                  <i className="ph-fill ph-lock-key" style={{ marginRight: '8px', fontSize: '1.4rem', verticalAlign: 'middle' }}></i> 
                                  Event has concluded. Registrations closed.
                              </div>
                          );
                      }

                      const eType = (eventModal.type || eventModal.Event || '').toLowerCase();
                      if (eType.includes('drive') || eType.includes('placement')) {
                          return (
                              <div style={{ display: 'flex', gap: '15px' }}>
                                  <button className="btn-cancel" style={{ flex: 1, padding: '1.2rem', fontSize: '1rem', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }} onClick={() => handleEventRSVP('Not Interested')}><i className="ph-bold ph-x-circle"></i> Decline</button>
                                  <button className="btn-action" style={{ flex: 2, background: '#10b981', padding: '1.2rem', fontSize: '1rem' }} onClick={() => handleEventRSVP('Registered')}><i className="ph-bold ph-check-circle"></i> Secure RSVP Slot</button>
                              </div>
                          );
                      }
                      return null; 
                  })()}
                  
                  {rsvpStatus && <div className={`alert alert-${rsvpStatus.type}`} style={{marginTop: '20px'}}>{rsvpStatus.message}</div>}
              </div>
           </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
