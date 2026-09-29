import { useEffect, useMemo, useRef, useState } from 'react';

const COLORS = [
  { name: 'Ruby', hex: '#fb5c69', tint: 'rgba(251,92,105,.16)', start: 47 },
  { name: 'Azure', hex: '#4e9dff', tint: 'rgba(78,157,255,.16)', start: 7 },
  { name: 'Amber', hex: '#f6b844', tint: 'rgba(246,184,68,.16)', start: 20 },
  { name: 'Jade', hex: '#42d6a4', tint: 'rgba(66,214,164,.16)', start: 33 },
];
const TRACK = (() => {
  const cells = [];
  for (let column = 1; column <= 14; column += 1) cells.push([1, column]);
  for (let row = 2; row <= 14; row += 1) cells.push([row, 14]);
  for (let column = 13; column >= 1; column -= 1) cells.push([14, column]);
  for (let row = 13; row >= 2; row -= 1) cells.push([row, 1]);
  return cells;
})();
const SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
const LADDERS = { 2: 23, 8: 34, 20: 77, 32: 68, 41: 79, 50: 91, 71: 92, 80: 99 };
const PLAYERS = ['You', 'Player 2', 'Player 3', 'Player 4'];
const elapsedSeconds = (startedAt) => Math.max(1, Math.round((Date.now() - startedAt) / 1000));
const finishGame = (onComplete, game, score, accuracy, startedAt) => onComplete(game.name, game.category, score, accuracy, elapsedSeconds(startedAt));

function BoardShell({ game, onExit, children, turn }) {
  return <main className="cognitive-game-screen board-game-screen">
    <header className="cognitive-game-topbar"><button type="button" className="btn-cancel" onClick={onExit}><i className="ph ph-arrow-left"></i> Exit game</button><div className="cognitive-game-top-meta"><span>{game.category.toUpperCase()}</span><span>PASS & PLAY</span></div><span className="cognitive-game-score"><i className={`ph-fill ${game.icon}`}></i> {game.name}</span></header>
    <div className="board-game-wrap">{turn && <div className="board-turn-banner" style={{ '--turn-tint': turn.color }}><span className="board-turn-dot"></span><div><small>UP NEXT</small><strong>{turn.name}</strong></div><span className="board-turn-caption">Pass the device to the next player</span></div>}{children}</div>
    <p className="cognitive-game-footnote">A friendly pass-and-play game. Scores are saved to your GamePal player profile.</p>
  </main>;
}

function PlayerCountPicker({ count, setCount, locked }) {
  return <div className="board-player-picker" aria-label="Choose player count"><span>PLAYERS</span>{[2, 3, 4].map((value) => <button type="button" key={value} className={count === value ? 'active' : ''} disabled={locked} onClick={() => setCount(value)}>{value}</button>)}</div>;
}

