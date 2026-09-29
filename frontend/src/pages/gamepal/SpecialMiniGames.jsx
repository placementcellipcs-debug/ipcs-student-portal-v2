import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function GameShell({ game, onExit, children, meta }) {
  return (
    <main className="cognitive-game-screen special-game-screen">
      <header className="cognitive-game-topbar">
        <button type="button" className="btn-cancel" onClick={onExit}><i className="ph ph-arrow-left"></i> Exit game</button>
        <div className="cognitive-game-top-meta"><span>{game.category.toUpperCase()}</span>{meta && <span>{meta}</span>}</div>
        <span className="cognitive-game-score"><i className={`ph-fill ${game.icon}`}></i> {game.name}</span>
      </header>
      {children}
    </main>
  );
}

function KnifeShow({ game, onComplete, onExit }) {
  const [rotation, setRotation] = useState(0);
  const [knives, setKnives] = useState([]);
  const [throws, setThrows] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lastResult, setLastResult] = useState('Time your throw and avoid the blades already on the target.');
  const [ended, setEnded] = useState(false);
  const startedAt = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    startedAt.current = Date.now();
    const timer = window.setInterval(() => setRotation((value) => (value + (2 + hits * 0.18)) % 360), 32);
    return () => window.clearInterval(timer);
  }, [hits]);

  const finish = useCallback((finalHits, finalThrows) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setEnded(true);
    const score = Math.max(0, finalHits * 100 - Math.max(0, finalThrows - finalHits) * 14);
    onComplete(game.name, game.category, score, Math.round((finalHits / Math.max(1, finalThrows)) * 100), Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
  }, [game, onComplete]);

  const throwKnife = () => {
    if (ended) return;
    const nextThrows = throws + 1;
    const landingAngle = ((90 - rotation) % 360 + 360) % 360;
    const collision = knives.some((angle) => {
      const distance = Math.abs(((landingAngle - angle + 540) % 360) - 180);
      return distance < 18;
    });
    setThrows(nextThrows);
    if (collision) {
      const nextMisses = misses + 1;
      setMisses(nextMisses);
      setLastResult(`Blade collision. ${Math.max(0, 3 - nextMisses)} retries left.`);
      if (nextMisses >= 3) finish(hits, nextThrows);
      return;
    }
    const nextHits = hits + 1;
    setHits(nextHits);
    setKnives((value) => [...value, landingAngle]);
    setLastResult(nextHits % 4 === 0 ? 'Arena cleared! The target speeds up.' : 'Clean hit. Keep your timing steady.');
    if (nextHits >= 10) finish(nextHits, nextThrows);
  };

  return <GameShell game={game} onExit={onExit} meta={`THROW ${hits} / 10`}>
    <section className="special-game-card knife-game-card">
      <p className="eyebrow">PRECISION ARENA · {Math.floor(hits / 4) + 1}</p>
      <h1>Find the opening.</h1>
      <p>Tap when the target’s lower edge is clear. Three collisions end the run.</p>
      <div className="knife-stage" aria-label={`Rotating target, ${hits} of 10 throws landed`}>
        <div className="knife-wheel" style={{ transform: `rotate(${rotation}deg)` }}>
          <span className="knife-wheel-core">✦</span>
          {knives.map((angle, index) => <i key={index} className="knife-stuck-blade" style={{ transform: `rotate(${angle}deg) translateY(-95px)` }}>➤</i>)}
          <span className="knife-fruit">✦</span>
        </div>
        <span className="knife-launch-line" aria-hidden="true"></span>
        <span className="knife-projectile" aria-hidden="true">➤</span>
      </div>
      <div className="special-game-hud"><span><strong>{hits}</strong><small>clean hits</small></span><span><strong>{misses}/3</strong><small>collisions</small></span><span><strong>{hits * 100}</strong><small>points</small></span></div>
      <p className="special-game-feedback" aria-live="polite">{lastResult}</p>
      <button type="button" className="gamepal-primary-action special-game-action" onClick={throwKnife} disabled={ended}><i className="ph-fill ph-target"></i> Throw knife</button>
    </section>
  </GameShell>;
}

