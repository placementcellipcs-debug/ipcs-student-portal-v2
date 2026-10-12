const GAME_ART = {
  memory: '🧠', attention: '🎯', language: '🔤', math: '∑', logic: '🧩', flexibility: '🔀', speed: '⚡',
  pinpoint: '🧭', crossclimb: '🪜', queens: '♛', tango: '☯', zip: '🧵', 'mini-sudoku': '🔢', patches: '🟪', wend: '📝',
  knifeshow: '🗡️', snowrider: '🛷', dino: '🦖', chess: '♟️', 'word-association': '🔠',
  'ludo-king': '🎲', 'snakes-ladders': '🐍', '2048': '🔢', minesweeper: '💣',
  'connect-4': '🔴', wordle: '🟩', snake: '🐍', 'flappy-bird': '🐤', 'brick-breaker': '🧱',
  'whack-mole': '🔨', 'cookie-clicker': '🍪', 'guess-number': '🔢', 'color-flood': '🎨',
  'memory-match': '🃏', 'tic-tac-toe': '❌', 'rock-paper-scissors': '✂️', 'dice-battle': '🎲',
  'coin-flip-tycoon': '🪙', pong: '🏓', asteroids: '☄️', frogger: '🐸', 'space-invaders': '👾',
  'lunar-lander': '🚀', 'bubble-shooter': '🫧', 'lights-out': '💡', 'tower-hanoi': '🗼',
  slitherlink: '🔗', mastermind: '🧩', 'slide-puzzle': '🔢', checkers: '⚫',
  'geometry-dash': '🔺', 'fruit-ninja': '🍉', 'stack-tower': '🧱', 'falling-blocks': '🟥',
  'helix-jump': '🌀', 'typing-racer': '⌨️', 'quick-draw': '🎯', 'bop-it': '🕹️',
  'piano-tiles': '🎹', 'hoop-shot': '🏀', 'hexagon-dodger': '⬡', 'word-scramble-scavenger': '🔎',
  'balloon-pop-math': '🎈', 'tunnel-runner': '🛣️', 'orbit-golf': '🪐', 'sound-matcher': '🎵',
  'maze-tracer': '🧭', 'rhythm-tap': '🥁', 'fruit-catcher': '🧺', 'missile-command': '🛡️',
  'word-search': '🔤', tetris: '🧊', artillery: '🎯', parking: '🚙', pinball: '🎰',
  'duck-hunt': '🦆', plinko: '🔽', 'tower-defense': '🏰', platformer: '🏃',
  'boxing-reaction': '🥊', 'daily-crossword': '📝', 'zombie-survival': '🧟',
  'burger-assembly': '🍔', 'air-hockey': '🏒', 'minecart-runner': '🚋',
};

export default function GameArtwork({ game, compact = false }) {
  return (
    <span className={`gamepal-artwork ${compact ? 'compact' : ''}`} style={{ '--game-tint': game.tint }} role="img" aria-label={`${game.name} game icon`}>
      <i className="gamepal-artwork-orbit orbit-one" aria-hidden="true"></i>
      <i className="gamepal-artwork-orbit orbit-two" aria-hidden="true"></i>
      <span className="gamepal-artwork-glyph" aria-hidden="true">{game.art || GAME_ART[game.id] || '🎮'}</span>
      <span className="gamepal-artwork-shine" aria-hidden="true"></span>
    </span>
  );
}
