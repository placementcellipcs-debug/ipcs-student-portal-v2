import { useMemo, useState } from 'react';

const SIZE = 6;
const finish = (game, onComplete, startedAt, score, accuracy) => onComplete(
  game.name,
  game.category,
  Math.max(0, Math.round(score)),
  Math.max(0, Math.min(100, Math.round(accuracy))),
  Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
);

function GameFrame({ game, onExit, prompt, children }) {
  return (
    <main className="cognitive-game-screen reference-game-screen">
      <header className="cognitive-game-topbar">
        <button type="button" className="btn-cancel" onClick={onExit}><i className="ph ph-arrow-left"></i> Exit game</button>
        <div className="reference-game-title"><span style={{ color: game.tint }}>{game.category}</span><strong>{game.name}</strong></div>
        <span className="reference-game-session"><i className="ph-fill ph-sparkle"></i> Practice</span>
      </header>
      <section className="reference-game-card">
        <div className="reference-game-heading"><span className="reference-game-icon" style={{ '--game-tint': game.tint }}><i className={`ph-fill ${game.icon}`}></i></span><div><p className="eyebrow">Mini-game · One focused round</p><h1>{game.name}</h1></div></div>
        <p className="reference-game-prompt">{prompt}</p>
        {children}
      </section>
      <p className="cognitive-game-footnote">Short learning practice for your everyday routine. GamePal scores describe your sessions, not a medical assessment.</p>
    </main>
  );
}

function Pinpoint({ game, onComplete, onExit }) {
  const clues = [
    'This word can mean “happening now.”',
    'It can describe the flow of a river.',
    'Electricity moving through a wire is measured with this word.',
    'It is another word for a flow or trend.',
    'Put all the clues together: what is the word?',
  ];
  const [guess, setGuess] = useState('');
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const submit = (event) => {
    event.preventDefault();
    if (done || !guess.trim()) return;
    if (guess.trim().toLowerCase() === 'current') {
      setDone(true);
      setMessage('You found it. The clues all pointed to “current.”');
      finish(game, onComplete, startedAt, 110 + (4 - wrong) * 20, Math.max(20, 100 - wrong * 15));
      return;
    }
    const next = wrong + 1;
    setWrong(next);
    setMessage(next === 5 ? 'The answer was “current.” Try another puzzle next time.' : 'Not this time. Here is another clue.');
    if (next >= 5) {
      setDone(true);
      finish(game, onComplete, startedAt, 15, 10);
    }
    setGuess('');
  };

  return <GameFrame game={game} onExit={onExit} prompt="Read each clue, make a connection, and solve the word in five guesses or fewer.">
    <div className="pinpoint-clue-count"><span>{Math.min(wrong + 1, clues.length)} of {clues.length} clues</span><span>{5 - wrong} {5 - wrong === 1 ? 'guess' : 'guesses'} left</span></div>
    <div className="pinpoint-clue-list">{clues.slice(0, Math.min(wrong + 1, clues.length)).map((clue, index) => <div className="pinpoint-clue" key={clue}><span>0{index + 1}</span><p>{clue}</p></div>)}</div>
    <form className="reference-game-answer" onSubmit={submit}><label htmlFor="pinpoint-guess">Your answer</label><div><input id="pinpoint-guess" value={guess} onChange={(event) => setGuess(event.target.value)} disabled={done} autoComplete="off" placeholder="Type a word…" /><button type="submit" disabled={done || !guess.trim()}>Guess <i className="ph ph-arrow-right"></i></button></div></form>
    {message && <p className={`reference-game-feedback ${done ? 'success' : ''}`} role="status"><i className={`ph-fill ${done ? 'ph-check-circle' : 'ph-lightbulb'}`}></i>{message}</p>}
  </GameFrame>;
}

