// tests/career-manager.test.js
//
// Standalone Node.js test harness for js/career-manager.js.

const fs = require('fs');
const path = require('path');

let CareerManager;
let SaveManager;
let FocusSystem;
let GameEvents;
let _savedBlob;
let _saveCount;
let _renderCount;
let _emitted;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildGameEventsMock() {
  const listeners = new Map();
  return {
    EVENTS: {
      TITLE_EARNED: 'title_earned',
    },
    on(eventName, handler) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(handler);
      listeners.set(eventName, bucket);
      return () => this.off(eventName, handler);
    },
    off(eventName, handler) {
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      bucket.delete(handler);
      if (bucket.size === 0) listeners.delete(eventName);
    },
    emit(eventName, payload) {
      _emitted.push({ eventName, payload });
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      for (const handler of bucket) handler(payload);
    },
    clear() {
      listeners.clear();
    },
  };
}

function reset(savedOverride = null) {
  _savedBlob = savedOverride ? clone(savedOverride) : null;
  _saveCount = 0;
  _renderCount = 0;
  _emitted = [];

  SaveManager = {
    hasSave: () => _savedBlob !== null,
    load: () => clone(_savedBlob),
    save: (state) => {
      _savedBlob = clone(state);
      _saveCount += 1;
    },
    deleteSave: () => {
      _savedBlob = null;
    },
  };

  FocusSystem = {
    current: 100,
    max: 100,
    render: () => { _renderCount += 1; },
  };

  GameEvents = buildGameEventsMock();

  const code = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'career-manager.js'),
    'utf8',
  );
  CareerManager = (new Function(
    'SaveManager', 'FocusSystem', 'GameEvents',
    `${code}\nreturn CareerManager;`,
  ))(SaveManager, FocusSystem, GameEvents);

  CareerManager.init();
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

function testWithSave(name, saved, fn) {
  reset(saved);
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

console.log('\n── Title thresholds ──');

test('titleForElo matches the FIDE thresholds', () => {
  assertEq(CareerManager.titleForElo(1999), null);
  assertEq(CareerManager.titleForElo(2100), null);
  assertEq(CareerManager.titleForElo(2199), null);
  assertEq(CareerManager.titleForElo(2200), 'CM');
  assertEq(CareerManager.titleForElo(2299), 'CM');
  assertEq(CareerManager.titleForElo(2300), 'FM');
  assertEq(CareerManager.titleForElo(2399), 'FM');
  assertEq(CareerManager.titleForElo(2400), 'IM');
  assertEq(CareerManager.titleForElo(2499), 'IM');
  assertEq(CareerManager.titleForElo(2500), 'GM');
});

test('formatName returns the plain display name without prefixing the title', () => {
  assertEq(CareerManager.formatName('Viktor Holm', 'GM'), 'Viktor Holm');
  assertEq(CareerManager.formatName('Viktor Holm', null), 'Viktor Holm');
});

console.log('\n── Creation and migration ──');

test('player.create starts untitled at 800 Elo', () => {
  CareerManager.player.create({
    playerName: 'Tester',
    nationality: 'NO',
  });
  const player = CareerManager.player.get();
  assertEq(player.elo, 800);
  assertEq(player.title, null);
});

testWithSave('init derives a missing title from existing Elo without degrading saves', {
  player: {
    playerName: 'Existing',
    nationality: 'NO',
    gender: 'M',
    avatar: {},
    elo: 2442,
    settings: { difficulty: 'realistic' },
  },
}, () => {
  const player = CareerManager.player.get();
  assertEq(player.title, 'IM');
});

testWithSave('init preserves an existing CM title even when elo is now below the CM threshold', {
  player: {
    playerName: 'Existing',
    nationality: 'NO',
    gender: 'M',
    avatar: {},
    elo: 2100,
    title: 'CM',
    settings: { difficulty: 'realistic' },
  },
}, () => {
  const player = CareerManager.player.get();
  assertEq(CareerManager.titleForElo(player.elo), null);
  assertEq(player.title, 'CM');
});

console.log('\n── Promotions ──');

test('checkTitlePromotion promotes step by step and never downgrades', () => {
  CareerManager.player.create({
    playerName: 'Tester',
    nationality: 'NO',
  });
  const player = CareerManager.player.get();

  player.elo = 2200;
  assertEq(CareerManager.player.checkTitlePromotion(), 'CM');
  assertEq(player.title, 'CM');

  player.elo = 2300;
  assertEq(CareerManager.player.checkTitlePromotion(), 'FM');
  assertEq(player.title, 'FM');

  player.elo = 2400;
  assertEq(CareerManager.player.checkTitlePromotion(), 'IM');
  assertEq(player.title, 'IM');

  player.elo = 2500;
  assertEq(CareerManager.player.checkTitlePromotion(), 'GM');
  assertEq(player.title, 'GM');

  player.elo = 2100;
  assertEq(CareerManager.player.checkTitlePromotion(), null);
  assertEq(player.title, 'GM');

  assertEq(
    _emitted
      .filter((event) => event.eventName === GameEvents.EVENTS.TITLE_EARNED)
      .map((event) => event.payload.title),
    ['CM', 'FM', 'IM', 'GM'],
  );
});

test('updateElo emits title_earned when crossing a threshold', () => {
  CareerManager.player.create({
    playerName: 'Tester',
    nationality: 'NO',
  });
  const player = CareerManager.player.get();
  player.elo = 2190;

  const delta = CareerManager.player.updateElo(1, 2500);
  assert(delta > 0, 'expected a positive Elo gain');
  assert(player.elo >= 2200, 'expected CM threshold to be crossed');
  assertEq(player.title, 'CM');
  assertEq(
    _emitted.filter((event) => event.eventName === GameEvents.EVENTS.TITLE_EARNED).length,
    1,
  );
});

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) {
  process.exitCode = 1;
}
