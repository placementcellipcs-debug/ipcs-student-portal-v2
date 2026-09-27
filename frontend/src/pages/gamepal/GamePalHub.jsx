import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import CognitiveMiniGame from './CognitiveMiniGame';
import ReferenceMiniGame from './ReferenceMiniGames';

const CATEGORIES = ['Memory', 'Attention', 'Language', 'Math', 'Problem Solving', 'Flexibility', 'Speed'];
const GAMES = [
  { id: 'memory', name: 'Sequence Studio', category: 'Memory', icon: 'ph-grid-four', tint: '#38bdf8', summary: 'Hold a growing pattern in mind and recall it.' },
  { id: 'attention', name: 'Color Focus', category: 'Attention', icon: 'ph-eye', tint: '#a78bfa', summary: 'Ignore the word and respond to the ink color.' },
  { id: 'language', name: 'Word Scramble', category: 'Language', icon: 'ph-text-aa', tint: '#fb7185', summary: 'Rebuild a word from a shuffled set of letters.' },
  { id: 'math', name: 'Quick Calculations', category: 'Math', icon: 'ph-calculator', tint: '#34d399', summary: 'Solve short arithmetic challenges under a light pace.' },
  { id: 'logic', name: 'Pattern Finder', category: 'Problem Solving', icon: 'ph-puzzle-piece', tint: '#fbbf24', summary: 'Spot the rule and complete the number sequence.' },
  { id: 'flexibility', name: 'Rule Switch', category: 'Flexibility', icon: 'ph-arrows-left-right', tint: '#818cf8', summary: 'Adapt as the classification rule changes.' },
  { id: 'speed', name: 'Quick Spot', category: 'Speed', icon: 'ph-lightning', tint: '#fb7185', summary: 'Find the requested number in a changing set.' },
  { id: 'pinpoint', name: 'Pinpoint', category: 'Language', icon: 'ph-target', tint: '#f472b6', summary: 'Uncover clues and find the word connection in five guesses.' },
  { id: 'crossclimb', name: 'Crossclimb', category: 'Language', icon: 'ph-stairs', tint: '#fb7185', summary: 'Arrange clues into a ladder where each word changes by one letter.' },
  { id: 'queens', name: 'Queens', category: 'Problem Solving', icon: 'ph-crown', tint: '#fbbf24', summary: 'Place one queen in each row, column, and colored region.' },
  { id: 'tango', name: 'Tango', category: 'Problem Solving', icon: 'ph-sun', tint: '#a78bfa', summary: 'Balance suns and moons while following the grid rules.' },
  { id: 'zip', name: 'Zip', category: 'Problem Solving', icon: 'ph-path', tint: '#38bdf8', summary: 'Connect the numbered route through every tile exactly once.' },
  { id: 'mini-sudoku', name: 'Mini Sudoku', category: 'Math', icon: 'ph-grid-four', tint: '#34d399', summary: 'Complete a compact 6 × 6 number puzzle.' },
  { id: 'patches', name: 'Patches', category: 'Problem Solving', icon: 'ph-shapes', tint: '#fb923c', summary: 'Rotate and arrange tile patches to cover the whole board.' },
  { id: 'wend', name: 'Wend', category: 'Language', icon: 'ph-text-aa', tint: '#60a5fa', summary: 'Trace connected words and use every letter tile once.' },
];

const REFERENCE_GAME_IDS = new Set(['pinpoint', 'crossclimb', 'queens', 'tango', 'zip', 'mini-sudoku', 'patches', 'wend']);

const indiaDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const categoryScore = (stats, category) => Number(stats?.categories?.[category.replace(/\s/g, '')] ?? stats?.categories?.[category] ?? 500) || 0;
const cleanName = (name) => String(name || 'Student').trim().split(/\s+/)[0];