const hammingDistanceOne = (left, right) => left.length === right.length && [...left].filter((letter, index) => letter !== right[index]).length === 1;
function Crossclimb({ game, onComplete, onExit }) {
  const words = ['CORD', 'CARD', 'WARD'];
  const [slots, setSlots] = useState(['', '', '']);
  const [picked, setPicked] = useState('');
  const [message, setMessage] = useState('');
  const [startedAt] = useState(() => Date.now());
  const available = words.filter((word) => !slots.includes(word));
  const check = () => {
    if (slots.some((word) => !word)) { setMessage('Place every middle word before checking the ladder.'); return; }
    const ladder = ['COLD', ...slots, 'WARM'];
    const valid = ladder.slice(1).every((word, index) => hammingDistanceOne(ladder[index], word));
    setMessage(valid ? 'Every step changes exactly one letter. Ladder complete!' : 'Check the order: each neighboring word must differ by one letter.');
    if (valid) finish(game, onComplete, startedAt, 150, 100);
  };
  const placeInSlot = (index) => {
    if (picked) {
      setSlots((current) => { const next = [...current]; const previousSlot = next.indexOf(picked); if (previousSlot !== -1) next[previousSlot] = ''; next[index] = picked; return next; });
      setPicked(''); setMessage('');
    } else if (slots[index]) {
      setSlots((current) => current.map((word, slot) => slot === index ? '' : word));
    }
  };

  return <GameFrame game={game} onExit={onExit} prompt="Use every word once to build a word ladder. Each neighboring pair must differ by one letter.">
    <div className="crossclimb-hints"><span>START <strong>COLD</strong><small>Opposite of hot</small></span><i className="ph ph-arrow-down"></i><span>FINISH <strong>WARM</strong><small>Opposite of cold</small></span></div>
    <div className="crossclimb-board" aria-label="Word ladder slots"><div className="crossclimb-fixed">COLD <small>START</small></div>{slots.map((word, index) => <button type="button" className={`crossclimb-slot ${picked ? 'ready' : ''}`} key={index} onClick={() => placeInSlot(index)} aria-label={`Word ladder space ${index + 1}${word ? `: ${word}` : ''}`}>{word || 'Tap a slot'}<span>{index + 2}</span></button>)}<div className="crossclimb-fixed">WARM <small>FINISH</small></div></div>
    <div className="crossclimb-tiles">{available.map((word) => <button type="button" key={word} className={picked === word ? 'selected' : ''} onClick={() => setPicked(picked === word ? '' : word)}>{word}</button>)}</div>
    <div className="reference-game-actions"><button type="button" className="reference-game-primary" onClick={check}>Check ladder <i className="ph ph-check"></i></button></div>
    {message && <p className={`reference-game-feedback ${message.includes('complete') ? 'success' : ''}`} role="status">{message}</p>}
  </GameFrame>;
}

const REGIONS = Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, column) => (row * 2 + column * 3) % SIZE));
const REGION_COLORS = ['#38bdf8', '#a78bfa', '#fb7185', '#34d399', '#fbbf24', '#60a5fa'];
function Queens({ game, onComplete, onExit }) {
  const [queens, setQueens] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tool, setTool] = useState('queen');
  const [message, setMessage] = useState('Place one queen in each row, column, and color region. Queens cannot touch.');
  const [startedAt] = useState(() => Date.now());
  const place = (row, column) => {
    const key = `${row},${column}`;
    if (tool === 'note') {
      setNotes((current) => current.includes(key) ? current.filter((cell) => cell !== key) : [...current, key]);
      return;
    }
    setQueens((current) => current.some((queen) => queen.key === key) ? current.filter((queen) => queen.key !== key) : [...current.filter((queen) => queen.row !== row), { key, row, column }]);
  };
  const check = () => {
    if (queens.length !== SIZE) { setMessage(`Place ${SIZE - queens.length} more ${SIZE - queens.length === 1 ? 'queen' : 'queens'} before checking.`); return; }
    const rows = new Set(queens.map((queen) => queen.row));
    const columns = new Set(queens.map((queen) => queen.column));
    const regions = new Set(queens.map((queen) => REGIONS[queen.row][queen.column]));
    const touching = queens.some((queen, index) => queens.slice(index + 1).some((other) => Math.abs(queen.row - other.row) <= 1 && Math.abs(queen.column - other.column) <= 1));
    const valid = rows.size === SIZE && columns.size === SIZE && regions.size === SIZE && !touching;
    setMessage(valid ? 'Every row, column, and region is covered safely. Queens placed!' : 'A queen shares a row, column, or region, or is touching another queen. Adjust and try again.');
    if (valid) finish(game, onComplete, startedAt, 180, 100);
  };
  return <GameFrame game={game} onExit={onExit} prompt="Place six queens. Keep one in every row, column, and colored region, with no queens touching each other.">
    <div className="puzzle-tools"><button type="button" className={tool === 'queen' ? 'active' : ''} onClick={() => setTool('queen')}><i className="ph-fill ph-crown"></i> Place queen</button><button type="button" className={tool === 'note' ? 'active' : ''} onClick={() => setTool('note')}><i className="ph ph-x"></i> Add note</button><span>{queens.length} / 6 queens</span></div>
    <div className="queens-board" role="group" aria-label="Queens puzzle board">{REGIONS.flatMap((row, rowIndex) => row.map((region, column) => { const key = `${rowIndex},${column}`; const queen = queens.some((item) => item.key === key); return <button type="button" key={key} aria-label={`Row ${rowIndex + 1}, column ${column + 1}, region ${region + 1}${queen ? ', queen' : ''}`} onClick={() => place(rowIndex, column)} className={`${queen ? 'has-queen' : ''} ${notes.includes(key) ? 'has-note' : ''}`} style={{ '--region-color': REGION_COLORS[region] }}>{queen ? <i className="ph-fill ph-crown"></i> : notes.includes(key) ? <i className="ph ph-x"></i> : null}</button>; }))}</div>
    <div className="reference-game-actions"><button type="button" className="reference-game-primary" onClick={check}>Check queens <i className="ph ph-check"></i></button></div>
    <p className="reference-game-feedback" role="status"><i className="ph ph-info"></i>{message}</p>
  </GameFrame>;
}

