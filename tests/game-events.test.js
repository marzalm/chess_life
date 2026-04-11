// tests/game-events.test.js
//
// Standalone Node.js test harness for js/game-events.js.
//
// IMPORTANT: GameEvents is a module-level singleton. Every test must start
// from a clean bus state, so reset() calls GameEvents.clear() before each
// case. Do not rely on individual tests to clean up after themselves.

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'game-events.js'),
  'utf8',
);
const GameEvents = (new Function(`${code}\nreturn GameEvents;`))();

let passed = 0, failed = 0;
const failures = [];

function reset() {
  GameEvents.clear();
}

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

console.log('\n── Basic pub/sub ──');

test('on + emit calls handler with payload', () => {
  let seen = null;
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, (payload) => { seen = payload; });
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, { result: 'win', mode: 'free' });
  assertEq(seen, { result: 'win', mode: 'free' });
});

test('emit with no subscribers is a no-op', () => {
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, { result: 'draw' });
  assert(true);
});

test('multiple subscribers all run in registration order', () => {
  const seen = [];
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => seen.push('first'));
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => seen.push('second'));
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => seen.push('third'));
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  assertEq(seen, ['first', 'second', 'third']);
});

console.log('\n── Unsubscribe paths ──');

test('returned unsubscribe function removes the handler', () => {
  let count = 0;
  const unsubscribe = GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => { count += 1; });
  unsubscribe();
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  assertEq(count, 0);
});

test('off removes a handler directly', () => {
  let count = 0;
  const handler = () => { count += 1; };
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, handler);
  GameEvents.off(GameEvents.EVENTS.GAME_ENDED, handler);
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  assertEq(count, 0);
});

test('off on an unknown handler is a no-op', () => {
  GameEvents.off(GameEvents.EVENTS.GAME_ENDED, () => {});
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  assert(true);
});

console.log('\n── Error handling ──');

test('throwing handler is caught and logged', () => {
  const originalError = console.error;
  const seen = [];
  console.error = (...args) => { seen.push(args.map(String).join(' ')); };
  try {
    GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => { throw new Error('boom'); });
    GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  } finally {
    console.error = originalError;
  }
  assert(seen.length >= 1, 'expected console.error to be called');
  assert(seen[0].includes('Handler failed'), 'expected logged handler failure');
});

test('throwing handler does not prevent later handlers', () => {
  const seen = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => {
      seen.push('bad');
      throw new Error('boom');
    });
    GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => {
      seen.push('good');
    });
    GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  } finally {
    console.error = originalError;
  }
  assertEq(seen, ['bad', 'good']);
});

console.log('\n── Clear helpers ──');

test('clear(eventName) clears only one channel', () => {
  let a = 0, b = 0;
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => { a += 1; });
  GameEvents.on(GameEvents.EVENTS.TOURNAMENT_FINISHED, () => { b += 1; });
  GameEvents.clear(GameEvents.EVENTS.GAME_ENDED);
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {});
  assertEq([a, b], [0, 1]);
});

test('clear() clears every channel', () => {
  let count = 0;
  GameEvents.on(GameEvents.EVENTS.GAME_ENDED, () => { count += 1; });
  GameEvents.on(GameEvents.EVENTS.TOURNAMENT_FINISHED, () => { count += 1; });
  GameEvents.clear();
  GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {});
  GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {});
  assertEq(count, 0);
});

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) {
  process.exitCode = 1;
}
