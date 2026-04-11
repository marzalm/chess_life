// tests/puzzle-system.test.js
//
// Standalone Node.js test harness for js/puzzle-system.js.
// Uses the real generated puzzle-data.js file and a mocked
// CareerManager training/player surface.
// Run with: node tests/puzzle-system.test.js

const fs = require('fs');
const path = require('path');

const puzzleDataCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'puzzle-data.js'),
  'utf8',
);
const PUZZLES = (new Function(`${puzzleDataCode}\nreturn PUZZLES;`))();

let _player;
let _trainingState;
let _saveCount;

function makeDefaultTrainingState() {
  return {
    aptitudes: {},
    seenPuzzleIds: {},
    reinforcementQueues: {},
    trainingBonuses: {},
    flowBonus: { earned: false, reservedPuzzleId: null },
    puzzleRating: 500,
    puzzleRatingRd: 300,
    stats: {
      sessionsCompleted: 0,
      sessionsPassed: 0,
      puzzlesAttempted: 0,
      puzzlesSolvedAllTime: 0,
      reinforcementPuzzlesSolved: 0,
      bonusesUsedTraining: 0,
      bonusesUsedFlow: 0,
      byTheme: {},
    },
  };
}

function resetMocks() {
  _player = { elo: 1500 };
  _trainingState = makeDefaultTrainingState();
  _saveCount = 0;
}

const CareerManager = {
  player: {
    get: () => _player,
  },
  training: {
    get: () => _trainingState,
  },
  save: () => {
    _saveCount += 1;
  },
};

const systemCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'puzzle-system.js'),
  'utf8',
);
const PuzzleSystem = (new Function(
  'PUZZLES', 'CareerManager',
  `${systemCode}\nreturn PuzzleSystem;`,
))(PUZZLES, CareerManager);

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.log('  ✗', name);
    console.log('     →', e.message);
    failed++;
    failures.push({ name, message: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${msg || 'mismatch'}\n        expected: ${e}\n        actual:   ${a}`,
    );
  }
}

function _findThemePuzzle(theme) {
  const found = PUZZLES.find((p) => p.theme === theme);
  if (!found) throw new Error(`missing test puzzle for theme ${theme}`);
  return found;
}

function _puzzleTurnColor(puzzle) {
  const parts = puzzle.fen.split(' ');
  return parts[1] === 'b' ? 'b' : 'w';
}

function _withOverriddenThemePool(theme, puzzles, fn) {
  const removed = [];
  for (let i = PUZZLES.length - 1; i >= 0; i--) {
    if (PUZZLES[i].theme === theme) {
      removed.push(PUZZLES.splice(i, 1)[0]);
    }
  }
  PUZZLES.push(...puzzles);
  try {
    return fn();
  } finally {
    for (let i = PUZZLES.length - 1; i >= 0; i--) {
      if (PUZZLES[i].theme === theme) {
        PUZZLES.splice(i, 1);
      }
    }
    PUZZLES.push(...removed);
  }
}

console.log('\n── Theme catalog and init ──');

test('getThemes returns the 22 locked theme keys', () => {
  const themes = PuzzleSystem.getThemes();
  assertEq(themes.length, 22);
  assert(themes.includes('fork'));
  assert(themes.includes('queensPawnGame'));
});

test('getThemeLabel formats opening and tactical labels', () => {
  assertEq(PuzzleSystem.getThemeLabel('fork'), 'Fork');
  assertEq(PuzzleSystem.getThemeLabel('caroKannDefense'), 'Caro-Kann Defense');
});

test('unknown theme rejects cleanly', () => {
  let threw = false;
  try {
    PuzzleSystem.startSelfTrainingSession('dragonAttack');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'expected unknown theme to throw');
});

test('init normalizes the training state for every theme', () => {
  assertEq(PuzzleSystem.getAptitude('fork'), 0);
  assertEq(PuzzleSystem.getTrainingBonusCount('fork'), 0);
  assertEq(PuzzleSystem.getPuzzleRating(), 500);
  assertEq(PuzzleSystem.getPuzzleRatingRd(), 300);
  assert(Array.isArray(PuzzleSystem.getReinforcementQueue('fork')));
});

console.log('\n── Session start and seen tracking ──');

test('self-training session starts with valid puzzles for the theme', () => {
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  assertEq(session.puzzles.length, 5);
  assert(session.puzzles.every((p) => p.theme === 'fork'));
});

test('starting a session marks shown puzzles as seen immediately', () => {
  const before = PuzzleSystem.getSeenCount();
  const session = PuzzleSystem.startSelfTrainingSession('pin');
  const after = PuzzleSystem.getSeenCount();
  assertEq(after - before, session.puzzles.length);
});

test('difficulty selection prefers the current puzzle-rating window when possible', () => {
  const session = PuzzleSystem.startSelfTrainingSession('mateIn1', { size: 3 });
  const inWindow = session.puzzles.filter((p) => Math.abs(p.difficulty - 500) <= 360).length;
  assert(inWindow >= 2, 'expected at least two puzzles near player elo');
});

test('pickInGamePuzzle with empty theme pool returns null', () => {
  const removed = [];
  for (let i = PUZZLES.length - 1; i >= 0; i--) {
    if (PUZZLES[i].theme === 'fork') {
      removed.push(PUZZLES.splice(i, 1)[0]);
    }
  }

  try {
    const picked = PuzzleSystem.pickInGamePuzzle('fork');
    assertEq(picked, null);
  } finally {
    PUZZLES.push(...removed);
  }
});

test('consumeTrainingBonus decrements and returns false when empty', () => {
  _trainingState.trainingBonuses.fork = 2;
  assertEq(PuzzleSystem.consumeTrainingBonus('fork'), true);
  assertEq(_trainingState.trainingBonuses.fork, 1);
  assertEq(PuzzleSystem.consumeTrainingBonus('fork'), true);
  assertEq(_trainingState.trainingBonuses.fork, 0);
  assertEq(PuzzleSystem.consumeTrainingBonus('fork'), false);
});

test('pickInGamePuzzle with preferredColor returns matching side-to-move puzzles when available', () => {
  const picked = PuzzleSystem.pickInGamePuzzle('fork', 'w');
  assert(picked, 'expected a puzzle to be picked');
  assertEq(_puzzleTurnColor(picked), 'w');
});

test('normalized post-setup FENs expose the player color to the in-game picker', () => {
  const picked = PuzzleSystem.pickInGamePuzzle('fork', 'w');
  assert(picked, 'expected a normalized puzzle to be picked');
  assertEq(String(picked.fen).split(' ')[1], 'w');
  assert(picked.solution.length >= 1, 'expected normalized solution to start with the player move');
});

test('pickInGamePuzzle falls back to the full pool when preferredColor has no matches', () => {
  const custom = [
    {
      id: 'fork_black_only',
      fen: '6k1/8/8/8/8/8/6q1/6K1 b - - 0 1',
      solution: ['g2g1q'],
      theme: 'fork',
      difficulty: 700,
      source: 'test:black-only',
    },
  ];

  _withOverriddenThemePool('fork', custom, () => {
    const picked = PuzzleSystem.pickInGamePuzzle('fork', 'w');
    assert(picked, 'expected fallback puzzle instead of null');
    assertEq(picked.id, 'fork_black_only');
  });
});

console.log('\n── Reinforcement loop ──');

test('failed puzzle enters the reinforcement queue once', () => {
  const session = PuzzleSystem.startSelfTrainingSession('fork', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, false);
  const summary = PuzzleSystem.completeSession(session.id);
  const queue = PuzzleSystem.getReinforcementQueue('fork');
  assertEq(summary.passed, false);
  assertEq(queue.length, 1);
  assertEq(queue[0].state, 'active');
  assertEq(queue[0].confirmations, 0);
});

test('reinforcement puzzles come first in the next session of the same theme', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'active', confirmations: 0 },
  ];
  const session = PuzzleSystem.startSelfTrainingSession('fork', { size: 1, passThreshold: 1 });
  assertEq(session.puzzles[0].id, seed.id);
  assertEq(session.puzzles[0].reinforcement, true);
});

test('solving a queued puzzle moves it to pending-confirmation', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'active', confirmations: 0 },
  ];
  const session = PuzzleSystem.startSelfTrainingSession('fork', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.completeSession(session.id);
  const queue = PuzzleSystem.getReinforcementQueue('fork');
  assertEq(queue.length, 1);
  assertEq(queue[0].state, 'pending-confirmation');
  assertEq(queue[0].confirmations, 1);
});

test('second successful re-solve in a later session removes the queue entry', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'pending-confirmation', confirmations: 1 },
  ];
  const session = PuzzleSystem.startSelfTrainingSession('fork', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.completeSession(session.id);
  assertEq(PuzzleSystem.getReinforcementQueue('fork').length, 0);
});

test('failure during confirmation resets the queue entry to active', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'pending-confirmation', confirmations: 1 },
  ];
  const session = PuzzleSystem.startSelfTrainingSession('fork', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, false);
  PuzzleSystem.completeSession(session.id);
  const queue = PuzzleSystem.getReinforcementQueue('fork');
  assertEq(queue.length, 1);
  assertEq(queue[0].state, 'active');
  assertEq(queue[0].confirmations, 0);
});

console.log('\n── Rewards and aptitude ──');

test('success against an easy puzzle yields a positive rating delta', () => {
  const result = PuzzleSystem.updatePuzzleRatingAfterAttempt(600, true);
  assert(result.delta > 0, 'expected positive delta');
  assert(result.newRating > 500, 'expected rating increase');
});

test('success against a harder puzzle yields a larger positive delta than an easy one', () => {
  const easy = PuzzleSystem.updatePuzzleRatingAfterAttempt(600, true).delta;
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  const hard = PuzzleSystem.updatePuzzleRatingAfterAttempt(1200, true).delta;
  assert(hard > easy, 'expected harder puzzle to give larger positive delta');
});

test('failure has softer impact than symmetric success', () => {
  const success = PuzzleSystem.updatePuzzleRatingAfterAttempt(900, true).delta;
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  const failure = PuzzleSystem.updatePuzzleRatingAfterAttempt(900, false).delta;
  assert(Math.abs(failure) < success, 'expected softened failure impact');
});

test('puzzle rating deviation converges toward 50', () => {
  for (let i = 0; i < 80; i++) {
    PuzzleSystem.updatePuzzleRatingAfterAttempt(800, true);
  }
  assertEq(PuzzleSystem.getPuzzleRatingRd(), 50);
});

test('puzzle rating is clamped to the [400, 2500] range', () => {
  _trainingState.puzzleRating = 2490;
  PuzzleSystem.updatePuzzleRatingAfterAttempt(1400, true);
  assert(PuzzleSystem.getPuzzleRating() <= 2500, 'expected upper clamp');

  _trainingState.puzzleRating = 405;
  _trainingState.puzzleRatingRd = 300;
  PuzzleSystem.updatePuzzleRatingAfterAttempt(2400, false);
  assert(PuzzleSystem.getPuzzleRating() >= 400, 'expected lower clamp');
});

test('pickInGamePuzzle window widens when RD is high and narrows when RD is low', () => {
  const custom = [
    {
      id: 'fork_window_probe',
      fen: '6k1/8/8/8/8/8/4K3/7Q w - - 0 1',
      solution: ['h1h8'],
      theme: 'fork',
      difficulty: 820,
      source: 'test:window-probe',
    },
  ];

  _withOverriddenThemePool('fork', custom, () => {
    _trainingState.puzzleRating = 500;
    _trainingState.puzzleRatingRd = 300; // window 360
    const highPicked = PuzzleSystem.pickInGamePuzzle('fork', 'w');
    assertEq(highPicked.id, 'fork_window_probe');
    assert(Math.abs(highPicked.difficulty - 500) <= 360, 'expected in-window pick at high RD');
  });

  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();

  _withOverriddenThemePool('fork', custom, () => {
    _trainingState.puzzleRating = 500;
    _trainingState.puzzleRatingRd = 50; // window 150
    const lowPicked = PuzzleSystem.pickInGamePuzzle('fork', 'w');
    assertEq(lowPicked.id, 'fork_window_probe');
    assert(Math.abs(lowPicked.difficulty - 500) > 150, 'expected fallback pick outside the narrow window');
  });
});

test('successful session grants exactly one training bonus for that theme', () => {
  const session = PuzzleSystem.startSelfTrainingSession('pin');
  for (let i = 0; i < session.puzzles.length; i++) {
    PuzzleSystem.submitSessionAnswer(session.id, i < 3);
  }
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(summary.passed, true);
  assertEq(summary.bonusGranted, true);
  assertEq(PuzzleSystem.getTrainingBonusCount('pin'), 1);
});

test('failed session grants no training bonus', () => {
  const session = PuzzleSystem.startSelfTrainingSession('pin');
  for (let i = 0; i < session.puzzles.length; i++) {
    PuzzleSystem.submitSessionAnswer(session.id, i === 0);
  }
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(summary.passed, false);
  assertEq(PuzzleSystem.getTrainingBonusCount('pin'), 0);
});

test('aptitude increases after successful solves', () => {
  const session = PuzzleSystem.startSelfTrainingSession('skewer', { size: 2, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.submitSessionAnswer(session.id, false);
  PuzzleSystem.completeSession(session.id);
  assert(PuzzleSystem.getAptitude('skewer') > 0, 'expected aptitude increase');
});

test('aptitude caps at 100', () => {
  _trainingState.stats.byTheme.fork = {
    solvedThemePuzzles: 100,
    reinforcedResolves: 100,
  };
  const session = PuzzleSystem.startSelfTrainingSession('fork', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.completeSession(session.id);
  assertEq(PuzzleSystem.getAptitude('fork'), 100);
});

console.log('\n── Session boundaries and persistence ──');

test('submitSessionAnswer records boolean results without move validation in E.1', () => {
  const session = PuzzleSystem.startSelfTrainingSession('opening', { size: 1, passThreshold: 1 });
  const result = PuzzleSystem.submitSessionAnswer(session.id, true);
  assertEq(result.solved, true);
  assertEq(result.remaining, 0);
});

test('completeSession rejects incomplete sessions', () => {
  const session = PuzzleSystem.startSelfTrainingSession('opening', { size: 2, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  let threw = false;
  try {
    PuzzleSystem.completeSession(session.id);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'expected incomplete session to throw');
});

test('training state survives re-init / save-load style round-trip', () => {
  const session = PuzzleSystem.startSelfTrainingSession('endgame', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.completeSession(session.id);
  const snapshot = JSON.parse(JSON.stringify(_trainingState));

  PuzzleSystem.clearForTests();
  _trainingState = snapshot;
  PuzzleSystem.init();

  assertEq(PuzzleSystem.getTrainingBonusCount('endgame'), 1);
  assert(PuzzleSystem.getAptitude('endgame') > 0);
});

test('changing coach later does not wipe player-owned training progress', () => {
  const session = PuzzleSystem.startSelfTrainingSession('middlegame', { size: 1, passThreshold: 1 });
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.completeSession(session.id);
  const aptitudeBefore = PuzzleSystem.getAptitude('middlegame');
  const seenBefore = PuzzleSystem.getSeenCount();

  const snapshot = JSON.parse(JSON.stringify(_trainingState));
  snapshot.currentCoach = { id: 'coach_petrova_elena', hireDate: { year: 2026, month: 4, day: 11 } };
  _trainingState = snapshot;
  PuzzleSystem.init();

  assertEq(PuzzleSystem.getAptitude('middlegame'), aptitudeBefore);
  assertEq(PuzzleSystem.getSeenCount(), seenBefore);
});

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  • ${f.name}\n    ${f.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