const TANGO_GIVENS = new Map([
  ['0,2', 0], ['0,3', 1], ['0,5', 0],
  ['1,0', 1], ['1,1', 0], ['1,4', 1],
  ['2,0', 0], ['2,2', 1], ['2,3', 0], ['2,5', 1],
  ['3,0', 1], ['3,1', 0], ['3,3', 1], ['3,5', 0],
  ['4,0', 0], ['4,2', 0], ['4,3', 1], ['4,4', 0], ['4,5', 1],
  ['5,0', 0], ['5,2', 1], ['5,3', 0], ['5,4', 1], ['5,5', 1],
]);
const TANGO_RELATIONS = [
  { a: [0, 0], b: [0, 1], kind: '=' },
  { a: [1, 2], b: [1, 3], kind: '×' },
  { a: [2, 4], b: [3, 4], kind: '×' },
  { a: [4, 1], b: [5, 1], kind: '×' },
];
function Tango({ game, onComplete, onExit }) {
  const [cells, setCells] = useState(() => Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, column) => TANGO_GIVENS.get(`${row},${column}`) ?? null)));
  const [message, setMessage] = useState('Fill every tile with a sun or moon. Use the relation clues below the board.');
  const [startedAt] = useState(() => Date.now());
  const toggle = (row, column) => {
    if (TANGO_GIVENS.has(`${row},${column}`)) return;
    setCells((current) => current.map((line, rowIndex) => rowIndex !== row ? line : line.map((value, columnIndex) => columnIndex !== column ? value : value === null ? 0 : value === 0 ? 1 : null)));
  };
  const check = () => {
    const full = cells.every((row) => row.every((cell) => cell !== null));
    if (!full) { setMessage(`There are ${cells.flat().filter((cell) => cell === null).length} empty tiles left.`); return; }
    const balanced = cells.every((row) => row.filter((cell) => cell === 0).length === SIZE / 2)
      && Array.from({ length: SIZE }, (_, column) => cells.filter((row) => row[column] === 0).length === SIZE / 2);
    const noTriples = cells.every((row) => row.every((cell, column) => column < 2 || !(cell === row[column - 1] && cell === row[column - 2])))
      && Array.from({ length: SIZE }, (_, column) => cells.every((row, rowIndex) => rowIndex < 2 || !(row[column] === cells[rowIndex - 1][column] && row[column] === cells[rowIndex - 2][column])));
    const relationsOkay = TANGO_RELATIONS.every(({ a, b, kind }) => kind === '=' ? cells[a[0]][a[1]] === cells[b[0]][b[1]] : cells[a[0]][a[1]] !== cells[b[0]][b[1]]);
    const valid = balanced && noTriples && relationsOkay;
    const messageText = valid ? 'Balanced, no triples, and all relation clues satisfied. Puzzle complete!' : !balanced ? 'Each row and column needs three suns and three moons.' : !noTriples ? 'Avoid three identical symbols in a row.' : 'One or more = / × relation clues do not match.';
    setMessage(messageText);
    if (valid) finish(game, onComplete, startedAt, 170, 100);
  };
  return <GameFrame game={game} onExit={onExit} prompt="Balance suns and moons across every line. No line may contain three matching symbols in a row.">
    <div className="tango-legend"><span className="tango-sun"><i className="ph-fill ph-sun"></i> Sun</span><span className="tango-moon"><i className="ph-fill ph-moon"></i> Moon</span><small>Tap a tile to cycle blank → sun → moon.</small></div>
    <div className="tango-board" role="group" aria-label="Tango sun and moon puzzle">{cells.flatMap((row, rowIndex) => row.map((cell, column) => { const fixed = TANGO_GIVENS.has(`${rowIndex},${column}`); return <button type="button" key={`${rowIndex}-${column}`} className={`${cell === 0 ? 'sun' : cell === 1 ? 'moon' : ''} ${fixed ? 'given' : ''}`} onClick={() => toggle(rowIndex, column)} disabled={fixed} aria-label={`Row ${rowIndex + 1}, column ${column + 1}, ${cell === null ? 'blank' : cell === 0 ? 'sun' : 'moon'}${fixed ? ', clue' : ''}`}>{cell === 0 ? <i className="ph-fill ph-sun"></i> : cell === 1 ? <i className="ph-fill ph-moon"></i> : null}</button>; }))}</div>
    <div className="tango-relations"><strong>Relations</strong>{TANGO_RELATIONS.map(({ a, b, kind }, index) => <span key={index}>R{a[0] + 1}C{a[1] + 1} <b>{kind}</b> R{b[0] + 1}C{b[1] + 1}</span>)}</div>
    <div className="reference-game-actions"><button type="button" className="reference-game-primary" onClick={check}>Check grid <i className="ph ph-check"></i></button></div>
    <p className="reference-game-feedback" role="status">{message}</p>
  </GameFrame>;
}

