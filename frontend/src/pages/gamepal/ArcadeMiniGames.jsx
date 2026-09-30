import { useCallback, useEffect, useRef, useState } from 'react';

const elapsed = (start) => Math.max(1, Math.round((Date.now() - start) / 1000));
const report = (onComplete, game, start, score, accuracy) => onComplete(game.name, game.category, Math.max(0, Math.min(1000, Math.round(score))), Math.max(0, Math.min(100, Math.round(accuracy))), elapsed(start));

function ArcadeShell({ game, onExit, children, eyebrow = 'ARCADE MODE' }) {
  return <main className="cognitive-game-screen arcade-screen"><header className="cognitive-game-topbar"><button type="button" className="btn-cancel" onClick={onExit}><i className="ph ph-arrow-left"></i> Exit game</button><div className="cognitive-game-top-meta"><span>{eyebrow}</span><span>GAMEPAL ARCADE</span></div><span className="cognitive-game-score"><i className={`ph-fill ${game.icon}`}></i> {game.name}</span></header>{children}</main>;
}

const empty2048 = () => {
  const board = Array.from({ length: 4 }, () => Array(4).fill(0));
  return spawn2048(spawn2048(board));
};
function spawn2048(board) {
  const empty = [];
  board.forEach((row, r) => row.forEach((value, c) => { if (!value) empty.push([r, c]); }));
  if (!empty.length) return board;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = board.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}
function move2048(board, direction) {
  const next = board.map((row) => [...row]);
  let gained = 0;
  for (let line = 0; line < 4; line += 1) {
    const coords = Array.from({ length: 4 }, (_, index) => direction === 'left' ? [line, index] : direction === 'right' ? [line, 3 - index] : direction === 'up' ? [index, line] : [3 - index, line]);
    const original = coords.map(([r, c]) => board[r][c]).filter(Boolean);
    const packed = [];
    for (let i = 0; i < original.length; i += 1) {
      if (original[i] === original[i + 1]) { packed.push(original[i] * 2); gained += original[i] * 2; i += 1; }
      else packed.push(original[i]);
    }
    coords.forEach(([r, c], index) => { next[r][c] = packed[index] || 0; });
  }
  return { board: next, gained, changed: next.some((row, r) => row.some((value, c) => value !== board[r][c])) };
}
function Game2048({ game, onComplete, onExit }) {
  const [board, setBoard] = useState(empty2048);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('gamepal-2048-best')) || 0);
  const [status, setStatus] = useState('playing');
  const startRef = useRef(0);
  const doneRef = useRef(false);
  const finish = useCallback((won = false, finalBoard = board, finalScore = score) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStatus(won ? 'won' : 'over');
    const maxTile = Math.max(...finalBoard.flat());
    report(onComplete, game, startRef.current, Math.min(1000, maxTile / 2 + finalScore / 18), Math.min(100, maxTile / 20));
  }, [board, game, onComplete, score]);
  const turn = useCallback((direction) => {
    if (status !== 'playing') return;
    const result = move2048(board, direction);
    if (!result.changed) return;
    const next = spawn2048(result.board);
    const nextScore = score + result.gained;
    const nextBest = Math.max(best, nextScore);
    setBoard(next); setScore(nextScore); setBest(nextBest);
    try { localStorage.setItem('gamepal-2048-best', String(nextBest)); } catch { /* Keep this run usable if storage is unavailable. */ }
    if (next.flat().includes(2048)) window.setTimeout(() => finish(true, next, nextScore), 240);
    else if (!next.some((row, r) => row.some((value, c) => !value || (c < 3 && value === row[c + 1]) || (r < 3 && value === next[r + 1][c])))) window.setTimeout(() => finish(false, next, nextScore), 240);
  }, [best, board, finish, score, status]);
  useEffect(() => { startRef.current = Date.now(); }, []);
  useEffect(() => {
    const handle = (event) => { const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }; if (map[event.key]) { event.preventDefault(); turn(map[event.key]); } };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [turn]);
  const reset = () => { doneRef.current = false; startRef.current = Date.now(); setBoard(empty2048()); setScore(0); setStatus('playing'); };
  return <ArcadeShell game={game} onExit={onExit} eyebrow="SLIDE & MERGE">
    <section className="arcade-card game-2048-card"><div className="arcade-heading"><div><p className="eyebrow">NUMBER LAB · CLASSIC MODE</p><h1>Make the next big tile.</h1><p>Slide equal tiles together. Keyboard arrows or the controls move the board.</p></div><div className="arcade-score-pills"><span><small>SCORE</small><b>{score}</b></span><span><small>BEST</small><b>{best}</b></span></div></div>
      <div className="tile2048-board" role="grid" aria-label="2048 game board">{board.flatMap((row, r) => row.map((value, c) => <div role="gridcell" key={`${r}-${c}`} className={`tile2048-cell value-${value || 0}`} aria-label={value ? String(value) : 'empty'}>{value || ''}</div>))}</div>
      <div className="arcade-direction-pad"><button onClick={() => turn('up')} aria-label="Move up">↑</button><span><button onClick={() => turn('left')} aria-label="Move left">←</button><button onClick={() => turn('down')} aria-label="Move down">↓</button><button onClick={() => turn('right')} aria-label="Move right">→</button></span></div>
      {status !== 'playing' && <div className="arcade-end-banner"><strong>{status === 'won' ? '2048 reached!' : 'Board locked'}</strong><button type="button" onClick={reset}>Play again</button></div>}
    </section>
  </ArcadeShell>;
}

