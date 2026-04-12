// tests/calendar-system.test.js
//
// Standalone Node.js test harness for js/calendar-system.js.
// No test framework — just plain assertions and a tiny runner.
// Run with:  node tests/calendar-system.test.js
//
// We mock CareerManager (the only dependency of calendar-system.js)
// and load the source via `new Function()` so the const declaration
// inside the IIFE can be captured and returned cleanly.

const fs   = require('fs');
const path = require('path');

// ── Mock CareerManager ────────────────────────────────────────

let _state;
function resetState() {
  _state = {
    date:         { year: 2026, month: 4, day: 10 },
    phase:        'idle',
    events:       [],
    currentEvent: null,
  };
}
resetState();

const CareerManager = {
  calendar: { get: () => _state },
  save:     () => {},
};

// ── Load and instantiate calendar-system.js ───────────────────

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'calendar-system.js'),
  'utf8',
);

// Wrap in a Function so `const CalendarSystem = ...` is local and
// can be returned. Pass CareerManager via the closure of the wrapper.
const factory = new Function('CareerManager', `${code}\nreturn CalendarSystem;`);
const CalendarSystem = factory(CareerManager);

// ── Tiny test runner ──────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  resetState();
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

function assertThrows(fn, msg) {
  try {
    fn();
  } catch (e) {
    return; // good
  }
  throw new Error(msg || 'expected to throw');
}

// ── Tests ─────────────────────────────────────────────────────

console.log('\n── Date math ──');

test('addDays — simple', () => {
  const r = CalendarSystem.addDays({year:2026, month:4, day:10}, 5);
  assertEq(r, {year:2026, month:4, day:15});
});

test('addDays — 0 days returns clone', () => {
  const r = CalendarSystem.addDays({year:2026, month:4, day:10}, 0);
  assertEq(r, {year:2026, month:4, day:10});
});

test('addDays — month rollover', () => {
  const r = CalendarSystem.addDays({year:2026, month:4, day:28}, 5);
  assertEq(r, {year:2026, month:5, day:3});
});

test('addDays — year rollover', () => {
  const r = CalendarSystem.addDays({year:2026, month:12, day:28}, 10);
  assertEq(r, {year:2027, month:1, day:7});
});

test('addDays — leap year (2024 has Feb 29)', () => {
  const r = CalendarSystem.addDays({year:2024, month:2, day:28}, 1);
  assertEq(r, {year:2024, month:2, day:29});
});

test('addDays — non-leap year (2025 skips to Mar 1)', () => {
  const r = CalendarSystem.addDays({year:2025, month:2, day:28}, 1);
  assertEq(r, {year:2025, month:3, day:1});
});

test('addDays — century non-leap (1900)', () => {
  const r = CalendarSystem.addDays({year:1900, month:2, day:28}, 1);
  assertEq(r, {year:1900, month:3, day:1});
});

test('addDays — 400-year leap (2000)', () => {
  const r = CalendarSystem.addDays({year:2000, month:2, day:28}, 1);
  assertEq(r, {year:2000, month:2, day:29});
});

test('addDays — full year (365 days from non-leap start)', () => {
  const r = CalendarSystem.addDays({year:2025, month:1, day:1}, 365);
  assertEq(r, {year:2026, month:1, day:1});
});

test('addDays — full year (366 days from leap start)', () => {
  const r = CalendarSystem.addDays({year:2024, month:1, day:1}, 366);
  assertEq(r, {year:2025, month:1, day:1});
});

test('addDays — negative throws', () => {
  assertThrows(() => CalendarSystem.addDays({year:2026,month:4,day:10}, -1));
});

test('compareDates — earlier / later / equal', () => {
  const a = {year:2026, month:4, day:10};
  const b = {year:2026, month:4, day:11};
  const c = {year:2026, month:4, day:10};
  assertEq(CalendarSystem.compareDates(a, b), -1);
  assertEq(CalendarSystem.compareDates(b, a),  1);
  assertEq(CalendarSystem.compareDates(a, c),  0);
});