function LudoKing({ game, onComplete, onExit }) {
  const [playerCount, setPlayerCount] = useState(2);
  const [tokens, setTokens] = useState(() => Array.from({ length: 4 }, () => Array(4).fill(-1)));
  const [turn, setTurn] = useState(0);
  const [die, setDie] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [notice, setNotice] = useState('Roll a six to bring a token out of the yard.');
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(0);
  useEffect(() => { startedAt.current = Date.now(); }, []);
  const players = useMemo(() => COLORS.slice(0, playerCount).map((color, index) => ({ ...color, name: index === 0 ? 'You' : PLAYERS[index] })), [playerCount]);

  const complete = (next, winner) => {
    setFinished(true);
    setNotice(`${winner.name} brought every token home. A brilliant finish!`);
    const userPiecesHome = next[0].filter((step) => step === 56).length;
    const userProgress = next[0].reduce((sum, step) => sum + Math.max(0, step), 0);
    const score = winner.name === 'You' ? 1000 : 100 + Math.round((userProgress / 224) * 700);
    finishGame(onComplete, game, score, Math.round((userPiecesHome / 4) * 100), startedAt.current);
  };
  const nextPlayer = () => setTurn((current) => (current + 1) % playerCount);

  const rollDie = () => {
    if (finished || rolling || die !== null) return;
    setRolling(true);
    window.setTimeout(() => {
      const value = Math.floor(Math.random() * 6) + 1;
      setDie(value);
      setRolling(false);
      const movable = tokens[turn].some((step) => (step === -1 ? value === 6 : step + value <= 56));
      if (!movable) {
        setNotice(value === 6 ? 'No token can move. Your turn passes.' : 'A six is needed to leave the yard. Your turn passes.');
        window.setTimeout(() => { setDie(null); nextPlayer(); }, 900);
      } else setNotice(`${players[turn].name} rolled ${value}. Choose one highlighted token.`);
    }, 420);
  };

  const moveToken = (tokenIndex) => {
    if (finished || rolling || die === null) return;
    const step = tokens[turn][tokenIndex];
    if (step === -1 && die !== 6) return;
    if (step !== -1 && step + die > 56) return;
    const next = tokens.map((row) => [...row]);
    const newStep = step === -1 ? 0 : step + die;
    next[turn][tokenIndex] = newStep;
    let captured = 0;
    if (newStep <= 51) {
      const landing = (players[turn].start + newStep) % 52;
      const safeSquares = new Set([...players.map((player) => player.start), 0, 8, 13, 21, 26, 34, 39, 47]);
      const safe = safeSquares.has(landing);
      if (!safe) {
        next.forEach((pieces, opponent) => {
          if (opponent === turn) return;
          pieces.forEach((opponentStep, index) => {
            if (opponentStep >= 0 && opponentStep <= 51 && (players[opponent].start + opponentStep) % 52 === landing) {
              next[opponent][index] = -1;
              captured += 1;
            }
          });
        });
      }
    }
    setTokens(next);
    const finishedCount = next[turn].filter((value) => value === 56).length;
    if (finishedCount === 4) { complete(next, players[turn]); return; }
    const again = die === 6 || captured > 0;
    setNotice(captured ? `Capture! ${captured} rival token${captured > 1 ? 's' : ''} sent back to the yard.` : newStep === 56 ? 'Token home! Exact landing.' : again ? 'Six rolled — take another turn.' : `${players[turn].name} moved a token ${die} space${die === 1 ? '' : 's'}.`);
    setDie(null);
    if (!again) nextPlayer();
  };

  const locationFor = (player, step, tokenIndex) => {
    if (step < 0) {
      const base = [[3, 3], [3, 12], [12, 12], [12, 3]][player];
      return [base[0] + (tokenIndex > 1 ? 1 : 0), base[1] + (tokenIndex % 2)];
    }
    if (step <= 51) return TRACK[(players[player].start + step) % 52];
    const progress = step - 51;
    return player === 0 ? [1 + progress, 7] : player === 1 ? [7, 14 - progress] : player === 2 ? [14 - progress, 8] : [8, 1 + progress];
  };
  const canMove = (step) => die !== null && (step === -1 ? die === 6 : step + die <= 56);

  return <BoardShell game={game} onExit={onExit} turn={{ name: players[turn].name, color: players[turn].hex }}>
    <section className="board-game-card ludo-card">
      <div className="board-game-heading"><div><p className="eyebrow">THE CLASSIC RACE HOME</p><h1>Roll. Race. Bring your team home.</h1><p>Take turns on one device. Roll a six to enter the track, capture rival tokens, and finish with an exact roll.</p></div><PlayerCountPicker count={playerCount} setCount={(count) => { setPlayerCount(count); setTokens(Array.from({ length: 4 }, () => Array(4).fill(-1))); setTurn(0); setDie(null); }} locked={tokens.some((row) => row.some((step) => step !== -1))} /></div>
      <div className="ludo-board-wrap"><div className="ludo-board" role="grid" aria-label="Ludo board">
        <div className="ludo-base base-ruby"><strong>RUBY</strong><div>{tokens[0].map((step, index) => step < 0 && <span key={index} style={{ '--player': COLORS[0].hex }} />)}</div></div>
        <div className="ludo-base base-azure"><strong>AZURE</strong><div>{tokens[1].map((step, index) => step < 0 && <span key={index} style={{ '--player': COLORS[1].hex }} />)}</div></div>
        <div className="ludo-base base-amber"><strong>AMBER</strong><div>{tokens[2].map((step, index) => step < 0 && <span key={index} style={{ '--player': COLORS[2].hex }} />)}</div></div>
        <div className="ludo-base base-jade"><strong>JADE</strong><div>{tokens[3].map((step, index) => step < 0 && <span key={index} style={{ '--player': COLORS[3].hex }} />)}</div></div>
        {TRACK.map(([row, column], index) => <span key={`track-${index}`} className={`ludo-track-tile ${index % 13 === 0 ? 'safe' : ''}`} style={{ '--grid-row': row + 1, '--grid-col': column + 1 }}></span>)}
        <div className="ludo-center"><i className="ph-fill ph-crown"></i><span>HOME</span></div>
        {tokens.slice(0, playerCount).flatMap((pieces, player) => pieces.map((step, token) => {
          if (step < 0 || step === 56) return null;
          const [row, column] = locationFor(player, step, token);
          return <button type="button" key={`${player}-${token}`} aria-label={`${players[player].name} token ${token + 1}`} className={`ludo-token ${player === turn && canMove(step) ? 'movable' : ''}`} onClick={() => player === turn && moveToken(token)} style={{ '--grid-row': row + 1, '--grid-col': column + 1, '--player': players[player].hex }} disabled={player !== turn || !canMove(step) || finished}><span>{token + 1}</span></button>;
        }))}
      </div></div>
      <div className="board-game-controls"><div className="board-game-notice" aria-live="polite">{notice}</div><button type="button" className={`board-dice ${rolling ? 'rolling' : ''}`} onClick={rollDie} disabled={finished || rolling || die !== null}><span>{rolling ? '🎲' : die ?? '🎲'}</span><small>{die === null ? 'ROLL DICE' : 'SELECT A TOKEN'}</small></button></div>
      <div className="board-player-strip">{players.map((player, index) => <div key={player.name} className={turn === index ? 'active' : ''} style={{ '--player': player.hex }}><span></span><strong>{player.name}</strong><small>{tokens[index].filter((step) => step === 56).length}/4 home</small></div>)}</div>
    </section>
  </BoardShell>;
}

