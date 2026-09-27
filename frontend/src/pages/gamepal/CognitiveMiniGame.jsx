import { useEffect, useMemo, useRef, useState } from 'react';

const COLORS = [
  { name: 'Red', value: '#fb7185' }, { name: 'Blue', value: '#38bdf8' },
  { name: 'Green', value: '#34d399' }, { name: 'Amber', value: '#fbbf24' },
];
const WORDS = ['bright', 'planet', 'garden', 'signal', 'motion', 'silver', 'puzzle', 'bridge', 'energy', 'canvas', 'forest', 'rhythm'];
const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
const asChoices = (answer, distractors) => shuffle([...new Set([String(answer), ...distractors.map(String).filter((value) => value !== String(answer))])].slice(0, 4));

function createChallenge(game, level, round) {
  if (game.id === 'attention') {
    const word = COLORS[Math.floor(Math.random() * COLORS.length)];
    const ink = COLORS[Math.floor(Math.random() * COLORS.length)];
    return { prompt: 'Ignore the word. Choose the ink color.', word, ink, options: shuffle(COLORS.map((color) => color.name)), answer: ink.name };
  }
  if (game.id === 'memory') {
    const length = Math.min(7, 3 + level);
    const symbols = ['◆', '●', '▲', '■', '✦', '⬟', '♥'];
    const sequence = Array.from({ length }, () => symbols[Math.floor(Math.random() * symbols.length)]);
    const alternatives = Array.from({ length: 3 }, () => {
      const wrong = [...sequence];
      const index = Math.floor(Math.random() * wrong.length);
      wrong[index] = symbols.filter((symbol) => symbol !== wrong[index])[Math.floor(Math.random() * (symbols.length - 1))];
      return wrong.join(' ');
    });
    const answer = sequence.join(' ');
    return { prompt: 'Remember the sequence, then choose it after it hides.', sequence, options: asChoices(answer, alternatives), answer };
  }
  if (game.id === 'language') {
    const pool = WORDS.filter((word) => word.length >= Math.min(7, 4 + Math.floor(level / 2)));
    const answer = pool[Math.floor(Math.random() * pool.length)] || WORDS[0];
    const letters = answer.split('');
    let scrambled = shuffle(letters).join('');
    if (scrambled === answer && letters.length > 1) scrambled = `${scrambled.slice(1)}${scrambled[0]}`;
    return { prompt: 'Unscramble the letters to find the word.', display: scrambled.toUpperCase(), options: asChoices(answer, shuffle(WORDS.filter((word) => word !== answer)).slice(0, 3)), answer };
  }
  if (game.id === 'math') {
    const limit = 8 + level * 7;
    const a = 2 + Math.floor(Math.random() * limit);
    const b = 1 + Math.floor(Math.random() * limit);
    const multiply = level >= 3 && Math.random() > 0.55;
    const answer = multiply ? a * b : a + b;
    const prompt = multiply ? `${a} × ${b}` : `${a} + ${b}`;
    return { prompt: `Solve ${prompt}`, options: asChoices(answer, [answer + 2, Math.max(0, answer - 3), answer + 5]), answer: String(answer) };
  }
  if (game.id === 'logic') {
    const step = 2 + level + Math.floor(Math.random() * 4);
    const start = Math.floor(Math.random() * 12) + 1;
    const sequence = [start, start + step, start + step * 2, start + step * 3];
    const answer = start + step * 4;
    return { prompt: `What comes next?  ${sequence.join('  ·  ·  ')}`, options: asChoices(answer, [answer + step, answer - 1, answer + 2]), answer: String(answer) };
  }
  if (game.id === 'flexibility') {
    const number = 1 + Math.floor(Math.random() * 18);
    const rule = Math.floor((round - 1) / 3) % 2 === 0 ? 'EVEN' : 'GREATER THAN 9';
    const answer = rule === 'EVEN' ? number % 2 === 0 : number > 9;
    return { prompt: `Rule: Is ${number} ${rule.toLowerCase()}?`, display: String(number), options: ['Yes', 'No'], answer: answer ? 'Yes' : 'No', rule };
  }
  const target = 1 + Math.floor(Math.random() * 9);
  return { prompt: `Find ${target} as quickly as you can.`, display: String(target), options: asChoices(target, shuffle(Array.from({ length: 9 }, (_, index) => index + 1).filter((number) => number !== target)).slice(0, 3)), answer: String(target) };
}