test('compareDates — different years dominate', () => {
  const a = {year:2025, month:12, day:31};
  const b = {year:2026, month:1,  day:1};
  assertEq(CalendarSystem.compareDates(a, b), -1);
});

test('getDayOfWeek — known dates (ISO: 0=Mon..6=Sun)', () => {
  // 2026-04-10 is a Friday
  assertEq(CalendarSystem.getDayOfWeek({year:2026, month:4,  day:10}), 4);
  // 2024-02-29 is a Thursday
  assertEq(CalendarSystem.getDayOfWeek({year:2024, month:2,  day:29}), 3);
  // 2026-01-01 is a Thursday
  assertEq(CalendarSystem.getDayOfWeek({year:2026, month:1,  day:1}),  3);
  // 2026-12-31 is a Thursday
  assertEq(CalendarSystem.getDayOfWeek({year:2026, month:12, day:31}), 3);
  // 2000-01-01 is a Saturday
  assertEq(CalendarSystem.getDayOfWeek({year:2000, month:1,  day:1}),  5);
  // 1900-01-01 is a Monday
  assertEq(CalendarSystem.getDayOfWeek({year:1900, month:1,  day:1}),  0);
});

test('getDayOfWeekName — long and short forms', () => {
  // 2026-04-10 is a Friday
  assertEq(CalendarSystem.getDayOfWeekName({year:2026, month:4, day:10}),       'Friday');
  assertEq(CalendarSystem.getDayOfWeekName({year:2026, month:4, day:10}, true), 'Fri');
});

test('getDaysInMonth — Jan/Feb/Apr', () => {
  assertEq(CalendarSystem.getDaysInMonth(2026, 1), 31);
  assertEq(CalendarSystem.getDaysInMonth(2026, 2), 28);
  assertEq(CalendarSystem.getDaysInMonth(2024, 2), 29);
  assertEq(CalendarSystem.getDaysInMonth(2026, 4), 30);
});

console.log('\n── Date formatting ──');

test('formatDate — explicit date', () => {
  CalendarSystem.init();
  assertEq(
    CalendarSystem.formatDate({year:2026, month:4, day:10}),
    'April 10, 2026',
  );
});

test('formatDate — defaults to today', () => {
  CalendarSystem.init();
  assertEq(CalendarSystem.formatDate(), 'April 10, 2026');
});

test('dateToISO — basic', () => {
  CalendarSystem.init();
  assertEq(CalendarSystem.dateToISO({year:2026, month:4, day:10}), '2026-04-10');
});

test('dateToISO — single-digit padding', () => {
  CalendarSystem.init();
  assertEq(CalendarSystem.dateToISO({year:2026, month:1, day:5}), '2026-01-05');
});

console.log('\n── Init and getters ──');

test('init normalizes missing fields', () => {
  delete _state.phase;
  delete _state.events;
  delete _state.currentEvent;
  CalendarSystem.init();
  assertEq(CalendarSystem.getPhase(), 'idle');
  assertEq(CalendarSystem.getEventCount(), 0);
  assertEq(CalendarSystem.getCurrentEvent(), null);
});

test('getDate returns a clone (no leak)', () => {
  CalendarSystem.init();
  const d = CalendarSystem.getDate();
  d.day = 99;
  assertEq(CalendarSystem.getDate().day, 10, 'state should not be mutated');
});

test('phase predicate helpers', () => {
  CalendarSystem.init();
  assert( CalendarSystem.isIdle());
  assert(!CalendarSystem.isEventPrompt());
  assert(!CalendarSystem.isInTournament());
  assert(!CalendarSystem.isInTraining());
});

console.log('\n── Event scheduling ──');

test('scheduleEvent adds and returns id', () => {
  CalendarSystem.init();
  const id = CalendarSystem.scheduleEvent({
    date:  {year:2026, month:4, day:15},
    type:  'mail_arrival',
    label: 'Welcome',
  });
  assert(typeof id === 'string' && id.length > 0);
  assertEq(CalendarSystem.getEventCount(), 1);
});

