const GAME_ART = {
  memory: '🧠', attention: '🎯', language: '🔤', math: '∑', logic: '🧩', flexibility: '🔀', speed: '⚡',
  pinpoint: '🧭', crossclimb: '🪜', queens: '♛', tango: '☯', zip: '🧵', 'mini-sudoku': '🔢', patches: '🟪', wend: '📝',
  knifeshow: '🗡️', snowrider: '🛷', dino: '🦖', chess: '♟️', 'word-association': '🔠',
  'ludo-king': '🎲', 'snakes-ladders': '🐍', '2048': '🔢', minesweeper: '💣',
  'connect-4': '🔴', wordle: '🟩', snake: '🐍', 'flappy-bird': '🐤', 'brick-breaker': '🧱',
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