export default function GamePalHub() {
  const { user, getDriveImageUrl } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [activeGame, setActiveGame] = useState(null);
  const [activeTab, setActiveTab] = useState('Today');
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [completedToday, setCompletedToday] = useState([]);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(user?.email));
  const [message, setMessage] = useState('');

  const firstName = cleanName(user?.name);
  const preferenceKey = `talenzo_gamepal_goals_${user?.email || 'student'}`;
  const completionKey = `talenzo_gamepal_daily_${user?.email || 'student'}_${indiaDateKey()}`;

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    api.post('/api/gamepal/dashboard', {})
      .then((res) => {
        if (!cancelled && res.data.success) setStats(res.data.stats);
        else if (!cancelled) setMessage(res.data.message || 'GamePal is temporarily unavailable.');
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.response?.data?.message || 'Could not load your GamePal progress.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    api.get('/api/gamepal/history')
      .then((res) => { if (!cancelled && res.data.success) setRecentSessions(res.data.sessions || []); })
      .catch(() => { if (!cancelled) setRecentSessions([]); });
    return () => { cancelled = true; };
  }, [user?.email]);

  useEffect(() => {
    if (!stats || !user?.email) return;
    const suggested = [...CATEGORIES].sort((a, b) => categoryScore(stats, a) - categoryScore(stats, b)).slice(0, 3);
    let savedGoals = suggested;
    let savedCompletions = [];
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
      if (Array.isArray(saved) && saved.length) savedGoals = saved.filter((goal) => CATEGORIES.includes(goal)).slice(0, 3);
      const completed = JSON.parse(localStorage.getItem(completionKey) || '[]');
      savedCompletions = Array.isArray(completed) ? completed : [];
    } catch { /* Defaults are used when stored preferences are malformed. */ }
    const frame = window.requestAnimationFrame(() => {
      setSelectedGoals(savedGoals);
      setCompletedToday(savedCompletions);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stats, user?.email, preferenceKey, completionKey]);

  const dailyGames = useMemo(() => {
    const focus = selectedGoals.length ? selectedGoals : [...CATEGORIES].sort((a, b) => categoryScore(stats, a) - categoryScore(stats, b)).slice(0, 3);
    const dayNumber = Number(indiaDateKey().replace(/-/g, '')) || 0;
    return focus.map((category) => {
      const choices = GAMES.filter((game) => game.category === category);
      return choices.length ? choices[dayNumber % choices.length] : null;
    }).filter(Boolean);
  }, [selectedGoals, stats]);

  const saveGoals = (category) => {
    setMessage('');
    setSelectedGoals((previous) => {
      const exists = previous.includes(category);
      if (exists && previous.length === 1) {
        setMessage('Keep at least one focus area in your daily routine.');
        return previous;
      }
      if (!exists && previous.length >= 3) {
        setMessage('Choose up to three focus areas for your daily routine.');
        return previous;
      }
      const next = exists ? previous.filter((goal) => goal !== category) : [...previous, category];
      try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Preferences remain active for this visit. */ }
      return next;
    });
  };

  const handleGameComplete = async (gameName, category, score, accuracy, timeSeconds) => {
    if (!user?.email) return;
    try {
      const response = await api.post('/api/gamepal/session', {
        name: user.name, rollNo: user.rollNo, branch: user.branch,
        gameName, category, score, accuracy, timeSeconds,
      });
      if (!response.data.success) throw new Error(response.data.message || 'Your session could not be saved.');
      setCompletedToday((previous) => {
        const next = [...new Set([...previous, gameName])];
        try { localStorage.setItem(completionKey, JSON.stringify(next)); } catch { /* Continue with this visit's state. */ }
        return next;
      });
      setMessage(`Workout complete — ${accuracy}% accuracy. Your progress has been saved.`);
      const [dashboardResult, historyResult] = await Promise.allSettled([
        api.post('/api/gamepal/dashboard', {}), api.get('/api/gamepal/history'),
      ]);
      if (dashboardResult.status === 'fulfilled' && dashboardResult.value.data.success) setStats(dashboardResult.value.data.stats);
      if (historyResult.status === 'fulfilled' && historyResult.value.data.success) setRecentSessions(historyResult.value.data.sessions || []);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Your session could not be saved.');
    }
    setActiveGame(null);
  };

  if (activeGame) {
    const Game = REFERENCE_GAME_IDS.has(activeGame.id) ? ReferenceMiniGame : CognitiveMiniGame;
    return <Game game={activeGame} onComplete={handleGameComplete} onExit={() => setActiveGame(null)} />;
  }

  if (loading) return <div className="gamepal-loading"><i className="ph ph-spinner animate-spin"></i><span>Preparing your daily workout…</span></div>;
  if (!stats) return <div className="gamepal-loading error"><i className="ph ph-warning-circle"></i><span>{message || 'GamePal could not load.'}</span><button className="btn-action" onClick={() => window.location.reload()}>Try again</button></div>;

  const hasPhoto = Boolean(user?.photo && user.photo !== 'N/A' && !profileImageFailed);
  const overall = Number(stats.overallScore) || 500;
  const routineDone = dailyGames.length > 0 && dailyGames.every((game) => completedToday.includes(game.name));

  return (
    <div className="gamepal-page animate-fade-in">
      <header className="gamepal-header">
        <div className="gamepal-brand-lockup">
          <div className="gamepal-avatar">{hasPhoto ? <img src={getDriveImageUrl(user.photo)} onError={() => setProfileImageFailed(true)} referrerPolicy="no-referrer" alt="Your profile" /> : <span>{firstName.charAt(0).toUpperCase()}</span>}</div>
          <div><p className="eyebrow">IPCS cognitive practice</p><h1>GamePal</h1><span>Small daily sessions. Steady progress.</span></div>
        </div>
        <div className="gamepal-streak"><i className="ph-fill ph-fire"></i><div><strong>{stats.currentStreak || 0}</strong><span>day streak</span></div></div>
      </header>

      <nav className="gamepal-tabs" aria-label="GamePal sections">
        {['Today', 'Game library', 'Progress'].map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab === 'Today' ? <i className="ph ph-sun"></i> : tab === 'Game library' ? <i className="ph ph-game-controller"></i> : <i className="ph ph-chart-line-up"></i>}{tab}</button>)}
      </nav>

      {message && <div className="gamepal-feedback" role="status"><i className="ph ph-info"></i><span>{message}</span><button type="button" aria-label="Dismiss message" onClick={() => setMessage('')}><i className="ph ph-x"></i></button></div>}

      {activeTab === 'Today' && (
        <>
          <section className="gamepal-hero">
            <div className="gamepal-hero-copy"><p className="eyebrow">Your personal routine · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h2>{routineDone ? `You showed up today, ${firstName}.` : `A fresh start, ${firstName}.`}</h2><p>{routineDone ? 'Your focus areas are complete for today. Come back tomorrow to keep the streak going.' : 'Your routine is shaped around the skills you want to strengthen. Each game adapts as you play.'}</p><button type="button" className="gamepal-primary-action" onClick={() => setActiveGame(dailyGames.find((game) => !completedToday.includes(game.name)) || dailyGames[0])} disabled={!dailyGames.length || routineDone}>{routineDone ? 'Daily routine complete' : <><i className="ph-fill ph-play"></i> {completedToday.length ? 'Continue today’s workout' : 'Start today’s workout'}</>}</button></div>
            <div className="gamepal-hero-score"><span className="gamepal-score-ring"><strong>{overall}</strong><small>Brain score</small></span><span className="gamepal-workout-count">{dailyGames.filter((game) => completedToday.includes(game.name)).length}<i>/</i>{dailyGames.length} sessions today</span></div>
          </section>

          <section className="gamepal-focus-panel">
            <div className="gamepal-section-heading"><div><p className="eyebrow">Personalize your routine</p><h2>What would you like to work on?</h2></div><span>Choose up to 3</span></div>
            <div className="gamepal-goal-chips">
              {CATEGORIES.map((category) => <button type="button" className={selectedGoals.includes(category) ? 'selected' : ''} key={category} aria-pressed={selectedGoals.includes(category)} onClick={() => saveGoals(category)}><i className={`ph ${selectedGoals.includes(category) ? 'ph-check-circle' : 'ph-circle'}`}></i>{category}</button>)}
            </div>
          </section>

          <section className="gamepal-library-section">
            <div className="gamepal-section-heading"><div><p className="eyebrow">Made for your focus</p><h2>Today’s workout</h2></div><button type="button" className="gamepal-link-button" onClick={() => setActiveTab('Game library')}>Explore all games <i className="ph ph-arrow-right"></i></button></div>
            <div className="gamepal-card-grid">
              {dailyGames.map((game, index) => {
                const done = completedToday.includes(game.name);
                return <button type="button" className="gamepal-game-card" key={game.id} onClick={() => setActiveGame(game)} style={{ '--game-tint': game.tint }}><span className="gamepal-game-number">0{index + 1}</span><span className="gamepal-game-icon"><i className={`ph-fill ${game.icon}`}></i></span><span className="gamepal-game-domain">{game.category}</span><strong>{game.name}</strong><span className="gamepal-game-summary">{game.summary}</span><span className={`gamepal-game-cta ${done ? 'complete' : ''}`}>{done ? <><i className="ph-fill ph-check-circle"></i> Complete today</> : <>Play this game <i className="ph ph-arrow-up-right"></i></>}</span></button>;
              })}
            </div>
          </section>
        </>
      )}

      {activeTab === 'Game library' && (
        <section className="gamepal-library-section">
          <div className="gamepal-section-heading"><div><p className="eyebrow">Play at your own pace</p><h2>Game library</h2><span>{GAMES.length} mini-games across seven focus areas. Choose any game to play.</span></div></div>
          <div className="gamepal-card-grid">
            {GAMES.map((game) => <button type="button" className="gamepal-game-card" key={game.id} onClick={() => setActiveGame(game)} style={{ '--game-tint': game.tint }}><span className="gamepal-game-icon"><i className={`ph-fill ${game.icon}`}></i></span><span className="gamepal-game-domain">{game.category}</span><strong>{game.name}</strong><span className="gamepal-game-summary">{game.summary}</span><span className="gamepal-game-cta">Play game <i className="ph ph-arrow-up-right"></i></span></button>)}
          </div>
        </section>
      )}

      {activeTab === 'Progress' && (
        <section className="gamepal-progress-layout">
          <article className="gamepal-progress-overview"><p className="eyebrow">Your performance</p><h2>{overall}</h2><p>Overall brain score</p><div className="gamepal-progress-stats"><div><strong>{stats.currentStreak || 0}</strong><span>day streak</span></div><div><strong>{stats.lastPlayedDate === 'Never' ? '—' : stats.lastPlayedDate}</strong><span>last session</span></div></div></article>
          <article className="gamepal-skills-panel"><div className="gamepal-section-heading"><div><p className="eyebrow">Seven areas</p><h2>Skill breakdown</h2></div></div>{CATEGORIES.map((category) => { const score = categoryScore(stats, category); const percentage = Math.min(100, Math.max(0, (score / 2000) * 100)); const game = GAMES.find((item) => item.category === category); return <div className="gamepal-skill-row" key={category}><div><span><i className={`ph ${game.icon}`} style={{ color: game.tint }}></i>{category}</span><strong>{score}</strong></div><div className="gamepal-skill-track"><span style={{ width: `${percentage}%`, background: game.tint }}></span></div></div>; })}</article>
          <article className="gamepal-history-panel"><div className="gamepal-section-heading"><div><p className="eyebrow">Your recent sessions</p><h2>Practice history</h2></div><span>{recentSessions.length} saved</span></div>{recentSessions.length ? <div className="gamepal-history-list">{recentSessions.slice(0, 8).map((session, index) => { const game = GAMES.find((item) => item.category === session.category); const accuracy = Number.parseInt(session.accuracy, 10) || 0; return <div className="gamepal-history-entry" key={`${session.date}-${session.gameName}-${index}`}><span className="gamepal-history-icon" style={{ color: game?.tint || 'var(--accent-cyan)' }}><i className={`ph-fill ${game?.icon || 'ph-game-controller'}`}></i></span><div className="gamepal-history-copy"><strong>{session.gameName}</strong><span>{session.category} · {session.date || 'Session'}</span></div><div className="gamepal-history-result"><strong>{session.score} pts</strong><span>{accuracy}% accuracy</span></div><div className="gamepal-history-track"><i style={{ width: `${Math.min(100, Math.max(4, accuracy))}%`, background: game?.tint || 'var(--accent-cyan)' }}></i></div></div>; })}</div> : <p className="gamepal-history-empty">Finish your first mini-game and your recent practice will show up here.</p>}</article>
        </section>
      )}
      <p className="gamepal-disclaimer">GamePal is for learning and everyday cognitive practice. Scores describe your GamePal sessions and are not medical assessments.</p>
    </div>
  );
}