test('scheduleEvent uses provided id', () => {
  CalendarSystem.init();
  const id = CalendarSystem.scheduleEvent({
    id:   'fixed-id',
    date: {year:2026, month:4, day:15},
    type: 'mail_arrival',
  });
  assertEq(id, 'fixed-id');
});

test('scheduleEvent — auto-sort by date', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:5,day:1},  type:'a'});
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:15}, type:'b'});
  CalendarSystem.scheduleEvent({date:{year:2026,month:6,day:10}, type:'c'});
  const ev = CalendarSystem.getUpcomingEvents();
  assertEq(ev[0].type, 'b');
  assertEq(ev[1].type, 'a');
  assertEq(ev[2].type, 'c');
});

test('scheduleEvent — same-date keeps insertion order', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:5,day:1}, type:'first'});
  CalendarSystem.scheduleEvent({date:{year:2026,month:5,day:1}, type:'second'});
  const ev = CalendarSystem.getUpcomingEvents();
  assertEq(ev[0].type, 'first');
  assertEq(ev[1].type, 'second');
});

test('scheduleEvent — null event throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.scheduleEvent(null));
});

test('scheduleEvent — missing date throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.scheduleEvent({type:'x'}));
});

test('scheduleEvent — bad month throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.scheduleEvent({
    date:{year:2026,month:13,day:1}, type:'x',
  }));
});

test('scheduleEvent — bad day throws (Feb 30)', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.scheduleEvent({
    date:{year:2026,month:2,day:30}, type:'x',
  }));
});

test('scheduleEvent — Feb 29 in non-leap throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.scheduleEvent({
    date:{year:2025,month:2,day:29}, type:'x',
  }));
});

test('scheduleEvent — Feb 29 in leap year ok', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({
    date:{year:2024,month:2,day:29}, type:'x',
  });
  assertEq(CalendarSystem.getEventCount(), 1);
});

test('scheduleEvent — missing type throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.scheduleEvent({
    date:{year:2026,month:4,day:10},
  }));
});

test('removeEvent finds and removes', () => {
  CalendarSystem.init();
  const id = CalendarSystem.scheduleEvent({
    date:{year:2026,month:5,day:1}, type:'x',
  });
  assert(CalendarSystem.removeEvent(id));
  assertEq(CalendarSystem.getEventCount(), 0);
});

test('removeEvent returns false on missing id', () => {
  CalendarSystem.init();
  assertEq(CalendarSystem.removeEvent('nonexistent'), false);
});

test('getUpcomingEvents — n limits the result', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:5,day:1},  type:'a'});
  CalendarSystem.scheduleEvent({date:{year:2026,month:6,day:1},  type:'b'});
  CalendarSystem.scheduleEvent({date:{year:2026,month:7,day:1},  type:'c'});
  assertEq(CalendarSystem.getUpcomingEvents(2).length, 2);
});

console.log('\n── Continue loop ──');

test('continue — stops at scheduled event', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({
    date: {year:2026, month:4, day:15},  // 5 days away
    type: 'tournament_start',
  });
  const r = CalendarSystem.continue();
  assertEq(r.stoppedBy, 'event');
  assertEq(r.daysAdvanced, 5);
  assertEq(CalendarSystem.getDate(), {year:2026, month:4, day:15});
  assertEq(CalendarSystem.getPhase(), 'event_prompt');
  assert(CalendarSystem.getCurrentEvent() !== null);
});

test('continue — removes event from queue', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:11}, type:'x'});
  CalendarSystem.continue();
  assertEq(CalendarSystem.getEventCount(), 0);
});

test('continue — event today fires immediately', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:10}, type:'x'});
  const r = CalendarSystem.continue();
  assertEq(r.daysAdvanced, 0);
  assertEq(r.stoppedBy, 'event');
});

test('continue — event in the past fires immediately', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:5}, type:'x'});
  const r = CalendarSystem.continue();
  assertEq(r.daysAdvanced, 0);
  assertEq(r.stoppedBy, 'event');
});

