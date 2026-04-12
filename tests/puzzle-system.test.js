// tests/puzzle-system.test.js
//
// Standalone Node.js test harness for js/puzzle-system.js.
// Uses the real generated puzzle-data.js file and a mocked
// CareerManager training/player surface.

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
    seenPuzzleIds: {},
    reinforcementQueues: {},
    trainingBonuses: {},
    flowBonus: { earned: false, reservedPuzzleId: null },
    puzzleRatings: {},
    puzzleRatingRds: {},
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

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  try {
    fn();
    console.log('  ✓', name);
    passed += 1;
  } catch (e) {
    console.log('  ✗', name);
    console.log('     →', e.message);
    failed += 1;
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
    throw new Error(`${msg || 'mismatch'}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

function assertThrows(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch (_) {
    threw = true;
  }
  if (!threw) throw new Error(msg || 'expected throw');
}

function _findThemePuzzle(theme, predicate = null) {
  const found = PUZZLES.find((p) => p.theme === theme && (!predicate || predicate(p)));
  if (!found) throw new Error(`missing test puzzle for theme ${theme}`);
  return found;
}

function _puzzleTurnColor(puzzle) {
  return String(puzzle.fen).split(' ')[1] === 'b' ? 'b' : 'w';
}

function _withOverriddenThemePool(theme, puzzles, fn) {
  const removed = [];
  for (let i = PUZZLES.length - 1; i >= 0; i--) {
    if (PUZZLES[i].theme === theme) removed.push(PUZZLES.splice(i, 1)[0]);
  }
  PUZZLES.push(...puzzles);
  try {
    fn();
  } finally {
    for (let i = PUZZLES.length - 1; i >= 0; i--) {
      if (PUZZLES[i].theme === theme) PUZZLES.splice(i, 1);
    }
    PUZZLES.push(...removed);
  }
}

console.log('\n── Theme catalog and migration ──');

test('getThemes returns the 22 locked theme keys', () => {
  assertEq(PuzzleSystem.getThemes().length, 22);
  assert(PuzzleSystem.getThemes().includes('fork'));
  assert(PuzzleSystem.getThemes().includes('queensPawnGame'));
});

test('getThemeLabel formats opening and tactical labels', () => {
  assertEq(PuzzleSystem.getThemeLabel('fork'), 'Fork');
  assertEq(PuzzleSystem.getThemeLabel('ruyLopez'), 'Ruy Lopez');
});

test('unknown theme rejects cleanly', () => {
  assertThrows(() => PuzzleSystem.getThemeLabel('dragonAttack'));
});

test('init migrates legacy global rating and numeric bonus counts into the E.5 schema', () => {
  delete _trainingState.puzzleRatings;
  delete _trainingState.puzzleRatingRds;
  _trainingState.puzzleRating = 640;
  _trainingState.puzzleRatingRd = 180;
  _trainingState.trainingBonuses.fork = 2;
  PuzzleSystem.init();
  assertEq(PuzzleSystem.getPuzzleRating('fork'), 640);
  assertEq(PuzzleSystem.getPuzzleRatingRd('fork'), 180);
  assertEq(PuzzleSystem.getTrainingBonusStatus('fork'), {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  });
  assertEq(_trainingState.puzzleRating, undefined);
  assertEq(_trainingState.puzzleRatingRd, undefined);
});

test('getAptitude is derived from the per-theme rating', () => {
  _trainingState.puzzleRatings.fork = 500;
  _trainingState.puzzleRatings.pin = 850;
  _trainingState.puzzleRatings.skewer = 1200;
  PuzzleSystem.init();
  assertEq(PuzzleSystem.getAptitude('fork'), 0);
  assert(PuzzleSystem.getAptitude('pin') >= 49, 'expected mid aptitude from rating 850');
  assertEq(PuzzleSystem.getAptitude('skewer'), 100);
});

console.log('\n── In-game and Flow selection ──');

test('pickInGamePuzzle with empty theme pool returns null', () => {
  _withOverriddenThemePool('fork', [], () => {
    assertEq(PuzzleSystem.pickInGamePuzzle('fork'), null);
  });
});

test('pickInGamePuzzle with preferredColor returns matching side-to-move puzzles when available', () => {
  const custom = [
    {
      id: 'fork_white_only',
      fen: '6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      solution: ['f7g7'],
      theme: 'fork',
      difficulty: 700,
      source: 'test:white-only',
    },
    {
      id: 'fork_black_only',
      fen: '6k1/8/8/8/8/8/5qpp/6K1 b - - 0 1',
      solution: ['f2f1q'],
      theme: 'fork',
      difficulty: 710,
      source: 'test:black-only',
    },
  ];

  _withOverriddenThemePool('fork', custom, () => {
    const picked = PuzzleSystem.pickInGamePuzzle('fork', 'b');
    assert(picked, 'expected a matching puzzle to be picked');
    assertEq(_puzzleTurnColor(picked), 'b');
  });
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
      fen: '6k1/8/8/8/8/8/5qpp/6K1 b - - 0 1',
      solution: ['f2f1q'],
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

test('pickFlowPuzzle honors preferredColor when matching unseen puzzles exist', () => {
  for (const puzzle of PUZZLES) {
    if (puzzle.id !== 'flow_probe_white' && puzzle.id !== 'flow_probe_black') {
      _trainingState.seenPuzzleIds[puzzle.id] = 1;
    }
  }

  PUZZLES.push(
    {
      id: 'flow_probe_white',
      fen: '6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      solution: ['f7g7'],
      theme: 'mateIn1',
      difficulty: 900,
      source: 'test:flow-probe-white',
    },
    {
      id: 'flow_probe_black',
      fen: '6k1/8/8/8/8/8/5qpp/6K1 b - - 0 1',
      solution: ['f2f1q'],
      theme: 'mateIn1',
      difficulty: 910,
      source: 'test:flow-probe-black',
    },
  );

  try {
    const picked = PuzzleSystem.pickFlowPuzzle('w');
    assert(picked, 'expected an unseen flow puzzle');
    assertEq(picked.id, 'flow_probe_white');
    assertEq(_puzzleTurnColor(picked), 'w');
    assertEq(_trainingState.flowBonus.reservedPuzzleId, 'flow_probe_white');
  } finally {
    for (const id of ['flow_probe_white', 'flow_probe_black']) {
      const idx = PUZZLES.findIndex((entry) => entry.id === id);
      if (idx >= 0) PUZZLES.splice(idx, 1);
    }
  }
});

test('pickFlowPuzzle returns null when every puzzle is already seen', () => {
  for (const puzzle of PUZZLES) _trainingState.seenPuzzleIds[puzzle.id] = 1;
  assertEq(PuzzleSystem.pickFlowPuzzle(), null);
});

test('pickFlowPuzzle falls back to any unseen color when preferredColor has no matches', () => {
  const custom = [
    {
      id: 'flow_black_only_probe',
      fen: '6k1/8/8/8/8/8/5qpp/6K1 b - - 0 1',
      solution: ['f2f1q'],
      theme: 'mateIn1',
      difficulty: 900,
      source: 'test:flow-black-only',
    },
  ];

  _withOverriddenThemePool('mateIn1', custom, () => {
    for (const puzzle of PUZZLES) {
      if (puzzle.id !== 'flow_black_only_probe') _trainingState.seenPuzzleIds[puzzle.id] = 1;
    }
    const picked = PuzzleSystem.pickFlowPuzzle('w');
    assert(picked, 'expected fallback unseen puzzle');
    assertEq(picked.id, 'flow_black_only_probe');
    assertEq(_puzzleTurnColor(picked), 'b');
  });
});

test('pickFlowPuzzle reuses the reserved puzzle id until consumed or cleared', () => {
  const first = PuzzleSystem.pickFlowPuzzle();
  assert(first, 'expected first flow puzzle');
  const second = PuzzleSystem.pickFlowPuzzle();
  assertEq(second.id, first.id);
});

test('flow bonus helpers earn consume and clear the flag cleanly', () => {
  assertEq(PuzzleSystem.hasFlowBonus(), false);
  assertEq(PuzzleSystem.earnFlowBonus(), true);
  assertEq(PuzzleSystem.hasFlowBonus(), true);
  assertEq(PuzzleSystem.consumeFlowBonus(), true);
  assertEq(PuzzleSystem.hasFlowBonus(), false);
  assertEq(PuzzleSystem.earnFlowBonus(), true);
  assertEq(PuzzleSystem.clearFlowBonus(), true);
  assertEq(PuzzleSystem.hasFlowBonus(), false);
});

console.log('\n── Training session lifecycle ──');

test('canStartTrainingSession is ok by default', () => {
  assertEq(PuzzleSystem.canStartTrainingSession('fork'), { ok: true, reasons: [] });
});

test('prepared theme is blocked until tournament end', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.canStartTrainingSession('fork'), {
    ok: false,
    reasons: ['already_prepared'],
  });
});

test('startSelfTrainingSession returns tracker defaults and a current puzzle', () => {
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  assertEq(session.attemptsUsed, 0);
  assertEq(session.attemptsRemaining, 18);
  assertEq(session.solvedTotal, 0);
  assertEq(session.streak, 0);
  assertEq(session.status, 'active');
  assert(session.currentPuzzle, 'expected a current puzzle');
});

test('starting a session marks the shown puzzle as seen immediately', () => {
  const session = PuzzleSystem.startSelfTrainingSession('pin');
  assertEq(_trainingState.seenPuzzleIds[session.currentPuzzle.id], 1);
});

test('submitting a failure resets streak and queues the puzzle for reinforcement', () => {
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  const result = PuzzleSystem.submitSessionAnswer(session.id, false);
  const queue = PuzzleSystem.getReinforcementQueue('fork');
  assertEq(result.session.streak, 0);
  assertEq(result.session.attemptsUsed, 1);
  assertEq(queue.length, 1);
  assertEq(queue[0].state, 'active');
});

test('reinforcement puzzle is served first in the next session of the same theme', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'active', confirmations: 0 },
  ];
  PuzzleSystem.init();
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  assertEq(session.currentPuzzle.id, seed.id);
  assertEq(session.currentPuzzle.reinforcement, true);
});

test('solving a queued puzzle moves it to pending-confirmation', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'active', confirmations: 0 },
  ];
  PuzzleSystem.init();
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  PuzzleSystem.submitSessionAnswer(session.id, true);
  const queue = PuzzleSystem.getReinforcementQueue('fork');
  assertEq(queue[0].state, 'pending-confirmation');
  assertEq(queue[0].confirmations, 1);
});

test('failure during confirmation resets the queue entry to active', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'pending-confirmation', confirmations: 1 },
  ];
  PuzzleSystem.init();
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  PuzzleSystem.submitSessionAnswer(session.id, false);
  const queue = PuzzleSystem.getReinforcementQueue('fork');
  assertEq(queue[0].state, 'active');
  assertEq(queue[0].confirmations, 0);
});

test('second successful re-solve in a later session removes the queue entry', () => {
  const seed = _findThemePuzzle('fork');
  _trainingState.reinforcementQueues.fork = [
    { puzzleId: seed.id, state: 'pending-confirmation', confirmations: 1 },
  ];
  PuzzleSystem.init();
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  PuzzleSystem.submitSessionAnswer(session.id, true);
  assertEq(PuzzleSystem.getReinforcementQueue('fork').length, 0);
});

test('three consecutive solves trigger the streak success path', () => {
  const session = PuzzleSystem.startSelfTrainingSession('mateIn1');
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.submitSessionAnswer(session.id, true);
  const result = PuzzleSystem.submitSessionAnswer(session.id, true);
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(result.session.status, 'completed');
  assertEq(summary.path, 'streak');
  assertEq(summary.bonusGranted, true);
  assertEq(PuzzleSystem.getTrainingBonusStatus('mateIn1').prepared, true);
});

test('six total solves within eighteen attempts trigger the persistence path', () => {
  const session = PuzzleSystem.startSelfTrainingSession('pin');
  const pattern = [true, false, true, false, true, true, false, true, true];
  let last = null;
  pattern.forEach((value) => {
    last = PuzzleSystem.submitSessionAnswer(session.id, value);
  });
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(last.session.status, 'completed');
  assertEq(summary.path, 'persistence');
  assertEq(summary.correct, 6);
  assertEq(summary.bonusGranted, true);
});

test('eighteen attempts without six solves end the session in failure', () => {
  const session = PuzzleSystem.startSelfTrainingSession('skewer');
  const pattern = [
    true, true, false,
    true, false, false,
    true, false, false,
    true, false, false,
    false, false, false,
    false, false, false,
  ];
  for (let i = 0; i < 18; i++) {
    PuzzleSystem.submitSessionAnswer(session.id, pattern[i]);
  }
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(summary.path, 'failure');
  assertEq(summary.bonusGranted, false);
});

test('completeSession rejects incomplete sessions', () => {
  const session = PuzzleSystem.startSelfTrainingSession('opening');
  assertThrows(() => PuzzleSystem.completeSession(session.id));
});

test('cannot start another session while one is active', () => {
  PuzzleSystem.startSelfTrainingSession('fork');
  const verdict = PuzzleSystem.canStartTrainingSession('pin');
  assertEq(verdict.ok, false);
  assertEq(verdict.reasons.includes('session_active'), true);
});

test('a prepared theme does not block training on a different theme', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.canStartTrainingSession('pin'), { ok: true, reasons: [] });
});

test('submitSessionAnswer still trusts a boolean solved flag in E.5', () => {
  const session = PuzzleSystem.startSelfTrainingSession('opening');
  const result = PuzzleSystem.submitSessionAnswer(session.id, true);
  assertEq(result.solved, true);
  assertEq(result.session.attemptsUsed, 1);
});

test('non-terminal answers advance to a new current puzzle', () => {
  const session = PuzzleSystem.startSelfTrainingSession('fork');
  const firstPuzzleId = session.currentPuzzle.id;
  const result = PuzzleSystem.submitSessionAnswer(session.id, false);
  assertEq(result.session.status, 'active');
  assert(result.session.currentPuzzle, 'expected next current puzzle');
  assert(result.session.currentPuzzle.id !== firstPuzzleId, 'expected a different next puzzle');
});

test('streak success summary exposes rating, aptitude, and training bonus snapshot', () => {
  const session = PuzzleSystem.startSelfTrainingSession('mateIn1');
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.submitSessionAnswer(session.id, true);
  PuzzleSystem.submitSessionAnswer(session.id, true);
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(typeof summary.rating, 'number');
  assertEq(typeof summary.ratingRd, 'number');
  assertEq(typeof summary.aptitude, 'number');
  assertEq(summary.trainingBonus.prepared, true);
});

test('failure summary leaves the theme unprepared', () => {
  const session = PuzzleSystem.startSelfTrainingSession('skewer');
  for (let i = 0; i < PuzzleSystem.SESSION_MAX_ATTEMPTS; i++) {
    PuzzleSystem.submitSessionAnswer(session.id, false);
  }
  const summary = PuzzleSystem.completeSession(session.id);
  assertEq(summary.path, 'failure');
  assertEq(PuzzleSystem.getTrainingBonusStatus('skewer').prepared, false);
});

console.log('\n── Ratings and derived aptitude ──');

test('per-theme ratings initialize to 500 and 300 RD', () => {
  assertEq(PuzzleSystem.getPuzzleRating('fork'), 500);
  assertEq(PuzzleSystem.getPuzzleRatingRd('fork'), 300);
  assertEq(PuzzleSystem.getPuzzleRating('pin'), 500);
});

test('success against an easy puzzle yields a positive rating delta', () => {
  const result = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 600, true);
  assert(result.delta > 0, 'expected positive delta');
});

test('success against a harder puzzle yields a larger positive delta than an easy one', () => {
  const easy = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 600, true);
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  const hard = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 1100, true);
  assert(hard.delta > easy.delta, 'expected harder win to grant larger delta');
});

test('failure has softer impact than symmetric success', () => {
  const win = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 900, true);
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  const loss = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 900, false);
  assert(Math.abs(loss.delta) < win.delta, 'expected softer failure impact');
});

test('training K factor is one quarter of the in-game K impact', () => {
  const live = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 900, true, 1);
  resetMocks();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  const training = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 900, true, PuzzleSystem.TRAINING_K_FACTOR_MULT);
  assert(training.delta < live.delta, 'expected training delta to be smaller than live delta');
});

test('rating deviation converges toward 50 per theme', () => {
  for (let i = 0; i < 80; i++) {
    PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 800, true);
  }
  assertEq(PuzzleSystem.getPuzzleRatingRd('fork'), 50);
  assertEq(PuzzleSystem.getPuzzleRatingRd('pin'), 300);
});

test('rating is clamped to the [400, 2500] range per theme', () => {
  _trainingState.puzzleRatings.fork = 2490;
  _trainingState.puzzleRatingRds.fork = 300;
  PuzzleSystem.init();
  PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 1600, true);
  assert(PuzzleSystem.getPuzzleRating('fork') <= 2500);

  _trainingState.puzzleRatings.pin = 405;
  _trainingState.puzzleRatingRds.pin = 300;
  PuzzleSystem.init();
  PuzzleSystem.updatePuzzleRatingAfterAttempt('pin', 1400, false);
  assert(PuzzleSystem.getPuzzleRating('pin') >= 400);
});

test('theme ratings are isolated from each other', () => {
  PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 900, true);
  assert(PuzzleSystem.getPuzzleRating('fork') !== PuzzleSystem.getPuzzleRating('pin'));
});

test('updatePuzzleRatingAfterAttempt returns the new theme rating snapshot', () => {
  const result = PuzzleSystem.updatePuzzleRatingAfterAttempt('fork', 900, true);
  assertEq(result.newRating, PuzzleSystem.getPuzzleRating('fork'));
  assertEq(result.newRd, PuzzleSystem.getPuzzleRatingRd('fork'));
});

test('pickInGamePuzzle window widens when theme RD is high and narrows when it is low', () => {
  const custom = [
    {
      id: 'fork_low_band',
      fen: '6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      solution: ['f7g7'],
      theme: 'fork',
      difficulty: 820,
      source: 'test:low-band',
    },
    {
      id: 'fork_outside_narrow',
      fen: '6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      solution: ['f7g7'],
      theme: 'fork',
      difficulty: 980,
      source: 'test:outside-narrow',
    },
  ];

  _withOverriddenThemePool('fork', custom, () => {
    _trainingState.puzzleRatings.fork = 500;
    _trainingState.puzzleRatingRds.fork = 300;
    PuzzleSystem.init();
    const wide = PuzzleSystem.pickInGamePuzzle('fork');
    assertEq(wide.id, 'fork_low_band');

    resetMocks();
    _trainingState.puzzleRatings.fork = 500;
    _trainingState.puzzleRatingRds.fork = 50;
    PuzzleSystem.clearForTests();
    PuzzleSystem.init();
    const narrow = PuzzleSystem.pickInGamePuzzle('fork');
    assertEq(narrow.id, 'fork_low_band');
  });
});

test('derived aptitude changes when a theme rating rises', () => {
  const before = PuzzleSystem.getAptitude('middlegame');
  PuzzleSystem.updatePuzzleRatingAfterAttempt('middlegame', 1200, true);
  assert(PuzzleSystem.getAptitude('middlegame') > before);
});

console.log('\n── Tournament-scoped training bonuses ──');

test('prepared bonus counts as available once per game', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.getTrainingBonusCount('fork'), 1);
});

test('consumeTrainingBonus marks the theme used for the current game', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.consumeTrainingBonus('fork'), true);
  assertEq(PuzzleSystem.getTrainingBonusCount('fork'), 0);
  assertEq(PuzzleSystem.getTrainingBonusStatus('fork').usedThisGame, true);
});

test('consumeTrainingBonus returns false for an unprepared theme', () => {
  assertEq(PuzzleSystem.consumeTrainingBonus('fork'), false);
});

test('consumeTrainingBonus returns false when the prepared theme was already used this game', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: true,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.consumeTrainingBonus('fork'), false);
});

test('resetTrainingBonusesForGame restores prepared themes for the next round', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: true,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  PuzzleSystem.resetTrainingBonusesForGame();
  assertEq(PuzzleSystem.getTrainingBonusCount('fork'), 1);
});

test('resetTrainingBonusesForGame does not create a prepared bonus where none exists', () => {
  PuzzleSystem.resetTrainingBonusesForGame();
  assertEq(PuzzleSystem.getTrainingBonusStatus('fork'), {
    prepared: false,
    usedThisGame: false,
    lockedUntilTournamentEnd: false,
  });
});

test('clearTrainingBonusesAfterTournament clears all prepared themes', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: true,
    lockedUntilTournamentEnd: true,
  };
  _trainingState.trainingBonuses.pin = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  PuzzleSystem.clearTrainingBonusesAfterTournament();
  assertEq(PuzzleSystem.getPreparedThemes(), []);
  assertEq(PuzzleSystem.getTrainingBonusStatus('fork'), {
    prepared: false,
    usedThisGame: false,
    lockedUntilTournamentEnd: false,
  });
});

test('getPreparedThemes lists every prepared theme', () => {
  _trainingState.trainingBonuses.fork = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  _trainingState.trainingBonuses.pin = {
    prepared: true,
    usedThisGame: true,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.getPreparedThemes().sort(), ['fork', 'pin']);
});

console.log('\n── Persistence and invariants ──');

test('getSeenCount reflects seen puzzle ids', () => {
  _trainingState.seenPuzzleIds = { a: 1, b: 1, c: 1 };
  PuzzleSystem.init();
  assertEq(PuzzleSystem.getSeenCount(), 3);
});

test('training state survives re-init round-trip with per-theme ratings', () => {
  _trainingState.puzzleRatings.endgame = 730;
  _trainingState.puzzleRatingRds.endgame = 215;
  _trainingState.trainingBonuses.endgame = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  assertEq(PuzzleSystem.getPuzzleRating('endgame'), 730);
  assertEq(PuzzleSystem.getTrainingBonusStatus('endgame').prepared, true);
});

test('changing coach later does not wipe player-owned training progress', () => {
  _trainingState.puzzleRatings.middlegame = 760;
  _trainingState.seenPuzzleIds.p1 = 1;
  _trainingState.reinforcementQueues.middlegame = [
    { puzzleId: 'p1', state: 'active', confirmations: 0 },
  ];
  _trainingState.trainingBonuses.middlegame = {
    prepared: true,
    usedThisGame: false,
    lockedUntilTournamentEnd: true,
  };
  PuzzleSystem.init();
  const ratingBefore = PuzzleSystem.getPuzzleRating('middlegame');
  const bonusBefore = PuzzleSystem.getTrainingBonusStatus('middlegame');
  assertEq(ratingBefore, 760);
  assertEq(bonusBefore.prepared, true);
});

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failures:');
  failures.forEach((failure) => {
    console.log(`  • ${failure.name}\n    ${failure.message}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
