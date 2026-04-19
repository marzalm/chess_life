// tests/focus-system.test.js
//
// Focus-only regression harness for hopeless-position cutoff logic.

const fs = require('fs');
const path = require('path');

const focusCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'focus-system.js'),
  'utf8',
);

let FocusSystem;
let CareerManager;
let SoundManager;
let ChessEngine;
let UIManager;
let document;
let windowObj;

function reset() {
  CareerManager = {
    hasCharacter: () => true,
    player: {
      get: () => ({ elo: 1200 }),
    },
  };

  SoundManager = {
    playBestMove() {},
    playGoodMove() {},
    playBlunder() {},
    playImprecision() {},
    playFocusEmpty() {},
    playFlowEnter() {},
    playFlowExit() {},
    playSFActivate() {},
  };

  ChessEngine = {
    setUsedStockfish() {},
  };

  UIManager = {
    _opponentElo: 1200,
  };

  document = {
    getElementById() { return null; },
    querySelector() { return null; },
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  };

  windowObj = {};

  FocusSystem = (new Function(
    'CareerManager', 'SoundManager', 'ChessEngine', 'UIManager', 'document', 'window',
    `${focusCode}\nreturn FocusSystem;`,
  ))(CareerManager, SoundManager, ChessEngine, UIManager, document, windowObj);

  FocusSystem.render = () => {};
  FocusSystem._log = () => {};
  FocusSystem.setMoveEvalCallback(null);
  FocusSystem.current = 50;
  FocusSystem.max = 100;
  FocusSystem._playbackPaused = false;
  FocusSystem.modifiers = [];
  FocusSystem.consecutiveGoodMoves = 0;
  FocusSystem.flowPalier = 0;
  FocusSystem.lastMoveEval = null;
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  reset();
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

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'mismatch'}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('\n── Hopeless-position cutoff ──');

test('player losing by 800cp with 8 pieces gets no Focus gain', () => {
  FocusSystem.evaluateMoveDelta(0, false, null, 1, false, 8, -800);
  assertEq(FocusSystem.current, 50, 'Focus should not change');
});

test('player losing by 1500cp with 20 pieces gets no Focus gain', () => {
  FocusSystem.evaluateMoveDelta(0, false, null, 1, false, 20, -1500);
  assertEq(FocusSystem.current, 50, 'Focus should not change');
});

test('player winning by 800cp with 8 pieces still gets reduced non-zero Focus gain', () => {
  FocusSystem.evaluateMoveDelta(0, false, null, 1, false, 8, 800);
  assert(FocusSystem.current > 50, 'winning side should still gain some Focus');
});

console.log('\n── Adaptive move threshold ──');

test('displayed opponent elo is used directly', () => {
  UIManager._opponentElo = 1800;
  assertEq(FocusSystem._getOpponentElo(), 1800, 'should use displayed opponent elo directly');
});

test('base threshold is now fixed at 80cp regardless of player elo', () => {
  CareerManager.player.get = () => ({ elo: 800 });
  assertEq(FocusSystem._getBaseThreshold(), 80, '800 elo should use the fixed 80cp base');
  CareerManager.player.get = () => ({ elo: 1800 });
  assertEq(FocusSystem._getBaseThreshold(), 80, '1800 elo should use the fixed 80cp base');
});

test('gap penalty tightens the threshold when the effective opponent is stronger', () => {
  CareerManager.player.get = () => ({ elo: 1200 });
  UIManager._opponentElo = 2000;
  // base 80, gap 800, eloScale ~0.333 => penalty ≈ 13cp, threshold 67
  assertEq(FocusSystem._getGoodMoveThreshold(), 67, '1200 vs 2000 should tighten to 67cp');
});

test('gap penalty hits harder at high elo for the same gap', () => {
  CareerManager.player.get = () => ({ elo: 800 });
  UIManager._opponentElo = 1200; // same +400 gap
  const low = FocusSystem._getGapPenalty();

  CareerManager.player.get = () => ({ elo: 1800 });
  UIManager._opponentElo = 2200; // same +400 gap
  const high = FocusSystem._getGapPenalty();

  assert(high > low, 'same gap should penalize high elo more than low elo');
});

test('threshold keeps the absolute 15cp floor after flow tightening and large gap', () => {
  CareerManager.player.get = () => ({ elo: 1800 });
  UIManager._opponentElo = 4000;
  FocusSystem.flowPalier = 4;
  assertEq(FocusSystem._getGoodMoveThreshold(), 15, 'should never drop below 15cp');
});

console.log(`\nFocus tests: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((failure) => {
    console.log(`- ${failure.name}: ${failure.message}`);
  });
  process.exit(1);
}