function SnakeLadders({ game, onComplete, onExit }) {
  const [playerCount, setPlayerCount] = useState(2);
  const [positions, setPositions] = useState([0, 0, 0, 0]);
  const [turn, setTurn] = useState(0);
  const [die, setDie] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [notice, setNotice] = useState('Roll the die and follow the numbered route.');
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(0);
  useEffect(() => { startedAt.current = Date.now(); }, []);
  const boardNumbers = useMemo(() => Array.from({ length: 100 }, (_, index) => 100 - index).map((number) => {
    const row = Math.floor((number - 1) / 10);
    const column = (number - 1) % 10;
    return { number, gridRow: 10 - row, gridColumn: row % 2 === 0 ? column + 1 : 10 - column };
  }), []);
  const players = useMemo(() => COLORS.slice(0, playerCount).map((color, index) => ({ ...color, name: index === 0 ? 'You' : PLAYERS[index] })), [playerCount]);

  const roll = () => {
    if (rolling || finished) return;
    setRolling(true);
    window.setTimeout(() => {
      const value = Math.floor(Math.random() * 6) + 1;
      setDie(value);
      const target = positions[turn] + value;
      if (target > 100) {
        setNotice(`${players[turn].name} rolled ${value}; an exact roll is needed for square 100.`);
        setTimeout(() => { setDie(null); setTurn((current) => (current + 1) % playerCount); }, 800);
        setRolling(false);
        return;
      }
      const landed = LADDERS[target] || SNAKES[target] || target;
      const next = [...positions];
      next[turn] = landed;
      setPositions(next);
      setNotice(LADDERS[target] ? `Ladder! Climb from ${target} to ${landed}.` : SNAKES[target] ? `Snake! Slide from ${target} to ${landed}.` : `${players[turn].name} moved to ${landed}.`);
      window.setTimeout(() => {
        setDie(null);
        if (landed === 100) {
          setFinished(true);
          setNotice(`${players[turn].name} reached 100 and won the race!`);
          const playerScore = turn === 0 ? 1000 : 100 + Math.round((positions[0] / 100) * 700);
          finishGame(onComplete, game, playerScore, positions[0], startedAt.current);
        } else setTurn((current) => (current + 1) % playerCount);
      }, 700);
      setRolling(false);
    }, 400);
  };

  return <BoardShell game={game} onExit={onExit} turn={{ name: players[turn].name, color: players[turn].hex }}>
    <section className="board-game-card snakes-card">
      <div className="board-game-heading"><div><p className="eyebrow">A RACE TO 100</p><h1>Climb high. Watch your step.</h1><p>Take turns. Ladders lift you forward, snakes send you back. Land exactly on 100 to win.</p></div><PlayerCountPicker count={playerCount} setCount={(count) => { setPlayerCount(count); setPositions([0, 0, 0, 0]); setTurn(0); setDie(null); }} locked={positions.some((position) => position > 0)} /></div>
      <div className="snakes-board-wrap"><div className="snakes-board" role="grid" aria-label="Snakes and ladders board">
        {boardNumbers.map(({ number, gridRow, gridColumn }) => <div role="gridcell" key={number} className={`snakes-square ${number % 2 ? 'odd' : 'even'} ${SNAKES[number] ? 'snake-square' : ''} ${LADDERS[number] ? 'ladder-square' : ''} ${number === 100 ? 'finish-square' : ''}`} style={{ '--grid-row': gridRow, '--grid-col': gridColumn }}><span>{number}</span>{SNAKES[number] ? <small>🐍</small> : LADDERS[number] ? <small>🪜</small> : null}{positions.map((position, player) => position === number && <i key={player} className="snakes-player-token" style={{ '--player': players[player].hex }} aria-label={players[player].name}></i>)}</div>)}
      </div></div>
      <div className="board-game-controls"><div className="board-game-notice" aria-live="polite">{notice}</div><button type="button" className={`board-dice ${rolling ? 'rolling' : ''}`} onClick={roll} disabled={finished || rolling}><span>{rolling ? '🎲' : die ?? '🎲'}</span><small>{finished ? 'FINISHED' : 'ROLL DICE'}</small></button></div>
      <div className="board-player-strip">{players.map((player, index) => <div key={player.name} className={turn === index ? 'active' : ''} style={{ '--player': player.hex }}><span></span><strong>{player.name}</strong><small>{positions[index] ? `Square ${positions[index]}` : 'At start'}</small></div>)}</div>
    </section>
  </BoardShell>;
}

export default function BoardMiniGame({ game, onComplete, onExit }) {
  if (game.id === 'ludo-king') return <LudoKing game={game} onComplete={onComplete} onExit={onExit} />;
  return <SnakeLadders game={game} onComplete={onComplete} onExit={onExit} />;
}
