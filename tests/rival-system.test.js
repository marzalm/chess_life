// tests/rival-system.test.js
//
// Standalone Node.js test harness for js/rival-system.js.

const fs = require('fs');
const path = require('path');

let RivalSystem;
let RivalData;
let CareerManager;
let CalendarSystem;
let _savedState;
let _today;
let _saveCount;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function reset() {
  _savedState = {
    player: { elo: 1500 },
    rivals: [],
  };
  _today = { year: 2026, month: 4, day: 12 };
  _saveCount = 0;

  CareerManager = {
    player: { get: () => _savedState.player },
    save: () => { _saveCount += 1; },
    _rawState: () => _savedState,
  };

  CalendarSystem = {
    getDate: () => clone(_today),
    addDays(date, n) {
      const out = clone(date);
      for (let i = 0; i < n; i++) {
        out.day += 1;
        if (out.day > 30) { out.day = 1; out.month += 1; }
        if (out.month > 12) { out.month = 1; out.year += 1; }
      }
      return out;
    },
    compareDates(a, b) {
      if (a.year !== b.year) return a.year < b.year ? -1 : 1;
      if (a.month !== b.month) return a.month < b.month ? -1 : 1;
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      return 0;
    },
    onDayAdvanced(handler) {
      this._tickHandler = handler;
      return () => { if (this._tickHandler === handler) this._tickHandler = null; };
    },
    _tickHandler: null,
  };

  const dataCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'rival-data.js'), 'utf8');
  RivalData = (new Function(`${dataCode}\nreturn RivalData;`))();

  const sysCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'rival-system.js'), 'utf8');
  RivalSystem = (new Function(
    'CareerManager', 'CalendarSystem', 'RivalData',
    `${sysCode}\nreturn RivalSystem;`,
  ))(CareerManager, CalendarSystem, RivalData);

  RivalSystem._teardown();
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  reset();
  try {
    RivalSystem.init();
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

console.log('\n=== RivalSystem.init / seed ===');

test('init seeds all catalogue rivals into career.rivals', () => {
  assertEq(_savedState.rivals.length, RivalData.count(), 'seed count');
});

test('init preserves existing runtime fields on rivals', () => {
  const protoId = RivalData.getAll()[0].id;
  _savedState.rivals = [{
    id: protoId,
    elo: 1234,
    startElo: 999,
    archetype: 'steady',
    headToHead: { wins: 2, losses: 1, draws: 0 },
    met: true,
    lastMetDate: { year: 2026, month: 1, day: 5 },
    lastDriftDate: null,
    recentForm: ['W'],
  }];
  RivalSystem._teardown();
  RivalSystem.init();

  const live = RivalSystem.getById(protoId);
  assertEq(live.elo, 1234, 'elo preserved');
  assertEq(live.headToHead, { wins: 2, losses: 1, draws: 0 }, 'H2H preserved');
  assert(live.met, 'met preserved');
});

test('init drops unknown rival ids from save', () => {
  _savedState.rivals = [{
    id: 'rival_ghost',
    elo: 1000,
    startElo: 1000,
    archetype: 'steady',
    headToHead: { wins: 0, losses: 0, draws: 0 },
    met: false,
  }];
  RivalSystem._teardown();
  RivalSystem.init();
  assert(!RivalSystem.getById('rival_ghost'), 'ghost removed');
  assertEq(_savedState.rivals.length, RivalData.count(), 'size matches catalogue');
});

console.log('\n=== Getters ===');

test('getAll returns a snapshot, not a live reference', () => {
  const snap = RivalSystem.getAll();
  snap.pop();
  assertEq(_savedState.rivals.length, RivalData.count(), 'state untouched');
});

test('getById returns a clone of the rival', () => {
  const id = RivalData.getAll()[0].id;
  const r = RivalSystem.getById(id);
  r.elo = 0;
  assert(RivalSystem.getById(id).elo !== 0, 'live elo untouched');
});

test('getById derives a title from the rival Elo', () => {
  const id = RivalData.getAll()[0].id;
  const live = CareerManager._rawState().rivals.find((r) => r.id === id);
  live.elo = 2500;
  assertEq(RivalSystem.getById(id).title, 'GM');
});

test('getNearestToPlayer returns closest by |elo - playerElo|', () => {
  const nearest = RivalSystem.getNearestToPlayer(1500, 3);
  assertEq(nearest.length, 3, 'three returned');
  const deltas = nearest.map((r) => Math.abs(r.elo - 1500));
  for (let i = 1; i < deltas.length; i++) {
    assert(deltas[i - 1] <= deltas[i], 'sorted by proximity');
  }
});

test('getEligibleForTournament filters by Elo window', () => {
  const pool = RivalSystem.getEligibleForTournament(1400, 1700);
  for (const r of pool) {
    assert(r.elo >= 1400 && r.elo <= 1700, 'within window');
  }
});

console.log('\n=== markMet ===');

test('markMet flips met=true on first call, idempotent after', () => {
  const id = RivalData.getAll()[0].id;
  assert(!RivalSystem.getById(id).met, 'starts unmet');
  const first = RivalSystem.markMet(id, { year: 2026, month: 4, day: 12 });
  const second = RivalSystem.markMet(id, { year: 2026, month: 4, day: 13 });
  assertEq(first, true, 'first call returns true');
  assertEq(second, false, 'second call returns false');
  assert(RivalSystem.getById(id).met, 'met is true');
});

test('markMet sets lastMetDate', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.markMet(id, { year: 2026, month: 5, day: 1 });
  assertEq(RivalSystem.getById(id).lastMetDate, { year: 2026, month: 5, day: 1 });
});

