// tests/tournament-system.test.js
//
// Standalone Node.js test harness for js/tournament-system.js.
// Loads tournament-data.js as the real dependency, mocks the smaller
// CareerManager and CalendarSystem surfaces.
// Run with:  node tests/tournament-system.test.js

const fs   = require('fs');
const path = require('path');

// ── Load tournament-data.js (real, no mocks) ──────────────────

const dataCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'tournament-data.js'),
  'utf8',
);
const TournamentData = (new Function(`${dataCode}\nreturn TournamentData;`))();

// ── Mocked dependencies ───────────────────────────────────────

let _player;
let _finances;
let _calendarState;
let _historyState;
let _scheduledEvents;
let _saveCount;
let _emittedEvents;
let _focusSimulatedCalls;

function resetMocks() {
  _player = {
    playerName:  'Tester',
    nationality: 'NO',
    gender:      'M',
    avatar:      {},
    elo:         1500,
  };
  _finances = { money: 500 };
  _calendarState = {
    date:              { year: 2026, month: 4, day: 10 },
    phase:             'idle',
    events:            [],
    currentEvent:      null,
    currentTournament: null,
  };
  _historyState = { games: [], tournaments: [], trophies: [] };
  _scheduledEvents = [];
  _saveCount = 0;
  _emittedEvents = [];
  _focusSimulatedCalls = 0;
}

const CareerManager = {
  player: {
    get: () => _player,
    updateElo: (score, opponentElo) => {
      const elo = _player.elo;
      const E = 1 / (1 + 10 ** ((opponentElo - elo) / 400));
      const K = elo < 2400 ? 32 : 16;
      const delta = Math.round(K * (score - E));
      _player.elo = Math.max(100, elo + delta);
      return delta;
    },
  },
  finances: {
    get: () => _finances,
    addExpense: (amount) => {
      if (_finances.money < amount) return false;
      _finances.money -= amount;
      return true;
    },
    addIncome: (amount) => {
      _finances.money += amount;
    },
  },
  calendar: { get: () => _calendarState },
  history:  {
    get: () => _historyState,
    recordGame: (entry) => {
      const scoreMap = { win: 1, draw: 0.5, loss: 0 };
      const eloBefore = _player.elo;
      const delta = CareerManager.player.updateElo(scoreMap[entry.result], entry.opponentElo);
      _historyState.games.push({
        opponentName: entry.opponentName,
        opponentElo: entry.opponentElo,
        result: entry.result,
        moves: entry.moves || 0,
        eloBefore,
        eloAfter: _player.elo,
        delta,
      });
      return delta;
    },
  },
  save: () => { _saveCount += 1; },
};

function _cmpDates(a, b) {
  if (a.year  !== b.year)  return a.year  < b.year  ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day   !== b.day)   return a.day   < b.day   ? -1 : 1;
  return 0;
}

function _addDays(d, n) {
  // Naive but correct enough for the test (no leap year edges hit)
  const out = { ...d };
  for (let i = 0; i < n; i++) {
    out.day += 1;
    const dim = [31,29,31,30,31,30,31,31,30,31,30,31][out.month - 1];
    if (out.day > dim) {
      out.day = 1;
      out.month += 1;
      if (out.month > 12) { out.month = 1; out.year += 1; }
    }
  }
  return out;
}

const CalendarSystem = {
  getDate: () => ({ ..._calendarState.date }),
  compareDates: _cmpDates,
  addDays: _addDays,
  scheduleEvent: (ev) => {
    const id = 'ev_' + (_scheduledEvents.length + 1);
    _scheduledEvents.push({ id, ...ev });
    return id;
  },
  getAllEvents: () => _scheduledEvents.slice(),
};

const GameEvents = {
  EVENTS: {
    TOURNAMENT_FINISHED: 'tournament_finished',
    ROUND_PLAYED: 'round_played',
  },
  emit: (eventName, payload) => {
    _emittedEvents.push({ eventName, payload });
  },
};

const FocusSystem = {
  onRoundSimulated: () => {
    _focusSimulatedCalls += 1;
  },
};

// Backward-compat alias for the C.2a tests that referenced _calendarToday
function _setCalendarToday(date) {
  _calendarState.date = { ...date };
}

