// tests/stockfish-opponent.test.js
//
// Standalone Node.js test harness for js/stockfish-opponent.js.
// The real Stockfish Worker does not exist in Node; we test the pure
// parts (temperature/movetime interpolation, softmax sampling) and
// mock ChessEngine.requestOpponentMove for getMove() integration.

const fs = require('fs');
const path = require('path');

// Mock ChessEngine for this test run.
let _mockRequestResult = null;
let _mockRequestCalls = [];
global.ChessEngine = {
  async requestOpponentMove(fen, opts) {
    _mockRequestCalls.push({ fen, opts });
    return _mockRequestResult;
  },
};

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'stockfish-opponent.js'),
  'utf8',
);
const StockfishOpponent = (new Function(
  'ChessEngine',
  `${code}\nreturn StockfishOpponent;`,
))(global.ChessEngine);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  _mockRequestResult = null;
  _mockRequestCalls = [];
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

async function atest(name, fn) {
  _mockRequestResult = null;
  _mockRequestCalls = [];
  try {
    await fn();
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

function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg || 'not close'} — expected ${expected} ±${tol}, got ${actual}`);
  }
}

function assertEq(a, b, msg) {
  const aj = JSON.stringify(a);
  const bj = JSON.stringify(b);
  if (aj !== bj) throw new Error(`${msg || 'mismatch'}\n        expected: ${bj}\n        actual:   ${aj}`);
}

(async () => {
  console.log('\n── TEMPERATURE_AT ──');

  test('TEMPERATURE_AT anchors match design', () => {
    assertClose(StockfishOpponent.TEMPERATURE_AT(2000), 60, 0.1);
    assertClose(StockfishOpponent.TEMPERATURE_AT(2400), 30, 0.1);
    assertClose(StockfishOpponent.TEMPERATURE_AT(2800), 15, 0.1);
  });

  test('TEMPERATURE_AT interpolates linearly between 2000 and 2400', () => {
    // midpoint 2200 → 45
    assertClose(StockfishOpponent.TEMPERATURE_AT(2200), 45, 0.5);
  });

  test('TEMPERATURE_AT interpolates linearly between 2400 and 2800', () => {
    // midpoint 2600 → 22.5
    assertClose(StockfishOpponent.TEMPERATURE_AT(2600), 22.5, 0.5);
  });

  test('TEMPERATURE_AT extrapolates below 2000', () => {
    // 1800 (below anchor): linear extrapolation continues upward
    const t = StockfishOpponent.TEMPERATURE_AT(1800);
    assert(t > 60, 'below-2000 T should be > 60');
  });

  test('TEMPERATURE_AT extrapolates above 2800, clamped positive', () => {
    const t = StockfishOpponent.TEMPERATURE_AT(3200);
    // Extrapolating: would go negative in theory, clamped to >= 3
    assert(t >= 3, 'clamped to 3+');
    assert(t < 15, 'still smaller than 2800 T');
  });

  test('TEMPERATURE_AT non-finite returns default', () => {
    const t = StockfishOpponent.TEMPERATURE_AT(NaN);
    assert(Number.isFinite(t) && t > 0);
  });

  console.log('\n── MOVETIME_AT ──');

  test('MOVETIME_AT anchors match design', () => {
    assertClose(StockfishOpponent.MOVETIME_AT(2000), 250, 1);
    assertClose(StockfishOpponent.MOVETIME_AT(2400), 300, 1);
    assertClose(StockfishOpponent.MOVETIME_AT(2800), 450, 1);
  });

  test('MOVETIME_AT interpolates above 2400', () => {
    assertClose(StockfishOpponent.MOVETIME_AT(2600), 375, 1);
  });

  test('MOVETIME_AT has a sane floor', () => {
    const mt = StockfishOpponent.MOVETIME_AT(1500);
    assert(mt >= 80, 'floor at 80ms');
  });

  console.log('\n── sampleMove ──');

  test('empty lines → null', () => {
    assertEq(StockfishOpponent.sampleMove([], 30), null);
  });

  test('single line → that move', () => {
    assertEq(StockfishOpponent.sampleMove([{ move: 'e2e4', cp: 20 }], 30), 'e2e4');
  });

  test('T very low (~0): always picks the best', () => {
    const lines = [
      { move: 'e2e4', cp: 50 },
      { move: 'd2d4', cp: 45 },
      { move: 'c2c4', cp: 10 },
    ];
    // With T=1, delta 5 → weight exp(-5) ≈ 0.0067, heavily biased to best.
    let countsBest = 0;
    for (let i = 0; i < 1000; i++) {
      if (StockfishOpponent.sampleMove(lines, 1) === 'e2e4') countsBest += 1;
    }
    assert(countsBest > 990, `expected >990 best picks, got ${countsBest}`);
  });

  test('T moderate: distribution approximately matches softmax', () => {
    const lines = [
      { move: 'A', cp: 0 },
      { move: 'B', cp: -30 },  // delta 30
      { move: 'C', cp: -60 },  // delta 60
    ];
    const T = 30;
    const wA = Math.exp(0);       // 1
    const wB = Math.exp(-1);      // ~0.3679
    const wC = Math.exp(-2);      // ~0.1353
    const sum = wA + wB + wC;
    const expectedA = wA / sum;   // ~0.6652
    const expectedB = wB / sum;
    const expectedC = wC / sum;

    const counts = { A: 0, B: 0, C: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) {
      counts[StockfishOpponent.sampleMove(lines, T)] += 1;
    }
    const pA = counts.A / N;
    const pB = counts.B / N;
    const pC = counts.C / N;

    assertClose(pA, expectedA, 0.02, 'pA off');
    assertClose(pB, expectedB, 0.02, 'pB off');
    assertClose(pC, expectedC, 0.02, 'pC off');
  });

  test('T very high: distribution approaches uniform', () => {
    const lines = [
      { move: 'A', cp: 0 },
      { move: 'B', cp: -40 },
      { move: 'C', cp: -80 },
    ];
    const counts = { A: 0, B: 0, C: 0 };
    const N = 10000;
    for (let i = 0; i < N; i++) {
      counts[StockfishOpponent.sampleMove(lines, 1000)] += 1;
    }
    // With T=1000, each should get roughly 33% ± 3%
    for (const k of ['A', 'B', 'C']) {
      assertClose(counts[k] / N, 0.333, 0.03, `high-T prob ${k}`);
    }
  });

  test('injectable randFn: deterministic picks', () => {
    const lines = [
      { move: 'A', cp: 0 },
      { move: 'B', cp: -20 },
    ];
    // With rand=0: cumulative starts at A, so A is picked
    assertEq(StockfishOpponent.sampleMove(lines, 30, () => 0), 'A');
    // With rand=0.999: past A's weight, lands on B
    assertEq(StockfishOpponent.sampleMove(lines, 30, () => 0.999), 'B');
  });

  console.log('\n── getMove integration ──');

  await atest('getMove passes movetime and multipv to ChessEngine', async () => {
    _mockRequestResult = { lines: [{ pvNum: 1, move: 'e2e4', cp: 20 }], bestMove: 'e2e4' };
    const out = await StockfishOpponent.getMove('startpos', 2400, {});
    assertEq(out.move, 'e2e4');
    assert(_mockRequestCalls.length === 1);
    assertClose(_mockRequestCalls[0].opts.movetimeMs, 300, 1);
    assertEq(_mockRequestCalls[0].opts.multipv, 10);
    assertClose(out.T, 30, 0.5);
  });

  await atest('getMove with empty lines falls back to bestMove', async () => {
    _mockRequestResult = { lines: [], bestMove: 'd2d4' };
    const out = await StockfishOpponent.getMove('startpos', 2200, {});
    assertEq(out.move, 'd2d4');
  });

  await atest('getMove respects explicit movetime override', async () => {
    _mockRequestResult = { lines: [{ pvNum: 1, move: 'a2a4', cp: 0 }], bestMove: 'a2a4' };
    await StockfishOpponent.getMove('startpos', 2000, { movetimeMs: 1000 });
    assertEq(_mockRequestCalls[0].opts.movetimeMs, 1000);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