function makeMineBoard(size, mineCount, safeIndex) {
  const mines = new Set();
  while (mines.size < mineCount) { const index = Math.floor(Math.random() * size * size); if (index !== safeIndex) mines.add(index); }
  return Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size); const col = index % size;
    const near = [];
    for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) { const r = row + y; const c = col + x; if (r >= 0 && r < size && c >= 0 && c < size) near.push(r * size + c); }
    return { mine: mines.has(index), count: near.filter((cell) => mines.has(cell)).length, open: false, flag: false };
  });
}
function Minesweeper({ game, onComplete, onExit, initialLevel = 1 }) {
  const size = 9; const mineCount = initialLevel >= 4 ? 14 : initialLevel >= 2 ? 12 : 10;
  const [cells, setCells] = useState(() => Array(size * size).fill(null));
  const [pendingFlags, setPendingFlags] = useState(() => new Set()); const [seconds, setSeconds] = useState(0); const [message, setMessage] = useState('Open a safe tile. Your first click is always clear.'); const [status, setStatus] = useState('playing');
  const startRef = useRef(0); const doneRef = useRef(false);
  useEffect(() => { if (status !== 'playing') return undefined; startRef.current = Date.now(); const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000); return () => window.clearInterval(timer); }, [status]);
  const finish = useCallback((won, nextCells) => {
    if (doneRef.current) return; doneRef.current = true; setStatus(won ? 'won' : 'lost');
    const safeOpen = nextCells.filter((cell) => cell?.open && !cell.mine).length;
    const safeTotal = size * size - mineCount;
    report(onComplete, game, startRef.current, won ? 1000 : safeOpen / safeTotal * 850, safeOpen / safeTotal * 100);
  }, [game, mineCount, onComplete]);
  const revealFlood = (board, index) => {
    const next = board.map((cell) => ({ ...cell })); const stack = [index];
    while (stack.length) { const at = stack.pop(); if (at < 0 || at >= next.length || next[at].open || next[at].flag) continue; next[at].open = true; if (next[at].count === 0 && !next[at].mine) { const row = Math.floor(at / size); const col = at % size; for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) { const r = row + y; const c = col + x; if ((x || y) && r >= 0 && r < size && c >= 0 && c < size) stack.push(r * size + c); } } }
    return next;
  };
  const open = (index) => {
    if (status !== 'playing' || cells[index]?.open || cells[index]?.flag) return;
    if (pendingFlags.has(index)) return;
    const firstOpen = !cells[index];
    const source = cells[index] ? cells : makeMineBoard(size, mineCount, index).map((cell, cellIndex) => ({ ...cell, flag: pendingFlags.has(cellIndex) }));
    const next = source[index].mine ? source.map((cell) => ({ ...cell, open: cell.mine || cell.open })) : revealFlood(source, index);
    if (firstOpen) setPendingFlags(new Set());
    setCells(next);
    if (next[index].mine) { setMessage('Mine hit. The board is revealed.'); finish(false, next); return; }
    const safeOpen = next.filter((cell) => cell.open && !cell.mine).length;
    if (safeOpen === size * size - mineCount) { setMessage('Field cleared. Every safe tile found!'); finish(true, next); }
    else setMessage(`${safeOpen} safe tiles cleared · ${next.filter((cell) => cell.flag).length}/${mineCount} flags placed.`);
  };
  const toggleFlag = (index) => { if (status !== 'playing' || cells[index]?.open) return; if (!cells[index]) { setPendingFlags((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; }); return; } const next = cells.map((cell, i) => i === index ? { ...cell, flag: !cell.flag } : cell); setCells(next); };
  const newField = () => { doneRef.current = false; startRef.current = Date.now(); setCells(Array(size * size).fill(null)); setPendingFlags(new Set()); setSeconds(0); setStatus('playing'); setMessage('Open a safe tile. Your first click is always clear.'); };
  const flagCount = pendingFlags.size + cells.filter((cell) => cell?.flag).length;
  return <ArcadeShell game={game} onExit={onExit} eyebrow="FIELD SCAN · FIRST TAP SAFE"><section className="arcade-card mines-card"><div className="arcade-heading"><div><p className="eyebrow">TACTICAL GRID · {mineCount} MINES</p><h1>Read the numbers. Clear the field.</h1><p>Numbers show mines touching that square. Right click or long-press a tile to flag it.</p></div><div className="arcade-score-pills"><span><small>FLAGS</small><b>{flagCount}/{mineCount}</b></span><span><small>TIME</small><b>{seconds}s</b></span></div></div>
    <div className="mines-grid" style={{ '--mine-size': size }} role="grid" aria-label="Minesweeper field">{Array.from({ length: size * size }, (_, index) => { const cell = cells[index]; const flagged = cell?.flag || pendingFlags.has(index); return <button type="button" role="gridcell" key={index} className={`mine-cell ${cell?.open ? 'opened' : ''} ${cell?.mine && cell.open ? 'mine-hit' : ''}`} onClick={() => open(index)} onContextMenu={(event) => { event.preventDefault(); toggleFlag(index); }} onTouchStart={(event) => { const tile = event.currentTarget; tile.longPressTimer = window.setTimeout(() => toggleFlag(index), 520); }} onTouchEnd={(event) => window.clearTimeout(event.currentTarget.longPressTimer)} aria-label={flagged ? 'Flagged mine' : cell?.open ? cell.mine ? 'Mine' : `${cell.count || 'empty'} adjacent mines` : 'Hidden tile'}>{flagged ? '⚑' : cell?.open ? cell.mine ? '✹' : cell.count || '' : ''}</button>; })}</div><p className="arcade-feedback" role="status">{message} · {flagCount}/{mineCount} flags</p>{status !== 'playing' && <div className="arcade-end-banner"><strong>{status === 'won' ? 'Field cleared!' : 'Mine found'}</strong><button type="button" onClick={newField}>New field</button></div>}</section></ArcadeShell>;
}

