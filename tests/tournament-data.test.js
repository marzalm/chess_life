// tests/tournament-data.test.js
//
// Standalone Node.js test harness for js/tournament-data.js.
// Run with:  node tests/tournament-data.test.js

const fs   = require('fs');
const path = require('path');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'tournament-data.js'),
  'utf8',
);
const factory = new Function(`${code}\nreturn TournamentData;`);
const TournamentData = factory();

// ── Tiny test runner ──────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
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

// ── Tests ─────────────────────────────────────────────────────

console.log('\n── Catalogue integrity ──');

test('getCount > 0', () => {
  assert(TournamentData.getCount() > 0, 'catalogue is empty');
});

test('every tournament has required fields', () => {
  const required = [
    'id', 'name', 'tier',
    'eloMin', 'eloMax', 'rounds', 'pairingSystem',
    'daysDuration', 'entryFee', 'prizes', 'annualDates', 'description',
  ];
  for (const t of TournamentData.getAll()) {
    for (const f of required) {
      assert(t[f] !== undefined, `tournament ${t.id} missing field "${f}"`);
    }
    // city/country are required UNLESS home === true
    if (t.home === true) {
      assertEq(t.city, null, `${t.id}: home template must have city: null`);
      assertEq(t.country, null, `${t.id}: home template must have country: null`);
    } else {
      assert(typeof t.city === 'string' && t.city.length > 0,
             `${t.id}: non-home tournament must have a string city`);
      assert(typeof t.country === 'string' && t.country.length > 0,
             `${t.id}: non-home tournament must have a string country`);
    }
  }
});

test('home templates exist and are all Tier 1', () => {
  const homes = TournamentData.getHomeTemplates();
  assert(homes.length > 0, 'no home templates found');
  for (const t of homes) {
    assertEq(t.tier, 1, `${t.id}: home template should be Tier 1`);
    assertEq(t.home, true);
  }
});

test('every Tier 1 tournament is a home template', () => {
  for (const t of TournamentData.getByTier(1)) {
    assertEq(t.home, true, `${t.id}: Tier 1 tournament should be a home template`);
  }
});

test('no Tier 2 tournament is a home template', () => {
  for (const t of TournamentData.getByTier(2)) {
    assert(t.home !== true, `${t.id}: Tier 2 should not be a home template`);
  }
});

test('getHomeTemplates and getFixedLocationTournaments partition the catalogue', () => {
  const homes = TournamentData.getHomeTemplates().length;
  const fixed = TournamentData.getFixedLocationTournaments().length;
  assertEq(homes + fixed, TournamentData.getCount());
});

test('ids are unique', () => {
  const seen = new Set();
  for (const t of TournamentData.getAll()) {
    assert(!seen.has(t.id), `duplicate id: ${t.id}`);
    seen.add(t.id);
  }
});

test('tiers stay within the shipped 1-6 ladder', () => {
  for (const t of TournamentData.getAll()) {
    assert(t.tier >= 1 && t.tier <= 6, `${t.id} has invalid tier ${t.tier}`);
  }
});

test('pairingSystem stays within supported values', () => {
  for (const t of TournamentData.getAll()) {
    assert(
      t.pairingSystem === 'swiss' || t.pairingSystem === 'roundrobin',
      `${t.id} has unsupported pairingSystem ${t.pairingSystem}`,
    );
  }
});

test('eloMin <= eloMax for every tournament', () => {
  for (const t of TournamentData.getAll()) {
    assert(t.eloMin <= t.eloMax, `${t.id}: eloMin > eloMax`);
  }
});

test('prizes are descending and positive', () => {
  for (const t of TournamentData.getAll()) {
    assert(t.prizes.length > 0, `${t.id}: empty prize list`);
    for (let i = 0; i < t.prizes.length; i++) {
      assert(t.prizes[i] > 0, `${t.id}: prize at rank ${i+1} not positive`);
      if (i > 0) {
        assert(
          t.prizes[i] <= t.prizes[i - 1],
          `${t.id}: prizes not monotonically decreasing at rank ${i+1}`,
        );
      }
    }
  }
});

test('annualDates have valid month and day', () => {
  const daysInMonth = (m) => [31,29,31,30,31,30,31,31,30,31,30,31][m-1];
  for (const t of TournamentData.getAll()) {
    assert(Array.isArray(t.annualDates) && t.annualDates.length > 0,
           `${t.id}: annualDates must be a non-empty array`);
    for (const d of t.annualDates) {
      assert(d.month >= 1 && d.month <= 12,
             `${t.id}: invalid month ${d.month}`);
      assert(d.day >= 1 && d.day <= daysInMonth(d.month),
             `${t.id}: invalid day ${d.day}/${d.month}`);
    }
  }
});

test('rounds and daysDuration are positive', () => {
  for (const t of TournamentData.getAll()) {
    assert(t.rounds > 0, `${t.id}: rounds must be positive`);
    assert(t.daysDuration > 0, `${t.id}: daysDuration must be positive`);
  }
});

test('entryFee is non-negative', () => {
  for (const t of TournamentData.getAll()) {
    assert(t.entryFee >= 0, `${t.id}: entryFee negative`);
  }
});

console.log('\n── Lookups ──');

test('getById finds a known tournament', () => {
  const t = TournamentData.getById('cappelle');
  assert(t !== null, 'cappelle should exist');
  assertEq(t.country, 'FR');
  assertEq(t.tier, 2);
});