// ── Load tournament-system.js with all deps in scope ──────────

const sysCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'tournament-system.js'),
  'utf8',
);
const TournamentSystem = (new Function(
  'TournamentData', 'CareerManager', 'CalendarSystem', 'GameEvents', 'FocusSystem',
  `${sysCode}\nreturn TournamentSystem;`,
))(TournamentData, CareerManager, CalendarSystem, GameEvents, FocusSystem);

// ── Tiny test runner ──────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  resetMocks();
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

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ── Tests ─────────────────────────────────────────────────────

console.log('\n── Resolution of home templates ──');

test('resolve unknown id returns null', () => {
  assertEq(TournamentSystem.resolve('nope'), null);
});

test('resolve home template fills city/country from player nationality', () => {
  _player.nationality = 'NO';
  const t = TournamentSystem.resolve('local_weekend_open');
  assert(t !== null);
  assertEq(t.city,    'Oslo');
  assertEq(t.country, 'NO');
  assertEq(t.home,    true);
});

test('resolve home template uses Paris for FR', () => {
  _player.nationality = 'FR';
  const t = TournamentSystem.resolve('local_weekend_open');
  assertEq(t.city,    'Paris');
  assertEq(t.country, 'FR');
});

test('resolve home template falls back to "Hometown" for unknown country', () => {
  _player.nationality = 'ZZ';
  const t = TournamentSystem.resolve('local_weekend_open');
  assertEq(t.city, 'Hometown');
});

test('resolve fixed-location tournament leaves city/country untouched', () => {
  _player.nationality = 'NO';
  const t = TournamentSystem.resolve('cappelle');
  assertEq(t.city,    'Cappelle-la-Grande');
  assertEq(t.country, 'FR');
});

console.log('\n── Opponent generation ──');

test('generateOpponent returns required fields', () => {
  const t = TournamentData.getById('cappelle');
  const opp = TournamentSystem.generateOpponent(t, 'FR');
  assert(typeof opp.id === 'string' && opp.id.length > 0);
  assert(typeof opp.name === 'string' && opp.name.length > 0);
  assert(typeof opp.elo === 'number');
  assert(typeof opp.nationality === 'string');
});

test('generateOpponent elo within tournament range', () => {
  const t = TournamentData.getById('cappelle');
  for (let i = 0; i < 50; i++) {
    const opp = TournamentSystem.generateOpponent(t, 'FR');
    assert(opp.elo >= t.eloMin && opp.elo <= t.eloMax,
           `elo ${opp.elo} outside [${t.eloMin}, ${t.eloMax}]`);
  }
});

test('generateOpponent name has two parts', () => {
  const t = TournamentData.getById('local_weekend_open');
  for (let i = 0; i < 10; i++) {
    const opp = TournamentSystem.generateOpponent(t, 'NO');
    const parts = opp.name.split(' ').filter(Boolean);
    assert(parts.length >= 2, `name "${opp.name}" should have at least two parts`);
  }
});

test('generateOpponent uses fallback names for unknown countries', () => {
  const t = TournamentData.getById('local_weekend_open');
  for (let i = 0; i < 10; i++) {
    const opp = TournamentSystem.generateOpponent(t, 'ZZ');
    // We can't assert exact names since the generator may pick a
    // visitor instead. Just check it doesn't crash.
    assert(typeof opp.name === 'string' && opp.name.length > 0);
  }
});

console.log('\n── canRegister ──');

test('canRegister: unknown tournament', () => {
  const v = TournamentSystem.canRegister('nope');
  assertEq(v.ok, false);
  assert(v.reasons.includes('unknown_tournament'));
});

test('canRegister: ok when in range and afford', () => {
  _player.elo = 1500;
  _finances.money = 500;
  const v = TournamentSystem.canRegister('cappelle');
  assertEq(v.ok, true);
  assertEq(v.reasons, []);
});

test('canRegister: elo_too_low blocks', () => {
  _player.elo = 800;
  _finances.money = 500;
  const v = TournamentSystem.canRegister('cappelle');
  assertEq(v.ok, false);
  assert(v.reasons.includes('elo_too_low'));
});