function SnowRider({ game, onComplete, onExit }) {
  const [lane, setLane] = useState(1);
  const [items, setItems] = useState([]);
  const [ticks, setTicks] = useState(0);
  const [gifts, setGifts] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [lastResult, setLastResult] = useState('Use the lanes to weave past obstacles and collect gifts.');
  const laneRef = useRef(1);
  const jumpingRef = useRef(false);
  const itemsRef = useRef([]);
  const tickRef = useRef(0);
  const giftsRef = useRef(0);
  const finishedRef = useRef(false);
  const startedAt = useRef(0);

  const finish = useCallback((crashed = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const score = Math.max(0, Math.floor(tickRef.current / 3) + giftsRef.current * 35);
    onComplete(game.name, game.category, score, crashed ? Math.max(25, Math.round((tickRef.current / 400) * 100)) : 100, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
  }, [game, onComplete]);

  const move = (direction) => {
    const nextLane = Math.max(0, Math.min(2, laneRef.current + direction));
    laneRef.current = nextLane;
    setLane(nextLane);
  };
  const jump = () => {
    if (jumpingRef.current) return;
    jumpingRef.current = true;
    setJumping(true);
    window.setTimeout(() => { jumpingRef.current = false; setJumping(false); }, 650);
  };

  useEffect(() => {
    startedAt.current = Date.now();
    const onKey = (event) => {
      if (['ArrowLeft', 'a', 'A'].includes(event.key)) { event.preventDefault(); move(-1); }
      if (['ArrowRight', 'd', 'D'].includes(event.key)) { event.preventDefault(); move(1); }
      if ([' ', 'ArrowUp', 'w', 'W'].includes(event.key)) { event.preventDefault(); jump(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextTick = tickRef.current + 1;
      tickRef.current = nextTick;
      setTicks(nextTick);
      let nextItems = itemsRef.current.map((item) => ({ ...item, y: item.y + 1.5 + Math.min(2.4, nextTick / 230) }));
      if (nextTick % 8 === 0) nextItems.push({ id: `tree-${nextTick}`, type: 'obstacle', lane: Math.floor(Math.random() * 3), y: -6, glyph: Math.random() > .5 ? '🌲' : '🪨' });
      if (nextTick % 14 === 0) nextItems.push({ id: `gift-${nextTick}`, type: 'gift', lane: Math.floor(Math.random() * 3), y: -5, glyph: '🎁' });
      const hitObstacle = nextItems.some((item) => item.type === 'obstacle' && item.lane === laneRef.current && item.y >= 81 && item.y <= 94 && !jumpingRef.current);
      const pickedGift = nextItems.filter((item) => item.type === 'gift' && item.lane === laneRef.current && item.y >= 84 && item.y <= 96);
      if (pickedGift.length) {
        const foundIds = new Set(pickedGift.map((item) => item.id));
        nextItems = nextItems.filter((item) => !foundIds.has(item.id));
        giftsRef.current += pickedGift.length;
        setGifts(giftsRef.current);
        setLastResult('Gift collected! Your run score is climbing.');
      }
      itemsRef.current = nextItems.filter((item) => item.y < 106);
      setItems(itemsRef.current);
      if (hitObstacle) { setLastResult('Run ended — every ride gives you another chance to beat your distance.'); finish(true); }
      else if (nextTick >= 400) { setLastResult('Mountain mastered! You completed the full descent.'); finish(false); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [finish]);

  return <GameShell game={game} onExit={onExit} meta={`${Math.floor(ticks / 10)}s / 40s`}>
    <section className="special-game-card snow-game-card">
      <div className="special-game-heading"><div><p className="eyebrow">ALPINE RUN · SPEED RISES OVER TIME</p><h1>Carve your line.</h1><p>Switch lanes, jump over hazards, and gather the gifts.</p></div><span className="snow-score-badge">🎁 {gifts}</span></div>
      <div className="snow-course" aria-label="Three-lane snowy sled course">
        <span className="snow-mountain mountain-one"></span><span className="snow-mountain mountain-two"></span>
        {[0, 1, 2].map((column) => <span key={column} className="snow-lane-line" style={{ left: `${((column + 1) / 3) * 100}%` }}></span>)}
        {items.map((item) => <span key={item.id} className={`snow-course-item ${item.type}`} style={{ left: `${(item.lane + .5) * 33.333}%`, top: `${Math.min(95, Math.max(0, item.y))}%` }}>{item.glyph}</span>)}
        <span className={`snow-rider ${jumping ? 'jumping' : ''}`} style={{ left: `${(lane + .5) * 33.333}%` }}>🛷</span>
      </div>
      <p className="special-game-feedback" aria-live="polite">{lastResult}</p>
      <div className="special-game-controls"><button type="button" onClick={() => move(-1)} aria-label="Move left"><i className="ph ph-caret-left"></i></button><button type="button" onClick={jump}><i className="ph-fill ph-arrow-fat-up"></i> Jump</button><button type="button" onClick={() => move(1)} aria-label="Move right"><i className="ph ph-caret-right"></i></button></div>
      <small className="special-game-instructions">Keyboard: ← / → or A / D to steer · Space / ↑ to jump</small>
    </section>
  </GameShell>;
}

function DinoRunner({ game, onComplete, onExit }) {
  const [obstacles, setObstacles] = useState([]);
  const [ticks, setTicks] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [ducking, setDucking] = useState(false);
  const [night, setNight] = useState(false);
  const [lastResult, setLastResult] = useState('Jump over cacti and duck below flying hazards.');
  const jumpRef = useRef(false);
  const duckRef = useRef(false);
  const obstaclesRef = useRef([]);
  const tickRef = useRef(0);
  const finishedRef = useRef(false);
  const startedAt = useRef(0);

  const finish = useCallback((crashed = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const score = Math.floor(tickRef.current / 2);
    onComplete(game.name, game.category, score, crashed ? Math.min(99, Math.floor(tickRef.current / 2)) : 100, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
  }, [game, onComplete]);

  const jump = () => {
    if (jumpRef.current) return;
    jumpRef.current = true; setJumping(true);
    window.setTimeout(() => { jumpRef.current = false; setJumping(false); }, 680);
  };
  const duck = (active) => { duckRef.current = active; setDucking(active); };

  useEffect(() => {
    startedAt.current = Date.now();
    const onKeyDown = (event) => {
      if ([' ', 'ArrowUp', 'w', 'W'].includes(event.key)) { event.preventDefault(); jump(); }
      if (['ArrowDown', 's', 'S'].includes(event.key)) { event.preventDefault(); duck(true); }
    };
    const onKeyUp = (event) => { if (['ArrowDown', 's', 'S'].includes(event.key)) duck(false); };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextTick = tickRef.current + 1;
      tickRef.current = nextTick; setTicks(nextTick);
      if (nextTick % 100 === 0) setNight((value) => !value);
      const speed = 1.2 + Math.min(2.5, nextTick / 250);
      let nextObstacles = obstaclesRef.current.map((item) => ({ ...item, x: item.x - speed }));
      if (nextTick % 32 === 0) nextObstacles.push({ id: nextTick, x: 102, kind: nextTick > 120 && Math.random() > .6 ? 'bird' : 'cactus' });
      const collision = nextObstacles.some((item) => item.x <= 15 && item.x >= 10 && (item.kind === 'cactus' ? !jumpRef.current : !duckRef.current));
      obstaclesRef.current = nextObstacles.filter((item) => item.x > -8);
      setObstacles(obstaclesRef.current);
      if (collision) { setLastResult('The run ended. Your next attempt will start with a new obstacle pattern.'); finish(true); }
      else if (nextTick >= 600) { setLastResult('Run complete — excellent reflexes.'); finish(false); }
    }, 50);
    return () => window.clearInterval(timer);
  }, [finish]);

  return <GameShell game={game} onExit={onExit} meta={`DISTANCE ${Math.floor(ticks / 2)}`}>
    <section className="special-game-card dino-game-card">
      <div className="special-game-heading"><div><p className="eyebrow">TREX SPRINT · SPEED INCREASES</p><h1>Keep the run alive.</h1><p>Clear ground hazards with a jump; duck under the flyers.</p></div><span className="dino-score-badge">{Math.floor(ticks / 2).toString().padStart(4, '0')}</span></div>
      <div className={`dino-track ${night ? 'night' : ''}`} aria-label="Dinosaur runner course">
        <span className="dino-cloud cloud-one">☁</span><span className="dino-cloud cloud-two">☁</span>
        {obstacles.map((item) => <span key={item.id} className={`dino-obstacle ${item.kind}`} style={{ left: `${item.x}%` }}>{item.kind === 'bird' ? '🪽' : '🌵'}</span>)}
        <span className={`dino-player ${jumping ? 'jumping' : ''} ${ducking ? 'ducking' : ''}`}>🦖</span>
        <span className="dino-ground"></span>
      </div>
      <p className="special-game-feedback">{lastResult}</p>
      <div className="special-game-controls dino-controls"><button type="button" onClick={jump}><i className="ph-fill ph-arrow-fat-up"></i> Jump</button><button type="button" onPointerDown={() => duck(true)} onPointerUp={() => duck(false)} onPointerLeave={() => duck(false)}><i className="ph-fill ph-arrow-fat-down"></i> Hold to duck</button></div>
      <small className="special-game-instructions">Keyboard: Space / ↑ to jump · Hold ↓ to duck</small>
    </section>
  </GameShell>;
}

const ASSOCIATION_SETS = [
  [
    { name: 'PLANETS', words: ['MERCURY', 'VENUS', 'EARTH', 'MARS'] },
    { name: 'PROGRAMMING', words: ['VARIABLE', 'FUNCTION', 'LOOP', 'ARRAY'] },
    { name: 'WEATHER', words: ['CLOUD', 'RAIN', 'WIND', 'STORM'] },
    { name: 'MUSIC', words: ['RHYTHM', 'MELODY', 'CHORD', 'TEMPO'] },
  ],
  [
    { name: 'WORKPLACE', words: ['OFFICE', 'MEETING', 'DEADLINE', 'TEAM'] },
    { name: 'NETWORKING', words: ['ROUTER', 'PACKET', 'SERVER', 'FIREWALL'] },
    { name: 'MARKETING', words: ['CAMPAIGN', 'AUDIENCE', 'BRAND', 'CONTENT'] },
    { name: 'GEOMETRY', words: ['ANGLE', 'CIRCLE', 'TRIANGLE', 'RADIUS'] },
  ],
  [
    { name: 'AUTOMATION', words: ['SENSOR', 'ACTUATOR', 'PLC', 'RELAY'] },
    { name: 'WEB', words: ['BROWSER', 'COOKIE', 'DOMAIN', 'HTML'] },
    { name: 'INTERVIEW', words: ['RESUME', 'PANEL', 'OFFER', 'QUESTION'] },
    { name: 'ENERGY', words: ['SOLAR', 'WINDMILL', 'BATTERY', 'VOLTAGE'] },
  ],
  [
    { name: 'KITCHEN', words: ['LADLE', 'WHISK', 'SPATULA', 'TONGS'] },
    { name: 'STARGAZING', words: ['ORBIT', 'NEBULA', 'COMET', 'GALAXY'] },
    { name: 'STUDY', words: ['NOTES', 'REVISION', 'LECTURE', 'QUIZ'] },
    { name: 'TRAVEL', words: ['TICKET', 'PASSPORT', 'LUGGAGE', 'ITINERARY'] },
  ],
];
const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

function WordAssociation({ game, onComplete, onExit }) {
  const puzzle = ASSOCIATION_SETS[(Number(game.sessionSeed) || 0) % ASSOCIATION_SETS.length];
  const [tiles] = useState(() => {
    const words = puzzle.flatMap((group) => group.words.map((word) => ({ word, group: group.name })));
    return shuffle(words);
  });
  const [selected, setSelected] = useState([]);
  const [solved, setSolved] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState('Select four words that belong together.');
  const [wrong, setWrong] = useState(false);
  const startedAt = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => { startedAt.current = Date.now(); }, []);

  const choose = (word) => {
    if (solved.some((group) => group.words.includes(word)) || selected.includes(word) || selected.length >= 4) return;
    setSelected((value) => [...value, word]);
  };
  const submit = () => {
    if (selected.length !== 4) return;
    const group = puzzle.find((item) => selected.every((word) => item.words.includes(word)));
    if (!group) {
      setMistakes((value) => value + 1); setWrong(true); setFeedback('Not quite. Look for a different shared theme.');
      window.setTimeout(() => { setSelected([]); setWrong(false); }, 650);
      return;
    }
    const nextSolved = [...solved, { ...group, words: selected }];
    setSolved(nextSolved); setSelected([]); setFeedback(`Nice connection: ${group.name.toLowerCase()}.`);
    if (nextSolved.length === puzzle.length && !finishedRef.current) {
      finishedRef.current = true;
      const score = Math.max(0, 400 - mistakes * 35);
      window.setTimeout(() => onComplete(game.name, game.category, score, Math.round((4 / (4 + mistakes)) * 100), Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))), 800);
    }
  };

  return <GameShell game={game} onExit={onExit} meta={`${solved.length} / 4 GROUPS`}>
    <section className="special-game-card association-game-card">
      <p className="eyebrow">WORD CONNECTIONS · ROUND {solved.length + 1}</p><h1>Find the common thread.</h1>
      <p>Choose four tiles, then lock in your connection. The board changes every time you play.</p>
      <div className="association-solved-groups">{solved.map((group) => <div className="association-solved" key={group.name}><strong>{group.name}</strong><span>{group.words.join(' · ')}</span></div>)}</div>
      <div className={`association-board ${wrong ? 'wrong' : ''}`} role="group" aria-label="Word tiles">
        {tiles.map((tile) => {
          const isSolved = solved.some((group) => group.words.includes(tile.word));
          return <button type="button" key={tile.word} disabled={isSolved} className={`${selected.includes(tile.word) ? 'selected' : ''} ${isSolved ? 'solved' : ''}`} onClick={() => choose(tile.word)}>{tile.word}</button>;
        })}
      </div>
      <div className="association-footer"><p className={`special-game-feedback ${wrong ? 'error' : ''}`}>{feedback}</p><button type="button" className="gamepal-primary-action special-game-action" disabled={selected.length !== 4} onClick={submit}>Check group <i className="ph ph-arrow-right"></i></button></div>
      <small className="special-game-instructions">{mistakes} incorrect {mistakes === 1 ? 'guess' : 'guesses'} · {4 - solved.length} groups left</small>
    </section>
  </GameShell>;
}

// Compact local chess engine: legal moves, check, castling, en passant, and queen promotion.
const INITIAL_BOARD = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  ['', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', ''],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];
const PIECE_GLYPHS = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const pieceColor = (piece) => piece && (piece === piece.toUpperCase() ? 'w' : 'b');
const inside = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;
const findKing = (board, color) => {
  const target = color === 'w' ? 'K' : 'k';
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) if (board[row][col] === target) return [row, col];
  return [-1, -1];
};
function isSquareAttacked(board, row, col, byColor) {
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
    const piece = board[r][c]; if (!piece || pieceColor(piece) !== byColor) continue;
    const type = piece.toLowerCase(); const dr = row - r; const dc = col - c;
    if (type === 'p' && dr === (byColor === 'w' ? -1 : 1) && Math.abs(dc) === 1) return true;
    if (type === 'n' && ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))) return true;
    if (type === 'k' && Math.max(Math.abs(dr), Math.abs(dc)) === 1) return true;
    const diagonal = Math.abs(dr) === Math.abs(dc) && dr !== 0;
    const straight = (dr === 0) !== (dc === 0);
    if ((type === 'b' && diagonal) || (type === 'r' && straight) || (type === 'q' && (diagonal || straight))) {
      const stepR = Math.sign(dr); const stepC = Math.sign(dc); let rr = r + stepR; let cc = c + stepC; let blocked = false;
      while (rr !== row || cc !== col) { if (board[rr][cc]) { blocked = true; break; } rr += stepR; cc += stepC; }
      if (!blocked) return true;
    }
  }
  return false;
}
const inCheck = (board, color) => { const [row, col] = findKing(board, color); return isSquareAttacked(board, row, col, color === 'w' ? 'b' : 'w'); };
function applyChessMove(position, move) {
  const board = position.board.map((row) => [...row]); const piece = board[move.from[0]][move.from[1]];
  board[move.from[0]][move.from[1]] = '';
  if (move.enPassant) board[move.from[0]][move.to[1]] = '';
  board[move.to[0]][move.to[1]] = move.promote ? (pieceColor(piece) === 'w' ? 'Q' : 'q') : piece;
  if (move.castle) {
    const row = move.from[0]; const rookFrom = move.castle === 'king' ? 7 : 0; const rookTo = move.castle === 'king' ? 5 : 3;
    board[row][rookTo] = board[row][rookFrom]; board[row][rookFrom] = '';
  }
  const rights = { ...position.rights };
  if (piece.toLowerCase() === 'k') { rights[`${pieceColor(piece)}K`] = false; rights[`${pieceColor(piece)}Q`] = false; }
  if (piece.toLowerCase() === 'r') {
    if (move.from[0] === 7 && move.from[1] === 0) rights.wQ = false;
    if (move.from[0] === 7 && move.from[1] === 7) rights.wK = false;
    if (move.from[0] === 0 && move.from[1] === 0) rights.bQ = false;
    if (move.from[0] === 0 && move.from[1] === 7) rights.bK = false;
  }
  const captured = position.board[move.to[0]][move.to[1]];
  if (captured?.toLowerCase() === 'r') {
    if (move.to[0] === 7 && move.to[1] === 0) rights.wQ = false;
    if (move.to[0] === 7 && move.to[1] === 7) rights.wK = false;
    if (move.to[0] === 0 && move.to[1] === 0) rights.bQ = false;
    if (move.to[0] === 0 && move.to[1] === 7) rights.bK = false;
  }
  const enPassant = piece.toLowerCase() === 'p' && Math.abs(move.to[0] - move.from[0]) === 2 ? [(move.to[0] + move.from[0]) / 2, move.from[1]] : null;
  return { board, turn: position.turn === 'w' ? 'b' : 'w', rights, enPassant, moveCount: position.moveCount + 1 };
}
function pseudoMoves(position, row, col) {
  const { board, turn, rights, enPassant } = position; const piece = board[row][col];
  if (!piece || pieceColor(piece) !== turn) return [];
  const type = piece.toLowerCase(); const moves = []; const add = (r, c, extra = {}) => { if (!inside(r, c) || pieceColor(board[r][c]) === turn) return false; moves.push({ from: [row, col], to: [r, c], ...extra }); return !board[r][c]; };
  if (type === 'p') {
    const direction = turn === 'w' ? -1 : 1; const start = turn === 'w' ? 6 : 1;
    if (inside(row + direction, col) && !board[row + direction][col]) {
      add(row + direction, col, { promote: row + direction === (turn === 'w' ? 0 : 7) });
      if (row === start && !board[row + 2 * direction][col]) add(row + 2 * direction, col);
    }
    for (const dc of [-1, 1]) {
      const targetRow = row + direction; const targetCol = col + dc;
      if (!inside(targetRow, targetCol)) continue;
      if (pieceColor(board[targetRow][targetCol]) && pieceColor(board[targetRow][targetCol]) !== turn) add(targetRow, targetCol, { promote: targetRow === (turn === 'w' ? 0 : 7) });
      else if (enPassant && enPassant[0] === targetRow && enPassant[1] === targetCol) moves.push({ from: [row, col], to: [targetRow, targetCol], enPassant: true });
    }
  } else if (type === 'n' || type === 'k') {
    const deltas = type === 'n' ? [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    deltas.forEach(([dr, dc]) => add(row + dr, col + dc));
    if (type === 'k' && !inCheck(board, turn)) {
      const home = turn === 'w' ? 7 : 0; const enemy = turn === 'w' ? 'b' : 'w';
      if (row === home && col === 4 && rights[`${turn}K`] && !board[home][5] && !board[home][6] && board[home][7] === (turn === 'w' ? 'R' : 'r') && !isSquareAttacked(board, home, 5, enemy) && !isSquareAttacked(board, home, 6, enemy)) moves.push({ from: [row,col], to: [home,6], castle: 'king' });
      if (row === home && col === 4 && rights[`${turn}Q`] && !board[home][1] && !board[home][2] && !board[home][3] && board[home][0] === (turn === 'w' ? 'R' : 'r') && !isSquareAttacked(board, home, 2, enemy) && !isSquareAttacked(board, home, 3, enemy)) moves.push({ from: [row,col], to: [home,2], castle: 'queen' });
    }
  } else {
    const directions = [];
    if (type === 'b' || type === 'q') directions.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (type === 'r' || type === 'q') directions.push([-1,0],[1,0],[0,-1],[0,1]);
    for (const [dr, dc] of directions) { let r = row + dr; let c = col + dc; while (inside(r,c)) { const keepGoing = add(r,c); if (!keepGoing) break; r += dr; c += dc; } }
  }
  return moves;
}
function legalMoves(position, row, col) {
  return pseudoMoves(position, row, col).filter((move) => !inCheck(applyChessMove(position, move).board, position.turn));
}
function allLegalMoves(position) {
  const moves = [];
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) moves.push(...legalMoves(position, row, col));
  return moves;
}
function chessOutcome(position) {
  const moves = allLegalMoves(position);
  if (!moves.length) return inCheck(position.board, position.turn) ? (position.turn === 'b' ? 'win' : 'loss') : 'draw';
  if (position.moveCount >= 100) return 'draw';
  return '';
}
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 20 };
function selectComputerMove(position, moves) {
  return [...moves].sort((a, b) => (PIECE_VALUE[(position.board[b.to[0]][b.to[1]] || '').toLowerCase()] || 0) - (PIECE_VALUE[(position.board[a.to[0]][a.to[1]] || '').toLowerCase()] || 0))[Math.floor(Math.random() * Math.min(3, moves.length))];
}

