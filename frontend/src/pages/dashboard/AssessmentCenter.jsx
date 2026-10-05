import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import ModalPortal from '../../components/ui/ModalPortal';
import { formatPortalDateTime } from '../../utils/portalDate';

export default function AssessmentCenter() {
  const { user } = useOutletContext();
  
  const [view, setView] = useState('hub'); // hub, transition, live, result, review
  const [activeExamType, setActiveExamType] = useState('aptitude'); 
  const [selectedTestNum, setSelectedTestNum] = useState(1);
  
  // Data States
  const [leaderboard, setLeaderboard] = useState([]);
  const [aptHistory, setAptHistory] = useState([]);
  const [talHistory, setTalHistory] = useState([]);
  const [techHistory, setTechHistory] = useState([]);
  const [levelData, setLevelData] = useState({ 1: [], 2: [], 3: [] });
  const [viewingResult, setViewingResult] = useState(null);
  const [examSessionId, setExamSessionId] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);

  // Live Exam States
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [testTimeLeft, setTestTimeLeft] = useState(0);
  const [globalTimeSpent, setGlobalTimeSpent] = useState(0);
  const [isSurrendered, setIsSurrendered] = useState(false);

  const fetchHubData = useCallback(() => {
    if (!user || !user.email) return;
    
    api.get('/api/dashboard/aptitude/leaderboard')
      .then(res => { if (res.data.success) setLeaderboard(res.data.leaderboard); })
      .catch((error) => console.error('Failed to load aptitude leaderboard:', error));
      
    api.post('/api/dashboard/aptitude/history')
      .then(res => { 
        if (res.data.success) {
            const history = res.data.history || [];
            setAptHistory(history.filter((item) => item.type === 'aptitude'));
            setTalHistory(history.filter(h => h.type === 'talentino' || (!h.type && h.levelReached?.includes("Test"))));
            setTechHistory(history.filter(h => h.type === 'technical' || (!h.type && h.levelReached === user.course)));
        }
      }).catch((error) => console.error('Failed to load assessment history:', error));
  }, [user]);

  const submitFinalScore = useCallback(async (finalLevel, surrenderFlag = false) => {
    try {
      setIsSurrendered(surrenderFlag);
      setView('result');
      if (!examSessionId) throw new Error('This test session has expired. Please start again.');
      const endpoint = activeExamType === 'aptitude' ? '/api/dashboard/aptitude/submit' : '/api/dashboard/exam/submit';
      const response = await api.post(endpoint, {
        sessionId: examSessionId,
        answers: userAnswers,
        ...(activeExamType === 'aptitude' ? { finalLevel } : {}),
      });
      if (!response.data.success) throw new Error(response.data.message || 'Could not save your score.');
      setSubmissionResult(response.data);
      setExamSessionId(null);
    } catch (error) {
      console.error('Assessment submission failed:', error);
      setSubmissionResult({ error: error.response?.data?.message || error.message || 'Could not save your score.' });
      setExamSessionId(null);
    }
  }, [activeExamType, examSessionId, userAnswers]);

  useEffect(() => {
    if (view === 'hub') fetchHubData();
  }, [view, fetchHubData]);

  // Exam Timer
  useEffect(() => {
    if (view !== 'live' || testTimeLeft <= 0) return undefined;

    const timer = setInterval(() => {
      if (testTimeLeft <= 1) {
        clearInterval(timer);
        setTestTimeLeft(0);
        setGlobalTimeSpent((previousTime) => previousTime + 1);
        submitFinalScore(currentLevel, false);
        return;
      }

      setTestTimeLeft((previousTime) => previousTime - 1);
      setGlobalTimeSpent((previousTime) => previousTime + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [view, testTimeLeft, currentLevel, submitFinalScore]);

  const triggerTransition = (timeMins) => {
    setUserAnswers({});
    setCurrentQIndex(0);
    setTestTimeLeft(timeMins * 60);
    setGlobalTimeSpent(0);
    setIsSurrendered(false);
    setView('transition');
    setTimeout(() => setView('live'), 3000);
  };

  const handleStartExam = async (type, testNum = 1, isReview = false) => {
    try {
      setActiveExamType(type);
      setSelectedTestNum(testNum);
      setSubmissionResult(null);
      
      const endpoint = type === 'aptitude' ? '/api/dashboard/aptitude/start' : '/api/dashboard/exam/start';
      const payload = type === 'aptitude' ? {} : { type, testNum, ...(isReview ? { isReview: true } : {}) };
      
      const res = await api.post(endpoint, payload);

      if (res.data.success && res.data.levels && res.data.levels[testNum] && res.data.levels[testNum].length > 0) {
        setLevelData(res.data.levels);
        
        if (isReview) {
           setExamSessionId(null);
           setView('review');
           setViewingResult(null);
           return;
        }
        setExamSessionId(res.data.sessionId || null);
        setCurrentLevel(testNum);
        triggerTransition(res.data.timeLimits[testNum] || 15);
      } else {
        alert(res.data.message || "Exam questions not configured for this selection yet.");
      }
    } catch (err) {
      console.error('Failed to start assessment:', err);
      alert(err.response?.data?.message || "Could not start the assessment. Please try again.");
    }
  };

  const handleOptionSelect = (qId, optionKey) => {
    setUserAnswers(prev => ({ ...prev, [qId]: optionKey }));
    if (currentQIndex < (levelData[currentLevel]?.length || 1) - 1) {
        setTimeout(() => setCurrentQIndex(prev => prev + 1), 300);
    }
  };

  return (
    <div className="assessment-page animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      
      {/* 1. LOBBY VIEW */}
      {view === 'hub' && (
        <>
          <section className="assessment-hero">
            <div className="assessment-hero-copy">
              <p className="eyebrow">Your next milestone</p>
              <h1>Assessment Center</h1>
              <p>Build confidence with focused practice, then see how far you have progressed.</p>
            </div>
            <div className="assessment-hero-progress">
              <span className="assessment-hero-icon"><i className="ph-fill ph-brain"></i></span>
              <div><strong>{aptHistory.length + talHistory.length + techHistory.length}</strong><span>assessments completed</span></div>
            </div>
            <div className="assessment-hero-foot"><i className="ph ph-sparkle"></i> Every attempt is progress. Choose a path and take it one question at a time.</div>
          </section>

          <div className="assessment-path-heading">
            <div><p className="eyebrow">Choose your path</p><h2>Practice, progress, prepare</h2></div>
            <span>{leaderboard.length} students on the aptitude board</span>
          </div>

          <div className="assessment-path-grid">
            
            {/* Aptitude Card */}
            <div className="ac-lobby-card" style={{ borderTop: '4px solid #a855f7' }}>
               <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#a855f7', letterSpacing: '1px', textTransform: 'uppercase' }}>Global Rankings</div>
               <h2 style={{ margin: '10px 0', fontSize: '1.8rem', color: '#fff' }}>Aptitude Test</h2>
               <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0', fontSize: '0.9rem', lineHeight: '1.6', flex: 1 }}>Compete against students globally across Easy, Medium, and Hard difficulty levels.</p>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <button className="btn-action" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }} onClick={() => handleStartExam('aptitude', 1)}>Easy Mode</button>
                   <button className="btn-action" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }} onClick={() => handleStartExam('aptitude', 2)}>Medium Mode</button>
                   <button className="btn-action" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }} onClick={() => handleStartExam('aptitude', 3)}>Hard Mode</button>
               </div>
            </div>

            {/* Talentino Tests */}
            <div className="ac-lobby-card" style={{ borderTop: '4px solid #10b981' }}>
               <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981', letterSpacing: '1px', textTransform: 'uppercase' }}>Sequential Exams</div>
               <h2 style={{ margin: '10px 0', fontSize: '1.8rem', color: '#fff' }}>Talentino Tests</h2>
               <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0', fontSize: '0.9rem', lineHeight: '1.6', flex: 1 }}>Complete these 3 tests progressively based on your syllabus completion.</p>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[1, 2, 3].map(num => {
                     const result = talHistory.find(h => h.levelReached === `Test ${num}`);
                     const isUnlocked = num === 1 || talHistory.find(h => h.levelReached === `Test ${num - 1}`);
                     
                     if (result) {
                        return <button key={num} className="btn-action" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', justifyContent: 'space-between' }} onClick={() => setViewingResult(result)}><span>Test {num}</span> <span>✅ View Result</span></button>
                     } else if (isUnlocked) {
                        return <button key={num} className="btn-action" style={{ background: '#10b981', color: '#fff', justifyContent: 'space-between' }} onClick={() => handleStartExam('talentino', num)}><span>Test {num}</span> <span>Start &rarr;</span></button>
                     } else {
                        return <div key={num} style={{ background: 'var(--bg-dark)', padding: '12px 18px', borderRadius: '10px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Test {num}</span> <span><i className="ph-fill ph-lock-key"></i> Locked</span></div>
                     }
                  })}
               </div>
            </div>

            {/* Technical Exam */}
            <div className="ac-lobby-card" style={{ borderTop: '4px solid #3b82f6' }}>
               <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '1px', textTransform: 'uppercase' }}>Final Assessment</div>
               <h2 style={{ margin: '10px 0', fontSize: '1.8rem', color: '#fff' }}>Technical Exam</h2>
               <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0', fontSize: '0.9rem', lineHeight: '1.6', flex: 1 }}>Domain-specific test for <strong style={{color: '#fff'}}>{user?.course}</strong>.</p>
               
               {(!user?.techExamAccess || !/^(yes|true|1)$/i.test(user.techExamAccess.toString().trim())) ? (
                   <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '16px', borderRadius: '10px', color: '#f87171', textAlign: 'center', fontSize: '0.9rem', fontWeight: 700 }}><i className="ph-fill ph-lock-key"></i> Access Denied by Admin</div>
               ) : techHistory.length > 0 ? (
                   <button className="btn-action" style={{ width: '100%', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#3b82f6', padding: '1rem' }} onClick={() => setViewingResult(techHistory[0])}>✅ Completed: View Result</button>
               ) : (
                   <button className="btn-action" style={{ width: '100%', background: '#3b82f6', padding: '1rem', fontSize: '1rem' }} onClick={() => handleStartExam('technical', 1)}><i className="ph-bold ph-pencil-simple"></i> Launch Exam</button>
               )}
            </div>
          </div>

          {/* Leaderboard */}
          <div className="ac-lobby-card" style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
             <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', fontSize: '1.4rem' }}><i className="ph-fill ph-trophy"></i> Global Aptitude Hall of Fame</h3>
             {leaderboard.length === 0 ? ( 
               <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'var(--bg-dark)', borderRadius: '16px', fontWeight: 600 }}>Arena is empty. Be the first to play!</div> 
             ) : (
                 leaderboard.map((player, idx) => {
                     let rBg = idx === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : idx === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' : idx === 2 ? 'linear-gradient(135deg, #d97706, #b45309)' : 'var(--input-bg)';
                     let rCol = idx <= 2 ? '#fff' : 'var(--text-muted)';
                     return (
                         <div key={idx} className="ac-leaderboard-row">
                             <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                               <div className="ac-rank-badge" style={{ background: rBg, color: rCol }}>{idx + 1}</div>
                               <div><div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{player.name}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{player.branch} • {player.levelReached}</div></div>
                             </div>
                             <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 900, color: 'var(--accent-cyan)', fontSize: '1.1rem' }}>{player.score} pts</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{Math.floor(player.timeSeconds/60)}m {player.timeSeconds%60}s</div></div>
                         </div>
                     );
                 })
             )}
          </div>
        </>
      )}

      {/* 2. EXAM TRANSITION */}
      {view === 'transition' && (
        <div className="ac-test-card" style={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '4px', marginBottom: '15px' }}>Initializing Exam Engine</div>
            <h1 style={{ fontSize: '4rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', marginBottom: '10px' }}>
                {activeExamType === 'aptitude' ? (currentLevel === 1 ? 'EASY MODE' : currentLevel === 2 ? 'MEDIUM MODE' : 'HARD MODE') : activeExamType === 'talentino' ? `TEST ${selectedTestNum}` : `FINAL ASSESSMENT`}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>Good luck. The timer starts as soon as this screen disappears.</p>
            <i className="ph ph-spinner animate-spin" style={{ fontSize: '3rem', color: 'var(--accent-cyan)', marginTop: '2rem' }}></i>
        </div>
      )}

      {/* 3. LIVE EXAM UI */}
      {view === 'live' && levelData[currentLevel] && (
        <div className="ac-test-layout">
          <div className="ac-test-card" style={{ borderTop: '4px solid var(--accent-cyan)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid var(--card-border)' }}>
              <span style={{ background: 'rgba(56, 189, 248, 0.1)', color: 'var(--accent-cyan)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {activeExamType === 'aptitude' ? `Level ${currentLevel}` : activeExamType === 'talentino' ? `Test ${selectedTestNum}` : 'Final Exam'} • {levelData[currentLevel][currentQIndex]?.category}
              </span>
              <div style={{ background: testTimeLeft <= 60 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)', color: testTimeLeft <= 60 ? '#ef4444' : '#fff', padding: '8px 16px', borderRadius: '30px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', border: `1px solid ${testTimeLeft <= 60 ? '#ef4444' : 'var(--card-border)'}` }}>
                <i className="ph-bold ph-timer"></i> {Math.floor(testTimeLeft / 60).toString().padStart(2, '0')}:{(testTimeLeft % 60).toString().padStart(2, '0')}
              </div>
            </div>
            
            <h3 style={{ fontSize: '1.4rem', lineHeight: 1.6, marginBottom: '2.5rem', color: '#fff', fontWeight: 700 }}>
              {levelData[currentLevel][currentQIndex]?.question}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {Object.entries(levelData[currentLevel][currentQIndex]?.options || {}).map(([optKey, optText]) => {
                const isSelected = userAnswers[levelData[currentLevel][currentQIndex].id] === optKey;
                return (
                  <div key={optKey} className={`ac-option-box ${isSelected ? 'selected' : ''}`} onClick={() => handleOptionSelect(levelData[currentLevel][currentQIndex].id, optKey)}>
                    <div className="ac-option-circle">{optKey}</div>
                    <span style={{ fontSize: '1.05rem', fontWeight: 600, color: isSelected ? '#fff' : 'var(--text-main)' }}>{optText}</span>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem' }}>
              <button className="btn-cancel" disabled={currentQIndex === 0} onClick={() => setCurrentQIndex(prev => prev - 1)}>&larr; Previous</button>
              {currentQIndex < levelData[currentLevel].length - 1 ? (
                <button className="btn-action" onClick={() => setCurrentQIndex(prev => prev + 1)}>Next Question &rarr;</button>
              ) : (
                <button className="btn-action" style={{ background: '#10b981', padding: '0.8rem 2rem' }} onClick={() => submitFinalScore(currentLevel, false)}>Submit Exam 🚀</button>
              )}
            </div>
          </div>

          <div className="ac-test-card">
              <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Navigation Map</h4>
              <div className="ac-palette-grid">
                {levelData[currentLevel].map((q, idx) => {
                  const isAnswered = !!userAnswers[q.id];
                  return ( <div key={q.id} className={`ac-palette-btn ${currentQIndex === idx ? 'active' : ''} ${isAnswered ? 'answered' : ''}`} onClick={() => setCurrentQIndex(idx)}>{idx + 1}</div> );
                })}
              </div>
              <button className="btn-cancel" style={{ width: '100%', marginTop: '2rem', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }} onClick={() => submitFinalScore(currentLevel, true)}>Abort / End Test</button>
          </div>
        </div>
      )}

      {/* 4. RESULT VIEW */}
      {view === 'result' && (
        <div className="ac-test-card" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '6rem', margin: '0 0 20px 0', textShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>{isSurrendered ? '🏳️' : '🏆'}</div>
            <h1 style={{ fontSize: '3rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', marginBottom: '10px' }}>
                {submissionResult?.error ? 'RESULT NOT SAVED' : isSurrendered ? 'EXAM ABORTED' : 'EXAM COMPLETED'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2rem' }}>
                {activeExamType === 'aptitude' ? `You reached Level ${currentLevel}` : 'Assessment Submitted'} • Time: {submissionResult?.timeTaken || `${Math.floor(globalTimeSpent/60)}m ${globalTimeSpent%60}s`}
            </p>
            
            {submissionResult?.error ? (
              <div role="alert" style={{ display: 'block', background: 'rgba(239, 68, 68, 0.1)', padding: '15px 20px', borderRadius: '14px', color: '#fca5a5', marginBottom: '2rem' }}>{submissionResult.error}</div>
            ) : submissionResult ? (
              <div style={{ display: 'inline-block', background: 'rgba(56, 189, 248, 0.1)', padding: '15px 30px', borderRadius: '16px', fontSize: '1.5rem', fontWeight: 900, color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', marginBottom: '3rem' }}>
                Final Score: {submissionResult.score} / {submissionResult.totalQuestions * (activeExamType === 'aptitude' ? 2 : 1)} <span style={{ display: 'block', fontSize: '.92rem', color: 'var(--text-muted)', marginTop: 6 }}>{submissionResult.percentage}% accuracy</span>
              </div>
            ) : <div style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Saving your result…</div>}

            <button className="btn-action" onClick={() => setView('hub')} style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }}>Return to Hub</button>
        </div>
      )}

      {/* 5. REVIEW MODAL & STUDY SHEET */}
      {viewingResult && (
        <ModalPortal>
        <div className="report-modal-overlay" style={{ zIndex: 99999 }}>
          <div className="report-card" style={{ maxWidth: '450px', textAlign: 'center', padding: '3rem 2rem' }}>
             <i className="ph ph-x" style={{ position: 'absolute', top: '20px', right: '20px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.5rem' }} onClick={() => setViewingResult(null)}></i>
             
             <div style={{ fontSize: '5rem', marginBottom: '15px' }}>📝</div>
             <h2 style={{ color: '#fff', margin: '0 0 5px 0', fontSize: '2rem', fontWeight: 900 }}>{viewingResult.levelReached}</h2>
             <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '25px', fontWeight: 600 }}>{formatPortalDateTime(viewingResult.date) || viewingResult.date}</div>
             
             <div style={{ background: 'var(--input-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--input-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', textAlign: 'left', marginBottom: '25px' }}>
                <div><strong style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', marginBottom: '4px' }}>Score</strong><span style={{ fontSize:'1.4rem', fontWeight:900, color:'#fff' }}>{viewingResult.score}</span></div>
                <div><strong style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', marginBottom: '4px' }}>Accuracy</strong><span style={{ fontSize:'1.4rem', fontWeight:900, color:'#10b981' }}>{viewingResult.percentage || 'N/A'}</span></div>
                <div style={{ gridColumn: '1 / -1' }}><strong style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', marginBottom: '4px' }}>Time Duration</strong><span style={{ fontSize:'1.2rem', fontWeight:800, color:'#38bdf8' }}>{viewingResult.timeTaken}</span></div>
             </div>
             
             {(viewingResult.type === 'talentino' || viewingResult.type === 'technical') && (
                 <button className="btn-action" style={{ width: '100%', padding: '1.2rem', fontSize: '1rem', marginBottom: '10px' }} 
                    onClick={() => {
                        const tNum = viewingResult.levelReached.includes('Test') ? parseInt(viewingResult.levelReached.replace('Test ', '')) : 1;
                        handleStartExam(viewingResult.type, tNum, true);
                    }}>
                    <i className="ph-bold ph-book-open"></i> Review Answer Key
                 </button>
             )}
             <button className="btn-cancel" style={{ width: '100%', padding: '1.2rem', fontSize: '1rem' }} onClick={() => setViewingResult(null)}>Dismiss</button>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* REVIEW ENGINE UI */}
      {view === 'review' && (
         <div className="ac-test-card" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
                <div>
                  <h2 style={{ color: '#fff', margin: '0 0 5px 0', fontSize: '2rem', fontWeight: 900 }}>Answer Key</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>Review explanations for this module.</p>
                </div>
                <button className="btn-cancel" onClick={() => setView('hub')}>Exit Review</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {(levelData[selectedTestNum] || []).map((q, i) => (
                    <div key={q.id} style={{ background: 'var(--bg-dark)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <div style={{ fontWeight: 800, color: '#fff', marginBottom: '1.5rem', fontSize: '1.1rem', lineHeight: 1.5 }}>
                            <span style={{ color: '#10b981', marginRight: '10px' }}>Q{i + 1}.</span> {q.question}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '1.5rem' }}>
                            {Object.entries(q.options || {}).map(([k, v]) => {
                                const isCorrect = k === q.answer;
                                return (
                                    <div key={k} style={{ padding: '15px', borderRadius: '12px', background: isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'var(--input-bg)', color: isCorrect ? '#10b981' : 'var(--text-muted)', border: `1px solid ${isCorrect ? '#10b981' : 'var(--input-border)'}`, fontSize: '0.95rem', fontWeight: 700 }}>
                                        {k}) {v}
                                    </div>
                                );
                            })}
                        </div>
                        {q.explanation && (
                            <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '15px 20px', borderRadius: '12px', borderLeft: '4px solid #38bdf8', fontSize: '0.95rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                                <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Explanation</strong>
                                {q.explanation}
                            </div>
                        )}
                    </div>
                ))}
            </div>
         </div>
      )}

    </div>
  );
}