test('canRegister: cant_afford blocks', () => {
  _player.elo = 1500;
  _finances.money = 5;
  const v = TournamentSystem.canRegister('cappelle');
  assertEq(v.ok, false);
  assert(v.reasons.includes('cant_afford'));
});

test('canRegister: both barriers report both reasons', () => {
  _player.elo = 800;
  _finances.money = 5;
  const v = TournamentSystem.canRegister('cappelle');
  assertEq(v.ok, false);
  assert(v.reasons.includes('elo_too_low'));
  assert(v.reasons.includes('cant_afford'));
});

test('canRegister: below_your_level is a soft warning, not a block', () => {
  _player.elo = 2200;
  _finances.money = 500;
  const v = TournamentSystem.canRegister('local_weekend_open');
  assertEq(v.ok, true);
  assert(v.warnings.includes('below_your_level'));
});

test('canRegister: home tournament is reachable for low-elo player', () => {
  _player.elo = 800;
  _finances.money = 100;
  const v = TournamentSystem.canRegister('local_weekend_open');
  assertEq(v.ok, true);
});

test('canRegister: already_registered blocks a second register for the SAME date', () => {
  _player.elo = 1500;
  _finances.money = 500;
  const r1 = TournamentSystem.register('local_weekend_open', 2027);
  assertEq(r1.ok, true);
  // Re-check for the exact date that was scheduled → blocked
  const scheduledDate = _scheduledEvents[0].date;
  const v = TournamentSystem.canRegister('local_weekend_open', scheduledDate);
  assertEq(v.ok, false);
  assert(v.reasons.includes('already_registered'));
});

test('canRegister: second register picks the NEXT future instance and is allowed', () => {
  // Fix "today" to April 1 so the April 11 and May 9 instances are both future
  _setCalendarToday({ year: 2026, month: 4, day: 1 });
  _player.elo = 1500;
  _finances.money = 500;

  // Register once — this should pick April 11
  const r1 = TournamentSystem.register('local_weekend_open', 2026);
  assertEq(r1.ok, true);
  assertEq(_scheduledEvents[0].date.month, 4);
  assertEq(_scheduledEvents[0].date.day,   11);

  // Second register with the same year should NOT block — the next
  // future instance (May 9) is a different date and therefore valid
  const r2 = TournamentSystem.register('local_weekend_open', 2026);
  assertEq(r2.ok, true);
  assertEq(_scheduledEvents.length, 2);
  assertEq(_scheduledEvents[1].date.month, 5);
  assertEq(_scheduledEvents[1].date.day,   9);
});

test('canRegister: already_registered when currently in-tournament (same date)', () => {
  _player.elo = 1500;
  _finances.money = 500;
  // Simulate an in-progress instance
  _calendarState.currentTournament = {
    tournamentId: 'cappelle',
    tournamentName: 'Cappelle-la-Grande Open',
    startDate: { year: 2026, month: 2, day: 18 },
    field: [], currentRound: 3, rounds: 9,
  };
  // Check against the same date as the live instance
  const v = TournamentSystem.canRegister(
    'cappelle',
    { year: 2026, month: 2, day: 18 },
  );
  assertEq(v.ok, false);
  assert(v.reasons.includes('already_registered'));
});

test('canRegister: already_registered does NOT leak across tournaments', () => {
  _player.elo = 1500;
  _finances.money = 500;
  TournamentSystem.register('local_weekend_open', 2027);
  // A different tournament should still be registrable
  const v = TournamentSystem.canRegister('cappelle');
  assertEq(v.ok, true);
});

console.log('\n── register ──');

test('register: success deducts fee and schedules event', () => {
  _player.elo = 1500;
  _finances.money = 500;
  const before = _finances.money;
  const r = TournamentSystem.register('cappelle', 2027);
  assertEq(r.ok, true);
  assert(typeof r.eventId === 'string');
  // Cappelle entry fee is 60
  assertEq(_finances.money, before - 60);
  assertEq(_scheduledEvents.length, 1);
  const ev = _scheduledEvents[0];
  assertEq(ev.type, 'tournament_start');
  assertEq(ev.payload.tournamentId, 'cappelle');
  assertEq(ev.payload.city, 'Cappelle-la-Grande');
});

