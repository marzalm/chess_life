# Chess Life — Handoff

**Last updated:** 2026-04-17  
**Audience:** any LLM or developer taking over. Read this first, then
[CLAUDE.md](CLAUDE.md), [CHANGELOG.md](CHANGELOG.md), and
[PHASE_E_DESIGN.md](PHASE_E_DESIGN.md), then [PHASE_G_DESIGN.md](PHASE_G_DESIGN.md).

## 1. Project in one paragraph

Chess Life is a vanilla-JS chess career sim: the player creates a young
talent, browses a living calendar, registers for real tournaments,
plays games on the existing chess board against Maia/Stockfish-backed
opponents, hires a coach, trains between events, and climbs the Elo
ladder. The project has two equal goals: **fun FM-style progression**
and a **hidden chess trainer** that makes the real player improve.

## 2. Current shipped state

Phases **A through F are shipped**, and **Phase G.1 + G.2 are now
shipped as the accessibility / elite-opponent baseline** with one
follow-up stabilization pass already applied.

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
8. Global opponent difficulty:
   - realistic-only
   - no player-facing difficulty selector
9. Elite opponent routing:
   - Maia for displayed Elo `<= 2000`
   - humanized Stockfish for displayed Elo `> 2000`
   - one Stockfish Worker total, shared with eval
10. Phase G manual test support:
   - `🛠 Dev panel` on the home screen
   - `window.cl.dev`
   - forced Maia / Stockfish matchup presets for real-game testing
11. FIDE title layer:
   - player, rivals, champions, and anonymous opponents expose
     `CM / FM / IM / GM` from Elo
   - player title promotions are permanent
   - inbox now reacts to `title_earned`
12. Resignation flow:
   - the player can resign from the live board
   - clearly lost opponents can now resign too
   - resignations count as rated results but skip post-game review
13. Draw-offer flow:
   - the player can offer a draw directly
   - equal low-material positions can trigger AI draw offers
   - accepted draw offers count as rated draws and skip review
14. Elite tournament formats:
   - Tier 1-3 tournaments remain Swiss
   - Tier 4-6 tournaments now use pre-generated round-robin schedules
   - round-robin standings use Sonneborn-Berger before Elo

Current test baseline: **407 passed, 0 failed** across 17 suites.

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

### Phase G accessibility baseline

The old multi-difficulty experiment is gone. The project is now
**realistic-only**:

- displayed Elo is the Elo the AI actually plays at
- there is no hidden dampening layer
- `player.settings.difficulty` is retained only for save compatibility
  and is always forced to `'realistic'`

### FIDE titles are now part of the visible career identity

Current shipped thresholds:

- `<2000` → no title
- `2000+` → `CM`
- `2300+` → `FM`
- `2400+` → `IM`
- `2500+` → `GM`

Important behavior:

- `CareerManager.player.title` is persisted
- missing titles in older saves are derived from current Elo
- title promotions are permanent and never roll back on rating loss
- titled names are now rendered in the board UI, tournament UI, rivals
  UI, and key inbox mails

### Resignation is now a first-class game outcome

Current shipped behavior:

- player-side `Resign` button on the game screen with confirmation modal
- resignation records a normal rated `loss` / `win` in career history
- resignation skips `ReviewManager.startReview(...)`
- AI resignation is probabilistic, but only after a long enough streak of
  clearly losing evals from the opponent point of view

### Voluntary draw offers are now part of board play

Current shipped behavior:

- player-side `Offer Draw` button on the game screen
- opening positions auto-refuse draw offers
- equal endgames are much more drawish than busy middlegames
- voluntary draws reuse the normal rated-result path and skip review
- AI draw offers arrive only in low-material, long-equal stretches

### Closed elite tournaments now use round-robin schedules

Current shipped behavior:

- Tier 1-3 tournaments stay on the existing Swiss implementation
- Tier 4-6 tournaments use a Berger-style round-robin schedule generated
  at tournament start
- round-robin field size is now `rounds + 1`, not the old Swiss
  `rounds * 8` heuristic
- odd-sized round robins are supported through a virtual BYE slot
- round-robin standings break score ties by Sonneborn-Berger, then Elo

### Focus threshold is now tied to live opponent strength

This is easy to miss, but it matters a lot for future tuning:

- `FocusSystem` no longer adapts "good move" difficulty from the
  old dampened helper
- it now reads `UIManager._opponentElo` directly

Current shipped threshold logic:

- base threshold from player Elo:
  - `<1000` → `100cp`
  - `<1200` → `90cp`
  - `<1400` → `75cp`
  - `<1600` → `65cp`
  - `<1800` → `55cp`
  - `1800+` → `45cp`
- additional gap penalty when the opponent is stronger
- stronger gap effect at high Elo than at low Elo
- absolute floor: `15cp`