test('continue — empty queue hits cap', () => {
  CalendarSystem.init();
  const r = CalendarSystem.continue();
  assertEq(r.stoppedBy, 'limit');
  assertEq(r.daysAdvanced, 365);
  assert(CalendarSystem.isIdle());
});

test('advanceOneDay increments the date by exactly one day and fires tick handlers once', () => {
  CalendarSystem.init();
  let ticks = 0;
  const unsubscribe = CalendarSystem.onDayAdvanced(() => {
    ticks += 1;
  });
  const next = CalendarSystem.advanceOneDay();
  unsubscribe();
  assertEq(next, {year:2026, month:4, day:11});
  assertEq(CalendarSystem.getDate(), {year:2026, month:4, day:11});
  assertEq(ticks, 1);
});

test('continue — day tick handlers fire once per day advanced up to the cap', () => {
  CalendarSystem.init();
  let ticks = 0;
  const unsubscribe = CalendarSystem.onDayAdvanced(() => {
    ticks += 1;
  });
  const r = CalendarSystem.continue();
  unsubscribe();
  assertEq(r.daysAdvanced, 365);
  assertEq(ticks, 365);
});

test('continue — from non-idle throws', () => {
  CalendarSystem.init();
  CalendarSystem.enterTournament();
  assertThrows(() => CalendarSystem.continue());
});

test('continue — multiple events fire one at a time', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:11}, type:'a'});
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:13}, type:'b'});

  // First continue stops at day 11
  let r = CalendarSystem.continue();
  assertEq(r.event.type, 'a');
  assertEq(r.daysAdvanced, 1);
  assertEq(CalendarSystem.getEventCount(), 1);  // b still queued

  // Resolve and continue again
  CalendarSystem.consumeCurrentEvent();
  r = CalendarSystem.continue();
  assertEq(r.event.type, 'b');
  assertEq(r.daysAdvanced, 2);
  assertEq(CalendarSystem.getEventCount(), 0);
});

console.log('\n── Phase transitions ──');

test('consumeCurrentEvent → idle', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:11}, type:'x'});
  CalendarSystem.continue();
  assert(CalendarSystem.isEventPrompt());
  CalendarSystem.consumeCurrentEvent();
  assert(CalendarSystem.isIdle());
  assertEq(CalendarSystem.getCurrentEvent(), null);
});

test('consumeCurrentEvent — from idle throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.consumeCurrentEvent());
});

test('enterTournament — from idle ok', () => {
  CalendarSystem.init();
  CalendarSystem.enterTournament();
  assert(CalendarSystem.isInTournament());
});

test('enterTournament — from event_prompt ok and clears event', () => {
  CalendarSystem.init();
  CalendarSystem.scheduleEvent({date:{year:2026,month:4,day:11}, type:'x'});
  CalendarSystem.continue();
  CalendarSystem.enterTournament();
  assert(CalendarSystem.isInTournament());
  assertEq(CalendarSystem.getCurrentEvent(), null);
});

test('enterTournament — from in_tournament throws', () => {
  CalendarSystem.init();
  CalendarSystem.enterTournament();
  assertThrows(() => CalendarSystem.enterTournament());
});

test('exitTournament — returns to idle', () => {
  CalendarSystem.init();
  CalendarSystem.enterTournament();
  CalendarSystem.exitTournament();
  assert(CalendarSystem.isIdle());
});

test('exitTournament — from idle throws', () => {
  CalendarSystem.init();
  assertThrows(() => CalendarSystem.exitTournament());
});

test('enterTraining / exitTraining — round trip', () => {
  CalendarSystem.init();
  CalendarSystem.enterTraining();
  assert(CalendarSystem.isInTraining());
  CalendarSystem.exitTraining();
  assert(CalendarSystem.isIdle());
});

test('enterTraining — from in_tournament throws', () => {
  CalendarSystem.init();
  CalendarSystem.enterTournament();
  assertThrows(() => CalendarSystem.enterTraining());
});

// ── Summary ───────────────────────────────────────────────────

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  • ${f.name}\n    ${f.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