test('register: blocked by elo_too_low does NOT deduct money', () => {
  _player.elo = 800;
  _finances.money = 500;
  const before = _finances.money;
  const r = TournamentSystem.register('cappelle', 2027);
  assertEq(r.ok, false);
  assertEq(r.error, 'elo_too_low');
  assertEq(_finances.money, before);
  assertEq(_scheduledEvents.length, 0);
});

test('register: blocked by cant_afford does NOT deduct money', () => {
  _player.elo = 1500;
  _finances.money = 5;
  const r = TournamentSystem.register('cappelle', 2027);
  assertEq(r.ok, false);
  assertEq(r.error, 'cant_afford');
  assertEq(_finances.money, 5);
  assertEq(_scheduledEvents.length, 0);
});

test('register: home template resolves city in payload', () => {
  _player.nationality = 'JP';
  _player.elo = 1000;
  _finances.money = 200;
  const r = TournamentSystem.register('local_weekend_open', 2027);
  assertEq(r.ok, true);
  assertEq(_scheduledEvents[0].payload.city, 'Tokyo');
  assertEq(_scheduledEvents[0].payload.country, 'JP');
  assertEq(_scheduledEvents[0].payload.isHome, true);
});

test('register: skips dates already in the past, picks next valid', () => {
  _setCalendarToday({ year: 2026, month: 5, day: 1 });
  _player.elo = 1000;
  _finances.money = 200;
  // The Local Weekend Open has a date on Apr 11 (already passed) and
  // May 9 (next valid). Register for the same year (2026).
  const r = TournamentSystem.register('local_weekend_open', 2026);
  assertEq(r.ok, true);
  const date = _scheduledEvents[0].date;
  // Must be on or after May 1
  const cmp = _cmpDates(date, _calendarState.date);
  assert(cmp >= 0, `scheduled date ${JSON.stringify(date)} is in the past`);
  assertEq(date.month, 5);
  assertEq(date.day,   9);
});

test('register: error when no future date in the requested year', () => {
  // March 1 → all of January's events are in the past for 2026
  _setCalendarToday({ year: 2026, month: 12, day: 30 });
  _player.elo = 1000;
  _finances.money = 200;
  const r = TournamentSystem.register('new_year_open', 2026);
  // new_year_open is Jan 4 → no future instance in 2026
  assertEq(r.ok, false);
  assertEq(r.error, 'no_future_instance_this_year');
});

test('register: second register on the LAST instance of the year has no more dates', () => {
  // Fix today to Dec 1 so only the Dec 12 Local Weekend Open is future
  _setCalendarToday({ year: 2027, month: 12, day: 1 });
  _player.elo = 1500;
  _finances.money = 500;
  const first = TournamentSystem.register('local_weekend_open', 2027);
  assertEq(first.ok, true);
  const moneyAfterFirst = _finances.money;
  // Dec 12 is booked; no other future instance in 2027 → second
  // register finds nothing and returns no_future_instance_this_year
  const second = TournamentSystem.register('local_weekend_open', 2027);
  assertEq(second.ok, false);
  assertEq(second.error, 'no_future_instance_this_year');
  assertEq(_finances.money, moneyAfterFirst);
});

console.log('\n── getEligibleInstancesForYear ──');

test('returns instances from today onwards only', () => {
  _setCalendarToday({ year: 2026, month: 6, day: 1 });
  _player.elo = 1500;
  _finances.money = 500;
  const list = TournamentSystem.getEligibleInstancesForYear(2026);
  for (const item of list) {
    const cmp = _cmpDates(item.date, _calendarState.date);
    assert(cmp >= 0, 'instance in the past leaked into the lobby');
  }
});

test('every item has tournament + date + eligible verdict', () => {
  _player.elo = 1500;
  _finances.money = 500;
  const list = TournamentSystem.getEligibleInstancesForYear(2027);
  assert(list.length > 0, 'no instances found for 2027');
  for (const item of list) {
    assert(typeof item.tournamentId === 'string');
    assert(item.tournament !== undefined);
    assert(item.date !== undefined);
    assert(item.eligible !== undefined);
    assert(typeof item.eligible.ok === 'boolean');
  }
});

