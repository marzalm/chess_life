// tests/chess-engine-worker-race.test.js
//
// Phase G.2 regression tests for the shared Stockfish Worker race.
//
// Scenario covered: an in-flight Focus eval is cancelled by an incoming
// `requestOpponentMove()`. Before the fix, the cancelled eval's orphan
// `bestmove` could be misrouted into the opponent branch (`_opponentResolve`
// was armed immediately after `stop`), causing the opponent to receive a
// move for the wrong side and chess.js to reject it.
//
// The fix drains the worker via `stop` + `isready`/`readyok` BEFORE
// arming the new resolver. These tests drive a mock Worker manually to
// verify the drain ordering and the orphan isolation.

const fs = require('fs');
const path = require('path');

// ── 1. Real chess.js (self-contained) ──────────────────────────
const chessCode = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'chess.js'),
  'utf8',
);
const Chess = (new Function(`${chessCode}\nreturn Chess;`))();

// ── 2. Mock Worker + minimal global env ────────────────────────
let _worker = null;
const _posted = [];

class MockWorker {
  constructor() {
    _worker = this;
    this.onmessage = null;
  }
  postMessage(msg) { _posted.push(msg); }
  terminate() {}
  // Test helper: deliver a message as if the worker emitted it
  _emit(data) { if (this.onmessage) this.onmessage({ data }); }
}

// Stubs for modules chess-engine soft-couples to (never called during
// these tests, but referenced by `typeof ...` guards).
const FocusSystem = {
  evaluateMoveDelta() {},
  pauseForPlayback() {},
  resumeFromPlayback() {},
};
const MaiaEngine = {
  isBookPosition() { return false; },
};
// BonusSystem left undefined: we want the playback guard to be inert
// so we actually exercise the drain logic rather than short-circuit.

// ── 3. Load chess-engine.js in an isolated function scope ──────
const engineCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'chess-engine.js'),
  'utf8',
);
const ChessEngine = (new Function(
  'Chess', 'Worker', 'FocusSystem', 'MaiaEngine', 'console',
  `${engineCode}\nreturn ChessEngine;`,
))(Chess, MockWorker, FocusSystem, MaiaEngine, { log: () => {}, error: () => {} });

// ── 4. Init + handshake ────────────────────────────────────────
function resetEngine() {
  _posted.length = 0;
  ChessEngine.init();
  // Simulate the UCI handshake: uciok → engine posts isready → readyok → _ready=true
  _worker._emit('uciok');
  _worker._emit('readyok');
  _posted.length = 0; // clear handshake traffic
}

// ── 5. Test harness ────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

async function atest(name, fn) {
  try {
    resetEngine();
    await fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.log('  ✗', name);
    console.log('     →', e.stack || e.message);
    failed++;
    failures.push({ name, message: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Small helper to let microtasks settle before we inspect `_posted`.
const flush = () => new Promise((r) => setImmediate(r));

// ── 6. Tests ───────────────────────────────────────────────────

(async () => {

  console.log('── orphan isolation ──');

  await atest('orphan bestmove during drain is not consumed by opponent', async () => {
    // Kick off an eval (background prefetch via getBestMove). It arms
    // _evalResolve and posts `position`+`go`.
    const evalPromise = ChessEngine.getBestMove();
    await flush();

    // Worker should have received position + go for the eval.
    assert(_posted.some((m) => m.startsWith('position fen')), 'eval posted position');
    assert(_posted.some((m) => m.startsWith('go ')), 'eval posted go');
    _posted.length = 0;

    // Now issue an opponent request — should post `stop` + `isready`
    // and NOT yet post setoption/position/go (drain is in progress).
    const oppPromise = ChessEngine.requestOpponentMove(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      { movetimeMs: 100, multipv: 3 },
    );
    await flush();

    assert(_posted.includes('stop'),    'drain posts stop');
    assert(_posted.includes('isready'), 'drain posts isready');
    assert(!_posted.some((m) => m.startsWith('position fen')), 'no position posted before readyok');
    assert(!_posted.some((m) => m.startsWith('go ')),           'no go posted before readyok');

    // Inject the orphan bestmove BEFORE readyok. If the old code were
    // in place, _opponentResolve would already be armed and this would
    // resolve the opponent with a stale move. With the drain, no
    // resolver is armed yet, so this should be silently dropped.
    _worker._emit('bestmove a2a3');
    await flush();

    // Opponent still pending, no position/go yet.
    let oppSettled = false;
    oppPromise.then(() => { oppSettled = true; });
    await flush();
    assert(!oppSettled, 'opponent promise must not resolve during drain');

    // Now deliver readyok → drain resolves → setoption/position/go posted.
    _worker._emit('readyok');
    await flush();

    assert(_posted.some((m) => m.startsWith('setoption name MultiPV value 3')), 'setoption posted after drain');
    assert(_posted.some((m) => m.startsWith('position fen')),                    'position posted after drain');
    assert(_posted.some((m) => m.startsWith('go movetime 100')),                  'go posted after drain');

    // Emit the real opponent result.
    _worker._emit('info depth 1 multipv 1 score cp 20 pv e7e5');
    _worker._emit('info depth 1 multipv 2 score cp 15 pv c7c5');
    _worker._emit('bestmove e7e5');

    const result = await oppPromise;
    assertEqual(result.bestMove, 'e7e5', 'opponent resolves to real bestmove, not orphan');
    assert(Array.isArray(result.lines) && result.lines.length >= 1, 'opponent received lines');
    assert(result.lines.every((l) => l.move !== 'a2a3'), 'orphan never appears in lines');

    // The cancelled eval promise should have resolved with null (its
    // internal result mapping when bestMove is absent).
    await evalPromise; // should not hang
  });

  console.log('── init integrity ──');

  await atest('init readyok still sets _ready when no drain is pending', async () => {
    // resetEngine already exercises this; just re-verify by starting
    // a fresh engine and confirming it accepts new requests.
    const oppPromise = ChessEngine.requestOpponentMove(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { movetimeMs: 50, multipv: 1 },
    );
    await flush();
    // No prior eval, so no drain round-trip. Commands should be posted
    // immediately.
    assert(_posted.some((m) => m.startsWith('position fen')), 'position posted without drain');
    assert(_posted.some((m) => m.startsWith('go movetime 50')), 'go posted without drain');
    _worker._emit('bestmove e2e4');
    const result = await oppPromise;
    assertEqual(result.bestMove, 'e2e4', 'opponent resolves normally');
  });

  console.log('── drain timeout fail-open ──');

  await atest('500ms timeout releases drain if readyok never arrives', async () => {
    // Start an eval to arm _evalResolve.
    const evalPromise = ChessEngine.getBestMove();
    await flush();
    _posted.length = 0;

    // Opponent request triggers drain.
    const oppPromise = ChessEngine.requestOpponentMove(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      { movetimeMs: 80, multipv: 2 },
    );
    await flush();
    assert(_posted.includes('isready'), 'isready posted');

    // DO NOT emit readyok — simulate a cracked worker.
    // Wait >500ms for the timeout to fire.
    await new Promise((r) => setTimeout(r, 600));

    // Drain should have resolved; opponent posts now sent.
    assert(_posted.some((m) => m.startsWith('position fen')), 'position posted after timeout');
    assert(_posted.some((m) => m.startsWith('go movetime 80')), 'go posted after timeout');

    // Let the opponent resolve normally.
    _worker._emit('bestmove e7e5');
    const result = await oppPromise;
    assertEqual(result.bestMove, 'e7e5', 'opponent resolves after timeout fail-open');

    await evalPromise;
  });

  console.log('');
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);

})();