test('markMet returns false for unknown id', () => {
  assertEq(RivalSystem.markMet('rival_unknown'), false);
});

console.log('\n=== recordEncounter ===');

test('recordEncounter: player win increments rival losses and drops rival Elo', () => {
  const id = RivalData.getAll()[0].id;
  const before = RivalSystem.getById(id).elo;
  const out = RivalSystem.recordEncounter(id, 'win', 1500, _today);
  const after = RivalSystem.getById(id);
  assertEq(after.headToHead.losses, 1, 'rival loss counted');
  assertEq(after.headToHead.wins,   0);
  assert(out.delta <= 0, 'rival Elo decreased or unchanged');
  assertEq(after.elo, before + out.delta, 'elo matches delta');
});

test('recordEncounter: player loss increments rival wins and raises rival Elo', () => {
  const id = RivalData.getAll()[0].id;
  const before = RivalSystem.getById(id).elo;
  const out = RivalSystem.recordEncounter(id, 'loss', 1500, _today);
  assertEq(RivalSystem.getById(id).headToHead.wins, 1);
  assert(out.delta >= 0, 'rival Elo increased or unchanged');
  assertEq(RivalSystem.getById(id).elo, before + out.delta);
});

test('derived rival title updates after Elo changes', () => {
  const id = RivalData.getAll()[0].id;
  const live = CareerManager._rawState().rivals.find((r) => r.id === id);
  live.elo = 2390;
  assertEq(RivalSystem.getById(id).title, 'FM');
  live.elo = 2405;
  assertEq(RivalSystem.getById(id).title, 'IM');
});

test('recordEncounter: draw bumps draws counter', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.recordEncounter(id, 'draw', 1500, _today);
  assertEq(RivalSystem.getById(id).headToHead.draws, 1);
});

test('recordEncounter also flips met if first time', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.recordEncounter(id, 'draw', 1500, _today);
  assert(RivalSystem.getById(id).met, 'now met');
});

test('recordEncounter rejects bad result', () => {
  const id = RivalData.getAll()[0].id;
  let threw = false;
  try { RivalSystem.recordEncounter(id, 'banana', 1500, _today); } catch (e) { threw = true; }
  assert(threw, 'should throw on invalid result');
});

console.log('\n=== Relation derivation ===');

test('relation is neutral by default', () => {
  assertEq(RivalSystem.getRelation(RivalData.getAll()[0].id), 'neutral');
});

test('relation becomes antagonist after 2+ rival wins lead', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.recordEncounter(id, 'loss', 1500, _today);
  RivalSystem.recordEncounter(id, 'loss', 1500, _today);
  assertEq(RivalSystem.getRelation(id), 'antagonist');
});

test('relation becomes friend after 3+ rival losses lead with enough encounters', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.recordEncounter(id, 'win', 1500, _today);
  RivalSystem.recordEncounter(id, 'win', 1500, _today);
  RivalSystem.recordEncounter(id, 'win', 1500, _today);
  assertEq(RivalSystem.getRelation(id), 'friend');
});

test('isHeatedRivalry flips at 3 total encounters', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.recordEncounter(id, 'draw', 1500, _today);
  RivalSystem.recordEncounter(id, 'draw', 1500, _today);
  assertEq(RivalSystem.isHeatedRivalry(id), false);
  RivalSystem.recordEncounter(id, 'draw', 1500, _today);
  assertEq(RivalSystem.isHeatedRivalry(id), true);
});

console.log('\n=== Offscreen progression ===');