test('home instances appear with resolved city', () => {
  _player.nationality = 'DE';
  _player.elo = 1000;
  _finances.money = 200;
  const list = TournamentSystem.getEligibleInstancesForYear(2027);
  const home = list.find((i) => i.tournamentId === 'local_weekend_open');
  assert(home !== undefined, 'home instance missing');
  assertEq(home.tournament.city, 'Berlin');
  assertEq(home.tournament.country, 'DE');
});

test('low-elo player sees Tier 2 marked ineligible', () => {
  _player.elo = 800;
  _finances.money = 500;
  const list = TournamentSystem.getEligibleInstancesForYear(2027);
  const cappelle = list.find((i) => i.tournamentId === 'cappelle');
  assert(cappelle !== undefined);
  assertEq(cappelle.eligible.ok, false);
  assert(cappelle.eligible.reasons.includes('elo_too_low'));
});

test('eligible includes home Tier 1 templates regardless of nationality', () => {
  for (const nat of ['NO', 'JP', 'BR', 'IR', 'AU', 'ZZ']) {
    _player.nationality = nat;
    _player.elo = 1000;
    _finances.money = 200;
    const list = TournamentSystem.getEligibleInstancesForYear(2027);
    const homes = list.filter((i) =>
      TournamentData.getById(i.tournamentId).home === true,
    );
    assert(homes.length > 0,
           `nationality ${nat}: no home instances surfaced`);
  }
});

console.log('\n── startTournament (C.2b) ──');

function _samplePayload(id, overrides = {}) {
  const t = TournamentData.getById(id);
  const resolved = TournamentSystem.resolve(id);
  return {
    tournamentId: id,
    city:         resolved.city,
    country:      resolved.country,
    year:         2027,
    isHome:       Boolean(t.home),
    rounds:       t.rounds,
    duration:     t.daysDuration,
    ...overrides,
  };
}

test('startTournament builds an instance with the right field size', () => {
  const inst = TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  assert(inst !== null);
  // 5 rounds × 8 = 40 players (1 player + 39 opponents)
  assertEq(inst.field.length, 5 * 8);
  assertEq(inst.currentRound, 1);
  assert(Array.isArray(inst.currentPairings));
});

test('startTournament includes the player as field[0]', () => {
  const inst = TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const me = inst.field.find((p) => p.id === 'player');
  assert(me !== undefined);
  assertEq(me.isPlayer, true);
  assertEq(me.elo, _player.elo);
});

test('startTournament transitions calendar phase', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  assertEq(_calendarState.phase, 'in_tournament');
  assert(_calendarState.currentTournament !== null);
});

test('startTournament uses fieldSize of at least 8 even for short events', () => {
  const inst = TournamentSystem.startTournament(_samplePayload('sunday_rapid'));
  // 7 rounds × 8 = 56
  assertEq(inst.field.length, 56);
});

console.log('\n── Pairings ──');

test('round 1 pairings cover the whole field', () => {
  const inst = TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const seen = new Set();
  for (const p of inst.currentPairings) {
    seen.add(p.white.id);
    if (p.black) seen.add(p.black.id);
  }
  // 40 players, 20 pairings, all unique
  assertEq(seen.size, inst.field.length);
});

test('round 1 pairings are an exact partition (no double assignment)', () => {
  const inst = TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const counts = new Map();
  for (const p of inst.currentPairings) {
    counts.set(p.white.id, (counts.get(p.white.id) || 0) + 1);
    if (p.black) counts.set(p.black.id, (counts.get(p.black.id) || 0) + 1);
  }
  for (const [, count] of counts) {
    assertEq(count, 1, 'a player should appear in exactly one pairing per round');
  }
});

test('player is in exactly one pairing per round', () => {
  const inst = TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const myPairings = inst.currentPairings.filter(
    (p) => (p.white && p.white.id === 'player') || (p.black && p.black.id === 'player'),
  );
  assertEq(myPairings.length, 1);
});

console.log('\n── getCurrentPlayerPairing ──');

