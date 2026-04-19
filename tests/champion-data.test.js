// tests/champion-data.test.js
//
// Standalone Node.js test harness for js/champion-data.js.
// Run with: node tests/champion-data.test.js

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'champion-data.js'),
  'utf8',
);
const ChampionData = (new Function(`${code}\nreturn ChampionData;`))();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.log('  ✗', name);
    console.log('     →', e.message);
    failed++;
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

console.log('\n── ChampionData ──');

test('catalogue size is in the expected 30-40 range', () => {
  const count = ChampionData.count();
  assert(count >= 30 && count <= 40, `expected 30..40 champions, got ${count}`);
});

test('ids are unique and Elo values stay in the elite band', () => {
  const seen = new Set();
  for (const c of ChampionData.getAll()) {
    assert(!seen.has(c.id), `duplicate id: ${c.id}`);
    seen.add(c.id);
    assert(c.elo >= 2200 && c.elo <= 2850, `${c.id}: elo ${c.elo} outside elite band`);
  }
});

test('portrait seeds are unique so placeholder portraits stay visually distinct', () => {
  const seen = new Set();
  for (const c of ChampionData.getAll()) {
    assert(!seen.has(c.portraitSeed), `duplicate portraitSeed: ${c.portraitSeed}`);
    seen.add(c.portraitSeed);
  }
});

test('top 10 seeds all have an opening repertoire', () => {
  const top10 = ChampionData.getTopSeeds(10);
  assertEq(top10.length, 10);
  for (const c of top10) {
    assert(c.openingRepertoire, `${c.id} missing opening repertoire`);
    assert(Array.isArray(c.openingRepertoire.asWhite), `${c.id} missing asWhite`);
    assert(typeof c.openingRepertoire.vsE4 === 'string', `${c.id} missing vsE4`);
    assert(typeof c.openingRepertoire.vsD4 === 'string', `${c.id} missing vsD4`);
    assertEq(c.openingRepertoire.prob, 0.70, `${c.id} should use the baseline 70% preference`);
  }
});

test('seeds below the top 10 do not carry an opening repertoire', () => {
  const rest = ChampionData.getAll().slice(10);
  assert(rest.length > 0, 'expected non-top-10 champions');
  for (const c of rest) {
    assert(c.openingRepertoire === undefined, `${c.id} should not have an opening repertoire`);
  }
});

test('getByEloRange filters inclusively', () => {
  const band = ChampionData.getByEloRange(2500, 2600);
  assert(band.length > 0, 'expected at least one champion in 2500-2600');
  for (const c of band) {
    assert(c.elo >= 2500 && c.elo <= 2600, `${c.id} leaked outside inclusive range`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