export default function CognitiveMiniGame({ game, onComplete, onExit, initialLevel = 1 }) {
  const [round, setRound] = useState(1);
  const [level, setLevel] = useState(() => Math.max(1, Math.min(5, Number(initialLevel) || 1)));
  const [correct, setCorrect] = useState(0);
  const [score, setScore] = useState(0);
  const [answerState, setAnswerState] = useState({ round: 1, selected: '' });
  const [sequenceHiddenRound, setSequenceHiddenRound] = useState(0);
  const questionStartedAt = useRef(0);
  const [startedAt] = useState(() => Date.now());
  const challenge = useMemo(() => createChallenge(game, level, round), [game, level, round]);
  const selected = answerState.round === round ? answerState.selected : '';
  const showSequence = game.id === 'memory' && sequenceHiddenRound !== round;
  const isCorrect = selected && selected === String(challenge.answer);

  useEffect(() => {
    questionStartedAt.current = performance.now();
    if (game.id !== 'memory') return undefined;
    const delay = Math.min(3600, 1100 + challenge.sequence.length * 250);
    const timer = window.setTimeout(() => setSequenceHiddenRound(round), delay);
    return () => window.clearTimeout(timer);
  }, [challenge, game.id, round]);

  const chooseAnswer = (option, answeredAt) => {
    if (selected || (game.id === 'memory' && showSequence)) return;
    const correctAnswer = String(option) === String(challenge.answer);
    const responseMs = answeredAt - questionStartedAt.current;
    const points = correctAnswer ? 10 + Math.max(0, Math.min(5, Math.floor((4500 - responseMs) / 900))) : 0;
    setAnswerState({ round, selected: String(option) });
    setCorrect((value) => value + (correctAnswer ? 1 : 0));
    setScore((value) => value + points);

    window.setTimeout(() => {
      if (round >= 10) {
        const finalCorrect = correct + (correctAnswer ? 1 : 0);
        const finalScore = score + points;
        onComplete(game.name, game.category, finalScore, Math.round((finalCorrect / 10) * 100), Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
        return;
      }
      setLevel((value) => Math.max(1, Math.min(5, value + (correctAnswer ? 1 : -1))));
      setRound((value) => value + 1);
    }, 520);
  };

  const progress = ((round - 1) / 10) * 100;

  return (
    <main className="cognitive-game-screen">
      <header className="cognitive-game-topbar">
        <button type="button" className="btn-cancel" onClick={onExit}><i className="ph ph-arrow-left"></i> Exit workout</button>
        <div className="cognitive-game-top-meta"><span>LEVEL {level}</span><span>ROUND {round} / 10</span></div>
        <div className="cognitive-game-score"><i className="ph-fill ph-sparkle"></i> {score} pts</div>
      </header>
      <div className="cognitive-game-progress"><span style={{ width: `${progress}%` }}></span></div>
      <section className={`cognitive-game-card ${selected ? (isCorrect ? 'correct' : 'incorrect') : ''}`}>
        <div className="cognitive-game-domain"><span style={{ background: game.tint }}><i className={`ph-fill ${game.icon}`}></i></span>{game.category} workout</div>
        <p className="cognitive-game-prompt">{challenge.prompt}</p>
        {game.id === 'attention' ? (
          <div className="cognitive-stroop-word" style={{ color: challenge.ink.value }}>{challenge.word.name}</div>
        ) : game.id === 'memory' ? (
          <div className="cognitive-memory-display" aria-live="polite">{showSequence ? challenge.sequence.join('  ') : <span><i className="ph ph-eye-slash"></i> Sequence hidden</span>}</div>
        ) : (
          <div className="cognitive-game-display">{challenge.display || challenge.prompt.replace(/^Solve /, '')}</div>
        )}
        {game.id === 'attention' ? <p className="cognitive-game-hint">Choose the color of the letters.</p> : null}
        {game.id === 'memory' && showSequence ? <p className="cognitive-game-hint">Take a moment to remember the order.</p> : null}
        <div className={`cognitive-game-options ${game.id === 'attention' ? 'color-options' : ''}`}>
          {challenge.options.map((option) => {
            const color = game.id === 'attention' ? COLORS.find((entry) => entry.name === option)?.value : null;
            return (
              <button
                type="button"
                key={option}
                disabled={Boolean(selected) || (game.id === 'memory' && showSequence)}
                className={selected === option ? (isCorrect ? 'answer-correct' : 'answer-wrong') : ''}
                onClick={(event) => chooseAnswer(option, event.nativeEvent.timeStamp)}
                style={color ? { '--answer-color': color } : undefined}
              >
                {option}
              </button>
            );
          })}
        </div>
        <footer className="cognitive-game-feedback" aria-live="polite">
          {selected ? <><i className={`ph-fill ${isCorrect ? 'ph-check-circle' : 'ph-x-circle'}`}></i>{isCorrect ? 'Nice work. Your next round is ready.' : `Good try. The answer was ${challenge.answer}.`}</> : `${correct} correct so far · Difficulty adapts as you play`}
        </footer>
      </section>
      <p className="cognitive-game-footnote">A short practice activity for focus and learning. Scores track your own sessions.</p>
    </main>
  );
}