### Phase G elite-opponent routing

`UIManager._pickOpponentMove()` is now the live seam:

- displayed Elo `<= 2000`:
  - Maia opening book if early enough
  - then Maia policy move
- displayed Elo `> 2000`:
  - `StockfishOpponent.getMove()`

`StockfishOpponent` uses the **same single Stockfish Worker** via
`ChessEngine.requestOpponentMove()`. No second worker is allowed.

Humanization currently shipped:

- `MultiPV = 10`
- movetime interpolation:
  - `250ms @ 2000`
  - `300ms @ 2400`
  - `450ms @ 2800`
- softmax sampling with temperature:
  - `60cp @ 2000`
  - `30cp @ 2400`
  - `15cp @ 2800`

### Shared-worker race fix is already shipped

This is the main hidden technical risk of Phase G so far.

The single Stockfish Worker is now protected by a drain barrier in
`ChessEngine`:

- when an eval must be cancelled before a new request
- engine posts `stop`
- then waits for `isready` / `readyok`
- only after that does it arm the next resolver

This prevents orphan `bestmove` messages from a cancelled eval being
misrouted into the opponent-move path.

Related files:

- [js/chess-engine.js](js/chess-engine.js)
- [tests/chess-engine-worker-race.test.js](tests/chess-engine-worker-race.test.js)

### Dev quick-test tool

Phase G now has a lightweight manual validation tool:

- [js/dev-tools.js](js/dev-tools.js)
- home button: `🛠 Dev panel`
- console entry point: `window.cl.dev.open()`

Purpose:

- force player Elo / opponent Elo / tier / color
- preview routed engine (`Maia` vs `Stockfish`)
- launch real games beyond the current public tournament catalogue

Important caveat:

- this tool is for manual testing only
- it mutates persisted player Elo for the session
- do not use it while a real tournament is in progress

Still deferred:

- style-tag move bias (`attacker / positional / universal`)
- Maia-not-ready fallback to Stockfish
- named champion personalities beyond flavor text

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
- [js/champion-data.js](js/champion-data.js)
- [js/stockfish-opponent.js](js/stockfish-opponent.js)
- [js/dev-tools.js](js/dev-tools.js)

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
- [tests/career-manager.test.js](tests/career-manager.test.js)
- [tests/champion-data.test.js](tests/champion-data.test.js)
- [tests/tournament-data.test.js](tests/tournament-data.test.js)
- [tests/tournament-system.test.js](tests/tournament-system.test.js)
- [tests/game-events.test.js](tests/game-events.test.js)
- [tests/inbox-system.test.js](tests/inbox-system.test.js)
- [tests/puzzle-system.test.js](tests/puzzle-system.test.js)
- [tests/bonus-system.test.js](tests/bonus-system.test.js)
- [tests/staff-system.test.js](tests/staff-system.test.js)
- [tests/focus-system.test.js](tests/focus-system.test.js)
- [tests/rival-system.test.js](tests/rival-system.test.js)
- [tests/stockfish-opponent.test.js](tests/stockfish-opponent.test.js)
- [tests/ui-manager-ai-routing.test.js](tests/ui-manager-ai-routing.test.js)
- [tests/ui-manager-draw-offers.test.js](tests/ui-manager-draw-offers.test.js)
- [tests/ui-manager-resign.test.js](tests/ui-manager-resign.test.js)
- [tests/chess-engine-worker-race.test.js](tests/chess-engine-worker-race.test.js)

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
starts **after G.2 stabilization**. Read:

1. [CLAUDE.md](CLAUDE.md) for the project charter and roadmap
2. [CHANGELOG.md](CHANGELOG.md) for the latest fixes
3. [PHASE_E_DESIGN.md](PHASE_E_DESIGN.md) for the historical Phase E
   decisions and the shipped-state notes
4. [PHASE_G_DESIGN.md](PHASE_G_DESIGN.md) for the shipped G.1/G.2
   baseline and planned G.3+ work

Then run the full suite:

```bash
cd "/home/noidedbb/Documents/chess life/chess_life"
node tests/calendar-system.test.js
node tests/career-manager.test.js
node tests/champion-data.test.js
node tests/tournament-data.test.js
node tests/tournament-system.test.js
node tests/game-events.test.js
node tests/inbox-system.test.js
node tests/puzzle-system.test.js
node tests/bonus-system.test.js
node tests/staff-system.test.js
node tests/focus-system.test.js
node tests/rival-system.test.js
node tests/stockfish-opponent.test.js
node tests/ui-manager-ai-routing.test.js
node tests/ui-manager-draw-offers.test.js
node tests/ui-manager-resign.test.js
node tests/chess-engine-worker-race.test.js
```

Expected result: **407 passed, 0 failed**.

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