const ZIP_CHECKPOINTS = new Map([[0, '1'], [6, '7'], [12, '13'], [18, '19'], [24, '25']]);
function Zip({ game, onComplete, onExit }) {
  const [path, setPath] = useState([]);
  const [message, setMessage] = useState('Begin at 1. Follow a continuous path and visit every tile once.');
  const [startedAt] = useState(() => Date.now());
  const select = (index) => {
    if (!path.length) {
      if (index !== 0) { setMessage('Start at number 1 in the top-left corner.'); return; }
      setPath([index]); setMessage('Good start. Continue to a neighboring tile.'); return;
    }
    const existing = path.indexOf(index);
    if (existing !== -1) { setPath(path.slice(0, existing + 1)); setMessage('You can retrace the last part of the path.'); return; }
    const last = path[path.length - 1];
    if (Math.abs(Math.floor(index / 5) - Math.floor(last / 5)) + Math.abs((index % 5) - (last % 5)) !== 1) { setMessage('Choose a tile that shares an edge with your current path.'); return; }
    const next = [...path, index];
    setPath(next);
    const checkpointsMatch = [[0, 0], [6, 6], [12, 12], [18, 18], [24, 24]].every(([cell, step]) => next[step] === cell);
    if (next.length === 25 && checkpointsMatch) {
      setMessage('A complete route. Every tile is visited once!');
      finish(game, onComplete, startedAt, 150, 100);
    } else setMessage(`${next.length} of 25 tiles connected.`);
  };
  return <GameFrame game={game} onExit={onExit} prompt="Draw one continuous route from 1 to 25. Visit every tile exactly once, moving only up, down, left, or right.">
    <div className="zip-status"><span><i className="ph ph-path"></i> Route</span><strong>{path.length} / 25 tiles</strong><button type="button" onClick={() => { setPath([]); setMessage('Route cleared. Start at number 1 in the top-left corner.'); }}>Reset</button></div>
    <div className="zip-board" role="group" aria-label="Zip path puzzle">{Array.from({ length: 25 }, (_, index) => { const pathIndex = path.indexOf(index); return <button type="button" key={index} className={`${pathIndex >= 0 ? 'in-path' : ''} ${ZIP_CHECKPOINTS.has(index) ? 'checkpoint' : ''}`} aria-label={`Row ${Math.floor(index / 5) + 1}, column ${(index % 5) + 1}${ZIP_CHECKPOINTS.has(index) ? `, checkpoint ${ZIP_CHECKPOINTS.get(index)}` : ''}`} onClick={() => select(index)}>{ZIP_CHECKPOINTS.get(index) || (pathIndex >= 0 ? <i className="ph-fill ph-circle"></i> : '')}</button>; })}</div>
    <p className="reference-game-feedback" role="status">{message}</p>
  </GameFrame>;
}