test('tickOffscreenProgression is a no-op before 7 days elapsed', () => {
  const id = RivalData.getAll()[0].id;
  // Seed lastDriftDate = today to have a baseline
  RivalSystem.tickOffscreenProgression(_today);
  const baselineElo = RivalSystem.getById(id).elo;

  // Advance 6 days
  const plus6 = CalendarSystem.addDays(_today, 6);
  RivalSystem.tickOffscreenProgression(plus6);
  assertEq(RivalSystem.getById(id).elo, baselineElo, 'no drift at 6 days');
});

test('tickOffscreenProgression applies drift after 7+ days', () => {
  RivalSystem.tickOffscreenProgression(_today);
  const elosBefore = RivalSystem.getAll().map((r) => r.elo);

  const plus30 = CalendarSystem.addDays(_today, 30);
  RivalSystem.tickOffscreenProgression(plus30);
  const elosAfter = RivalSystem.getAll().map((r) => r.elo);

  // At least one rival must have moved (with mean != 0 archetypes)
  let moved = 0;
  for (let i = 0; i < elosBefore.length; i++) {
    if (elosAfter[i] !== elosBefore[i]) moved += 1;
  }
  assert(moved >= 1, 'at least one rival drifted after 30 days');
});

test('rising rivals trend upward over a simulated year', () => {
  // Force deterministic behavior by sampling many ticks
  const risingRivals = RivalData.getAll().filter((r) => r.archetype === 'rising');
  assert(risingRivals.length > 0, 'fixture has rising rivals');

  const startElos = {};
  for (const r of risingRivals) startElos[r.id] = RivalSystem.getById(r.id).elo;

  RivalSystem.tickOffscreenProgression(_today);
  let cursor = _today;
  for (let w = 0; w < 52; w++) {
    cursor = CalendarSystem.addDays(cursor, 7);
    RivalSystem.tickOffscreenProgression(cursor);
  }

  let upCount = 0;
  for (const r of risingRivals) {
    if (RivalSystem.getById(r.id).elo > startElos[r.id]) upCount += 1;
  }
  assert(upCount === risingRivals.length, 'all rising rivals went up after a year');
});

test('offscreen drift clamps within archetype range', () => {
  // Crank many ticks on a volatile rival; verify clamp holds.
  const volatile = RivalData.getAll().find((r) => r.archetype === 'volatile');
  const rules = RivalSystem.ARCHETYPE_DRIFT.volatile;
  let cursor = _today;
  RivalSystem.tickOffscreenProgression(cursor);
  for (let i = 0; i < 500; i++) {
    cursor = CalendarSystem.addDays(cursor, 7);
    RivalSystem.tickOffscreenProgression(cursor);
    const r = RivalSystem.getById(volatile.id);
    const diff = r.elo - r.startElo;
    assert(diff >= rules.clampMin - 1 && diff <= rules.clampMax + 1, `clamp violated: diff=${diff}`);
  }
});

console.log('\n=== Co-registration (F.4) ===');

test('rollRivalCoRegistrations never commits an unmet rival', () => {
  // Stub Math.random to always return 0 (i.e. always pass the coin flip)
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    RivalSystem.rollRivalCoRegistrations('test_t', { eloMin: 0, eloMax: 4000 }, _today, 'Test Tournament');
    for (const r of RivalSystem.getAll()) {
      assertEq(r.committedTournaments.length, 0, `unmet ${r.id} must not commit`);
    }
  } finally {
    Math.random = origRandom;
  }
});

test('rollRivalCoRegistrations commits met+eligible rivals with deterministic pass', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.markMet(id, _today);
  const live = RivalSystem.getById(id);

  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    RivalSystem.rollRivalCoRegistrations('test_t', { eloMin: live.elo - 10, eloMax: live.elo + 10 }, _today, 'Test Tournament');
  } finally {
    Math.random = origRandom;
  }
  const committed = RivalSystem.getCommittedRivalsForTournament('test_t', _today);
  const hit = committed.find((r) => r.id === id);
  assert(hit, 'rival committed');
});

test('rollRivalCoRegistrations is idempotent — no duplicate commitment', () => {
  const id = RivalData.getAll()[0].id;
  RivalSystem.markMet(id, _today);
  const live = RivalSystem.getById(id);

  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    RivalSystem.rollRivalCoRegistrations('test_t', { eloMin: live.elo - 10, eloMax: live.elo + 10 }, _today, 'Test');
    RivalSystem.rollRivalCoRegistrations('test_t', { eloMin: live.elo - 10, eloMax: live.elo + 10 }, _today, 'Test');
  } finally {
    Math.random = origRandom;
  }
  const r = RivalSystem.getById(id);
  assertEq(r.committedTournaments.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.message}`);
  }
  process.exit(1);
}
