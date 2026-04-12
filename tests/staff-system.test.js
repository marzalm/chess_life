// tests/staff-system.test.js
//
// Standalone Node.js test harness for js/staff-system.js.

const fs = require('fs');
const path = require('path');

let StaffSystem;
let CoachData;
let CareerManager;
let CalendarSystem;
let GameEvents;
let _player;
let _finances;
let _staffState;
let _trainingState;
let _today;
let _saveCount;
let _events;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function reset() {
  _player = { elo: 1500 };
  _finances = { money: 500 };
  _staffState = { currentCoach: null };
  _trainingState = {
    aptitudes: { fork: 60 },
    seenPuzzleIds: { p1: 1 },
    reinforcementQueues: { fork: [{ puzzleId: 'p1', state: 'active', confirmations: 0 }] },
    trainingBonuses: { fork: 1 },
    flowBonus: { earned: false, reservedPuzzleId: null },
    puzzleRating: 500,
    puzzleRatingRd: 300,
    stats: { sessionsCompleted: 1, sessionsPassed: 1, puzzlesAttempted: 5, puzzlesSolvedAllTime: 4, reinforcementPuzzlesSolved: 0, bonusesUsedTraining: 0, bonusesUsedFlow: 0, byTheme: { fork: { solvedThemePuzzles: 4, reinforcedResolves: 0 } } },
  };
  _today = { year: 2026, month: 4, day: 12 };
  _saveCount = 0;
  _events = [];

  CareerManager = {
    player: { get: () => _player },
    finances: {
      get: () => _finances,
      canAfford: (amount) => _finances.money >= amount,
      addExpense: (amount) => {
        if (_finances.money < amount) return false;
        _finances.money -= amount;
        _saveCount += 1;
        return true;
      },
    },
    calendar: { get: () => ({ date: clone(_today) }) },
    staff: { get: () => _staffState },
    training: { get: () => _trainingState },
    save: () => { _saveCount += 1; },
  };

  const listeners = new Map();
  GameEvents = {
    EVENTS: {
      COACH_HIRED: 'coach_hired',
      COACH_FIRED: 'coach_fired',
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
      _events.push({ eventName, payload });
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      for (const handler of bucket) handler(payload);
    },
  };

  CalendarSystem = {
    getDate: () => clone(_today),
    addDays(date, n) {
      const out = clone(date);
      for (let i = 0; i < n; i++) {
        out.day += 1;
        if (out.day > 30) {
          out.day = 1;
          out.month += 1;
        }
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

  const coachCode = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'coach-data.js'),
    'utf8',
  );
  CoachData = (new Function(`${coachCode}\nreturn CoachData;`))();

  const staffCode = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'staff-system.js'),
    'utf8',
  );
  StaffSystem = (new Function(
    'CareerManager', 'CalendarSystem', 'GameEvents', 'CoachData',
    `${staffCode}\nreturn StaffSystem;`,
  ))(CareerManager, CalendarSystem, GameEvents, CoachData);
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  reset();
  try {
    StaffSystem.init();
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

console.log('\n── Catalog and getters ──');

test('getAllCoaches returns the locked catalog of 10 entries', () => {
  assertEq(StaffSystem.getAllCoaches().length, 10);
  const meyer = StaffSystem.getCoachById('coach_meyer_luc');
  assertEq(meyer.primaryThemes, ['fork']);
  assertEq(meyer.bonusMoves, 1);
});

test('getCoachById returns null for an unknown coach id', () => {
  assertEq(StaffSystem.getCoachById('coach_missing'), null);
});

test('getAvailableCoaches respects elo unlocks', () => {
  _player.elo = 1250;
  const ids = StaffSystem.getAvailableCoaches().map((coach) => coach.id);
  assert(ids.includes('coach_meyer_luc'));
  assert(ids.includes('coach_kowalski_marek'));
  assert(!ids.includes('coach_petrova_elena'));
});

test('getAvailableCoaches returns clones that do not mutate the catalog', () => {
  const available = StaffSystem.getAvailableCoaches();
  available[0].name = 'Mutated';
  assert(StaffSystem.getAvailableCoaches()[0].name !== 'Mutated');
});

test('getCurrentCoach returns null when no coach is hired', () => {
  assertEq(StaffSystem.getCurrentCoach(), null);
  assertEq(StaffSystem.getHireDate(), null);
  assertEq(StaffSystem.getLastPaidDate(), null);
});

console.log('\n── Hiring and firing ──');

test('hire succeeds and persists currentCoach with hire and payment dates', () => {
  const result = StaffSystem.hire('coach_meyer_luc');
  assertEq(result.ok, true);
  assertEq(_staffState.currentCoach.id, 'coach_meyer_luc');
  assertEq(_staffState.currentCoach.hireDate, _today);
  assertEq(_staffState.currentCoach.lastPaidDate, _today);
  assertEq(_finances.money, 470);
});

test('hire blocked by Elo gate', () => {
  _player.elo = 1000;
  const result = StaffSystem.hire('coach_petrova_elena');
  assertEq(result.ok, false);
  assertEq(result.error, 'elo_too_low');
  assertEq(_staffState.currentCoach, null);
});

test('hire blocked by insufficient funds for the first week', () => {
  _finances.money = 20;
  const result = StaffSystem.hire('coach_meyer_luc');
  assertEq(result.ok, false);
  assertEq(result.error, 'cant_afford');
  assertEq(_staffState.currentCoach, null);
});

test('canHire returns unknown_coach for a missing id', () => {
  const verdict = StaffSystem.canHire('coach_missing');
  assertEq(verdict.ok, false);
  assertEq(verdict.reasons.includes('unknown_coach'), true);
});

test('fire clears the slot', () => {
  StaffSystem.hire('coach_meyer_luc');
  const result = StaffSystem.fire();
  assertEq(result.ok, true);
  assertEq(_staffState.currentCoach, null);
});

test('replace flow fires the old coach and hires the new one in one call', () => {
  StaffSystem.hire('coach_meyer_luc');
  const result = StaffSystem.hire('coach_petrova_elena');
  assertEq(result.ok, true);
  assertEq(_staffState.currentCoach.id, 'coach_petrova_elena');
  assertEq(_events.filter((e) => e.eventName === GameEvents.EVENTS.COACH_FIRED).length, 1);
  assertEq(_events.filter((e) => e.eventName === GameEvents.EVENTS.COACH_HIRED).length, 2);
});

test('canHire returns already_hired when the same coach is selected again', () => {
  StaffSystem.hire('coach_meyer_luc');
  const verdict = StaffSystem.canHire('coach_meyer_luc');
  assertEq(verdict.ok, false);
  assertEq(verdict.reasons.includes('already_hired'), true);
});

console.log('\n── Weekly cost processing ──');

test('processWeeklyCost deducts when 7 days have passed', () => {
  StaffSystem.hire('coach_meyer_luc');
  const result = StaffSystem.processWeeklyCost({ year: 2026, month: 4, day: 19 });
  assertEq(result.paid, true);
  assertEq(result.paymentsProcessed, 1);
  assertEq(_finances.money, 440);
  assertEq(_staffState.currentCoach.lastPaidDate, { year: 2026, month: 4, day: 19 });
});

test('processWeeklyCost does nothing before 7 days have passed', () => {
  StaffSystem.hire('coach_meyer_luc');
  const result = StaffSystem.processWeeklyCost({ year: 2026, month: 4, day: 18 });
  assertEq(result, { paid: false, fired: false, paymentsProcessed: 0 });
  assertEq(_finances.money, 470);
});

test('processWeeklyCost handles multi-week skips with multiple deductions', () => {
  StaffSystem.hire('coach_meyer_luc');
  const result = StaffSystem.processWeeklyCost({ year: 2026, month: 4, day: 26 });
  assertEq(result, { paid: true, fired: false, paymentsProcessed: 2 });
  assertEq(_finances.money, 410);
  assertEq(_staffState.currentCoach.lastPaidDate, { year: 2026, month: 4, day: 26 });
});

test('processWeeklyCost auto-fires when the player cannot afford the next week', () => {
  StaffSystem.hire('coach_petrova_elena');
  _finances.money = 10;
  const result = StaffSystem.processWeeklyCost({ year: 2026, month: 4, day: 19 });
  assertEq(result.fired, true);
  assertEq(_staffState.currentCoach, null);
  const fired = _events.find((e) => e.eventName === GameEvents.EVENTS.COACH_FIRED);
  assertEq(fired.payload.reason, 'cant_afford');
});

test('processWeeklyCost is a no-op without a coach', () => {
  assertEq(StaffSystem.processWeeklyCost({ year: 2026, month: 4, day: 19 }), {
    paid: false,
    fired: false,
    paymentsProcessed: 0,
  });
});

test('init registers exactly one calendar day-tick handler', () => {
  assertEq(typeof CalendarSystem._tickHandler, 'function');
});

test('calendar day tick handler routes to weekly cost processing', () => {
  StaffSystem.hire('coach_meyer_luc');
  CalendarSystem._tickHandler({ year: 2026, month: 4, day: 19 });
  assertEq(_finances.money, 440);
});

console.log('\n── Events and invariants ──');

test('coach_hired event emits the locked payload', () => {
  StaffSystem.hire('coach_meyer_luc');
  const hired = _events.find((e) => e.eventName === GameEvents.EVENTS.COACH_HIRED);
  assertEq(hired.payload, {
    coachId: 'coach_meyer_luc',
    weeklyCost: 30,
    eloUnlock: 800,
  });
});

test('manual fire emits reason manual', () => {
  StaffSystem.hire('coach_meyer_luc');
  StaffSystem.fire();
  const fired = _events.find((e) => e.eventName === GameEvents.EVENTS.COACH_FIRED);
  assertEq(fired.payload.reason, 'manual');
});

test('getCurrentCoachBonusMoves returns the coach tier bonus only on covered themes', () => {
  assertEq(StaffSystem.getCurrentCoachBonusMoves('fork'), 0);
  StaffSystem.hire('coach_petrova_elena');
  assertEq(StaffSystem.getCurrentCoachBonusMoves('ruyLopez'), 2);
  assertEq(StaffSystem.getCurrentCoachBonusMoves('backRankMate'), 2);
  assertEq(StaffSystem.getCurrentCoachBonusMoves('fork'), 0);
});

test('getCurrentCoachBonusMoves returns 0 while no coach is hired', () => {
  assertEq(StaffSystem.getCurrentCoachBonusMoves('fork'), 0);
});

test('player-owned training state is not reset on fire', () => {
  const before = clone(_trainingState);
  StaffSystem.hire('coach_meyer_luc');
  StaffSystem.fire();
  assertEq(_trainingState, before);
});

test('player-owned training state is not reset when replacing a coach', () => {
  const before = clone(_trainingState);
  StaffSystem.hire('coach_meyer_luc');
  StaffSystem.hire('coach_petrova_elena');
  assertEq(_trainingState, before);
});

test('getCurrentCoach returns null after fire', () => {
  StaffSystem.hire('coach_meyer_luc');
  StaffSystem.fire();
  assertEq(StaffSystem.getCurrentCoach(), null);
});

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failures:');
  failures.forEach((failure) => {
    console.log(`  • ${failure.name}\n    ${failure.message}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
