import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import CognitiveMiniGame from './CognitiveMiniGame';
import ReferenceMiniGame from './ReferenceMiniGames';
import SpecialMiniGame from './SpecialMiniGames';
import BoardMiniGame from './BoardMiniGames';
import GameArtwork from './GameArtwork';
import DriveImage from '../../components/ui/DriveImage';
import ModalPortal from '../../components/ui/ModalPortal';

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
  { id: 'knifeshow', name: 'Knife Show', category: 'Speed', icon: 'ph-target', tint: '#fb7185', summary: 'Time your throws around a spinning target and avoid collisions.' },
  { id: 'snowrider', name: 'Snow Rider 3D', category: 'Attention', icon: 'ph-snowflake', tint: '#38bdf8', summary: 'Steer a sled through a changing alpine obstacle course.' },
  { id: 'dino', name: 'Dino Runner', category: 'Speed', icon: 'ph-footprints', tint: '#34d399', summary: 'Jump, duck, and keep your run alive as the pace rises.' },
  { id: 'chess', name: 'Chess', category: 'Problem Solving', icon: 'ph-chess-knight', tint: '#c084fc', summary: 'Play a full chess match against the GamePal computer.' },
  { id: 'word-association', name: 'Word Association', category: 'Language', icon: 'ph-circles-three-plus', tint: '#fbbf24', summary: 'Group changing word tiles by the hidden theme they share.' },
  { id: 'ludo-king', name: 'Ludo King', category: 'Problem Solving', icon: 'ph-dice-five', tint: '#fb7185', summary: 'Race your tokens home, use safe squares, and send rivals back to start.' },
  { id: 'snakes-ladders', name: 'Snakes & Ladders', category: 'Problem Solving', icon: 'ph-stairs', tint: '#34d399', summary: 'Climb ladders, avoid snakes, and be first to reach square 100.' },
];

const REFERENCE_GAME_IDS = new Set(['pinpoint', 'crossclimb', 'queens', 'tango', 'zip', 'mini-sudoku', 'patches', 'wend']);
const SPECIAL_GAME_IDS = new Set(['knifeshow', 'snowrider', 'dino', 'chess', 'word-association']);
const BOARD_GAME_IDS = new Set(['ludo-king', 'snakes-ladders']);
const GAME_RULES = {
  memory: { goal: 'Remember the symbol sequence, then select the matching pattern.', controls: 'Watch the sequence until it hides, then tap the matching answer.', scoring: 'Correct answers and quicker responses earn more points. Difficulty adapts each round.' },
  attention: { goal: 'Choose the color of the letters, ignoring the word itself.', controls: 'Tap the answer that matches the ink color.', scoring: 'Ten quick rounds; accuracy and response time shape your score.' },
  language: { goal: 'Unscramble the letters to make the hidden word.', controls: 'Tap the correct word from the four choices.', scoring: 'Ten rounds with longer words as your level rises.' },
  math: { goal: 'Solve each short arithmetic problem.', controls: 'Tap the correct answer before moving to the next round.', scoring: 'Correct answers and speed add points; problem difficulty adjusts as you play.' },
  logic: { goal: 'Spot the number pattern and find what comes next.', controls: 'Choose the missing number from the choices.', scoring: 'Ten pattern rounds. Correct answers build your score.' },
  flexibility: { goal: 'Apply the current rule to each number, even when the rule changes.', controls: 'Tap Yes or No for each prompt.', scoring: 'The game switches rules during the session to train flexible thinking.' },
  speed: { goal: 'Find the requested number in a changing set.', controls: 'Tap the matching number as quickly as you can.', scoring: 'Fast, accurate choices earn more points.' },
  pinpoint: { goal: 'Use the clues to uncover the shared word connection.', controls: 'Submit guesses and use the feedback to narrow the answer.', scoring: 'Solve in fewer guesses for a stronger score.' },
  crossclimb: { goal: 'Arrange words into a ladder where each word changes by one letter.', controls: 'Select the words in the order that forms the ladder.', scoring: 'Complete the ladder accurately to earn points.' },
  queens: { goal: 'Place one queen in every row, column, and colored region.', controls: 'Tap a square to place or remove a queen.', scoring: 'Solve the board without conflicts.' },
  tango: { goal: 'Balance suns and moons while following the grid clues.', controls: 'Tap cells to switch between the two symbols.', scoring: 'Fill the board while satisfying each row, column, and clue.' },
  zip: { goal: 'Connect the numbered route and pass through every tile once.', controls: 'Tap neighboring cells to extend the path.', scoring: 'Finish a complete, non-repeating route.' },
  'mini-sudoku': { goal: 'Complete the compact number grid without repeating a number in a row or column.', controls: 'Tap a cell, then choose a number.', scoring: 'Fill every empty cell correctly.' },
  patches: { goal: 'Rotate and arrange the pieces so they cover the board.', controls: 'Select a patch, rotate it, and place it on the grid.', scoring: 'Cover the target area with no gaps or overlap.' },
  wend: { goal: 'Trace connected letters to find the words in the puzzle.', controls: 'Drag or tap neighboring letter tiles to build a word.', scoring: 'Find every listed word using connected letters.' },
  knifeshow: { goal: 'Land ten knives on the spinning target without hitting a blade already stuck there.', controls: 'Tap Throw knife when the lower edge of the target is clear. You have three collisions.', scoring: 'Clean hits add points; the target speeds up as your run continues.' },
  snowrider: { goal: 'Ride the full 40-second descent, dodge hazards, and collect gifts.', controls: 'Use Left/Right or A/D to change lanes. Press Space/Up to jump; touch buttons work on mobile.', scoring: 'Distance and gifts add to your separate Snow Rider score.' },
  dino: { goal: 'Keep running for as long as possible without hitting an obstacle.', controls: 'Press Space/Up to jump over cacti. Hold Down to duck under flyers; touch buttons work on mobile.', scoring: 'Your distance score increases with survival time while the run speeds up.' },
  chess: { goal: 'Play a full game as White and try to checkmate the computer.', controls: 'Tap a white piece to see legal moves, then tap a highlighted square. Use Resign to end early.', scoring: 'Checkmate earns the highest score; a draw or loss receives its own Chess result.' },
  'word-association': { goal: 'Sort sixteen words into four groups of four that share a hidden theme.', controls: 'Select four tiles, then tap Check group. The board changes each time.', scoring: 'Correct groups add points; fewer incorrect guesses improve accuracy.' },
  'ludo-king': { goal: 'Bring all four of your tokens from the yard to the home triangle before the other players.', controls: 'Roll a six to bring a token out. Select a token that can move the number rolled; land on an opponent to send it home. Exact rolls are needed to finish.', scoring: 'Your points reflect how far your tokens travel and whether you finish first.' },
  'snakes-ladders': { goal: 'Be the first player to land exactly on square 100.', controls: 'Roll the die and move along the numbered path. A ladder takes you up; a snake slides you down. An overshoot keeps you in place.', scoring: 'The winner earns the top score; other players receive a score based on finishing distance.' },
};

const indiaDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const categoryScore = (stats, category) => Number(stats?.categories?.[category.replace(/\s/g, '')] ?? stats?.categories?.[category] ?? 0) || 0;
const cleanName = (name) => String(name || 'Student').trim().split(/\s+/)[0];
const ordinal = (value) => `${value}${value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th')}`;

export default function GamePalHub() {
  const { user } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [friendChallenges, setFriendChallenges] = useState([]);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [pendingGame, setPendingGame] = useState(null);
  const [activeRoom, setActiveRoom] = useState(null);
  const [groupRooms, setGroupRooms] = useState([]);
  const [roomGameId, setRoomGameId] = useState(GAMES[0].id);
  const [friendEmail, setFriendEmail] = useState('');
  const [friendGameId, setFriendGameId] = useState(GAMES[0].id);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomClock, setRoomClock] = useState(0);
  const [groupCelebration, setGroupCelebration] = useState(null);
  const [activeTab, setActiveTab] = useState('Today');
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [completedToday, setCompletedToday] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user?.email));
  const [message, setMessage] = useState('');
  const [challengeCelebration, setChallengeCelebration] = useState(null);
  const [lastGameResult, setLastGameResult] = useState(null);
  const completionHandled = useRef(false);
  const handledRoomStarts = useRef(new Set());

  const firstName = cleanName(user?.name);
  const preferenceKey = `talenzo_gamepal_goals_${user?.email || 'student'}`;
  const completionKey = `talenzo_gamepal_daily_${user?.email || 'student'}_${indiaDateKey()}`;
  const seenChallengesKey = `talenzo_gamepal_seen_challenges_${user?.email || 'student'}`;
  const seenRoomsKey = `talenzo_gamepal_seen_rooms_${user?.email || 'student'}`;

  const openGameRules = useCallback((game, context = {}) => {
    completionHandled.current = false;
    setPendingGame({ game: { ...game, sessionSeed: Date.now() }, challenge: context.challenge || null, room: context.room || null });
  }, []);

  const startGameAfterRules = () => {
    if (!pendingGame) return;
    setActiveChallenge(pendingGame.challenge);
    setActiveRoom(pendingGame.room);
    setActiveGame(pendingGame.game);
    setPendingGame(null);
  };

  const celebrateChallenge = useCallback((challenge) => {
    if (!challenge?.id || challenge.status !== 'Complete') return false;
    let seenIds = [];
    try {
      const savedIds = JSON.parse(localStorage.getItem(seenChallengesKey) || '[]');
      if (Array.isArray(savedIds)) seenIds = savedIds;
    } catch { /* Use an empty seen list when storage is unavailable. */ }
    if (seenIds.includes(challenge.id)) return false;
    try { localStorage.setItem(seenChallengesKey, JSON.stringify([...seenIds.slice(-199), challenge.id])); } catch { /* The celebration still works for this visit. */ }

    const email = String(user?.email || '').trim().toLowerCase();
    const isCreator = String(challenge.creatorEmail || '').trim().toLowerCase() === email;
    const myScore = Number(isCreator ? challenge.creatorScore : challenge.opponentScore);
    const friendScore = Number(isCreator ? challenge.opponentScore : challenge.creatorScore);
    const scoresValid = Number.isFinite(myScore) && Number.isFinite(friendScore);
    const winnerEmail = challenge.winnerEmail || (!scoresValid || myScore === friendScore
      ? ''
      : myScore > friendScore ? email : (isCreator ? challenge.opponentEmail : challenge.creatorEmail));
    const outcome = !winnerEmail ? 'tie' : String(winnerEmail).trim().toLowerCase() === email ? 'win' : 'loss';
    setChallengeCelebration({
      id: challenge.id,
      outcome,
      gameName: challenge.gameName || 'GamePal challenge',
      friendName: isCreator ? challenge.opponentName : challenge.creatorName,
      myScore: scoresValid ? myScore : 0,
      friendScore: scoresValid ? friendScore : 0,
    });
    return true;
  }, [seenChallengesKey, user?.email]);

  const announceUnseenChallenges = useCallback((challenges) => {
    for (const challenge of challenges) {
      if (celebrateChallenge(challenge)) break;
    }
  }, [celebrateChallenge]);

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
    if (!user?.email || activeTab !== 'Play with friends' || activeGame) return undefined;
    let cancelled = false;
    const loadChallenges = () => api.get('/api/gamepal/friends')
      .then((res) => {
        if (!cancelled && res.data.success) {
          const challenges = res.data.challenges || [];
          setFriendChallenges(challenges);
          announceUnseenChallenges(challenges);
        }
      })
      .catch((error) => { if (!cancelled) setMessage(error.response?.data?.message || 'Could not load friend challenges.'); });
    loadChallenges();
    const interval = window.setInterval(loadChallenges, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [user?.email, activeTab, activeGame, announceUnseenChallenges]);

  const refreshFriendChallenges = useCallback(async () => {
    const response = await api.get('/api/gamepal/friends');
    if (response.data.success) {
      const challenges = response.data.challenges || [];
      setFriendChallenges(challenges);
      announceUnseenChallenges(challenges);
    }
  }, [announceUnseenChallenges]);

  const celebrateGroupRoom = useCallback((room) => {
    if (!room || room.status !== 'Complete' || !room.code) return false;
    let seenCodes = [];
    try {
      const savedCodes = JSON.parse(localStorage.getItem(seenRoomsKey) || '[]');
      if (Array.isArray(savedCodes)) seenCodes = savedCodes;
    } catch { /* Continue without saved celebration state. */ }
    if (seenCodes.includes(room.code)) return false;
    try { localStorage.setItem(seenRoomsKey, JSON.stringify([...seenCodes.slice(-199), room.code])); } catch { /* Celebrate for this visit. */ }
    const standings = [...(room.participants || [])]
      .filter((member) => member.score !== null && member.score !== undefined)
      .sort((left, right) => Number(right.score) - Number(left.score))
      .map((member, index, list) => ({ ...member, place: index > 0 && Number(member.score) === Number(list[index - 1].score) ? list[index - 1].place : index + 1 }));
    const email = String(user?.email || '').trim().toLowerCase();
    const mine = standings.find((member) => member.email === email);
    if (!mine) return false;
    setGroupCelebration({ code: room.code, gameName: room.gameName, standings, outcome: mine.place === 1 ? 'win' : 'loss', myPlace: mine.place, myScore: mine.score });
    return true;
  }, [seenRoomsKey, user?.email]);

  const refreshGroupRooms = useCallback(async () => {
    const response = await api.get('/api/gamepal/rooms');
    if (response.data.success) {
      const rooms = response.data.rooms || [];
      setGroupRooms(rooms);
      for (const room of rooms) if (celebrateGroupRoom(room)) break;
      return rooms;
    }
    return [];
  }, [celebrateGroupRoom]);

  const createGroupRoom = async (event) => {
    event.preventDefault();
    const game = GAMES.find((item) => item.id === roomGameId) || GAMES[0];
    setMessage('Creating your room…');
    try {
      const response = await api.post('/api/gamepal/rooms', { gameId: game.id });
      if (!response.data.success) throw new Error(response.data.message || 'Could not create the room.');
      const room = response.data.room;
      setGroupRooms((current) => [room, ...current.filter((item) => item.code !== room.code)]);
      setRoomCodeInput(room.code);
      setMessage(`Room ${room.code} is ready. Share its code; students have five minutes to join.`);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Could not create the room.');
    }
  };

  const createFriendChallenge = async (event) => {
    event.preventDefault();
    const game = GAMES.find((item) => item.id === friendGameId) || GAMES[0];
    const opponentEmail = friendEmail.trim().toLowerCase();
    setMessage('Sending your one-to-one game invite…');
    try {
      const response = await api.post('/api/gamepal/friends', { opponentEmail, gameId: game.id, gameName: game.name });
      if (!response.data.success) throw new Error(response.data.message || 'Could not send the invite.');
      setFriendEmail('');
      setFriendChallenges((current) => [response.data.challenge, ...current.filter((item) => item.id !== response.data.challenge.id)]);
      setMessage(`Invite sent to ${response.data.challenge.opponentName || opponentEmail}. Play your round now; your friend can join with their IPCS account.`);
      openGameRules(game, { challenge: response.data.challenge });
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Could not send the invite.');
    }
  };

  const joinGroupRoom = async (event) => {
    event.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) { setMessage('Enter the room code shared by the creator.'); return; }
    setMessage('Checking the room code…');
    try {
      const response = await api.post(`/api/gamepal/rooms/${encodeURIComponent(code)}/join`, {});
      if (!response.data.success) throw new Error(response.data.message || 'Could not join the room.');
      setGroupRooms((current) => [response.data.room, ...current.filter((item) => item.code !== response.data.room.code)]);
      setMessage(response.data.alreadyJoined ? `You are already in room ${code}.` : `Joined room ${code}. Wait for the host to start when everyone is ready.`);
      await refreshGroupRooms();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Could not join the room.');
    }
  };

  const startGroupRoom = async (room) => {
    setMessage('Starting the group game…');
    try {
      const response = await api.post(`/api/gamepal/rooms/${encodeURIComponent(room.code)}/start`, {});
      if (!response.data.success) throw new Error(response.data.message || 'Could not start the game.');
      const startedRoom = response.data.room;
      setGroupRooms((current) => current.map((item) => item.code === startedRoom.code ? startedRoom : item));
      handledRoomStarts.current.add(startedRoom.code);
      const game = GAMES.find((item) => item.id === startedRoom.gameId);
      if (game) openGameRules(game, { room: startedRoom });
      setMessage(`${startedRoom.gameName} is starting. Joining is now locked for this room.`);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Could not start the game.');
      await refreshGroupRooms().catch(() => {});
    }
  };

  const copyRoomCode = async (code) => {
    try { await navigator.clipboard.writeText(code); setMessage(`Room code ${code} copied.`); }
    catch { setMessage(`Share this room code with your group: ${code}`); }
  };

  useEffect(() => {
    if (!user?.email || activeTab !== 'Play with friends' || activeGame) return undefined;
    let cancelled = false;
    const loadRooms = async () => {
      try {
        const response = await api.get('/api/gamepal/rooms');
        if (cancelled || !response.data.success) return;
        const rooms = response.data.rooms || [];
        setGroupRooms(rooms);
        for (const room of rooms) if (celebrateGroupRoom(room)) break;
        const runningRoom = rooms.find((room) => room.status === 'In progress'
          && room.participants?.some((member) => member.email === String(user.email).trim().toLowerCase() && (member.score === null || member.score === undefined)));
        if (runningRoom && !handledRoomStarts.current.has(runningRoom.code) && !pendingGame && !activeGame) {
          handledRoomStarts.current.add(runningRoom.code);
          const game = GAMES.find((item) => item.id === runningRoom.gameId);
          if (game) openGameRules(game, { room: runningRoom });
        }
      } catch (error) {
        if (!cancelled) setMessage(error.response?.data?.message || 'Could not refresh your group rooms.');
      }
    };
    loadRooms();
    const interval = window.setInterval(loadRooms, 6000);
    const updateClock = () => setRoomClock(Date.now());
    updateClock();
    const clockInterval = window.setInterval(updateClock, 5000);
    return () => { cancelled = true; window.clearInterval(interval); window.clearInterval(clockInterval); };
  }, [user?.email, activeTab, celebrateGroupRoom, openGameRules, pendingGame, activeGame]);

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
    if (!user?.email || completionHandled.current) return;
    completionHandled.current = true;
    const currentBest = Number(stats?.games?.[gameName]?.bestScore) || 0;
    const resultId = `${gameName}-${Date.now()}`;
    setLastGameResult({ id: resultId, gameName, category, score: Number(score) || 0, accuracy: Number(accuracy) || 0, timeSeconds: Number(timeSeconds) || 0, highScore: Math.max(currentBest, Number(score) || 0), isNewRecord: Number(score) > currentBest, saving: true, syncNote: '', standings: [] });
    setActiveGame(null);
    const submittedChallenge = activeChallenge;
    const submittedRoom = activeRoom;
    setActiveChallenge(null);
    setActiveRoom(null);
    const updateResult = (update) => setLastGameResult((current) => current?.id === resultId ? { ...current, ...update } : current);
    try {
      const response = await api.post('/api/gamepal/session', {
        name: user.name, rollNo: user.rollNo, branch: user.branch,
        gameName, category, score, accuracy, timeSeconds,
      });
      if (!response.data.success) throw new Error(response.data.message || 'Your session could not be saved.');
      let challengeStatus = '';
      if (submittedChallenge?.id) {
        try {
          const challengeResponse = await api.post(`/api/gamepal/friends/${encodeURIComponent(submittedChallenge.id)}/score`, { score, accuracy });
          const result = challengeResponse.data;
          challengeStatus = result.status === 'Complete'
            ? result.winner === 'Tie' ? ' Friend challenge tied.' : ` ${result.winner} won the friend challenge.`
            : ' Your score is saved; waiting for your friend.';
          if (result.status === 'Complete') {
            const creatorIsMe = String(submittedChallenge.creatorEmail || '').toLowerCase() === String(user.email).toLowerCase();
            const mine = creatorIsMe ? result.creatorScore : result.opponentScore;
            const theirs = creatorIsMe ? result.opponentScore : result.creatorScore;
            const friendName = creatorIsMe ? submittedChallenge.opponentName : submittedChallenge.creatorName;
            updateResult({ matchup: { mine, theirs, friendName, outcome: mine === theirs ? 'tie' : mine > theirs ? 'win' : 'loss' } });
          }
          await refreshFriendChallenges();
        } catch (challengeError) {
          challengeStatus = ` Your game was saved, but its challenge score could not sync: ${challengeError.response?.data?.message || challengeError.message}`;
        }
      }
      if (submittedRoom?.code) {
        try {
          const roomResponse = await api.post(`/api/gamepal/rooms/${encodeURIComponent(submittedRoom.code)}/score`, { score, accuracy });
          const roomResult = roomResponse.data;
          if (!roomResult.success) throw new Error(roomResult.message || 'Could not record your room result.');
          setGroupRooms((current) => current.map((room) => room.code === roomResult.room.code ? roomResult.room : room));
          if (roomResult.status === 'Complete') {
            const standings = roomResult.standings || [];
            const mine = standings.find((member) => member.email === String(user.email).toLowerCase());
            updateResult({ standings, groupOutcome: mine?.place === 1 ? 'win' : 'loss', roomCode: submittedRoom.code });
            challengeStatus += ` Group results are in for room ${submittedRoom.code}.`;
          } else challengeStatus += ` Your group score is saved; waiting for ${roomResult.room.participants.filter((member) => member.score == null).length} more player(s).`;
        } catch (roomError) {
          challengeStatus += ` Your session was saved, but the group score could not sync: ${roomError.response?.data?.message || roomError.message}`;
        }
      }
      setCompletedToday((previous) => {
        const next = [...new Set([...previous, gameName])];
        try { localStorage.setItem(completionKey, JSON.stringify(next)); } catch { /* Continue with this visit's state. */ }
        return next;
      });
      setMessage(`Workout complete — ${accuracy}% accuracy. Your progress has been saved.${challengeStatus}`);
      updateResult({ saving: false, syncNote: challengeStatus || 'Score saved to your GamePal profile.' });
      const [dashboardResult, historyResult] = await Promise.allSettled([
        api.post('/api/gamepal/dashboard', {}), api.get('/api/gamepal/history'),
      ]);
      if (dashboardResult.status === 'fulfilled' && dashboardResult.value.data.success) setStats(dashboardResult.value.data.stats);
      if (historyResult.status === 'fulfilled' && historyResult.value.data.success) setRecentSessions(historyResult.value.data.sessions || []);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Your session could not be saved.');
      updateResult({ saving: false, syncNote: 'Score could not be saved. You can still review this run.' });
    }
  };

  if (activeGame) {
    const Game = BOARD_GAME_IDS.has(activeGame.id) ? BoardMiniGame : SPECIAL_GAME_IDS.has(activeGame.id) ? SpecialMiniGame : REFERENCE_GAME_IDS.has(activeGame.id) ? ReferenceMiniGame : CognitiveMiniGame;
    const initialLevel = Math.min(5, Math.max(1, Number(stats.games?.[activeGame.name]?.level) || 1));
    return <Game game={activeGame} initialLevel={initialLevel} onComplete={handleGameComplete} onExit={() => { completionHandled.current = false; setActiveChallenge(null); setActiveRoom(null); setActiveGame(null); }} />;
  }

  if (loading) return <div className="gamepal-loading"><i className="ph ph-spinner animate-spin"></i><span>Preparing your daily workout…</span></div>;
  if (!stats) return <div className="gamepal-loading error"><i className="ph ph-warning-circle"></i><span>{message || 'GamePal could not load.'}</span><button className="btn-action" onClick={() => window.location.reload()}>Try again</button></div>;

  const hasPhoto = Boolean(user?.photo && user.photo !== 'N/A');
  const overall = Number(stats.overallScore) || 0;
  const routineDone = dailyGames.length > 0 && dailyGames.every((game) => completedToday.includes(game.name));
  const gameRecords = Object.values(stats.games || {});
  const totalSessions = gameRecords.reduce((sum, game) => sum + (Number(game.attempts) || 0), 0);
  const activeGameCount = gameRecords.filter((game) => Number(game.attempts) > 0).length;
  const bestAccuracy = gameRecords.length ? Math.max(...gameRecords.map((game) => Number(game.averageAccuracy) || 0)) : 0;
  const bestGame = [...gameRecords].sort((left, right) => (Number(right.bestScore) || 0) - (Number(left.bestScore) || 0))[0];

  return (
    <div className="gamepal-page animate-fade-in">
      <header className="gamepal-header">
        <div className="gamepal-brand-lockup">
          <div className="gamepal-avatar">{hasPhoto ? <DriveImage src={user.photo} alt="Your profile">{firstName.charAt(0).toUpperCase()}</DriveImage> : <span>{firstName.charAt(0).toUpperCase()}</span>}</div>
          <div><p className="eyebrow">IPCS cognitive practice</p><h1>GamePal</h1><span>Small daily sessions. Steady progress.</span></div>
        </div>
        <div className="gamepal-streak"><i className="ph-fill ph-fire"></i><div><strong>{stats.currentStreak || 0}</strong><span>day streak</span></div></div>
      </header>

      <nav className="gamepal-tabs" aria-label="GamePal sections">
        {['Today', 'Game library', 'Play with friends', 'Progress'].map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab === 'Today' ? <i className="ph ph-sun"></i> : tab === 'Game library' ? <i className="ph ph-game-controller"></i> : tab === 'Play with friends' ? <i className="ph ph-users-three"></i> : <i className="ph ph-chart-line-up"></i>}{tab}</button>)}
      </nav>

      {message && <div className={`gamepal-feedback ${/complete|saved|won|tied/i.test(message) ? 'success' : /could not|failed|error/i.test(message) ? 'error' : /waiting|sending|invite/i.test(message) ? 'pending' : ''}`} role="status"><i className={`ph ${/complete|saved|won|tied/i.test(message) ? 'ph-check-circle' : /could not|failed|error/i.test(message) ? 'ph-warning-circle' : 'ph-info'}`}></i><span>{message}</span><button type="button" aria-label="Dismiss message" onClick={() => setMessage('')}><i className="ph ph-x"></i></button></div>}

      {activeTab === 'Today' && (
        <>
          <section className="gamepal-hero">
            <div className="gamepal-hero-copy"><p className="eyebrow">Your personal routine · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h2>{routineDone ? `You showed up today, ${firstName}.` : `A fresh start, ${firstName}.`}</h2><p>{routineDone ? 'Your focus areas are complete for today. Come back tomorrow to keep the streak going.' : 'Your routine is shaped around the skills you want to strengthen. Each game adapts as you play.'}</p><button type="button" className="gamepal-primary-action" onClick={() => openGameRules(dailyGames.find((game) => !completedToday.includes(game.name)) || dailyGames[0])} disabled={!dailyGames.length || routineDone}>{routineDone ? 'Daily routine complete' : <><i className="ph-fill ph-play"></i> {completedToday.length ? 'Continue today’s workout' : 'Start today’s workout'}</>}</button></div>
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
                return <button type="button" className="gamepal-game-card" key={game.id} onClick={() => openGameRules(game)} style={{ '--game-tint': game.tint }}><span className="gamepal-game-number">0{index + 1}</span><GameArtwork game={game} compact /><span className="gamepal-game-domain">{game.category}</span><strong>{game.name}</strong><span className="gamepal-game-summary">{game.summary}</span><span className={`gamepal-game-cta ${done ? 'complete' : ''}`}>{done ? <><i className="ph-fill ph-check-circle"></i> Complete today</> : <>Play this game <i className="ph ph-arrow-up-right"></i></>}</span></button>;
              })}
            </div>
          </section>
        </>
      )}

      {activeTab === 'Game library' && (
        <section className="gamepal-library-section">
          <div className="gamepal-section-heading"><div><p className="eyebrow">Play at your own pace</p><h2>Game library</h2><span>{GAMES.length} mini-games across seven focus areas. Choose any game to play.</span></div></div>
          <div className="gamepal-card-grid">
            {GAMES.map((game) => <button type="button" className="gamepal-game-card" key={game.id} onClick={() => openGameRules(game)} style={{ '--game-tint': game.tint }}><GameArtwork game={game} compact /><span className="gamepal-game-domain">{game.category}</span><strong>{game.name}</strong><span className="gamepal-game-summary">{game.summary}</span><span className="gamepal-game-cta">Play game <i className="ph ph-arrow-up-right"></i></span></button>)}
          </div>
        </section>
      )}

      {activeTab === 'Play with friends' && (
        <section className="gamepal-friends-panel">
          <div className="gamepal-section-heading"><div><p className="eyebrow">Private group lobbies</p><h2>Play together</h2><span>Create a timed room, share its short code, and compete in the same game. The host starts the room.</span></div><button type="button" className="gamepal-link-button" onClick={() => Promise.all([refreshFriendChallenges(), refreshGroupRooms()]).catch((error) => setMessage(error.response?.data?.message || 'Could not refresh GamePal rooms.'))}><i className="ph ph-arrow-clockwise"></i> Refresh</button></div>
          <div className="gamepal-room-setup-grid">
            <form className="gamepal-room-form" onSubmit={createGroupRoom}>
              <div className="gamepal-room-form-icon"><i className="ph-fill ph-users-three"></i></div>
              <p className="eyebrow">HOST A ROOM</p><h3>Start a group game</h3><p>Anyone with your code can join for five minutes. The creator starts when the group is ready.</p>
              <label>Choose a game<select value={roomGameId} onChange={(event) => setRoomGameId(event.target.value)}>{GAMES.map((game) => <option value={game.id} key={game.id}>{game.name} · {game.category}</option>)}</select></label>
              <button type="submit" className="gamepal-primary-action"><i className="ph-fill ph-plus-circle"></i> Create room code</button>
            </form>
            <form className="gamepal-room-form gamepal-duel-form" onSubmit={createFriendChallenge}>
              <div className="gamepal-room-form-icon"><i className="ph-fill ph-sword"></i></div>
              <p className="eyebrow">ONE-TO-ONE DUEL</p><h3>Invite one student</h3><p>Challenge a friend by their IPCS student email. You each play a round and compare scores.</p>
              <label>Choose a game<select value={friendGameId} onChange={(event) => setFriendGameId(event.target.value)}>{GAMES.map((game) => <option value={game.id} key={game.id}>{game.name} · {game.category}</option>)}</select></label>
              <label htmlFor="gamepal-friend-email">Friend’s student email</label><input id="gamepal-friend-email" className="gamepal-friend-email" type="email" required value={friendEmail} onChange={(event) => setFriendEmail(event.target.value)} placeholder="friend@example.com" />
              <button type="submit" className="gamepal-primary-action"><i className="ph-fill ph-paper-plane-tilt"></i> Invite & play</button>
            </form>
            <form className="gamepal-room-join" onSubmit={joinGroupRoom}>
              <div className="gamepal-room-join-icon"><i className="ph-fill ph-key"></i></div>
              <p className="eyebrow">JOIN YOUR GROUP</p><h3>Have a room code?</h3><p>Enter the six-character code from your host before the joining timer ends.</p>
              <label htmlFor="gamepal-room-code">Room code</label>
              <div className="gamepal-room-code-entry"><input id="gamepal-room-code" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6))} placeholder="e.g. 7KQ4MX" maxLength={6} autoCapitalize="characters" spellCheck="false" /><button type="submit" disabled={roomCodeInput.length !== 6}>Join room <i className="ph ph-arrow-right"></i></button></div>
              <small>Once the host starts, the room closes. A finished room code cannot be reused.</small>
            </form>
          </div>
          <div className="gamepal-room-list-heading"><div><p className="eyebrow">Your groups</p><h3>Game rooms</h3></div><span>Join closes after 5 minutes</span></div>
          <div className="gamepal-group-room-list">
            {groupRooms.length ? groupRooms.map((room) => {
              const game = GAMES.find((item) => item.id === room.gameId) || GAMES[0];
              const isCreator = room.creatorEmail === String(user?.email || '').trim().toLowerCase();
              const mine = room.participants?.find((member) => member.email === String(user?.email || '').trim().toLowerCase());
              const timerEnded = roomClock > 0 && Date.parse(room.joinDeadline) <= roomClock;
              const canStart = isCreator && room.status === 'Waiting' && room.participants?.length >= 2;
              const rank = [...(room.participants || [])].filter((member) => member.score != null).sort((left, right) => Number(right.score) - Number(left.score));
              return <article className="gamepal-group-room" key={room.code} style={{ '--game-tint': game.tint }}>
                <GameArtwork game={game} compact />
                <div className="gamepal-group-room-main"><div className="gamepal-group-room-title"><div><strong>{game.name}</strong><span>{room.participants?.length || 0} joined · host: {room.creatorName}</span></div><span className={`gamepal-room-status ${room.status.toLowerCase().replace(/\s+/g, '-')}`}>{room.status}</span></div>
                  {room.status === 'Waiting' && <div className="gamepal-room-members">{room.participants.map((member) => <span key={member.email}><i className="ph-fill ph-user-circle"></i>{member.name || 'Student'}{member.email === room.creatorEmail ? ' · host' : ''}</span>)}</div>}
                  {room.status === 'Waiting' && isCreator && <div className="gamepal-room-share"><div><small>SHARE THIS CODE</small><strong>{room.code}</strong></div><button type="button" onClick={() => copyRoomCode(room.code)}><i className="ph ph-copy"></i> Copy code</button><span>{timerEnded ? 'The join window has closed.' : `Students can join until ${new Date(room.joinDeadline).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}</span></div>}
                  {room.status === 'Waiting' && !isCreator && <small className="gamepal-room-wait-note">Waiting for {room.creatorName} to start the game after the group is ready.</small>}
                  {room.status === 'In progress' && <div className="gamepal-room-active-note"><i className="ph-fill ph-lock-key"></i><span>{mine?.score == null ? 'Game in progress. Joining is closed.' : `Your score is in: ${mine.score} points. Waiting for the rest of the group.`}</span>{mine?.score == null && <button type="button" onClick={() => openGameRules(game, { room })}>Play now <i className="ph ph-arrow-right"></i></button>}</div>}
                  {room.status === 'Complete' && <div className="gamepal-room-results">{rank.map((member, index) => <span key={member.email} className={index === 0 ? 'winner' : ''}><b>{ordinal(index + 1)}</b>{member.name}: {member.score} pts</span>)}</div>}
                  {room.status === 'Expired' && <small className="gamepal-room-wait-note">This room expired before another player joined. Create a new code to play.</small>}
                </div>
                <div className="gamepal-room-actions">{room.status === 'Waiting' && isCreator && <button type="button" className="gamepal-primary-action" disabled={!canStart} onClick={() => startGroupRoom(room)}>{canStart ? <><i className="ph-fill ph-play"></i> Start game</> : <><i className="ph ph-hourglass"></i> Need 2+ players</>}</button>}{room.status === 'Waiting' && isCreator && room.participants?.length < 2 && <small>Invite one or more students to unlock start</small>}</div>
              </article>;
            }) : <p className="gamepal-history-empty">No rooms yet. Create one and share its code with your group.</p>}
          </div>
          <details className="gamepal-legacy-challenges">
            <summary>Earlier head-to-head challenges</summary>
          <div className="gamepal-friend-challenges">
            {friendChallenges.length ? friendChallenges.map((challenge) => {
              const isCreator = challenge.creatorEmail === String(user?.email || '').toLowerCase();
              const myScore = isCreator ? challenge.creatorScore : challenge.opponentScore;
              const friendName = isCreator ? challenge.opponentName : challenge.creatorName;
              const played = myScore !== null && myScore !== undefined;
              const game = GAMES.find((item) => item.id === challenge.gameId);
              return <article className="gamepal-friend-challenge" key={challenge.id}>
                <span className="gamepal-friend-icon"><i className={`ph-fill ${game?.icon || 'ph-game-controller'}`}></i></span>
                <div><strong>{challenge.gameName}</strong><span>{isCreator ? 'Challenge for' : 'Challenge from'} {friendName || 'IPCS student'}</span><small>{challenge.status === 'Complete' ? `You: ${myScore ?? '—'} · Friend: ${isCreator ? challenge.opponentScore : challenge.creatorScore}` : played ? 'Your score is in. Waiting for your friend.' : 'Play once to record your score.'}</small></div>
                <span className={`gamepal-challenge-status ${challenge.status === 'Complete' ? 'complete' : played ? 'pending' : ''}`}>{challenge.status}</span>
                {!played && game && <button type="button" className="btn-action" onClick={() => openGameRules(game, { challenge })}>Play now</button>}
              </article>;
            }) : <p className="gamepal-history-empty">No earlier head-to-head challenge records.</p>}
          </div>
          </details>
        </section>
      )}

      {activeTab === 'Progress' && (
        <section className="gamepal-progress-layout">
          <header className="gamepal-progress-intro"><div><p className="eyebrow">PLAYER PROFILE · GAMEPAL</p><h2>Your training arena, {firstName}.</h2><p>Review your high scores, sharpen focus areas, and see how every session adds up.</p></div><div className="gamepal-progress-player"><div><small>PLAYER LEVEL</small><strong>{Math.max(1, 1 + Math.floor(totalSessions / 5))}</strong><span>{totalSessions} sessions logged</span></div><div className="gamepal-progress-score-ring" style={{ '--brain-score-progress': `${Math.min(100, Math.max(0, overall / 20))}%` }}><div><strong>{overall}</strong><small>Brain score</small></div></div></div></header>
          <div className="gamepal-progress-kpis"><article><span className="kpi-icon cyan"><i className="ph-fill ph-game-controller"></i></span><div><strong>{totalSessions}</strong><small>Sessions played</small></div></article><article><span className="kpi-icon violet"><i className="ph-fill ph-squares-four"></i></span><div><strong>{activeGameCount}<small> / {GAMES.length}</small></strong><small>Games explored</small></div></article><article><span className="kpi-icon green"><i className="ph-fill ph-target"></i></span><div><strong>{bestAccuracy}%</strong><small>Top game accuracy</small></div></article><article><span className="kpi-icon amber"><i className="ph-fill ph-fire"></i></span><div><strong>{stats.currentStreak || 0}</strong><small>Day streak</small></div></article></div>
          <article className="gamepal-skills-panel"><div className="gamepal-section-heading"><div><p className="eyebrow">Training map</p><h2>Focus areas</h2></div><span>Personal best XP</span></div><div className="gamepal-skill-grid">{CATEGORIES.map((category) => { const score = categoryScore(stats, category); const percentage = Math.min(100, Math.max(0, score / 20)); const game = GAMES.find((item) => item.category === category); return <div className="gamepal-skill-card" key={category} style={{ '--skill-tint': game.tint }}><div className="gamepal-skill-card-top"><span><i className={`ph-fill ${game.icon}`}></i></span><small>{percentage}%</small></div><strong>{category}</strong><div className="gamepal-skill-track" role="progressbar" aria-label={`${category} progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}><span style={{ width: `${percentage}%` }}><i></i></span></div><small>{score.toLocaleString()} XP earned</small></div>; })}</div></article>
          <article className="gamepal-history-panel gamepal-high-scores"><div className="gamepal-section-heading"><div><p className="eyebrow">PERSONAL LEADERBOARD</p><h2>Best runs</h2></div><span>{bestGame ? `Top: ${bestGame.name}` : 'Your first record is waiting'}</span></div>{gameRecords.length ? <div className="gamepal-best-list">{[...gameRecords].sort((left, right) => (Number(right.bestScore) || 0) - (Number(left.bestScore) || 0)).slice(0, 6).map((record, index) => { const game = GAMES.find((item) => item.name === record.name); return <div className="gamepal-best-score-row" key={record.name} style={{ '--game-tint': game?.tint || 'var(--accent-cyan)' }}><span className={`gamepal-best-rank rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><GameArtwork game={game || GAMES[0]} compact /><div><strong>{record.name}</strong><span>{record.attempts} runs · best {record.averageAccuracy}% accuracy</span></div><b>{record.bestScore}<small> pts</small></b></div>; })}</div> : <p className="gamepal-history-empty">Play a game and your best scores will appear here.</p>}</article>
          <article className="gamepal-history-panel gamepal-recent-sessions"><div className="gamepal-section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Practice history</h2></div><span>{recentSessions.length} saved</span></div>{recentSessions.length ? <div className="gamepal-history-list">{recentSessions.slice(0, 8).map((session, index) => { const game = GAMES.find((item) => item.name === session.gameName); const accuracy = Number.parseInt(session.accuracy, 10) || 0; return <div className="gamepal-history-entry" key={`${session.date}-${session.gameName}-${index}`}><span className="gamepal-history-icon" style={{ color: game?.tint || 'var(--accent-cyan)' }}><i className={`ph-fill ${game?.icon || 'ph-game-controller'}`}></i></span><div className="gamepal-history-copy"><strong>{session.gameName}</strong><span>{session.category} · {session.date || 'Session'}</span></div><div className="gamepal-history-result"><strong>{session.score} pts</strong><span>{accuracy}% accuracy</span></div><div className="gamepal-history-track"><i style={{ width: `${Math.min(100, Math.max(4, accuracy))}%`, background: game?.tint || 'var(--accent-cyan)' }}></i></div></div>; })}</div> : <p className="gamepal-history-empty">Finish your first mini-game and your recent practice will show up here.</p>}</article>
        </section>
      )}
      <p className="gamepal-disclaimer">GamePal is for learning and everyday cognitive practice. Scores describe your GamePal sessions and are not medical assessments.</p>

      {lastGameResult && (
        <ModalPortal>
          <div className={`gamepal-result-overlay outcome-${lastGameResult.groupOutcome || lastGameResult.matchup?.outcome || 'tie'}`} role="presentation">
            <div className="gamepal-result-particles" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 7) * -0.31}s`, '--particle-drift': `${((index * 29) % 100) - 50}px` }}></i>)}</div>
            <section className="gamepal-result-card gamepal-run-result-card" role="dialog" aria-modal="true" aria-labelledby="gamepal-run-result-title">
              <span className="gamepal-result-emblem" aria-hidden="true">{lastGameResult.groupOutcome === 'win' || lastGameResult.matchup?.outcome === 'win' ? '🏆' : lastGameResult.isNewRecord ? '✨' : '🎮'}</span>
              <p className="eyebrow">{lastGameResult.category} · SESSION COMPLETE</p>
              <h2 id="gamepal-run-result-title">{lastGameResult.groupOutcome === 'win' || lastGameResult.matchup?.outcome === 'win' ? 'Victory!' : lastGameResult.groupOutcome === 'loss' || lastGameResult.matchup?.outcome === 'loss' ? 'Good game!' : lastGameResult.isNewRecord ? 'New personal best!' : 'Run complete!'}</h2>
              <p className="gamepal-result-message">{lastGameResult.gameName} · {Math.floor(lastGameResult.timeSeconds / 60)}:{String(lastGameResult.timeSeconds % 60).padStart(2, '0')} played</p>
              <div className="gamepal-run-score-grid"><div><span>CURRENT SCORE</span><strong>{lastGameResult.score.toLocaleString()}</strong></div><div><span>PERSONAL BEST</span><strong>{lastGameResult.highScore.toLocaleString()}</strong></div><div><span>ACCURACY</span><strong>{lastGameResult.accuracy}%</strong></div></div>
              {lastGameResult.matchup && <div className="gamepal-result-scoreboard"><div><span>You</span><strong>{lastGameResult.matchup.mine}</strong></div><i>VS</i><div><span>{lastGameResult.matchup.friendName || 'Friend'}</span><strong>{lastGameResult.matchup.theirs ?? '…'}</strong></div></div>}
              {lastGameResult.standings?.length > 0 && <div className="gamepal-group-standings">{lastGameResult.standings.map((member) => <div className={member.place === 1 ? 'winner' : ''} key={member.email}><span>{member.place === 1 ? '🏆' : `#${member.place}`}</span><strong>{member.name}{member.email === String(user?.email || '').trim().toLowerCase() ? ' · you' : ''}</strong><b>{member.score} pts</b></div>)}</div>}
              <p className="gamepal-result-save-note" role="status">{lastGameResult.saving ? 'Saving your score and updating your records…' : lastGameResult.syncNote}</p>
              <button type="button" className="gamepal-primary-action" onClick={() => { setLastGameResult(null); setGroupCelebration(null); setChallengeCelebration(null); }}>Back to GamePal <i className="ph ph-arrow-right"></i></button>
            </section>
          </div>
        </ModalPortal>
      )}

      {challengeCelebration && !lastGameResult && (
        <ModalPortal>
          <div className={`gamepal-result-overlay outcome-${challengeCelebration.outcome}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChallengeCelebration(null); }}>
            <div className="gamepal-result-particles" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 7) * -0.31}s`, '--particle-drift': `${((index * 29) % 100) - 50}px` }}></i>)}</div>
            <section className="gamepal-result-card" role="dialog" aria-modal="true" aria-labelledby="gamepal-result-title">
              <span className="gamepal-result-emblem" aria-hidden="true">{challengeCelebration.outcome === 'win' ? '🏆' : challengeCelebration.outcome === 'loss' ? '🎮' : '🤝'}</span>
              <p className="eyebrow">{challengeCelebration.gameName} · head-to-head</p>
              <h2 id="gamepal-result-title">{challengeCelebration.outcome === 'win' ? 'Victory!' : challengeCelebration.outcome === 'loss' ? 'Good game!' : 'It’s a tie!'}</h2>
              <p className="gamepal-result-message">{challengeCelebration.outcome === 'win' ? `You beat ${challengeCelebration.friendName || 'your friend'}—that was a brilliant round.` : challengeCelebration.outcome === 'loss' ? `${challengeCelebration.friendName || 'Your friend'} edged ahead this time. Every round is a chance to level up.` : `You and ${challengeCelebration.friendName || 'your friend'} matched scores. Run it back for the tiebreaker.`}</p>
              <div className="gamepal-result-scoreboard"><div><span>You</span><strong>{challengeCelebration.myScore}</strong></div><i>VS</i><div><span>{challengeCelebration.friendName || 'Friend'}</span><strong>{challengeCelebration.friendScore}</strong></div></div>
              <button type="button" className="gamepal-primary-action" onClick={() => setChallengeCelebration(null)}>Back to challenges <i className="ph ph-arrow-right"></i></button>
            </section>
          </div>
        </ModalPortal>
      )}

      {pendingGame && (
        <ModalPortal>
          <div className="gamepal-rules-overlay" role="presentation">
            <section className="gamepal-rules-card" role="dialog" aria-modal="true" aria-labelledby="gamepal-rules-title">
              <div className="gamepal-rules-art"><GameArtwork game={pendingGame.game} /></div>
              <p className="eyebrow">BEFORE YOU PLAY · {pendingGame.game.category.toUpperCase()}</p>
              <h2 id="gamepal-rules-title">{pendingGame.game.name}</h2>
              <p className="gamepal-rules-intro">{pendingGame.game.summary}</p>
              <div className="gamepal-rules-list"><div><span><i className="ph-fill ph-flag-checkered"></i></span><p><strong>Goal</strong><small>{GAME_RULES[pendingGame.game.id]?.goal}</small></p></div><div><span><i className="ph-fill ph-hand-tap"></i></span><p><strong>How to play</strong><small>{GAME_RULES[pendingGame.game.id]?.controls}</small></p></div><div><span><i className="ph-fill ph-chart-line-up"></i></span><p><strong>Scoring</strong><small>{GAME_RULES[pendingGame.game.id]?.scoring}</small></p></div></div>
              {pendingGame.room && <div className="gamepal-rules-room-note"><i className="ph-fill ph-users-three"></i> Group room {pendingGame.room.code} · {pendingGame.room.participants.length} players. Your result will be added to the room standings.</div>}
              <button type="button" className="gamepal-primary-action" onClick={startGameAfterRules}><i className="ph-fill ph-play"></i> Close & start game</button>
            </section>
          </div>
        </ModalPortal>
      )}

      {groupCelebration && !lastGameResult && (
        <ModalPortal>
          <div className={`gamepal-result-overlay outcome-${groupCelebration.outcome}`} role="presentation">
            <div className="gamepal-result-particles" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 7) * -0.31}s`, '--particle-drift': `${((index * 29) % 100) - 50}px` }}></i>)}</div>
            <section className="gamepal-result-card gamepal-group-result-card" role="dialog" aria-modal="true" aria-labelledby="gamepal-group-result-title">
              <span className="gamepal-result-emblem" aria-hidden="true">{groupCelebration.outcome === 'win' ? '🏆' : '🎮'}</span>
              <p className="eyebrow">{groupCelebration.gameName} · ROOM {groupCelebration.code}</p>
              <h2 id="gamepal-group-result-title">{groupCelebration.outcome === 'win' ? 'Group victory!' : 'Good game!'}</h2>
              <p className="gamepal-result-message">{groupCelebration.outcome === 'win' ? 'You finished at the top of your group. Great run!' : `You placed ${ordinal(groupCelebration.myPlace)} with ${groupCelebration.myScore} points. Keep practicing and come back stronger.`}</p>
              <div className="gamepal-group-standings">{groupCelebration.standings.map((member) => <div className={member.place === 1 ? 'winner' : ''} key={member.email}><span>{member.place === 1 ? '🏆' : `#${member.place}`}</span><strong>{member.name}{member.email === String(user?.email || '').trim().toLowerCase() ? ' · you' : ''}</strong><b>{member.score} pts</b></div>)}</div>
              <button type="button" className="gamepal-primary-action" onClick={() => setGroupCelebration(null)}>Back to GamePal <i className="ph ph-arrow-right"></i></button>
            </section>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