const SUDOKU_SOLUTION = Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, column) => ((row * 3 + Math.floor(row / 2) + column) % SIZE) + 1));
const SUDOKU_BLANKS = new Set(['0,2', '0,5', '1,0', '1,3', '2,1', '2,4', '3,2', '3,4', '4,0', '4,5', '5,1', '5,3']);
function MiniSudoku({ game, onComplete, onExit }) {
  const [entries, setEntries] = useState({});
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('Fill each row, column, and 2 × 3 box with 1–6.');
  const [startedAt] = useState(() => Date.now());
  const givensCount = SIZE * SIZE - SUDOKU_BLANKS.size;
  const board = useMemo(() => SUDOKU_SOLUTION.map((row, rowIndex) => row.map((value, column) => {
    const key = `${rowIndex},${column}`;
    return SUDOKU_BLANKS.has(key) ? (entries[key] || 0) : value;
  })), [entries]);
  const enterNumber = (value) => {
    if (!selected || !SUDOKU_BLANKS.has(`${selected.row},${selected.column}`)) return;
    const key = `${selected.row},${selected.column}`;
    setEntries((current) => ({ ...current, [key]: current[key] === value ? 0 : value }));
  };
  const check = () => {
    const filled = board.every((row) => row.every((value) => value > 0));
    if (!filled) { setMessage(`${SUDOKU_BLANKS.size - Object.values(entries).filter(Boolean).length} spaces left. Keep going.`); return; }
    const validRows = board.every((row) => new Set(row).size === SIZE);
    const validColumns = Array.from({ length: SIZE }, (_, column) => new Set(board.map((row) => row[column])).size === SIZE).every(Boolean);
    const validBoxes = [0, 2, 4].every((columnStart) => [0, 2, 4].every((rowStart) => {
      const values = [board[rowStart][columnStart], board[rowStart][columnStart + 1], board[rowStart][columnStart + 2], board[rowStart + 1][columnStart], board[rowStart + 1][columnStart + 1], board[rowStart + 1][columnStart + 2]];
      return new Set(values).size === SIZE;
    }));
    const valid = validRows && validColumns && validBoxes && board.every((row, rowIndex) => row.every((value, column) => value === SUDOKU_SOLUTION[rowIndex][column]));
    setMessage(valid ? 'The grid is complete. Every row, column, and box checks out!' : 'There is a repeated or incorrect value. Review your row, column, and box.');
    if (valid) finish(game, onComplete, startedAt, 180, 100);
  };
  return <GameFrame game={game} onExit={onExit} prompt="Complete the 6 × 6 Sudoku. Each row, column, and 2 × 3 box must contain numbers 1 through 6 once.">
    <div className="sudoku-toolbar"><span><i className="ph ph-grid-four"></i> {givensCount} clues</span><button type="button" onClick={() => setEntries({})}>Clear entries</button></div>
    <div className="mini-sudoku-board" role="group" aria-label="6 by 6 Sudoku puzzle">{board.flatMap((row, rowIndex) => row.map((value, column) => { const blank = SUDOKU_BLANKS.has(`${rowIndex},${column}`); const isSelected = selected?.row === rowIndex && selected?.column === column; return <button type="button" key={`${rowIndex}-${column}`} className={`${blank ? 'editable' : ''} ${isSelected ? 'selected' : ''}`} onClick={() => blank && setSelected({ row: rowIndex, column })} aria-label={`Row ${rowIndex + 1}, column ${column + 1}${value ? `, ${value}` : ', empty'}`}>{value || ''}</button>; }))}</div>
    <div className="sudoku-number-pad">{Array.from({ length: SIZE }, (_, index) => <button type="button" key={index + 1} onClick={() => enterNumber(index + 1)} disabled={!selected} aria-pressed={selected ? entries[`${selected.row},${selected.column}`] === index + 1 : false}>{index + 1}</button>)}<button type="button" className="sudoku-erase" onClick={() => { if (selected) setEntries((current) => ({ ...current, [`${selected.row},${selected.column}`]: 0 })); }} disabled={!selected}><i className="ph ph-backspace"></i></button></div>
    <div className="reference-game-actions"><button type="button" className="reference-game-primary" onClick={check}>Check puzzle <i className="ph ph-check"></i></button></div>
    <p className="reference-game-feedback" role="status">{message}</p>
  </GameFrame>;
}