test('returns the player pairing with opponent and color', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const pp = TournamentSystem.getCurrentPlayerPairing();
  assert(pp !== null);
  assert(pp.opponent !== null);
  assert(pp.color === 'w' || pp.color === 'b' || pp.color === 'bye');
});

test('returns null when no tournament is in progress', () => {
  assertEq(TournamentSystem.getCurrentPlayerPairing(), null);
});

console.log('\n── recordPlayerResult ──');

test('recording advances the round', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const r1 = TournamentSystem.recordPlayerResult(1);
  assertEq(r1.ok, true);
  assertEq(r1.finished, false);
  const inst = TournamentSystem.getCurrentInstance();
  assertEq(inst.currentRound, 2);
});

test('player score reflects the recorded result', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  TournamentSystem.recordPlayerResult(1);
  TournamentSystem.recordPlayerResult(0.5);
  TournamentSystem.recordPlayerResult(0);
  const me = TournamentSystem.getCurrentInstance().field.find((p) => p.id === 'player');
  assertEq(me.score, 1.5);
});

test('recording marks opponents as faced', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const beforePairing = TournamentSystem.getCurrentPlayerPairing();
  const oppId = beforePairing.opponent.id;
  TournamentSystem.recordPlayerResult(0.5);
  const me = TournamentSystem.getCurrentInstance().field.find((p) => p.id === 'player');
  assert(me.opponentsFaced.includes(oppId));
});

test('full tournament reaches finished state', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  let result;
  for (let i = 0; i < 5; i++) {
    result = TournamentSystem.recordPlayerResult(0.5);
  }
  assertEq(result.finished, true);
  assertEq(TournamentSystem.isFinished(), true);
});

test('player faces 5 different opponents over 5 rounds', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  for (let i = 0; i < 5; i++) {
    TournamentSystem.recordPlayerResult(0.5);
  }
  const me = TournamentSystem.getCurrentInstance().field.find((p) => p.id === 'player');
  // Allow for one bye (null opponent) as a possibility but expect ≥4 unique opponents
  const uniqueOpps = new Set(me.opponentsFaced.filter(Boolean));
  assert(uniqueOpps.size >= 4,
         `expected at least 4 unique opponents, got ${uniqueOpps.size}`);
});

test('invalid score throws', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  let threw = false;
  try { TournamentSystem.recordPlayerResult(0.7); }
  catch (e) { threw = true; }
  assert(threw, 'expected throw on invalid score');
});

test('recordPlayerResult emits round_played with source board', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  TournamentSystem.recordPlayerResult(1);

  const ev = _emittedEvents.find((e) => e.eventName === GameEvents.EVENTS.ROUND_PLAYED);
  assert(ev, 'expected round_played event');
  assertEq(ev.payload.source, 'board');
  assertEq(ev.payload.result, 'win');
});

test('recordPlayerResult updates canonical field entries after mid-round save/reload', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  _calendarState.currentTournament = _deepClone(_calendarState.currentTournament);

  TournamentSystem.recordPlayerResult(1);

  const inst = TournamentSystem.getCurrentInstance();
  const me = inst.field.find((p) => p.id === 'player');
  assertEq(me.score, 1, 'player score should update on canonical field entry');
  assertEq(me.opponentsFaced.length, 1, 'player faced list should update on canonical field entry');
});

test('full tournament remains consistent across save/reload before every round', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  const scores = [0, 1, 0, 1, 0.5];

  for (const score of scores) {
    _calendarState.currentTournament = _deepClone(_calendarState.currentTournament);
    TournamentSystem.recordPlayerResult(score);
  }

  const inst = TournamentSystem.getCurrentInstance();
  const me = inst.field.find((p) => p.id === 'player');
  assertEq(me.score, 2.5, 'player score should equal the sum of recorded round scores');
  assertEq(me.opponentsFaced.length, 5, 'player should face one opponent per recorded round');
  assertEq(inst.history.length, 5, 'history should retain one entry per round');
});

console.log('\n── simulatePlayerRound ──');