function ChessTactics({ game, onComplete, onExit }) {
  const [position, setPosition] = useState(() => ({ board: INITIAL_BOARD.map((row) => [...row]), turn: 'w', rights: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null, moveCount: 0 }));
  const [selected, setSelected] = useState(null);
  const [legal, setLegal] = useState([]);
  const [status, setStatus] = useState('Your move · White');
  const [outcome, setOutcome] = useState('');
  const startedAt = useRef(0);
  const finishedRef = useRef(false);
  const moveSquares = useMemo(() => new Set(legal.map((move) => `${move.to[0]}-${move.to[1]}`)), [legal]);

  useEffect(() => { startedAt.current = Date.now(); }, []);

  const finish = useCallback((result) => {
    if (finishedRef.current) return;
    finishedRef.current = true; setOutcome(result);
    const score = result === 'win' ? 500 : result === 'draw' ? 260 : 80;
    onComplete(game.name, game.category, score, result === 'win' ? 100 : result === 'draw' ? 60 : 25, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
  }, [game, onComplete]);

  const playComputer = (nextPosition) => {
    const moves = allLegalMoves(nextPosition);
    if (!moves.length || nextPosition.moveCount >= 100) { finish(chessOutcome(nextPosition)); return; }
    setStatus('Computer is thinking…');
    window.setTimeout(() => {
      const move = selectComputerMove(nextPosition, moves);
      const reply = applyChessMove(nextPosition, move);
      setPosition(reply); setSelected(null); setLegal([]);
      const result = chessOutcome(reply);
      if (result) finish(result); else setStatus(inCheck(reply.board, 'w') ? 'Check — protect your king.' : 'Your move · White');
    }, 360);
  };

  const clickSquare = (row, col) => {
    if (outcome || position.turn !== 'w') return;
    if (selected && moveSquares.has(`${row}-${col}`)) {
      const move = legal.find((candidate) => candidate.to[0] === row && candidate.to[1] === col);
      const next = applyChessMove(position, move);
      setPosition(next); setSelected(null); setLegal([]);
      const result = chessOutcome(next);
      if (result) finish(result); else { setStatus(inCheck(next.board, 'b') ? 'Check — the computer must respond.' : 'Computer is thinking…'); playComputer(next); }
      return;
    }
    const piece = position.board[row][col];
    if (piece && pieceColor(piece) === 'w') { setSelected([row, col]); setLegal(legalMoves(position, row, col)); }
    else { setSelected(null); setLegal([]); }
  };

  const resign = () => finish('loss');
  return <GameShell game={game} onExit={onExit} meta={`MOVE ${Math.floor(position.moveCount / 2) + 1}`}>
    <section className="special-game-card chess-game-card">
      <div className="special-game-heading"><div><p className="eyebrow">CHESS · YOU PLAY WHITE</p><h1>Think a move ahead.</h1><p>{status}</p></div><button type="button" className="chess-resign" onClick={resign} disabled={Boolean(outcome)}>Resign</button></div>
      <div className="chess-board" role="grid" aria-label="Chess board">
        {position.board.map((row, rowIndex) => row.map((piece, colIndex) => {
          const isLight = (rowIndex + colIndex) % 2 === 0;
          const isSelected = selected?.[0] === rowIndex && selected?.[1] === colIndex;
          const isTarget = moveSquares.has(`${rowIndex}-${colIndex}`);
          return <button type="button" role="gridcell" key={`${rowIndex}-${colIndex}`} className={`chess-square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isTarget ? 'target' : ''}`} onClick={() => clickSquare(rowIndex, colIndex)} aria-label={`${String.fromCharCode(97 + colIndex)}${8 - rowIndex}${piece ? ` ${pieceColor(piece) === 'w' ? 'white' : 'black'} ${piece.toLowerCase()}` : ''}`}>
            {piece && <span className={pieceColor(piece) === 'w' ? 'white-piece' : 'black-piece'}>{PIECE_GLYPHS[piece]}</span>}
            {colIndex === 0 && <small>{8 - rowIndex}</small>}{rowIndex === 7 && <em>{String.fromCharCode(97 + colIndex)}</em>}
          </button>;
        }))}
      </div>
      {outcome && <div className={`chess-outcome ${outcome}`}><strong>{outcome === 'win' ? 'Checkmate — you win!' : outcome === 'loss' ? 'Game over' : 'Draw game'}</strong><span>Your Chess result is being saved. Close the game to return to GamePal.</span></div>}
      <p className="special-game-instructions">Tap a white piece to view legal moves. Captures, castling, en passant, and queen promotion are supported.</p>
    </section>
  </GameShell>;
}

export default function SpecialMiniGame({ game, onComplete, onExit }) {
  if (game.id === 'knifeshow') return <KnifeShow game={game} onComplete={onComplete} onExit={onExit} />;
  if (game.id === 'snowrider') return <SnowRider game={game} onComplete={onComplete} onExit={onExit} />;
  if (game.id === 'dino') return <DinoRunner game={game} onComplete={onComplete} onExit={onExit} />;
  if (game.id === 'chess') return <ChessTactics game={game} onComplete={onComplete} onExit={onExit} />;
  return <WordAssociation game={game} onComplete={onComplete} onExit={onExit} />;
}