const pieceShapes = [
  [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]],
];
const rotateShape = (shape, turns) => {
  let current = shape;
  for (let turn = 0; turn < turns; turn += 1) current = current.map(([row, column]) => [column, -row]);
  const minRow = Math.min(...current.map(([row]) => row));
  const minColumn = Math.min(...current.map(([, column]) => column));
  return current.map(([row, column]) => [row - minRow, column - minColumn]);
};
function Patches({ game, onComplete, onExit }) {
  const [placed, setPlaced] = useState([]);
  const [piece, setPiece] = useState(0);
  const [turns, setTurns] = useState([0, 0, 0, 0]);
  const [message, setMessage] = useState('Choose a patch, rotate it if needed, and place all sixteen squares without overlaps.');
  const [startedAt] = useState(() => Date.now());
  const occupied = new Map(placed.flatMap((placement) => placement.cells.map((key) => [key, placement.piece])));
  const currentShape = rotateShape(pieceShapes[piece], turns[piece]);
  const placeAt = (row, column) => {
    if (placed.some((placement) => placement.piece === piece)) { setMessage('That patch is already placed. Undo the last move to reposition it.'); return; }
    const cells = currentShape.map(([r, c]) => `${row + r},${column + c}`);
    if (cells.some((key) => { const [r, c] = key.split(',').map(Number); return r >= 4 || c >= 4 || occupied.has(key); })) { setMessage('That patch would overlap or extend beyond the board. Try another square.'); return; }
    const next = [...placed, { piece, cells }];
    setPlaced(next);
    setMessage(`${next.length} of 4 patches placed.`);
    if (next.length === 4) {
      const complete = new Set(next.flatMap((placement) => placement.cells));
      if (complete.size === 16) {
        setMessage('Every square is covered exactly once. Board complete!');
        finish(game, onComplete, startedAt, 150, 100);
      }
    }
  };
  const rotate = () => setTurns((current) => current.map((count, index) => index === piece ? (count + 1) % 4 : count));
  const undo = () => {
    if (!placed.length) return;
    setPlaced((current) => current.slice(0, -1));
    setMessage('Last patch removed. Choose its tile to place it again.');
  };
  return <GameFrame game={game} onExit={onExit} prompt="Arrange the patches so every square on the board is covered once. Rotate pieces to find a fit.">
    <div className="patches-board" role="group" aria-label="Patches tile board">{Array.from({ length: 16 }, (_, index) => { const row = Math.floor(index / 4); const column = index % 4; const key = `${row},${column}`; const pieceIndex = occupied.get(key); return <button type="button" key={key} className={pieceIndex === undefined ? '' : `piece piece-${pieceIndex}`} onClick={() => placeAt(row, column)} aria-label={`Row ${row + 1}, column ${column + 1}${pieceIndex === undefined ? ', empty' : ', covered'}`}>{pieceIndex === undefined && currentShape.some(([r, c]) => r === row && c === column) ? <span className="patches-preview-dot"></span> : null}</button>; })}</div>
    <div className="patches-controls"><div className="patches-piece-list">{pieceShapes.map((shape, index) => <button type="button" key={index} className={piece === index ? 'active' : ''} disabled={placed.some((placement) => placement.piece === index)} onClick={() => setPiece(index)}><span className={`patches-piece-preview ${shape.length === 4 && index > 1 ? 'square' : ''}`}></span><span>Patch {index + 1}</span></button>)}</div><div className="patches-actions"><button type="button" onClick={rotate}><i className="ph ph-arrow-clockwise"></i> Rotate</button><button type="button" onClick={undo} disabled={!placed.length}><i className="ph ph-arrow-u-up-left"></i> Undo</button><span>{occupied.size} / 16</span></div></div>
    <p className="reference-game-feedback" role="status">{message}</p>
  </GameFrame>;
}