function _setSingleRoundTournament(opponentElo = 1500, pairingColor = 'w') {
  const playerEntry = {
    id: 'player',
    name: 'Tester',
    elo: _player.elo,
    nationality: 'NO',
    isPlayer: true,
    score: 0,
    opponentsFaced: [],
  };
  const oppEntry = {
    id: 'opp_1',
    name: 'Jakub Novak',
    elo: opponentElo,
    nationality: 'CZ',
    isPlayer: false,
    score: 0,
    opponentsFaced: [],
  };
  const pairing = pairingColor === 'w'
    ? { white: playerEntry, black: oppEntry }
    : { white: oppEntry, black: playerEntry };

  _calendarState.currentTournament = {
    tournamentId: 'local_weekend_open',
    tournamentName: 'Local Weekend Open',
    city: 'Oslo',
    country: 'NO',
    startDate: { year: 2026, month: 4, day: 11 },
    playerEloStart: _player.elo,
    rounds: 1,
    daysDuration: 2,
    entryFee: 10,
    prizes: [200, 100, 50],
    field: [playerEntry, oppEntry],
    currentRound: 1,
    currentPairings: [pairing],
    history: [],
  };
  _calendarState.phase = 'in_tournament';
}

function _setByeTournament() {
  const playerEntry = {
    id: 'player',
    name: 'Tester',
    elo: _player.elo,
    nationality: 'NO',
    isPlayer: true,
    score: 0,
    opponentsFaced: [],
  };
  _calendarState.currentTournament = {
    tournamentId: 'local_weekend_open',
    tournamentName: 'Local Weekend Open',
    city: 'Oslo',
    country: 'NO',
    startDate: { year: 2026, month: 4, day: 11 },
    playerEloStart: _player.elo,
    rounds: 1,
    daysDuration: 2,
    entryFee: 10,
    prizes: [200, 100, 50],
    field: [playerEntry],
    currentRound: 1,
    currentPairings: [{ white: playerEntry, black: null }],
    history: [],
  };
  _calendarState.phase = 'in_tournament';
}

test('simulatePlayerRound advances the tournament and returns a summary', () => {
  _setSingleRoundTournament();
  const result = TournamentSystem.simulatePlayerRound();
  assertEq(result.ok, true);
  assertEq(result.finished, true);
  assertEq(result.source, 'simulated');
  assert(result.result === 'win' || result.result === 'draw' || result.result === 'loss');
  assertEq(result.round, 1);
});

test('simulatePlayerRound records a real career game and archives it', () => {
  _setSingleRoundTournament(1500);
  TournamentSystem.simulatePlayerRound();
  assertEq(_historyState.games.length, 1);
  assertEq(_historyState.games[0].opponentName, 'Jakub Novak');
});

test('simulatePlayerRound emits round_played with source simulated', () => {
  _setSingleRoundTournament();
  TournamentSystem.simulatePlayerRound();
  const ev = _emittedEvents.find((e) => e.eventName === GameEvents.EVENTS.ROUND_PLAYED);
  assert(ev, 'expected round_played event');
  assertEq(ev.payload.source, 'simulated');
  assertEq(ev.payload.opponent.name, 'Jakub Novak');
});

test('simulatePlayerRound strips flow via FocusSystem hook', () => {
  _setSingleRoundTournament();
  TournamentSystem.simulatePlayerRound();
  assertEq(_focusSimulatedCalls, 1);
});

test('simulatePlayerRound bye path gives full point and tags source as bye', () => {
  _setByeTournament();
  const result = TournamentSystem.simulatePlayerRound();
  const ev = _emittedEvents.find((e) => e.eventName === GameEvents.EVENTS.ROUND_PLAYED);
  assertEq(result.source, 'bye');
  assertEq(result.score, 1);
  assertEq(ev.payload.source, 'bye');
  assertEq(ev.payload.result, 'bye');
});

test('simulatePlayerRound bye does not touch FocusSystem.onRoundSimulated', () => {
  _setByeTournament();
  TournamentSystem.simulatePlayerRound();
  assertEq(_focusSimulatedCalls, 0);
});

test('simulatePlayerRound can finish a tournament and allow finalize', () => {
  _setSingleRoundTournament();
  TournamentSystem.simulatePlayerRound();
  assertEq(TournamentSystem.isFinished(), true);
  const result = TournamentSystem.finalize();
  assert(result.rank >= 1);
});