const CONNECT_ROWS = 6; const CONNECT_COLS = 7;
const winningConnect = (board, row, col, player) => [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => {
  let count = 1;
  for (const direction of [-1, 1]) { let r = row + dr * direction; let c = col + dc * direction; while (r >= 0 && r < CONNECT_ROWS && c >= 0 && c < CONNECT_COLS && board[r][c] === player) { count += 1; r += dr * direction; c += dc * direction; } }
  return count >= 4;
});
function ConnectFour({ game, onComplete, onExit }) {
  const [board, setBoard] = useState(() => Array.from({ length: CONNECT_ROWS }, () => Array(CONNECT_COLS).fill(0)));
  const [turn, setTurn] = useState(1); const [mode, setMode] = useState('robot'); const [status, setStatus] = useState('playing'); const [message, setMessage] = useState('Your move. Choose a column.');
  const startRef = useRef(0); const doneRef = useRef(false); const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { startRef.current = Date.now(); }, []);
  const finish = useCallback((winner, next) => { if (doneRef.current) return; doneRef.current = true; setStatus(winner ? 'over' : 'draw'); setMessage(!winner ? 'A perfectly matched board.' : winner === 1 ? 'Four connected. You win!' : 'The computer connected four.'); const count = next.flat().filter(Boolean).length; report(onComplete, game, startRef.current, winner === 1 ? 1000 : winner === 2 ? 220 + count * 8 : 600, winner === 1 ? 100 : winner === 2 ? 35 : 70); }, [game, onComplete]);
  const drop = useCallback((column, player) => {
    if (status !== 'playing') return;
    const next = boardRef.current.map((row) => [...row]); let row = CONNECT_ROWS - 1;
    while (row >= 0 && next[row][column]) row -= 1; if (row < 0) return;
    next[row][column] = player; boardRef.current = next; setBoard(next);
    if (winningConnect(next, row, column, player)) { finish(player, next); return; }
    if (next[0].every(Boolean)) { finish(0, next); return; }
    setTurn(player === 1 ? 2 : 1); setMessage(player === 1 && mode === 'robot' ? 'Computer is choosing a column…' : player === 1 ? 'Blue turn.' : 'Your move. Choose a column.');
  }, [finish, mode, status]);
  useEffect(() => { if (mode !== 'robot' || turn !== 2 || status !== 'playing') return undefined; const timer = window.setTimeout(() => { const current = boardRef.current; const valid = Array.from({ length: CONNECT_COLS }, (_, col) => col).filter((col) => current[0][col] === 0); const winning = (player) => valid.find((col) => { const trial = current.map((row) => [...row]); let row = CONNECT_ROWS - 1; while (row >= 0 && trial[row][col]) row -= 1; if (row < 0) return false; trial[row][col] = player; return winningConnect(trial, row, col, player); }); const choice = winning(2) ?? winning(1) ?? valid.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))[0]; if (choice !== undefined) drop(choice, 2); }, 550); return () => window.clearTimeout(timer); }, [drop, mode, status, turn]);
  const reset = () => { const fresh = Array.from({ length: CONNECT_ROWS }, () => Array(CONNECT_COLS).fill(0)); boardRef.current = fresh; setBoard(fresh); setTurn(1); setStatus('playing'); setMessage('Your move. Choose a column.'); doneRef.current = false; startRef.current = Date.now(); };
  return <ArcadeShell game={game} onExit={onExit} eyebrow="FOUR IN A ROW"><section className="arcade-card connect-card"><div className="arcade-heading"><div><p className="eyebrow">DROP ZONE · STRATEGY MATCH</p><h1>Connect four.</h1><p>Build a line across, down, or diagonally. The computer blocks threats.</p></div><div className="mode-toggle"><button className={mode === 'robot' ? 'active' : ''} onClick={() => { setMode('robot'); reset(); }}>vs Robot</button><button className={mode === 'friends' ? 'active' : ''} onClick={() => { setMode('friends'); reset(); }}>2 Players</button></div></div>
    <p className="arcade-feedback" role="status">{message}</p><div className="connect-board" role="grid" aria-label="Connect Four board">{board.map((row, r) => row.map((value, c) => <button key={`${r}-${c}`} role="gridcell" type="button" onClick={() => turn === 1 || mode === 'friends' ? drop(c, turn) : undefined} disabled={Boolean(value) || status !== 'playing' || (mode === 'robot' && turn === 2)} className={`connect-hole player-${value}`} aria-label={`Row ${r + 1} column ${c + 1}${value ? ` player ${value}` : ''}`}></button>))}</div>{status !== 'playing' && <div className="arcade-end-banner"><strong>{message}</strong><button type="button" onClick={reset}>Rematch</button></div>}</section></ArcadeShell>;
}

