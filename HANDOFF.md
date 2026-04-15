# Chess Life — Handoff

**Last updated:** 2026-04-15  
**Audience:** any LLM or developer taking over. Read this first, then
[CLAUDE.md](CLAUDE.md), [CHANGELOG.md](CHANGELOG.md), and
[PHASE_E_DESIGN.md](PHASE_E_DESIGN.md).

## 1. Project in one paragraph

Chess Life is a vanilla-JS chess career sim: the player creates a young
talent, browses a living calendar, registers for real tournaments,
plays games on the existing chess board against Maia/Stockfish-backed
opponents, hires a coach, trains between events, and climbs the Elo
ladder. The project has two equal goals: **fun FM-style progression**
and a **hidden chess trainer** that makes the real player improve.

## 2. Current shipped state

Phases **A through F are shipped**.

The current playable loop is:

1. Character creator on first launch
2. Home screen with calendar, continue button, inbox badge, coach
   button, and training button
3. Tournament lobby and registration flow
4. Tournament run loop with pairings, standings, round history, and
   real board games
5. Coach browser with one coach slot and weekly salary deductions
6. In-game puzzle bonuses:
   - training bonus
   - Flow bonus
   - Blitz Decay fuse bar
   - Stockfish playback reward
7. Training Hub:
   - coach-led theme sessions (`3-streak / 6 solves / 18 attempts`)
   - tournament-scoped prepared bonuses
   - `Solo practice` free-play random puzzle button with **zero**
     mechanical impact

Current test baseline: **334 passed, 0 failed** across 10 suites.

## 3. The most important current mechanics

### Tournament integrity

`TournamentSystem.recordPlayerResult()` must mutate the **canonical**
entries in `currentTournament.field`, not the pairing objects directly.
This was fixed on 2026-04-12 after a save/reload bug caused stale
pairing references mid-round. `getCurrentInstance()` now defensively
re-links `currentPairings` to `field` on access.

### Coach model

The old 22-skill-per-coach model is **gone**. Coaches now use:

- `primaryThemes[]`
- `bonusMoves`

`StaffSystem.getCurrentCoachBonusMoves(theme)` returns the coach tier
bonus only if that theme is covered. No hidden `skills[theme]`, no
skill bars, no `getCoachMoveBonus(skill)`.

### Puzzle progression

`PuzzleSystem` now owns:

- per-theme ratings: `training.puzzleRatings[theme]`
- per-theme RD: `training.puzzleRatingRds[theme]`
- player-owned reinforcement queues
- tournament-scoped training bonuses
- Flow bonus persistence

`getAptitude(theme)` is derived from the theme rating, not stored
separately.

### Training bonuses

Training bonuses are **not** permanent inventory anymore. A successful
coach-led training session prepares a theme for the **next tournament**.
Prepared themes are usable **once per game** during that tournament,
reset between rounds, and are cleared when the tournament finalizes.

Schema shape to remember:

```js
training.trainingBonuses[theme] = {
  prepared: boolean,
  usedThisGame: boolean,
  lockedUntilTournamentEnd: boolean
}
```

### Solo practice

`Solo practice` is deliberately light:

- one button: `🎲 Random puzzle`
- no rating changes
- no seen tracking
- no reinforcement mutation
- no bonuses
- no calendar cost
- no persistence side effects

It is pure learning/free-play and should stay mechanically isolated.

### Flow bonuses

Flow bonuses are now earned on **every upward palier transition**
(`I`, `II`, `III`, `MAX`) as long as the slot is empty. They are still
non-accumulating and are **lost on Flow exit** if unused.

### Blitz Decay

In-game puzzle rewards are speed-tiered through Blitz Decay:

- fast → base 3
- medium → base 2
- slow → base 1

Fuse bar is **vertical**, on the **right side of the board**, and only
appears in puzzle mode.

## 4. Files that matter most right now

### Core state / systems

- [js/career-manager.js](js/career-manager.js)
- [js/calendar-system.js](js/calendar-system.js)
- [js/tournament-system.js](js/tournament-system.js)
- [js/staff-system.js](js/staff-system.js)
- [js/puzzle-system.js](js/puzzle-system.js)
- [js/bonus-system.js](js/bonus-system.js)
- [js/focus-system.js](js/focus-system.js)
- [js/rival-system.js](js/rival-system.js)

### UI

- [js/ui-manager.js](js/ui-manager.js)
- [js/ui-career.js](js/ui-career.js)
- [index.html](index.html)
- [css/ui.css](css/ui.css)
- [css/career.css](css/career.css)

### Data

- [js/tournament-data.js](js/tournament-data.js)
- [js/coach-data.js](js/coach-data.js)
- [js/puzzle-data.js](js/puzzle-data.js)
- [js/rival-data.js](js/rival-data.js)

### Tests

- [tests/calendar-system.test.js](tests/calendar-system.test.js)
- [tests/tournament-data.test.js](tests/tournament-data.test.js)
- [tests/tournament-system.test.js](tests/tournament-system.test.js)
- [tests/game-events.test.js](tests/game-events.test.js)
- [tests/inbox-system.test.js](tests/inbox-system.test.js)
- [tests/puzzle-system.test.js](tests/puzzle-system.test.js)
- [tests/bonus-system.test.js](tests/bonus-system.test.js)
- [tests/staff-system.test.js](tests/staff-system.test.js)
- [tests/focus-system.test.js](tests/focus-system.test.js)
- [tests/rival-system.test.js](tests/rival-system.test.js)

## 5. Architecture rules still in force

- Never touch `chess-engine.js` unless the user explicitly asks
- All Focus logic stays in `focus-system.js`
- All date advancement stays in `calendar-system.js`
- All tournament mutations stay in `tournament-system.js`
- `BonusSystem` must not write training state directly; `PuzzleSystem`
  remains the canonical writer for puzzle/training domains
- One Stockfish worker only
- No framework / no bundler / no backend

## 6. What is outdated and should not be resurrected

Do **not** reintroduce:

- coach `skills[theme]` maps
- `getCoachMoveBonus(skill)`
- coach skill-bar detail panes
- permanent stackable training-bonus counts
- self-training theme sessions that mutate ratings/bonuses outside the
  coach loop

Those were all superseded by later Phase E work.

## 7. What to do next session

If the user says “resume”, assume the next design/implementation work
starts **after E.5**. Read:

1. [CLAUDE.md](CLAUDE.md) for the project charter and roadmap
2. [CHANGELOG.md](CHANGELOG.md) for the latest fixes
3. [PHASE_E_DESIGN.md](PHASE_E_DESIGN.md) for the historical Phase E
   decisions and the shipped-state notes

Then run the full suite:

```bash
cd "/home/noidedbb/Documents/chess life/chess_life"
node tests/calendar-system.test.js
node tests/tournament-data.test.js
node tests/tournament-system.test.js
node tests/game-events.test.js
node tests/inbox-system.test.js
node tests/puzzle-system.test.js
node tests/bonus-system.test.js
node tests/staff-system.test.js
node tests/focus-system.test.js
node tests/rival-system.test.js
```

Expected result: **334 passed, 0 failed**.

## 8. Browser test tip

For manual testing:

```bash
cd "/home/noidedbb/Documents/chess life/chess_life"
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

If the save is broken and you need a hard reset:

```js
localStorage.removeItem('chess_life_career_v2');
location.reload();
```