const WEND_WORDS = ['CARE', 'MIND', 'PLAY', 'GROW'];
const WEND_PATHS = [
  [0, 1, 2, 3], [7, 6, 5, 4], [8, 9, 10, 11], [15, 14, 13, 12],
];
const WEND_GRID = (() => {
  const grid = Array(16).fill('');
  WEND_WORDS.forEach((word, wordIndex) => WEND_PATHS[wordIndex].forEach((cell, index) => { grid[cell] = word[index]; }));
  return grid;
})();
function Wend({ game, onComplete, onExit }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [wordPath, setWordPath] = useState([]);
  const [used, setUsed] = useState([]);
  const [message, setMessage] = useState('Select a word, then trace its letters through neighboring tiles. Use every tile once.');
  const [startedAt] = useState(() => Date.now());
  const chooseWord = (index) => { if (!used.includes(index)) { setWordIndex(index); setWordPath([]); setMessage(`Trace ${WEND_WORDS[index]} one letter at a time.`); } };
  const selectTile = (tile) => {
    if (used.some((completedWord) => WEND_PATHS[completedWord].includes(tile))) { setMessage('That tile is already part of a completed word.'); return; }
    const word = WEND_WORDS[wordIndex];
    const nextIndex = wordPath.length;
    if (WEND_GRID[tile] !== word[nextIndex]) { setMessage(`Find the next letter “${word[nextIndex]}” in ${word}.`); return; }
    if (wordPath.length) {
      const previous = wordPath[wordPath.length - 1];
      if (Math.abs(Math.floor(previous / 4) - Math.floor(tile / 4)) + Math.abs((previous % 4) - (tile % 4)) !== 1) { setMessage('Choose a tile beside the previous letter.'); return; }
    }
    const nextPath = [...wordPath, tile];
    setWordPath(nextPath);
    if (nextPath.length === word.length) {
      const completedWords = [...new Set([...used, wordIndex])];
      setUsed(completedWords);
      setWordPath([]);
      if (completedWords.length === WEND_WORDS.length) {
        setMessage('All four words are connected, and every tile has been used once!');
        finish(game, onComplete, startedAt, 160, 100);
      } else setMessage(`${word} found. Choose another word to continue.`);
    }
  };
  return <GameFrame game={game} onExit={onExit} prompt="Connect each word through neighboring letters. Every tile belongs to one word and can be used only once.">
    <div className="wend-word-list">{WEND_WORDS.map((word, index) => <button type="button" key={word} className={`${wordIndex === index ? 'active' : ''} ${used.includes(index) ? 'complete' : ''}`} disabled={used.includes(index)} onClick={() => chooseWord(index)}><span>{used.includes(index) ? <i className="ph-fill ph-check-circle"></i> : `0${index + 1}`}</span>{word}</button>)}</div>
    <div className="wend-board" role="group" aria-label="Wend letter grid">{WEND_GRID.map((letter, index) => { const pathIndex = wordPath.indexOf(index); return <button type="button" key={index} className={`${used.some((word) => WEND_PATHS[word].includes(index)) ? 'used' : ''} ${pathIndex >= 0 ? 'active-path' : ''}`} onClick={() => selectTile(index)} aria-label={`Tile ${letter}${used.some((word) => WEND_PATHS[word].includes(index)) ? ', already used' : ''}`}>{letter}{pathIndex >= 0 && <small>{pathIndex + 1}</small>}</button>; })}</div>
    <div className="wend-progress"><span>{used.reduce((total, index) => total + WEND_WORDS[index].length, 0)} / 16 letters connected</span><button type="button" onClick={() => setWordPath([])}>Clear current path</button></div>
    <p className="reference-game-feedback" role="status">{message}</p>
  </GameFrame>;
}

const GAME_COMPONENTS = { pinpoint: Pinpoint, crossclimb: Crossclimb, queens: Queens, tango: Tango, zip: Zip, 'mini-sudoku': MiniSudoku, patches: Patches, wend: Wend };

export default function ReferenceMiniGame({ game, onComplete, onExit }) {
  const Game = GAME_COMPONENTS[game.id];
  if (!Game) return null;
  return <Game game={game} onComplete={onComplete} onExit={onExit} />;
}