const WORDS = ['BRAVE', 'CLOUD', 'PLANT', 'LIGHT', 'TRAIN', 'STONE', 'DREAM', 'FLAME', 'MOUSE', 'GRAPE', 'SHARE', 'CRANE', 'ROBOT', 'BRAIN', 'SCALE', 'TRACE', 'QUIET', 'PRIDE', 'SHELF', 'WORLD'];
const wordColors = (guess, answer) => { const result = Array(5).fill('absent'); const remaining = answer.split(''); for (let i = 0; i < 5; i += 1) if (guess[i] === answer[i]) { result[i] = 'correct'; remaining[i] = ''; } for (let i = 0; i < 5; i += 1) if (result[i] !== 'correct') { const found = remaining.indexOf(guess[i]); if (found >= 0) { result[i] = 'present'; remaining[found] = ''; } } return result; };
function Wordle({ game, onComplete, onExit }) {
  const [answer, setAnswer] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [guesses, setGuesses] = useState([]); const [current, setCurrent] = useState(''); const [message, setMessage] = useState('Six tries. Each color reveals a clue.'); const [status, setStatus] = useState('playing'); const startRef = useRef(0); const doneRef = useRef(false);
  const finish = useCallback((won, attempt) => { if (doneRef.current) return; doneRef.current = true; setStatus(won ? 'won' : 'lost'); setMessage(won ? 'Brilliant solve!' : `The word was ${answer}.`); report(onComplete, game, startRef.current, won ? 1000 - attempt * 100 : 180, won ? 100 : 0); }, [answer, game, onComplete]);
  const submit = useCallback(() => { if (current.length !== 5 || status !== 'playing') { setMessage(current.length === 5 ? message : 'Enter five letters first.'); return; } const next = [...guesses, current]; setGuesses(next); setCurrent(''); if (current === answer) finish(true, next.length); else if (next.length >= 6) finish(false, next.length); else setMessage('Try another word.'); }, [answer, current, finish, guesses, message, status]);
  const enter = useCallback((key) => { if (status !== 'playing') return; if (key === 'ENTER') { submit(); return; } if (key === 'BACKSPACE') { setCurrent((word) => word.slice(0, -1)); return; } if (/^[A-Z]$/.test(key)) setCurrent((word) => word.length < 5 ? word + key : word); }, [status, submit]);
  const reset = () => { doneRef.current = false; startRef.current = Date.now(); setAnswer(WORDS[Math.floor(Math.random() * WORDS.length)]); setGuesses([]); setCurrent(''); setMessage('Six tries. Each color reveals a clue.'); setStatus('playing'); };
  useEffect(() => { startRef.current = Date.now(); }, []);
  useEffect(() => { const handle = (event) => { if (event.key === 'Enter') enter('ENTER'); else if (event.key === 'Backspace') enter('BACKSPACE'); else if (/^[a-z]$/i.test(event.key)) enter(event.key.toUpperCase()); }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, [enter]);
  const keyboard = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split(''); const keyState = (letter) => guesses.flatMap((word) => wordColors(word, answer).map((color, index) => ({ letter: word[index], color }))).filter((item) => item.letter === letter).reduce((best, item) => ({ absent: 1, present: 2, correct: 3 }[item.color] > ({ absent: 1, present: 2, correct: 3 }[best] || 0) ? item.color : best), '');
  return <ArcadeShell game={game} onExit={onExit} eyebrow="WORD GRID"><section className="arcade-card wordle-card"><div className="arcade-heading"><div><p className="eyebrow">SIX GUESSES · FIVE LETTERS</p><h1>Find today’s word.</h1><p>Green is correct. Amber is in the word, in another spot. Gray is not in the word.</p></div></div><div className="wordle-grid" aria-label="Word puzzle">{Array.from({ length: 6 }, (_, r) => { const word = guesses[r] || (r === guesses.length ? current : ''); const colors = guesses[r] ? wordColors(guesses[r], answer) : []; return Array.from({ length: 5 }, (_, c) => <span key={`${r}-${c}`} className={`wordle-tile ${colors[c] || ''}`}>{word[c] || ''}</span>); })}</div>
    <div className="wordle-keyboard">{keyboard.map((key) => <button type="button" key={key} className={keyState(key)} onClick={() => enter(key)}>{key}</button>)}<button type="button" className="wide" onClick={() => enter('BACKSPACE')}>⌫</button><button type="button" className="wide enter" onClick={() => enter('ENTER')}>ENTER</button></div><p className="arcade-feedback" role="status">{message}</p>{status !== 'playing' && <div className="arcade-end-banner"><strong>{status === 'won' ? 'Word solved!' : 'Good practice!'}</strong><button type="button" onClick={reset}>New puzzle</button></div>}</section></ArcadeShell>;
}

function Snake({ game, onComplete, onExit }) {
  const canvasRef = useRef(null); const state = useRef(null); const scoreRef = useRef(0); const [score, setScore] = useState(0); const [best, setBest] = useState(() => Number(localStorage.getItem('gamepal-snake-best')) || 0); const [running, setRunning] = useState(true); const startRef = useRef(0); const doneRef = useRef(false);
  const resetState = useCallback(() => { const body = [{ x: 10, y: 8 }, { x: 9, y: 8 }, { x: 8, y: 8 }]; state.current = { body, direction: { x: 1, y: 0 }, queued: { x: 1, y: 0 }, food: { x: 15, y: 8 }, last: 0, acc: 0, ended: false }; }, []);
  useEffect(() => { startRef.current = Date.now(); resetState(); const target = canvasRef.current; const ctx = target.getContext('2d'); let raf; let previous = 0;
    const draw = (time) => { const s = state.current; if (!s) return; const width = target.width; const height = target.height; const cell = Math.min(width / 24, height / 16); const ox = (width - cell * 24) / 2; const oy = (height - cell * 16) / 2; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#07101c'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = 'rgba(148,163,184,.08)'; for (let x = 0; x <= 24; x += 1) { ctx.beginPath(); ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + 16 * cell); ctx.stroke(); } for (let y = 0; y <= 16; y += 1) { ctx.beginPath(); ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + 24 * cell, oy + y * cell); ctx.stroke(); }
      ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(ox + (s.food.x + .5) * cell, oy + (s.food.y + .5) * cell, cell * .34, 0, Math.PI * 2); ctx.fill();
      s.body.forEach((part, i) => { ctx.fillStyle = i ? '#17bd97' : '#73f3c8'; ctx.beginPath(); ctx.roundRect(ox + part.x * cell + 1, oy + part.y * cell + 1, cell - 2, cell - 2, cell * .25); ctx.fill(); });
      if (!s.ended) { const delta = Math.min(100, time - (previous || time)); previous = time; s.acc += delta; const speed = Math.max(68, 135 - scoreRef.current * 1.2); if (s.acc > speed) { s.acc = 0; s.direction = s.queued; const head = { x: s.body[0].x + s.direction.x, y: s.body[0].y + s.direction.y }; const eating = head.x === s.food.x && head.y === s.food.y; if (head.x < 0 || head.x >= 24 || head.y < 0 || head.y >= 16 || s.body.slice(0, eating ? undefined : -1).some((part) => part.x === head.x && part.y === head.y)) { s.ended = true; setRunning(false); if (!doneRef.current) { doneRef.current = true; report(onComplete, game, startRef.current, scoreRef.current * 38, Math.min(100, scoreRef.current * 8)); } } else { s.body.unshift(head); if (eating) { s.food = { x: Math.floor(Math.random() * 22) + 1, y: Math.floor(Math.random() * 14) + 1 }; scoreRef.current += 1; setScore(scoreRef.current); setBest((old) => { const bestScore = Math.max(old, scoreRef.current); try { localStorage.setItem('gamepal-snake-best', String(bestScore)); } catch { /* Ignore unavailable storage. */ } return bestScore; }); } else s.body.pop(); } } }
      raf = requestAnimationFrame(draw);
    }; raf = requestAnimationFrame(draw); const handle = (event) => { const s = state.current; if (!s) return; const moves = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }; const next = moves[event.key] || moves[event.key.toLowerCase()]; if (next) { event.preventDefault(); if (next[0] !== -s.direction.x || next[1] !== -s.direction.y) s.queued = { x: next[0], y: next[1] }; } }; window.addEventListener('keydown', handle); return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', handle); };
  }, [game, onComplete, resetState]);
  const reset = () => { doneRef.current = false; startRef.current = Date.now(); scoreRef.current = 0; setScore(0); setRunning(true); resetState(); };
  return <ArcadeShell game={game} onExit={onExit} eyebrow="NEON ARCADE · ENDLESS RUN"><section className="arcade-card canvas-arcade-card"><div className="arcade-heading"><div><p className="eyebrow">SNAKE · GRID RUNNER</p><h1>Grow without crossing your trail.</h1><p>Steer with arrows or WASD. Eat the energy orbs and keep clear of the walls.</p></div><div className="arcade-score-pills"><span><small>RUN SCORE</small><b>{score}</b></span><span><small>BEST</small><b>{best}</b></span></div></div><canvas ref={canvasRef} className="arcade-canvas snake-canvas" width="960" height="620" aria-label="Snake game arena"/><div className="arcade-touch-pad"><button onClick={() => { state.current.queued = { x: 0, y: -1 }; }}>↑</button><div><button onClick={() => { state.current.queued = { x: -1, y: 0 }; }}>←</button><button onClick={() => { state.current.queued = { x: 0, y: 1 }; }}>↓</button><button onClick={() => { state.current.queued = { x: 1, y: 0 }; }}>→</button></div></div>{!running && <div className="arcade-end-banner"><strong>Run over · {score} orbs</strong><button type="button" onClick={reset}>Run again</button></div>}</section></ArcadeShell>;
}