test('simulatePlayerRound win rate stays below 50% with equal displayed elo', () => {
  let wins = 0;
  const trials = 200;
  const originalRandom = Math.random;
  let seed = 12345;
  Math.random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  try {
    for (let i = 0; i < trials; i++) {
      resetMocks();
      _setSingleRoundTournament(1500);
      const result = TournamentSystem.simulatePlayerRound();
      if (result.result === 'win') wins += 1;
    }
  } finally {
    Math.random = originalRandom;
  }

  const winRate = wins / trials;
  assert(winRate >= 0.30 && winRate <= 0.45,
         `expected win rate in [0.30, 0.45], got ${winRate.toFixed(3)}`);
});

console.log('\n── Standings ──');

test('getStandings returns sorted by score then elo', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  for (let i = 0; i < 5; i++) TournamentSystem.recordPlayerResult(0.5);
  const standings = TournamentSystem.getStandings();
  for (let i = 1; i < standings.length; i++) {
    const a = standings[i - 1], b = standings[i];
    if (a.score === b.score) {
      assert(a.elo >= b.elo, 'tied players should be sorted by elo desc');
    } else {
      assert(a.score > b.score, 'standings should be sorted by score desc');
    }
  }
  // Ranks should be 1..N
  for (let i = 0; i < standings.length; i++) {
    assertEq(standings[i].rank, i + 1);
  }
});

console.log('\n── finalize ──');

test('finalize requires the tournament to be finished', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  let threw = false;
  try { TournamentSystem.finalize(); } catch (e) { threw = true; }
  assert(threw);
});

test('finalize pays prize money to player', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  // Player wins every game (score = 5)
  for (let i = 0; i < 5; i++) TournamentSystem.recordPlayerResult(1);
  const before = _finances.money;
  const result = TournamentSystem.finalize();
  // Player should have a prize ≥ 0; rank likely top
  assert(result.rank >= 1 && result.rank <= 40);
  assertEq(_finances.money, before + result.prize);
});

test('finalize records the tournament in history', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  for (let i = 0; i < 5; i++) TournamentSystem.recordPlayerResult(0.5);
  TournamentSystem.finalize();
  assertEq(_historyState.tournaments.length, 1);
  const row = _historyState.tournaments[0];
  assertEq(row.tournamentId, 'local_weekend_open');
  assertEq(row.rounds, 5);
});

test('finalize advances the calendar by daysDuration', () => {
  _setCalendarToday({ year: 2027, month: 5, day: 1 });
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  for (let i = 0; i < 5; i++) TournamentSystem.recordPlayerResult(0.5);
  TournamentSystem.finalize();
  // local_weekend_open daysDuration = 2
  assertEq(_calendarState.date, { year: 2027, month: 5, day: 3 });
});

test('finalize returns calendar to idle and clears currentTournament', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  for (let i = 0; i < 5; i++) TournamentSystem.recordPlayerResult(0.5);
  TournamentSystem.finalize();
  assertEq(_calendarState.phase, 'idle');
  assertEq(_calendarState.currentTournament, null);
});

test('finalize on a tier-2 tournament with prizes works', () => {
  _player.elo = 1500;
  TournamentSystem.startTournament(_samplePayload('cappelle'));
  // Cappelle has 9 rounds
  for (let i = 0; i < 9; i++) TournamentSystem.recordPlayerResult(0.5);
  const before = _finances.money;
  const result = TournamentSystem.finalize();
  assert(result.of >= 8);
  assert(result.rank >= 1);
  // money should not have decreased
  assert(_finances.money >= before);
});

test('finalize emits tournament_finished with eloBefore and eloAfter', () => {
  TournamentSystem.startTournament(_samplePayload('local_weekend_open'));
  for (let i = 0; i < 5; i++) TournamentSystem.recordPlayerResult(1);

  TournamentSystem.finalize();

  const ev = _emittedEvents.find((e) => e.eventName === GameEvents.EVENTS.TOURNAMENT_FINISHED);
  assert(ev, 'expected tournament_finished event');
  assert('eloBefore' in ev.payload, 'payload should include eloBefore');
  assert('eloAfter' in ev.payload, 'payload should include eloAfter');
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