test('getById returns null for unknown id', () => {
  assertEq(TournamentData.getById('nonexistent'), null);
});

test('getByTier returns the right ones', () => {
  const tier1 = TournamentData.getByTier(1);
  const tier2 = TournamentData.getByTier(2);
  const tier3 = TournamentData.getByTier(3);
  const tier4 = TournamentData.getByTier(4);
  const tier5 = TournamentData.getByTier(5);
  const tier6 = TournamentData.getByTier(6);
  assert(tier1.length > 0, 'no Tier 1 tournaments');
  assert(tier2.length > 0, 'no Tier 2 tournaments');
  assert(tier3.length > 0, 'no Tier 3 tournaments');
  assert(tier4.length > 0, 'no Tier 4 tournaments');
  assert(tier5.length > 0, 'no Tier 5 tournaments');
  assert(tier6.length > 0, 'no Tier 6 tournaments');
  for (const t of tier1) assertEq(t.tier, 1);
  for (const t of tier2) assertEq(t.tier, 2);
  for (const t of tier3) assertEq(t.tier, 3);
  for (const t of tier4) assertEq(t.tier, 4);
  for (const t of tier5) assertEq(t.tier, 5);
  for (const t of tier6) assertEq(t.tier, 6);
});

test('Tier 1-3 remain swiss and Tier 4-6 are round robin', () => {
  for (const t of TournamentData.getAll()) {
    if (t.tier <= 3) {
      assertEq(t.pairingSystem, 'swiss', `${t.id} should stay swiss`);
    } else {
      assertEq(t.pairingSystem, 'roundrobin', `${t.id} should now be round robin`);
    }
  }
});

test('round-robin events use closed-field sizes derived from rounds + 1', () => {
  for (const t of TournamentData.getAll()) {
    if (t.pairingSystem !== 'roundrobin') continue;
    const fieldSize = t.rounds + 1;
    assert(
      fieldSize >= 8 && fieldSize <= 14,
      `${t.id}: round-robin field size ${fieldSize} should stay within 8..14`,
    );
  }
});

test('getByTier(99) returns empty', () => {
  assertEq(TournamentData.getByTier(99), []);
});

console.log('\n── Eligibility ──');

test('getEligible(800) — beginner sees Tier 1 only', () => {
  const elig = TournamentData.getEligible(800);
  assert(elig.length > 0, 'no eligible tournaments for an 800 player');
  for (const t of elig) {
    assert(800 >= t.eloMin && 800 <= t.eloMax,
           `${t.id} should not be eligible for elo 800`);
  }
});

test('getEligible(1500) — mid sees both tiers', () => {
  const elig = TournamentData.getEligible(1500);
  const hasTier1 = elig.some((t) => t.tier === 1);
  const hasTier2 = elig.some((t) => t.tier === 2);
  assert(hasTier1, '1500 should still see some Tier 1');
  assert(hasTier2, '1500 should see Tier 2');
});

test('getEligible(2500) — high-level player now sees higher-tier events', () => {
  const elig = TournamentData.getEligible(2500);
  assert(elig.length > 0, '2500 should see higher-tier events');
  assert(elig.some((t) => t.tier >= 4), '2500 should reach at least Tier 4');
});

test('new elite catalogue includes the expected Tier 3-6 anchors', () => {
  const ids = [
    'gibraltar_masters',
    'tata_steel_challengers',
    'tata_steel_masters',
    'grand_swiss',
  ];
  for (const id of ids) {
    assert(TournamentData.getById(id), `${id} should exist in the Phase G catalogue`);
  }
});

console.log('\n── Prize pool ──');

test('getPrizePool sums correctly', () => {
  const t = TournamentData.getById('cappelle');
  const expected = t.prizes.reduce((a, b) => a + b, 0);
  assertEq(TournamentData.getPrizePool('cappelle'), expected);
});

test('getPrizePool unknown id returns 0', () => {
  assertEq(TournamentData.getPrizePool('nope'), 0);
});

console.log('\n── Per-year instance generation ──');

test('getInstancesForYear returns sorted CalendarDate instances', () => {
  const insts = TournamentData.getInstancesForYear(2026);
  assert(insts.length > 0, 'no instances generated');
  for (let i = 1; i < insts.length; i++) {
    const a = insts[i - 1].date;
    const b = insts[i].date;
    const aKey = a.year * 10000 + a.month * 100 + a.day;
    const bKey = b.year * 10000 + b.month * 100 + b.day;
    assert(aKey <= bKey, `instances not sorted at index ${i}`);
  }
});

test('getInstancesForYear includes every monthly date for monthly tournaments', () => {
  const insts = TournamentData.getInstancesForYear(2026)
    .filter((i) => i.tournamentId === 'local_weekend_open');
  // 12 monthly dates for the universal Local Weekend Open
  assertEq(insts.length, 12);
});

test('getInstancesForYear sets year correctly', () => {
  const insts = TournamentData.getInstancesForYear(2030);
  for (const i of insts) {
    assertEq(i.date.year, 2030);
  }
});

test('getInstancesForYear yields one entry per (tournament × annualDate)', () => {
  const total = TournamentData.getAll()
    .reduce((acc, t) => acc + t.annualDates.length, 0);
  assertEq(TournamentData.getInstancesForYear(2026).length, total);
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