function FlappyBird({ game, onComplete, onExit }) {
  const canvasRef = useRef(null); const world = useRef(null); const [score, setScore] = useState(0); const [best, setBest] = useState(() => Number(localStorage.getItem('gamepal-flappy-best')) || 0); const [playing, setPlaying] = useState(true); const startRef = useRef(0); const doneRef = useRef(false);
  const flap = useCallback(() => { if (world.current && !world.current.ended) world.current.vy = -410; }, []);
  useEffect(() => { startRef.current = Date.now(); const target = canvasRef.current; const ctx = target.getContext('2d'); world.current = { y: 180, vy: 0, pipes: [], elapsed: 0, score: 0, ended: false, last: 0 }; let raf;
    const draw = (time) => { const s = world.current; const w = target.width; const h = target.height; const dt = Math.min(.035, (time - (s.last || time)) / 1000); s.last = time; s.elapsed += dt; ctx.fillStyle = '#8de0ff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#bdeeff'; for (let i = 0; i < 4; i += 1) { const x = (i * 270 + 80 - s.elapsed * 18) % (w + 220); ctx.beginPath(); ctx.arc(x, 82 + (i % 2) * 48, 35, Math.PI, 0); ctx.arc(x + 38, 82 + (i % 2) * 48, 28, Math.PI, 0); ctx.fill(); }
      if (!s.ended) { s.vy += 1050 * dt; s.y += s.vy * dt; if (s.pipes.length === 0 || s.pipes[s.pipes.length - 1].x < 590) s.pipes.push({ x: w + 10, gap: 105 + Math.random() * 165, scored: false }); s.pipes.forEach((pipe) => { pipe.x -= 220 * dt; const top = pipe.gap; const gap = 155; ctx.fillStyle = '#20a15c'; ctx.fillRect(pipe.x, 0, 82, top); ctx.fillRect(pipe.x - 7, top - 22, 96, 22); ctx.fillRect(pipe.x, top + gap, 82, h - top - gap); ctx.fillRect(pipe.x - 7, top + gap, 96, 22); if (!pipe.scored && pipe.x + 82 < 166) { pipe.scored = true; s.score += 1; setScore(s.score); setBest((old) => { const next = Math.max(old, s.score); try { localStorage.setItem('gamepal-flappy-best', String(next)); } catch { /* Ignore unavailable storage. */ } return next; }); } if (pipe.x < 186 && pipe.x + 82 > 145 && (s.y - 13 < top || s.y + 13 > top + gap)) s.ended = true; }); s.pipes = s.pipes.filter((pipe) => pipe.x > -100); if (s.y > h - 35 || s.y < 0) s.ended = true; }
      ctx.fillStyle = '#facc47'; ctx.beginPath(); ctx.ellipse(165, s.y, 20, 15, Math.max(-.4, Math.min(.5, s.vy / 900)), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(172, s.y - 5, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#112033'; ctx.beginPath(); ctx.arc(174, s.y - 5, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(184, s.y); ctx.lineTo(198, s.y + 3); ctx.lineTo(184, s.y + 7); ctx.fill(); ctx.fillStyle = '#c78b53'; ctx.fillRect(0, h - 30, w, 30); ctx.fillStyle = '#6fbd55'; ctx.fillRect(0, h - 36, w, 8);
      if (s.ended && !doneRef.current) { doneRef.current = true; setPlaying(false); report(onComplete, game, startRef.current, Math.min(1000, s.score * 100), Math.min(100, s.score * 8)); } raf = requestAnimationFrame(draw);
    }; raf = requestAnimationFrame(draw); const key = (event) => { if ([' ', 'ArrowUp', 'w', 'W'].includes(event.key)) { event.preventDefault(); flap(); } }; window.addEventListener('keydown', key); return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); };
  }, [flap, game, onComplete]);
  const reset = () => { doneRef.current = false; startRef.current = Date.now(); world.current = { y: 180, vy: 0, pipes: [], elapsed: 0, score: 0, ended: false, last: 0 }; setScore(0); setPlaying(true); };
  return <ArcadeShell game={game} onExit={onExit} eyebrow="SKYLINE FLIGHT"><section className="arcade-card canvas-arcade-card"><div className="arcade-heading"><div><p className="eyebrow">FLAPPY BIRD · ENDLESS FLIGHT</p><h1>Find the gap.</h1><p>Tap, click, or press Space to flap between the pipes.</p></div><div className="arcade-score-pills"><span><small>FLIGHT</small><b>{score}</b></span><span><small>BEST</small><b>{best}</b></span></div></div><canvas ref={canvasRef} className="arcade-canvas flappy-canvas" width="900" height="380" onPointerDown={flap} aria-label="Flappy Bird flight course"/><p className="arcade-feedback">{playing ? 'Tap or press Space to flap.' : `Flight ended after ${score} pipes.`}</p>{!playing && <div className="arcade-end-banner"><strong>Flight complete · {score} pipes</strong><button type="button" onClick={reset}>Fly again</button></div>}</section></ArcadeShell>;
}

const makeBrickState = () => ({ paddle: 450, ball: { x: 450, y: 345, vx: 230, vy: -250 }, bricks: Array.from({ length: 5 }, (_, row) => Array.from({ length: 10 }, (_, col) => ({ x: 55 + col * 79, y: 60 + row * 30, alive: true, color: ['#37d3b4', '#22b7dd', '#7877ff', '#b36cf7', '#f062a2'][row] }))), lives: 3, score: 0, ended: false, won: false, last: 0 });
function BrickBreaker({ game, onComplete, onExit }) {
  const canvasRef = useRef(null); const state = useRef(null); const [score, setScore] = useState(0); const [lives, setLives] = useState(3); const [best, setBest] = useState(() => Number(localStorage.getItem('gamepal-brick-best')) || 0); const [playing, setPlaying] = useState(true); const [won, setWon] = useState(false); const startRef = useRef(0); const doneRef = useRef(false);
  useEffect(() => { startRef.current = Date.now(); state.current = makeBrickState(); const target = canvasRef.current; const ctx = target.getContext('2d'); let raf; let pointerX = null;
    const movePointer = (event) => { const rect = target.getBoundingClientRect(); pointerX = (event.clientX - rect.left) / rect.width * target.width; }; const keyDown = (event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); state.current.paddle -= 36; } if (event.key === 'ArrowRight') { event.preventDefault(); state.current.paddle += 36; } };
    const draw = (time) => { const s = state.current; if (!s) return; const w = target.width; const h = target.height; const dt = Math.min(.03, (time - (s.last || time)) / 1000); s.last = time; if (pointerX != null) s.paddle += (pointerX - s.paddle) * .22; s.paddle = Math.max(60, Math.min(w - 60, s.paddle)); ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, w, h);
      if (!s.ended) { const b = s.ball; b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < 12 || b.x > w - 12) b.vx *= -1; if (b.y < 15) b.vy = Math.abs(b.vy); if (b.vy > 0 && b.y > h - 55 && b.y < h - 38 && Math.abs(b.x - s.paddle) < 70) { const offset = (b.x - s.paddle) / 70; b.vx = offset * 360; b.vy = -Math.max(220, Math.abs(b.vy)); } if (b.y > h + 15) { s.lives -= 1; setLives(s.lives); if (s.lives <= 0) s.ended = true; else { b.x = s.paddle; b.y = h - 74; b.vx = 210 * (Math.random() > .5 ? 1 : -1); b.vy = -260; } }
        for (const brick of s.bricks.flat()) if (brick.alive && b.x > brick.x && b.x < brick.x + 65 && b.y > brick.y && b.y < brick.y + 20) { brick.alive = false; b.vy *= -1; s.score += 10; setScore(s.score); setBest((old) => { const next = Math.max(old, s.score); try { localStorage.setItem('gamepal-brick-best', String(next)); } catch { /* Ignore unavailable storage. */ } return next; }); break; } if (s.bricks.flat().every((brick) => !brick.alive)) { s.ended = true; s.won = true; }
      }
      for (const brick of s.bricks.flat()) if (brick.alive) { ctx.fillStyle = brick.color; ctx.beginPath(); ctx.roundRect(brick.x, brick.y, 65, 20, 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(brick.x + 5, brick.y + 4, 45, 2); }
      ctx.fillStyle = '#5eead4'; ctx.shadowColor = '#5eead4'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.roundRect(s.paddle - 57, h - 34, 114, 12, 6); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 8, 0, Math.PI * 2); ctx.fill();
      if (s.ended && !doneRef.current) { doneRef.current = true; setPlaying(false); setWon(s.won); report(onComplete, game, startRef.current, s.won ? 1000 : Math.min(850, s.score), s.won ? 100 : Math.round(s.lives / 3 * 100)); } raf = requestAnimationFrame(draw);
    }; raf = requestAnimationFrame(draw); target.addEventListener('pointermove', movePointer); window.addEventListener('keydown', keyDown); return () => { cancelAnimationFrame(raf); target.removeEventListener('pointermove', movePointer); window.removeEventListener('keydown', keyDown); };
  }, [game, onComplete]);
  const reset = () => { doneRef.current = false; startRef.current = Date.now(); state.current = makeBrickState(); setScore(0); setLives(3); setWon(false); setPlaying(true); };
  return <ArcadeShell game={game} onExit={onExit} eyebrow="BRICK BREAKER · ARKANOID"><section className="arcade-card canvas-arcade-card"><div className="arcade-heading"><div><p className="eyebrow">ARCADE CABINET · THREE LIVES</p><h1>Keep the ball in play.</h1><p>Move the paddle with your pointer or Left/Right arrows. Edge hits steer the ball.</p></div><div className="arcade-score-pills"><span><small>SCORE</small><b>{score}</b></span><span><small>LIVES</small><b>{'♥'.repeat(lives)}{'♡'.repeat(3 - lives)}</b></span><span><small>BEST</small><b>{best}</b></span></div></div><canvas ref={canvasRef} className="arcade-canvas brick-canvas" width="900" height="450" aria-label="Brick breaker game field"/><p className="arcade-feedback">{playing ? 'Move the paddle under the ball.' : `Round complete · ${score} points.`}</p>{!playing && <div className="arcade-end-banner"><strong>{won ? 'Wall cleared!' : 'Ball lost'}</strong><button type="button" onClick={reset}>New round</button></div>}</section></ArcadeShell>;
}

const GAME_COMPONENTS = { '2048': Game2048, minesweeper: Minesweeper, 'connect-4': ConnectFour, wordle: Wordle, snake: Snake, 'flappy-bird': FlappyBird, 'brick-breaker': BrickBreaker };
export default function ArcadeMiniGame({ game, onComplete, onExit, initialLevel = 1 }) {
  const Game = GAME_COMPONENTS[game.id];
  return Game ? <Game game={game} onComplete={onComplete} onExit={onExit} initialLevel={initialLevel} /> : null;
}
