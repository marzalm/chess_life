# Changelog

All notable changes to Chess Life are documented here.

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Project timeline is organized by **Phases** (A → H) as defined in [CLAUDE.md](CLAUDE.md).

---

## [Unreleased]

### E.5: Training Hub, per-theme ratings, and tournament preparation (2026-04-12)

Phase E closes with the missing out-of-game training loop: coach-led or
self-directed puzzle sessions on the board, per-theme progression, and
tournament-scoped preparation bonuses.

#### 1. Training Hub and session flow

- added a dedicated Training Hub screen with coach-theme sessions when a
  coach is hired, plus self-training access across all 22 themes
- training sessions now run directly on the puzzle board without Blitz
  Decay and use the locked `3-streak / 6 solves / 18 attempts` rules
- each completed session advances the in-game calendar by exactly **1
  day** through the new `CalendarSystem.advanceOneDay()`

#### 2. Puzzle progression redesign

- `PuzzleSystem` now stores **per-theme** ratings and rating deviations
  via `training.puzzleRatings[theme]` and `training.puzzleRatingRds[theme]`
- legacy global `puzzleRating` / `puzzleRatingRd` saves are migrated on
  init, and aptitude is now derived from theme rating instead of stored
  separately
- training sessions update theme rating with
  `TRAINING_K_FACTOR_MULT = 0.25`, keeping real-game puzzle pressure as
  the faster progression path

#### 3. Tournament-scoped training bonuses

- training bonuses are no longer permanent stackable charges
- a successful session now prepares a theme for the **next tournament**,
  making it usable once per game during that tournament
- prepared themes reset at the start of each new game and are cleared
  automatically when the tournament finalizes

#### 4. Coach model simplification

- replaced the old 22-skill coach grid with the simpler E.5 model:
  `primaryThemes[]` + explicit `bonusMoves`
- `StaffSystem.getCurrentCoachBonusMoves(theme)` now returns the tier
  bonus only on themes actually covered by the current coach
- the coach browser UI was simplified accordingly: no skill bars, only
  themes, cost, unlock, bonus, flavor, and hire/replace actions

#### 5. Tests

- added `CalendarSystem.advanceOneDay()` coverage and expanded
  `PuzzleSystem` to cover session flow, migration, per-theme ratings,
  prepared-theme semantics, and invariants
- all 9 suites are green at **278 tests**

### E.4 final fixes: Flow color matching and per-palier earning (2026-04-12)

Final polish pass before closing Phase E.

- `PuzzleSystem.pickFlowPuzzle()` now accepts an optional
  `preferredColor` and filters unseen Flow puzzles by the live
  player color when possible, with the same defensive fallback as
  training-bonus puzzle selection.
- `BonusSystem.invokeFlowBonus()` now passes
  `ChessEngine.getPlayerColor()` into `pickFlowPuzzle()`, so Flow
  puzzles match the side the player is currently playing in the game.
- `FocusSystem` now emits `flow_bonus_earned` on **every upward Flow
  palier transition**, not only on `0 -> 1+`. Because the Flow slot is
  still non-accumulating, this means the player can earn a fresh bonus
  at Flow II / III / MAX after spending the previous one, while
  climbing again with an unused charge does nothing.
- Tests now cover Flow color filtering and the per-palier earning rule.
  All 9 suites remain green.

### E.4: Flow bonus integration and Blitz Decay (2026-04-12)

Phase E.4 completes the hidden-trainer loop by adding the second
bonus source and replacing the fixed bonus reward with a speed-based
Blitz Decay tier system.

#### 1. Blitz Decay timing and puzzle-mode UI

- `js/bonus-system.js` now computes reward tiers from a continuous
  Blitz Decay timer using locked constants:
  `BLITZ_DRAIN_BASE_MS = 27000`, `BLITZ_DRAIN_EXPONENT = 1.25`,
  `BLITZ_FAST_CUTOFF = 2/3`, `BLITZ_MEDIUM_CUTOFF = 1/3`
- the fuse bar is now a **vertical bar on the right side of the board**
  with bottom-to-top fill and continuous green→yellow→red decay
- training-bonus rewards are no longer fixed at base 2; successful
  solves now grant tier base `3 / 2 / 1` plus aptitude and coach bonus

#### 2. Flow bonus lifecycle

- added `flow_bonus_earned` to `js/game-events.js`
- `FocusSystem` now emits `flow_bonus_earned` on each upward Flow
  palier transition while `PuzzleSystem` keeps the slot non-accumulating,
  and clears any unspent Flow bonus on Flow exit
- `PuzzleSystem` gained `pickFlowPuzzle()`, `hasFlowBonus()`,
  `earnFlowBonus()`, `consumeFlowBonus()`, and `clearFlowBonus()`
- Flow invocation uses unseen puzzles only, hides the theme during the
  puzzle, and reveals it after resolution

#### 3. Outcome and reward resolution

- `BonusSystem` now supports both training and Flow invocation paths
  with a unified `getRewardMoveCount(theme, tierBaseMoves)`
- Flow success/failure uses a two-phase reveal card:
  `Theme revealed` for `500ms`, then the full breakdown for `1500ms`
- Flow coach quality is read from the **revealed** theme using the
  same locked `StaffSystem.getCoachMoveBonus(skill)` mapping as E.3

#### 4. Tests

- `tests/puzzle-system.test.js` now covers `pickFlowPuzzle()` and
  unseen-pool exhaustion
- `tests/bonus-system.test.js` now covers:
  Blitz Decay fast/medium/slow tiers, longer-line scaling, Flow
  bonus appearance/loss on Flow exit, hidden-theme invocation,
  reveal-card content, and revealed-theme coach bonuses
- total suite count is now **263 green tests** across 9 suites

### Focus cutoff in hopeless positions (2026-04-12)

Small pre-E.4 integrity fix for the Focus / Flow loop.

- `js/focus-system.js` now hard-cuts the existing `oneSided`
  multiplier to `0` when the player is badly losing:
  `cpBefore <= -800` with `pieceCount <= 10`, or `cpBefore <= -1500`
  regardless of material.
- This prevents Focus / Flow farming in dead-lost positions where
  the player is only finding forced legal moves.
- Added a new `tests/focus-system.test.js` suite covering the two
  losing cutoffs and the non-zero winning-side case.

### E.3: coach system, weekly pay, coach UI, and inbox hooks (2026-04-12)

Phase E.3 ships the single-slot coach layer on top of the E.1/E.2
training systems: a static catalog of 10 coaches, persistent hire/fire
logic, automatic weekly pay, coach browser UI, coach inbox mails, and
coach quality wired into bonus rewards.

#### 1. Static coach catalog + staff domain

- added `js/coach-data.js` with the locked 10-coach catalog:
  2 starters, 3 mid specialists, 3 mid balanced, 1 elite balanced,
  1 elite specialist
- added `js/staff-system.js` with a single-slot coach model:
  `getCurrentCoach`, `canHire`, `hire`, `fire`, `processWeeklyCost`,
  `getCoachMoveBonus`, and catalog accessors
- persisted `staff.currentCoach` as `{ id, hireDate, lastPaidDate }`
  without touching player-owned training state

#### 2. Calendar day-tick hook + weekly cost processing

- `calendar-system.js` now exposes a per-day tick hook and fires it
  **once per day increment inside `continue()`**, including full
  365-day skips with no events
- `StaffSystem` subscribes to that hook and deducts coach cost every
  7 in-game days
- insufficient funds auto-fire the coach with a reactive `coach_fired`
  event instead of introducing debt or blocking calendar advancement

#### 3. Coach events, inbox mails, and reward quality

- added `coach_hired` and `coach_fired` to `game-events.js`
- `InboxSystem` now reacts to those events with three templates:
  hire, manual dismissal, and dismissal for insufficient funds
- `BonusSystem.getRewardMoveCount(theme)` now layers coach quality on
  top of the existing base-2 + aptitude reward using
  `StaffSystem.getCoachMoveBonus(skill)`

#### 4. Dedicated coaches screen and home integration

- added a full `#screen-coaches` browser with current-coach status,
  card grid, replace confirm modal, and grouped 22-theme skill bars
- home now shows `👨‍🏫 Hire a coach` when empty or `👨‍🏫 Your coach`
  plus the active coach name and weekly cost when filled
- coach cards visibly distinguish locked Elo gates, affordability, and
  current/replace states

#### 5. Tests

- new `tests/staff-system.test.js` with **19** passing tests
- `tests/calendar-system.test.js` gains the locked day-tick cap test
- `tests/inbox-system.test.js` now covers coach hire/fire mails
- `tests/bonus-system.test.js` now exercises the coach bonus path in
  `getRewardMoveCount`
- total suite count is now **249 green tests** across 8 suites

### E.2 playtest fixes round 4: playback deadlock (2026-04-12)

Fourth and final E.2 bugfix pass.

- `_runPlayback` in `js/bonus-system.js` used to early-break after
  the last budgeted player move, skipping Maia's reply. Control
  returned with "Your move." while Maia was actually still to
  move, deadlocking the game.
- Fixed by removing the mid-loop `if (movesLeft <= 0) break;`
  and letting every iteration play to completion (player move
  + Maia reply). The while condition still gates the next
  iteration on the budget.
- New regression test in `tests/bonus-system.test.js` verifies
  that a 2-move budget triggers `triggerAIMoveAndWait()` exactly
  2 times and that `ChessEngine.getTurn()` returns to the player
  color at the end of playback.

No file touched outside `bonus-system.js` and its test. All 7
suites still green at 226 tests.

### E.2 playtest fixes round 3: Lichess FEN setup-move normalization (2026-04-11)

Third focused E.2 bugfix pass. This round fixes the root mismatch
between shipped puzzle positions and the player’s expected first move
by normalizing Lichess data at extraction time instead of layering
runtime special cases on top.

#### 1. Puzzle extraction now ships post-setup positions

- `tools/extract_lichess_puzzles.py` now documents the raw Lichess CSV
  quirk: `FEN` is the position before the opponent’s setup move
- the script now loads that raw FEN, applies the first UCI move with
  `python-chess`, stores the resulting board as the shipped `fen`, and
  trims `solution` to `moves[1:]`
- defensive filtering drops any row that cannot produce a playable
  post-setup puzzle line

#### 2. Color filtering semantics are now correct

- `PuzzleSystem._puzzleTurnColor()` still reads the FEN turn letter,
  but that turn letter now means “player to move” instead of
  “opponent setup move to play”
- same-color filtering in `pickInGamePuzzle(theme, preferredColor)`
  therefore now matches the live-game player color as intended

#### 3. Starter pool regenerated with normalized FENs

- `js/puzzle-data.js` was regenerated from the normalized extractor
- the pool remains locked at **176 puzzles total**, **8 per theme**,
  **5 low / 3 mid**, and **4 white / 4 black**
- spot-checking the first puzzle of each theme confirms the shipped
  FENs changed from the previous raw-Lichess positions

#### 4. Regression coverage

- `tests/puzzle-system.test.js` adds a normalization regression test
  asserting that `pickInGamePuzzle('fork', 'w')` returns a puzzle whose
  shipped FEN turn letter is white
- all existing puzzle and bonus tests remain green on the normalized
  data format

### E.2 playtest fixes round 2 (2026-04-11)

Second focused bugfix pass after browser playtest. This round fixes
banner layout, puzzle-side consistency, adaptive puzzle rating, and
adds debug force-resolution hooks for faster validation.

#### 1. Puzzle banner moved out of the board overlay layer

- `#puzzle-mode-banner` is no longer absolutely positioned inside
  `#board-container`
- the banner now lives in `#board-section`, between
  `#captured-black` and the board itself
- styling switched back to normal document flow, so the first rank is
  no longer obscured during puzzle mode

#### 2. In-game puzzles now prefer the player’s side

- `PuzzleSystem.pickInGamePuzzle(theme, preferredColor)` now accepts
  an optional preferred turn color
- `BonusSystem.invokeBonus(theme)` passes
  `ChessEngine.getPlayerColor()` through as that preference
- selection filters fresh theme candidates to matching FEN turn color
  when possible, but falls back to the full theme pool if the
  color-matched subset is empty
- reinforcement queue picks intentionally ignore the color filter:
  revision stays more important than perspective consistency

#### 3. Adaptive puzzle rating replaces fixed starter targeting

- `CareerManager.training` now persists:
  - `puzzleRating` (initial **500**)
  - `puzzleRatingRd` (initial **300**)
- `PuzzleSystem` adds:
  - `getPuzzleRating()`
  - `getPuzzleRatingRd()`
  - `updatePuzzleRatingAfterAttempt(puzzleDifficulty, success)`
- the active selection window is now dynamic:
  `max(150, round(puzzleRatingRd * 1.2))`
- failures use half-impact rating loss so early mistakes do not crash
  the learner’s curve
- self-training sessions and in-game bonus puzzles now both select
  against this adaptive puzzle rating instead of the player’s chess Elo

#### 4. Starter pool recalibrated again for comfort and side coverage

- `tools/extract_lichess_puzzles.py` now builds **176** puzzles total
- locked mix per theme:
  - **8 puzzles**
  - **5 low (600-999)**
  - **3 mid (1000-1299)**
  - **4 white-to-play / 4 black-to-play**
- puzzles above `1299` are removed from the starter pool
- regenerated `js/puzzle-data.js` verifies every theme at:
  `total=8 low=5 mid=3 white=4 black=4`

#### 5. Debug force-resolution helpers

- new `BonusSystem.debugForcePuzzleSuccess()`
- new `BonusSystem.debugForcePuzzleFailure()`

These are explicitly debug-only and callable from `cl.bonus` in the
devtools console to validate success/failure resolution flows without
solving the puzzle manually.

#### Tests

- `tests/puzzle-system.test.js` expands to cover:
  preferred color filtering, color-filter fallback, initial puzzle
  rating/RD, adaptive rating updates, RD convergence, rating clamps,
  and dynamic-window behavior
- `tests/bonus-system.test.js` stays aligned with the one-button
  inventory model and the new `pickInGamePuzzle(theme, preferredColor)`
  call path
- all **7** suites remain green after the round-two fixes

### E.2 bugfix pass (2026-04-11)

Targeted post-playtest fixes for the first training-bonus release.
No new Phase E scope was added; this pass only corrects inventory UX,
AI-turn button timing, puzzle-banner visibility, and starter-pool
calibration.

#### 1. Training bonus button no longer leaks theme names

- sidebar inventory now shows **one** generic training-bonus button:
  `Training bonus (N)`
- `N` is the total count across all stored training themes
- new `BonusSystem.invokeNextAvailableTrainingBonus()` picks the theme
  with the highest current charge count, breaking ties by
  alphabetical theme key
- the actual theme is now revealed only in puzzle mode
  (banner + outcome card), not in the sidebar button label

#### 2. Bonus button enable race after Maia move fixed

- in `UIManager._triggerAIMove()`, `_aiThinking = false` now happens
  **before** `renderBoard()` and `updateMoveHistory()`
- this fixes the stale disabled-state render where training bonuses
  stayed grayed out until the next player interaction
- regression coverage was added in `tests/bonus-system.test.js`

#### 3. Puzzle banner no longer clips above the board

- `#puzzle-mode-banner` moved from a negatively positioned strip above
  the board to a full-width overlay at the top of `#board-container`
- this keeps the banner fully visible across themes and avoids the
  “small gold fragment” clipping seen in playtest screenshots

#### 4. Starter pool recalibrated for real beginner players

- `tools/extract_lichess_puzzles.py` now enforces the locked beginner
  mix of **3 low / 2 mid / 0 high** per theme
- difficulty bands changed to:
  `600-999`, `1000-1299`, `1300-1499`
- puzzles above `1499` are excluded entirely from the shipped starter pool
- `js/puzzle-data.js` was regenerated from real Lichess data with the new
  bands, keeping **110 total puzzles** and verifying each theme at
  `low=3, mid=2, high=0`

#### Tests

- `tests/bonus-system.test.js` updated for the one-button inventory model
  and the Maia-turn enable-order regression
- `tests/puzzle-system.test.js` updated for the new beginner-weighted
  selection expectations
- all **7** suites remain green after the bugfix pass

### Phase E.2 — In-game training bonus path (2026-04-11)

E.2 turns the Phase E training layer into a live game mechanic:
stored training bonuses can now be invoked during the player's turn,
the real game suspends into puzzle mode, and success grants a short
Stockfish takeover on the real board.

#### `bonus-system.js`

New orchestration module for the in-game bonus flow:

- `init()`
- `getInventory()`
- `canInvokeBonus(theme)`
- `invokeBonus(theme)`
- `isInPuzzleMode()`
- `isPlaybackActive()`
- `getPuzzleState()`
- `onPuzzleClick(square)`
- `resolvePuzzleFailure()`
- `resolvePuzzleSuccess()`
- `getRewardMoveCount(theme)`

Responsibilities are deliberately split:

- `BonusSystem` owns runtime puzzle/playback state and UI coordination
- `PuzzleSystem` remains the only writer to `CareerManager.training`
- `ChessEngine` stays untouched

E.2 also locks the alternating-line Lichess behavior:
opponent replies inside the puzzle solution auto-play on the temporary
board after `PUZZLE_OPPONENT_DELAY_MS = 500`, and a puzzle resolves
only once the **full** solution line has been consumed.

#### `puzzle-system.js` extensions

Two new public methods support in-game invocation without breaking the
training-domain ownership rule:

- `pickInGamePuzzle(theme)`
- `consumeTrainingBonus(theme)`

`pickInGamePuzzle(theme)` is reinforcement-first, falls back to
rating-matched / unseen selection, marks the chosen puzzle as seen,
and persists before returning. `consumeTrainingBonus(theme)` is the
single canonical decrement path for stored training charges.

#### `focus-system.js` playback pause

E.2 adds:

- `pauseForPlayback()`
- `resumeFromPlayback()`

with an internal `_playbackPaused` guard. During post-puzzle Stockfish
playback, Focus mutations short-circuit so no gauge loss, gain, Flow
progression, or other reactive side effects leak through the automated
move sequence.

#### UI and board transformation

The game screen gains a visible training-bonus entry point and a
distinct puzzle presentation without adding a new screen:

- new sidebar panel under Stockfish: `Training bonuses`
- one visible button per stored theme charge, e.g. `Use Fork (2)`
- panel hidden when inventory is empty
- buttons stay visible but disabled when invocation is not legal
- puzzle-mode banner above the board:
  `PUZZLE — [Theme] — Solve to activate`
- outcome card overlay for `1500ms` with locked copy:
  `Puzzle solved! +N Stockfish moves` / `Puzzle failed. No reward.`
- board transformation uses the existing game screen, with puzzle-mode
  styling on the board container rather than a modal or route change

#### `ui-manager.js` integration

`UIManager` now supports a third board source:

- `_pieceSource = 'live' | 'viewPly' | 'puzzle'`

and routes square clicks to `BonusSystem.onPuzzleClick()` whenever
`_puzzleMode` is active. E.2 also adds the thin playback hooks that the
bonus loop needs:

- `enterPuzzleMode()`
- `exitPuzzleMode()`
- `lockInputForPlayback()`
- `unlockInputAfterPlayback()`
- `applyPlaybackMove(move)`
- `triggerAIMoveAndWait()`

#### Tests

- `tests/puzzle-system.test.js` grows from **20** to **22** tests
- new `tests/bonus-system.test.js` adds **19** tests
- coverage includes inventory gating, puzzle-mode entry/exit,
  exact-UCI validation, auto-played opponent replies, single-move
  termination, reward-count computation, playback sequencing,
  game-end exit, Focus pause integration, and `bonus_invoked` /
  `bonus_resolved` payloads
- total suite count rises from **193** to **214**

#### Non-goals preserved

E.2 intentionally does **not** ship:

- Flow bonuses
- coaches or coach quality multipliers
- a coach browser / finance UI
- a separate puzzle screen
- `cancelPuzzle()`
- playback skip / interrupt
- any change to `chess-engine.js`

### Phase E.1 — Puzzle foundation (2026-04-11)

Phase E starts with the non-UI training core: real puzzle data,
player-owned training persistence, self-training sessions, aptitude
growth, and Lucas-Chess-style reinforcement queues.

#### Real Lichess starter pool

- new `tools/extract_lichess_puzzles.py`
- streams the official Lichess puzzle dump (or reads a local CSV / zst)
- filters to the 22 locked Phase E theme keys
- writes `js/puzzle-data.js` as committed static data
- starter pool ships with **110 real puzzles**:
  exactly **5 per theme**, stratified as `2 low / 2 mid / 1 high`
  across the `800-1200`, `1200-1600`, and `1600-2000` bands

#### `puzzle-system.js`

New pure logic module with no DOM:

- `startSelfTrainingSession(theme, options)`
- `submitSessionAnswer(sessionId, solved)`
- `completeSession(sessionId)`
- aptitude getters / bonus-count getters / reinforcement getters

E.1 scope is explicit in code comments and JSDoc:
`submitSessionAnswer` trusts a caller-provided boolean and does **not**
validate chess moves yet. Real move/FEN validation is deferred to E.2.

#### Training persistence

`career-manager.js` gains a new `training` domain with persisted:

- `aptitudes`
- `seenPuzzleIds`
- `reinforcementQueues`
- `trainingBonuses`
- `flowBonus`
- `stats`

Progress is player-owned: changing coach later must not wipe training
progress, seen puzzles, queued revisions, or earned bonuses.

#### Reinforcement and aptitude

- failed puzzles enter a theme-scoped reinforcement queue
- reinforcement puzzles are served before fresh ones
- exit rule is locked at **N = 2**:
  one solve → `pending-confirmation`, second solve in a later session
  removes the puzzle, failure resets it to `active`
- E.1 aptitude formula is:
  `min(100, floor(solvedThemePuzzles * 1.5 + reinforcedResolves * 2))`

#### Tests

- new `tests/puzzle-system.test.js` with **20** tests
- covers theme catalog, seen tracking, reinforcement priority,
  `pending-confirmation`, N=2 exit, session pass/fail rewards,
  aptitude growth/cap, persistence, and the explicit E.1 trust boundary
- total suite count rises from **173** to **193**

#### Non-goals preserved

E.1 intentionally ships **no** coach UI, no in-game bonus invocation,
no Flow integration, no puzzle board mode, and no Stockfish playback.
Those begin in E.2-E.4.

### Feature: Simulate round button (2026-04-11)

Phase D made tournament consequences easier to inspect; this feature
cuts out the remaining grind during the tournament itself. The player
can now skip a round from the in-tournament screen and get an
algorithmic result immediately, which helps both rapid testing and
"filler tournament" pacing in normal play.

#### Tournament logic

- new `TournamentSystem.simulatePlayerRound()`
- player simulations reuse the existing Elo probability model shape
  with a named `SIMULATION_PLAYER_PENALTY = 50` applied to the
  player's effective Elo before the roll
- simulated rounds count as real career games:
  `CareerManager.history.recordGame()` is called, so Elo still moves
- `recordPlayerResult()` now emits `round_played` for every player
  round resolution with `source: 'board' | 'simulated' | 'bye'`

Bye semantics are explicit:

- no Elo roll
- direct `+1`
- no Flow strip / Focus hook
- `round_played.source = 'bye'`

#### Focus interaction

New public `FocusSystem.onRoundSimulated()` strips momentum using the
existing Flow-exit path only:

- `consecutiveGoodMoves = 0`
- `_exitFlow()` removes Flow State
- `current` is left untouched

This keeps Focus logic fully owned by `focus-system.js` and avoids
inventing a second between-round reset rule.

#### UI

The in-tournament "Next round" card now offers two actions:

- `▶ Play round`
- `⏩ Simulate round`

A short non-blocking toast confirms the simulated result (`900ms`,
replacement-friendly) so test loops can click through many rounds
without waiting on an animation stack.

#### Tests

- `tests/tournament-system.test.js` gained simulation coverage:
  progression, emitted payloads, Focus hook, bye behavior,
  finalize-after-sim, and a seeded 200-trial distribution check
- total suite count rises from **164** to **173**

### Phase D.2 — Inbox screen UI (2026-04-11)

Phase D.1 made mails real. Phase D.2 makes them visible with a proper
mail-reader screen instead of keeping them as hidden state.

#### New inbox screen

New `#screen-inbox` in `index.html`, following the existing
`screen-${name}` routing pattern in `ui-career.js`.

Layout:

- fixed `← Back to home` button (same navigation language as lobby)
- centered header: `Inbox` + unread count only (`N unread`)
- two-column reader on desktop:
  - left = mail list
  - right = reading pane
- responsive fallback stacks the columns on narrow screens

The reading pane automatically selects the newest mail when opening
the inbox. Opening a mail marks it as read through `InboxSystem`.

#### Home screen integration

- new primary action button on the home screen:
  `📬 Inbox`
- unread badge rendered inline next to the label
- `UICareer.home.renderInboxBadge()` reads
  `InboxSystem.getUnreadCount()`
- `UICareer.init()` subscribes to `mail_received` and refreshes only
  the badge in place instead of doing a full `home.render()`

If the inbox screen is currently visible when a new mail arrives,
the mail list/pane also re-render immediately.

#### `UICareer.inbox` sub-namespace

Added to `js/ui-career.js` as presentation-only UI:

- `render()`
- `onOpenMail(id)`
- `onBack()`
- private render helpers for the list, pane, and empty states

Canonical state stays in `InboxSystem`; the UI layer only tracks the
currently selected mail id.

#### Typography and styling

The inbox shell stays in `Press Start 2P`, matching the rest of the
career UI:

- header
- mail list rows
- subject line
- from/date labels
- tag pill
- buttons

The **mail body only** switches to `VT323` for readability. This keeps
the retro feel without turning 3-sentence press articles into pixel
soup.

Visual cues:

- unread rows = brighter border / stronger contrast
- read rows = slightly muted
- selected row = gold accent highlight
- tag pill in the reading pane (`press`, `federation`)
- empty state copy:
  `No mail. Play a tournament to see the press react.`

#### Scope intentionally left out

Not shipped in D.2:

- tag filtering
- pagination
- clickable mail actions
- delete / mark-unread UI affordances

`InboxSystem.delete()` and `markUnread()` remain logic-layer APIs, but
the D.2 inbox behaves as a career archive, not a productivity mail
client.

#### Tests

No dedicated `ui-career-inbox` Node test was added. The screen is still
rendered in direct DOM style inside `ui-career.js`, so there is no clean
pure helper worth isolating yet.

Regression baseline remains green:

- 53 calendar
- 26 tournament-data
- 55 tournament-system
- 10 game-events
- 20 inbox-system

Total: **164 tests green**.

---

### Phase D.1 — Inbox data, templates, and event-driven mail generation (2026-04-11)

First real consumer of the D.0 event seam. Inbox mails now exist as
persisted game artifacts in `CareerManager.inbox.mails`, generated by
pure template data plus a DOM-free logic layer.

#### New module — `js/inbox-templates.js`

Pure data dictionary keyed by `templateId`, each entry exposing:

- `from`
- `subject`
- `body`
- `tag`
- optional `actions` (reserved for D.2 UI dispatch, not wired yet)

Phase D.1 ships four baseline templates:

- `press_tournament_win`
- `press_tournament_top3`
- `press_tournament_disappointing`
- `federation_elo_confirmation`

Templates use `{{var}}` substitution markers and stay intentionally
short: headline + compact lede, closer to FM inbox copy than long-form
article prose.

#### New module — `js/inbox-system.js`

Public logic API:

- `InboxSystem.init()`
- `InboxSystem.push(templateId, vars?, options?)`
- `InboxSystem.getAll()`
- `InboxSystem.getById(id)`
- `InboxSystem.getUnreadCount()`
- `InboxSystem.markRead(id)` / `markUnread(id)`
- `InboxSystem.delete(id)`
- `InboxSystem.clear()` (tests only)

Key behaviors:

- `push()` resolves the template, substitutes `{{var}}` markers, and
  persists a mail row shaped as
  `{ id, templateId, date, from, subject, body, read, tag, actions? }`
- missing vars render as `???` instead of throwing
- mail dates use the **in-game calendar date** by default:
  `options.date || CalendarSystem.getDate()`
- `getAll()` sorts newest first with `CalendarSystem.compareDates()`
  and never touches wall-clock `Date()`
- after persisting and saving, `push()` emits
  `GameEvents.EVENTS.MAIL_RECEIVED` with
  `{ mailId, templateId, vars, date, tag }`

#### Event-driven auto-mail

`InboxSystem.init()` wires **two** subscribers to
`GameEvents.EVENTS.TOURNAMENT_FINISHED`:

- one schedules a press mail (win / podium / disappointing result)
- one schedules a federation rating-confirmation mail

Both handlers defer their `push()` call with `queueMicrotask(...)`
instead of emitting during the original handler execution, following
the D.0 "no re-emit inside handlers" discipline rule.

This means every finished tournament now produces two mails without
coupling `tournament-system.js` to `inbox-system.js`.

#### Tournament payload extension

`TournamentSystem.startTournament()` now stores the player's Elo at the
start of the event on the live tournament instance. `finalize()` emits
a richer `tournament_finished` payload:

- previous fields unchanged
- `eloBefore`
- `eloAfter`
- `date` now stored as an in-game `CalendarDate`, not a wall-clock ISO
  timestamp

The standalone tournament-system test harness now injects a `GameEvents`
mock and asserts that the emitted payload includes the Elo fields.

#### Supporting integration

- `CareerManager.inbox.get()` added as the canonical public accessor
  for inbox state
- `index.html` loads `inbox-templates.js` and `inbox-system.js`
- bootstrap now calls `InboxSystem.init()` after `CareerFlow.init()`
  and before `UICareer.init()`

#### Tests

- `tests/inbox-system.test.js` added with **20** tests covering:
  push/persist, in-game date invariant, sorting, read/unread/delete,
  template substitution, missing vars, `MAIL_RECEIVED` emission,
  init guard, and auto-mail generation from `TOURNAMENT_FINISHED`
- `tests/tournament-system.test.js` gains **1** new test for the
  enriched emit payload

Total: **164 tests green** (53 calendar + 26 tournament-data +
55 tournament-system + 10 game-events + 20 inbox-system)

---

### Phase D.0 — Event bus and career flow extraction (2026-04-11)

The review pass run at the end of C.4 confirmed that the seams were
already cracking before Inbox work even started. Two concrete examples
motivated a minimal D.0:

- `UICareer._handleGameEnd` had become a cross-domain orchestrator
  living in a UI module (`_mode = 'free' | 'tournament'`, result
  dispatch, delayed screen transitions)
- `TournamentSystem.finalize()` was one Inbox listener away from
  needing a direct cross-domain coupling (`tournament-system` →
  `inbox-system`) or a worse "UI as orchestrator" workaround

Instead of a larger rewrite, D.0 adds a tiny synchronous event seam
and extracts the game-flow state out of `ui-career.js`.

#### New module — `js/game-events.js`

Minimal synchronous pub/sub bus:

- `GameEvents.on(eventName, handler)` → unsubscribe function
- `GameEvents.off(eventName, handler)`
- `GameEvents.emit(eventName, payload)`
- `GameEvents.clear(eventName?)`

Implementation: one `Map<eventName, Set<handler>>`, synchronous
handler execution in registration order, per-handler `try/catch` so
one bad subscriber does not break the chain.

`GameEvents.EVENTS` is now the source of truth for cross-domain event
names and payload shapes:

- `tournament_finished` — `{ tournamentId, tournamentName, city, country, startDate, rounds, rank, of, score, prize, date }`
- `round_played` — `{ tournamentId, round, opponent, result, score, standings? }`
- `game_ended` — `{ result: 'win'|'draw'|'loss', mode: 'free'|'tournament', opponentId?, opponentElo? }`
- `elo_changed` — `{ before, after, delta, source, opponentElo? }`
- `mail_received` — `{ mailId, templateId, vars?, date? }`

Discipline rule documented at the top of the file:

- handlers must **not** emit a new event during their own execution
  (avoid synchronous reentrancy); defer follow-up emits via
  `queueMicrotask` or `setTimeout(..., 0)`

#### New module — `js/career-flow.js`

Extracts the cross-cutting flow state from `ui-career.js`.

Public API:

- `CareerFlow.init()`
- `CareerFlow.getMode()`
- `CareerFlow.enterTournamentMode()`
- `CareerFlow.exitTournamentMode()`
- `CareerFlow.onGameEnd(result)`

Responsibilities:

- owns the current career mode (`'free' | 'tournament'`)
- manages the `body.in-tournament` class
- subscribes to `tournament_finished` in `init()` and flips mode back
  to `'free'`
- on game end, records the tournament round when relevant, then emits
  `game_ended`; it does **not** render UI

An init guard prevents double subscription.

#### Re-wiring

- `UIManager.onGameEnd` now points to `CareerFlow.onGameEnd`
- `UICareer.init()` now subscribes to:
  - `game_ended` → 1.5 s delayed re-render to tournament or home
  - `tournament_finished` → immediate return to the home screen
- `TournamentSystem.finalize()` keeps its direct finance/history
  writes, then emits `tournament_finished`
- That emit is guarded with `typeof GameEvents !== 'undefined'` so the
  existing standalone Node test harness for `tournament-system.js`
  stays compatible without new dependency injection

#### Tests

- New suite: `tests/game-events.test.js`
- 10 tests covering subscribe/emit, ordering, unsubscribe,
  error-isolation, and `clear(eventName)` / `clear()`
- Total: **143 tests green** (53 calendar + 26 tournament-data +
  54 tournament-system + 10 game-events)

#### Known debt (noted for D.1)

- `career-flow.js` currently reads `UIManager._opponentId` and
  `UIManager._opponentElo` directly; add a public
  `UIManager.getCurrentOpponent()` snapshot API when D.1/D.2 need
  richer payloads
- Both `CareerFlow` and `UICareer` subscribe to `tournament_finished`;
  bootstrap order currently matters because `CareerFlow.init()` must
  run before `UICareer.init()`
- `UICareer.tournament.onFinalize()` still writes the
  `#career-continue-status` line imperatively; acceptable for D.0
  because it is DOM-only, not orchestration

---

### Phase C.4 — Playtest polish (2026-04-11)

Playtest round after C.3b surfaced a real bug and several UX gaps.
This entry bundles all fixes into C.4, plus two new gameplay
intentions documented for later phases.

#### Bug fix — date-scoped duplicate registration

**Report.** Registering the Local Weekend Open for April 11 blocked
all further registrations of the same tournament — even for the May,
June, July… instances — because `canRegister` was keyed on
`tournamentId` alone.

**Fix.**
- `TournamentSystem.canRegister(id, targetDate?)` now takes an
  optional target date. The `already_registered` barrier only fires
  when the exact `(id, date)` pair is already scheduled.
- `_nextStartDate(t, year)` consults `CalendarSystem.getAllEvents()`
  and skips any date already booked for this tournament, so
  `register()` rolls forward to the next free instance automatically.
- `getEligibleInstancesForYear` and `register` both pass the target
  date explicitly when they probe `canRegister`.
- 1 updated test + 1 new test verifying that a second register
  for the same tournament picks the next future instance.

**Tests:** 54 total (was 53), all green.

#### Name pool expansion

**New module `js/name-pools.js`.** Replaces the inline 8-names-per-
country table with 27 countries × ~30 first + ~30 last names each.
Sources: Wikipedia "most common given/surnames in X" lists,
cross-referenced with FIDE ratings for plausibility. The in-module
`NAMES` table in `tournament-system.js` is kept as a hard-coded
fallback so Node tests don't need the extra file. 27 × 900
combinations ≈ 24k unique names available at runtime.

**Unique-name guarantee.** `TournamentSystem.startTournament` now
tracks a `usedNames` Set during field generation and retries up to
12 times per opponent to find a name not already taken. Even a full
Tier 2 9-round tournament (72 players) sees essentially zero
collisions in practice.

#### Tournament screen polish

- **Flags everywhere.** `COUNTRY_FLAGS` table (40 nations) plumbed
  through the standings row, round history row, and new pairings
  panel. Every opponent gets their country flag.
- **Scrollable standings.** The old "… and N more …" cut-off is
  gone. The standings list uses `max-height: 360px; overflow-y: auto`
  with a custom pixel-art scrollbar (WebKit + Firefox) using the
  `--px-*` palette.
- **New pairings panel.** Above the standings, a `Round N pairings`
  section renders every match of the current round as
  `#N | flag White (elo) vs flag Black (elo)`, with the player's row
  highlighted in gold. Also scrollable (`max-height: 320px`).

#### Game screen polish

- **Avatars in the sidebar cards.** The `You` card now shows the
  player's mini pixel avatar (reusing `UICareer.home._renderAvatarInto`)
  + name + Elo. The `Opponent` card shows a big country flag emoji +
  flagged name + Elo. Both cards share the new `.game-id-card` layout
  class.
- **UIManager.setOpponent** accepts a `nationality` field.
  `UICareer.tournament.onPlayRound` passes it through from the current
  pairing. `UIManager._flagFor(code)` maps ISO codes to flag emojis.
- **Move navigation.** New button row under the board:
  `⏮ ◀ [Live | Move N/M] ▶ ⏭`. Implementation:
  - `UIManager._viewPly` is `null` in live mode or an integer ply.
  - `_getPieceAccessor()` returns either `ChessEngine.getPiece` (live)
    or a closure over a fresh `new Chess()` that has replayed the
    SAN history up to `_viewPly` and calls `.get(square)`.
  - View mode disables clicks on squares, hides Stockfish arrows,
    threats, flow highlights, floating eval badges, and the last-move
    highlight.
  - Any new move (player or AI) resets `_viewPly = null` automatically.
  - Zero modification to `chess-engine.js` — the navigation lives
    entirely in `UIManager`.

#### Focus system — one-sided dampening

The Focus gauge used to fill just as fast in a trivially won endgame
(move the king, win the queen) as in a real game. Now it dampens
both gains and penalties when `|cpBefore|` indicates the position is
already decisively one-sided.

- `chess-engine._runFocusEval` passes its computed `cpBefore` to
  `FocusSystem.evaluateMoveDelta(..., cpBefore)`.
- New `oneSided` factor:

  | `|cpBefore|` | Factor |
  |---|---|
  | < 200 | 1.00 |
  | 400 | 0.70 |
  | 600 | 0.45 |
  | 800 | 0.25 |
  | ≥ 900 | 0.20 (floor) |

- Applied multiplicatively to both the gain path
  (`gain * complexity * oneSided`) and the penalty path
  (`rawPenalty * oneSided`). A blunder that only drops you from +800
  to +200 still leaves you winning, so the Focus hit is smaller; a
  great move in a lost position doesn't farm Focus either.

#### Documentation — deferred gameplay ideas

Added to `CLAUDE.md` under **Intentions futures**:

- **Dynamic difficulty scaling (easy/normal/realistic).** Not a flat
  offset. A sigmoid-style dampening of the Elo gap that scales the
  opponent's effective Elo down more when the gap is big, less when
  the player is close. Formula:
  ```
  effectiveOppElo = playerElo + gap * factor
  factor = { easy: 0.40, normal: 0.65, realistic: 1.00 }[difficulty]
  ```
  Never helps against opponents at or below the player's Elo.
  Displayed Elo in UI/standings/barriers/prize math stays on the
  catalogue value. Point of integration:
  `UIManager._triggerAIMove`.

- **Form rating / coached-form** (Phase E+). The user wanted dynamic
  opponent Elo based on coaching progress. Replaced by a cleaner
  hidden "form" stat on the player side that modifies the Focus
  system, mathematically equivalent but easier to explain and debug.

#### Files touched

- `js/calendar-system.js` — `getAllEvents()` (ship in C.3b) now used
  to skip booked dates in `_nextStartDate`.
- `js/tournament-system.js` — date-scoped `canRegister`, `register`
  reshuffle, unique-name guarantee in `startTournament`, prefers
  `NamePools` when loaded.
- `js/name-pools.js` — **new**, 27 countries × ~30×30 names.
- `js/chess-engine.js` — passes `cpBefore` to
  `FocusSystem.evaluateMoveDelta`.
- `js/focus-system.js` — `oneSided` factor in the scoring branch.
- `js/ui-manager.js` — `_opponentNationality`, `_viewPly`,
  `_getPieceAccessor`, `_updateNavUI`, `_goToPly`, `_navStart`/
  `_navPrev`/`_navNext`/`_navLive`, `_flagFor`, avatar + flag
  rendering in the game sidebar, button bindings for the nav row.
- `js/ui-career.js` — `COUNTRY_FLAGS` plumbed into standings, history,
  and pairings rendering; new `_renderPairings` sub-renderer; standings
  no longer cuts off.
- `index.html` — pairings panel markup, nav button row, reshaped
  player/opponent card slots, `name-pools.js` script tag.
- `css/career.css` — `.t-pairings` and `.t-pairing-row` styles;
  standings scrollbar.
- `css/ui.css` — `.game-id-card`, `.game-id-avatar`, `.game-id-name`,
  `.board-nav-btn`, `.board-nav-label` styles.
- `tests/tournament-system.test.js` — test rewrites for the
  date-scoped check; 54 tests total.
- `CLAUDE.md` — dynamic difficulty section + form rating section in
  "Intentions futures".

**Tests:** 54 tournament-system + 53 calendar + 26 tournament-data =
**133 total, all green.**

---

### Phase C.3b — In-tournament screen + duplicate-register fix (2026-04-10)

Replaces the Phase C.3a auto-play stub with a real in-tournament
screen. The player now plays each round on the existing chess board
inside a tournament context, with standings and round history
updating live between rounds.

#### Bug fix — duplicate tournament registration

**Report.** The lobby let the player register multiple times for the
same tournament, double-charging the entry fee and polluting the
calendar with duplicate events.

**Fix.**
- `CalendarSystem.getAllEvents()` — new public accessor returning a
  shallow copy of the event queue.
- `TournamentSystem.canRegister()` — new hard barrier
  `'already_registered'`, triggered when either:
  1. Any event in the calendar queue is a `tournament_start` for this
     tournament id, OR
  2. `CareerManager.calendar.currentTournament.tournamentId` matches
     (player is mid-tournament for this event)
- `TournamentSystem.register()` still runs `canRegister` first, so
  blocked registrations never touch finances. A regression test
  explicitly verifies "second register does not double-charge".
- `REASON_LABELS` in ui-career gains `already_registered → "Already
  registered"` for display on locked cards.

**4 new tests** bring the suite to **53** for tournament-system.

#### In-tournament screen

**New screen `#screen-tournament`** with four panels:

- **Header** — tournament name + location (flag), current round
  (`R/N`), player score, rank inside the field.
- **Next round card** (green border) — player vs opponent pairing
  display with color indicator (W/B/BYE), elos, and a big green
  `▶ Play round` button. Byes show a distinct `▶ Take the bye (+1)`
  button that skips the chess board entirely.
- **Finished panel** (gold border, hidden until the last round) —
  "You finished Nth of M with a score of X" + prize display + a
  `Finalize & return home ↩` button.
- **Standings** — top 10 rows with the player highlighted in gold.
  If the player is outside the top 10, their row is appended at the
  bottom with a `… and N more …` separator.
- **Round history** — per-round line: `R1`, opponent name + Elo,
  result in chess notation (`1 - 0`, `½ - ½`, `0 - 1`, `+1` for a
  bye), color-coded green / grey / red / accent.

**`UICareer.tournament` sub-namespace.**

```text
UICareer.tournament.render()            // full refresh
UICareer.tournament.onPlayRound()       // Play button handler
UICareer.tournament.onFinalize()        // Finalize button handler
(plus private _renderHeader, _renderStandings, _renderHistory,
 _showNextRound, _showFinishedPanel, _appendStandingRow)
```

`render()` picks between `_showNextRound` and `_showFinishedPanel`
depending on `TournamentSystem.isFinished()`.

#### Integration with the chess board

**Mode flag.** `UICareer` now tracks a `_mode` variable
(`'free' | 'tournament'`) and mirrors it on the body element via
`document.body.classList.toggle('in-tournament')`.

**Game end dispatch.** `UICareer.init()` wires
`UIManager.onGameEnd = _handleGameEnd` once. `_handleGameEnd(result)`
dispatches on `_mode`:

- `'free'` → classic 1.5 s delay then return to home (unchanged).
- `'tournament'` → map `win/draw/loss` to `1/0.5/0`, call
  `TournamentSystem.recordPlayerResult(score)`, then 1.5 s delay
  before switching back to `screen-tournament` and re-rendering.

**Play round handler.** `UICareer.tournament.onPlayRound()`:

1. Reads the current pairing via `TournamentSystem.getCurrentPlayerPairing()`
2. If `color === 'bye'`: calls `recordPlayerResult(1)` directly and
   re-renders (no chess board).
3. Otherwise: `UIManager.setOpponent(pairing.opponent)`, switches to
   `screen-game`, calls `UIManager.newGame(pairing.color)`.

**Finalize handler.** `UICareer.tournament.onFinalize()`:

1. Calls `TournamentSystem.finalize()` — pays prize, records history,
   advances calendar, transitions back to idle.
2. Switches back to `'free'` mode and the home screen.
3. Writes a summary line in the home `#career-continue-status` element:
   `Tournament: <rank>/<of> · score X · prize $Y`

#### Mid-tournament escape guards

When `_mode === 'tournament'`, body gets the `in-tournament` class.
CSS hides two affordances that would otherwise abandon a round:

- `#btn-new-game` (the sidebar "New game" button on the chess screen)
- `#btn-back-home` (the "← Back to home" overlay)

Both return naturally when `onFinalize()` switches back to free mode.

#### Resume on reload

The bootstrap now checks `CalendarSystem.isInTournament()` and, if
true, jumps straight to `screen-tournament` instead of the home
screen. Closing the tab mid-tournament is safe: the live instance
lives in `CareerManager.calendar.currentTournament` and is persisted
via `CareerManager.save()` after every round.

#### Auto-play removed

`home._autoPlayTournament` is gone. Replaced by `home._enterTournament`
which calls `TournamentSystem.startTournament`, flips the mode, and
shows the tournament screen. The old method and its sound/status
plumbing are deleted.

#### Files touched

- `js/calendar-system.js` — `getAllEvents()` added.
- `js/tournament-system.js` — `canRegister()` picks up the
  `already_registered` check.
- `tests/tournament-system.test.js` — mock gains `getAllEvents`;
  four new duplicate-register tests. **53 total, all green.**
- `index.html` — `#screen-tournament` markup (~70 lines).
- `css/career.css` — `In-tournament screen` section (~240 lines):
  header, next round card, finished panel, standings, history,
  body-class escape guards.
- `js/ui-career.js` — screen router gains `'tournament'`; `_mode`
  variable + `_setMode` helper; `tournament` sub-namespace
  (~220 lines); `_handleGameEnd` dispatcher; `_enterTournament`
  replaces `_autoPlayTournament`; `REASON_LABELS.already_registered`;
  bootstrap wires `UIManager.onGameEnd` in `init()`.
- `js/ui-manager.js` — bootstrap no longer sets `onGameEnd` directly
  (UICareer owns that now); resume-in-tournament branch added.
- `CLAUDE.md` — "Intentions futures" section added noting the
  mail/coach registration paths; `register(id, year, { source, … })`
  shape sketched for Phase D/E; Phase C.3a marked as superseded by
  C.3b in the roadmap.

#### How to test end-to-end

1. Reset career: `localStorage.removeItem('chess_life_career_v2'); location.reload();`
2. Create a character.
3. Home → `🏆 Browse tournaments` → register for the `Local Weekend
   Open`. The `Register` button flips to `🔒 Already registered` on
   re-click — bug fix verified.
4. Back to home. The next date has a red dot on the calendar.
5. Click `Continue ▶` until the tournament date. Modal opens with
   tournament-specific copy. Click OK.
6. You're now on `#screen-tournament`. Header shows Round 1/5,
   score 0, rank in the middle of the field. Next round card shows
   your opponent (name, flag, Elo) and your color.
7. Click `▶ Play round`. Chess board opens. Play the game against
   Maia (adversary elo ∈ tournament's window).
8. On game end, you return to the tournament screen after 1.5 s.
   Header updated, new pairing shown, round 2/5. History list has
   a row for round 1.
9. Repeat rounds 2→5. The system simulates every NPC vs NPC game in
   the same round with the Elo model, so your standings move naturally.
10. After round 5, the Finished panel replaces the Next round card.
    Click `Finalize & return home`.
11. Home re-renders. `cl.state.history.tournaments` has a summary
    row. Prize (if any) added to money. Calendar advanced by
    `daysDuration` days. The `#career-continue-status` line under
    the Continue button shows the outcome.
12. Return to Browse tournaments — the Local Weekend Open is now
    re-registerable (you've finished it).

**Tests (no regression).** 53 tournament-system · 53 calendar
· 26 tournament-data = **132 tests, all green.** Run each with
`node tests/<file>.test.js`.

---

### Phase C.3a — Tournament lobby UI (2026-04-10)

First UI integration of Phase C: a dedicated lobby screen where the
player browses upcoming tournaments, sees their eligibility verdict,
and registers for events. Plus a temporary auto-play hook on the
existing event prompt so the player can experience the full register
→ calendar → event → result → prize loop without waiting for the
in-tournament screen (which lands in C.3b).

**New screen: `#screen-lobby`.**

- Full-page list with a fixed back-to-home button (top-left).
- Title, summary line (`Year YYYY — N events · You: Elo X · $Y`),
  inline status banner for register feedback.
- Cards laid out in a responsive grid (`auto-fill, minmax(280px, 1fr)`).
- Empty state for years with no upcoming events.

**Tournament card.** Each card displays:

- Tier badge (`Tier 1` green / `Tier 2` blue) and start date in the top row
- Tournament name in the accent color
- City + country with the country flag emoji (40 nations covered)
- One-line italic description from the catalogue
- Stats row: rounds · days · Elo window
- Finance row: entry fee + total prize pool
- Eligibility status:
  - **Green border + Register button** when fully eligible
  - **Gold border + ⚠ Below your level + Register button** when the
    soft warning fires but registration is still allowed
  - **Red border + 🔒 reason + disabled Locked button** when blocked
    by `elo_too_low` or `cant_afford`

Reasons are translated from the C.2a verdict codes via a small
`REASON_LABELS` table.

**`UICareer.lobby` sub-namespace.**

```text
UICareer.lobby.render()                        // refresh from current state
UICareer.lobby._buildCard(item)                // (private) build one card
UICareer.lobby.onRegisterClick(id, date)       // calls TournamentSystem.register
UICareer.lobby._showStatus(msg, isError?)      // 4-second flash banner
```

`render()` calls `TournamentSystem.getEligibleInstancesForYear(today.year)`
and rebuilds every card. After a successful register, the lobby
re-renders so the new event's button switches to "Locked" if the
fee dropped the player below another tournament's threshold (and the
new event also appears in the home calendar grid as a red dot).

**Sound feedback.**
- Browse tournaments → `playSFActivate()`
- Register success → `playGoodMove(2)`
- Register failure → `playBlunder()`
- Lobby back → `playMove()`

**Home screen integration.**

- New `#btn-browse-tournaments` primary action button between the
  upcoming events list and the dev row, styled as a gold accent
  button. Above the placeholder dev buttons.
- The dev row keeps `Play test game` and `Reset career` for now —
  they'll shrink as Phase C/D/E ship real features.

**Event prompt — tournament_start specialization.**

- The event prompt body now reads tournament-specific copy when
  the event type is `tournament_start`: rounds, city, country,
  duration, plus a note that C.3b will replace the auto-play with
  interactive board play.

**C.3a temporary auto-play (`_autoPlayTournament`).**

When the player dismisses a `tournament_start` event:

1. `TournamentSystem.startTournament(payload)` builds the field
2. The system runs `recordPlayerResult` for every round with a
   random outcome (0/0.5/1)
3. `TournamentSystem.finalize()` pays the prize and records history
4. The home `#career-continue-status` line shows the result:
   `<TournamentName>: <rank>/<of> · score X · prize $Y`
5. Sound: `playVictory` if there's a prize, otherwise `playFlowExit`

**This is a temporary path.** It exists so the user has a complete
end-to-end loop in C.3a without waiting for C.3b. C.3b replaces it
with a real in-tournament screen wired to the chess board, where
each round is played interactively with `UIManager.onGameEnd` →
`recordPlayerResult`.

**Files touched.**
- `index.html` — `#screen-lobby` markup, `#btn-browse-tournaments`
  primary action button, `.career-primary-row` container.
- `css/career.css` — `.career-primary-row` / `.career-primary-btn`
  styles + a full "Tournament lobby screen" section (~200 new lines):
  layout, status banner, cards grid, card details, eligibility states.
- `js/ui-career.js` — `'lobby'` added to `SCREENS`, full
  `UICareer.lobby` sub-namespace (render + _buildCard +
  onRegisterClick + _showStatus), `COUNTRY_FLAGS` and
  `REASON_LABELS` tables, button bindings for browse / lobby back,
  `home._openEventPrompt` shows tournament-specific copy,
  `home.onEventDismiss` calls `_autoPlayTournament` for tournament
  events, `_autoPlayTournament` helper.
- `CLAUDE.md` — Phase C.3a marked ✅; C.3b sub-task explicit.

**How to test (full C.3a → C.2 loop).**

1. Reset career: `localStorage.removeItem('chess_life_career_v2'); location.reload();`
2. Create a character (any nationality)
3. Click `🏆 Browse tournaments` on the home screen
4. Browse the cards. Note that:
   - All Tier 1 events are eligible (you're at 800 Elo, fee small)
   - Most Tier 2 events are red (Elo too low)
5. Click `Register` on a Tier 1 event (e.g. Local Weekend Open)
6. Status banner: `Registered for the 2026 edition.`
7. Money decreased by entry fee
8. Click `← Back to home`
9. The next instance of that tournament is now a red dot on the
   calendar grid + a row in upcoming events
10. Click `Continue ▶` repeatedly until the calendar reaches the
    tournament date → modal `event_prompt` opens with tournament copy
11. Click `OK` → auto-play kicks in: tournament played, prize paid,
    calendar advances by `daysDuration`, home re-renders, the
    continue-status line shows `<name>: <rank>/<of> · score X · prize $Y`
12. Check `cl.state.history.tournaments` in the console to see the
    summary row

---

### Phase C.2b — Tournament run loop: pairings, simulation, payouts (2026-04-10)

Third slice of Phase C: turns a registered tournament into a playable
multi-round event with simulated NPC results, persistent state across
the rounds, prize payouts, and history records. The actual board UI
integration (the player playing each round on the existing chess
board) lands in C.3 — this slice provides the API.

**New schema slot.** `CareerManager.calendar.currentTournament` —
nullable; holds the live in-tournament state when the calendar phase
is `in_tournament`. Defensive migration in `_fillDefaults` ensures
older saves get the slot on init.

**`tournament-system.js` extensions.**

- **`startTournament(eventPayload)`.** Called when the player
  consumes a `tournament_start` calendar event (the wiring lives in
  C.3). Builds the field — the player at index 0 plus
  `max(8, rounds × 8)` opponents generated via the C.2a
  `generateOpponent` (so a 5-round event has 40 players, a 9-round
  event 72). Pairs round 1, sets `calendar.phase = 'in_tournament'`,
  persists, and returns the live instance.

- **`getCurrentInstance()`.** Returns
  `CareerManager.calendar.currentTournament` (or `null`).

- **`getCurrentPlayerPairing()`.** Returns
  `{ opponent, color: 'w'|'b'|'bye' }` for the player's pairing in
  the current round, or `null` if no tournament is in progress.

- **`recordPlayerResult(score)`.** `score ∈ {0, 0.5, 1}` from the
  player's perspective. The system applies the player's result, then
  walks every other pairing in the round and **simulates NPC vs NPC**
  with an Elo-based probability model:
  - `E = 1 / (1 + 10 ** ((eloB - eloA) / 400))`
  - 30% flat draw rate (chess Swiss baseline)
  - Otherwise winner is sampled by `r < E`

  Scores and `opponentsFaced` lists are updated for everyone, the
  round is appended to `instance.history`, and the next round's
  pairings are computed (or `null` when finished). Throws on an
  invalid score.

- **`isFinished()`.** True when `currentRound > rounds`.

- **`getStandings()`.** Returns the field sorted by `score` desc,
  then by `elo` desc as a simple tiebreak. Each entry gets a
  `rank` field (1-based).

- **`finalize()`.** Throws if the tournament isn't finished.
  Otherwise:
  1. Computes the player's final rank from `getStandings()`
  2. Pays `tournament.prizes[rank - 1]` to the player via
     `CareerManager.finances.addIncome()` (zero if outside the
     paying ranks — no penalty)
  3. Pushes a summary into `CareerManager.history.tournaments`:
     `{ tournamentId, tournamentName, city, country, startDate,
        rounds, rank, of, score, prize, date }`
  4. Advances the calendar by `daysDuration` days via
     `CalendarSystem.addDays`
  5. Resets `phase = 'idle'`, clears `currentTournament` and
     `currentEvent`, persists
  6. Returns `{ rank, score, prize, of }`

**Simplified Swiss pairings (`_pairRound`).** Monrad-style minimal:

1. Sort the field by score desc, then by Elo desc
2. Iterate top-to-bottom; for each unpaired player, find the next
   unpaired player they have not faced and pair them
3. If everyone left has been faced (small fields, late rounds), accept
   a rematch with the closest unpaired player to keep the round
   running
4. Last unpaired player (odd field) gets a **bye** = 1 point gift,
   no opponent recorded
5. Color assignment alternates by pairing index for variety
   (full color balancing across rounds is deferred — see
   "future refactors" below)

**Tests.** 22 new C.2b tests bring the suite to **49 total**, all
green. New coverage:
- field size invariants for short and long tournaments
- player at field[0] with the right Elo
- calendar phase transition on start
- round 1 pairings: full coverage, exact partition, player in
  exactly one pairing
- `getCurrentPlayerPairing` shape and null safety
- score accumulation across multiple rounds
- `opponentsFaced` tracking
- full tournament loop reaches `isFinished() === true`
- player faces ≥4 unique opponents over 5 rounds
- invalid score throws
- standings sort order and rank labelling
- `finalize` rejects unfinished tournaments
- `finalize` pays the prize bucket for the player's rank
- `finalize` records a row in history
- `finalize` advances the calendar by `daysDuration`
- `finalize` returns to idle and clears `currentTournament`
- `finalize` works on a Tier 2 (Cappelle, 9 rounds) tournament

Run with `node tests/tournament-system.test.js`.

**Out of scope (kept for later).**
- Color balancing across rounds (current alternation is
  pairing-index-based, not history-aware)
- Buchholz / Sonneborn-Berger tiebreaks (current tiebreak is Elo)
- Player fatigue or focus drain across long Swiss events
- Reading the actual chess board result from `UIManager.onGameEnd`
  — happens in C.3 when the in-tournament screen wires up

**Files touched.**
- `js/career-manager.js` — `currentTournament: null` added to the
  default `calendar` block; `_fillDefaults` defensively backfills it
  on older saves.
- `js/tournament-system.js` — extended with the C.2b API
  (~330 new lines: pairing helper, NPC simulation, run loop,
  finalize, history glue). Module is now ~700 lines total — still
  comfortable in one file.
- `tests/tournament-system.test.js` — 22 new tests, mock surface
  expanded to cover `CareerManager.calendar`, `CareerManager.history`,
  `addIncome`, and `CalendarSystem.addDays`.
- `CLAUDE.md` — Phase C.2b marked ✅; pointer to color-balancing
  refactor noted in the deferred section.

**Try it in the console** (after creating a character):
```js
// Register and trigger continue to reach the tournament_start event
cl.tournamentSystem.register('local_weekend_open', 2026)
cl.calendar.continue()              // → stoppedBy: 'event'
cl.calendar.getCurrentEvent()        // → the tournament_start event

// Simulate consuming the event (C.3 will wire this in via UI)
const ev = cl.calendar.getCurrentEvent()
cl.tournamentSystem.startTournament(ev.payload)
cl.tournamentSystem.getCurrentPlayerPairing()
// → { opponent: { name, elo, ... }, color: 'w' }

// Play the rounds (random outcomes for the test)
for (let i = 0; i < 5; i++) {
  cl.tournamentSystem.recordPlayerResult([0, 0.5, 1][Math.floor(Math.random()*3)])
}
cl.tournamentSystem.isFinished()     // → true
cl.tournamentSystem.getStandings().slice(0, 5)
cl.tournamentSystem.finalize()        // → { rank, score, prize, of }
cl.state.history.tournaments         // → [{...the played tournament...}]
cl.state.calendar.phase              // → 'idle'
```

---

### Phase C.2a — Tournament system: registration and lobby data (2026-04-10)

Second slice of Phase C: the orchestration layer that turns the
static catalogue into actionable in-game tournaments. Phase C.2a
delivers everything *up to* the player entering a tournament — home
template resolution, opponent generation, registration with money
and Elo barriers, and lobby data preparation. The actual round play
(Swiss pairings, run loop, payouts) lands in C.2b.

**New module: `js/tournament-system.js`.**

- **Home city resolution.** Static `HOME_CITIES` table maps every
  ISO country code from the character creator to a default home
  city (NO → Oslo, FR → Paris, US → New York, JP → Tokyo, …).
  `resolve(tournamentId)` reads the player's nationality and fills
  in city + country for `home: true` templates. Fixed-location
  tournaments are returned unchanged.

- **Opponent name pool.** Hand-curated `NAMES` dictionary with ~8
  first names + 8 last names per country for 20 chess nations
  (FR, GB, EN, US, DE, NL, RU, IN, CN, ES, PL, UA, AM, AZ, CZ, HU,
  SE, DK, IT, NO). Generic `NAMES_FALLBACK` for unknown countries.
  Real-feeling names beat generic placeholders.

- **`generateOpponent(tournament, hostCountry)`.** Returns
  `{ id, name, elo, nationality }`. Tier 1 home events draw 90% of
  opponents from the host country and 10% international visitors;
  Tier 2 international opens use 60/40. Elo is uniform within
  `[eloMin, eloMax]`, biased toward the middle of the window.

- **`canRegister(id)` — entry barriers.** Returns
  `{ ok, reasons, warnings }`.
  - **Hard barriers** (block registration):
    - `'unknown_tournament'` — id not in catalogue
    - `'elo_too_low'`        — `playerElo < tournament.eloMin`
    - `'cant_afford'`        — `playerMoney < tournament.entryFee`
  - **Soft warning** (does not block):
    - `'below_your_level'`   — `playerElo > tournament.eloMax`

  This is the answer to "we don't want the player to access the
  best tournaments right away": the data already encoded
  `eloMin` and `entryFee`; this function enforces them at
  registration time.

- **`register(id, year)`.**
  - Calls `canRegister`. If blocked, returns
    `{ ok: false, error: '<reason>' }` and does NOT touch finances.
  - Otherwise finds the next future start date for this tournament
    in `year`, deducts the entry fee via
    `CareerManager.finances.addExpense`, and schedules a single
    `tournament_start` calendar event with full instance metadata
    in the payload (`tournamentId`, resolved `city`/`country`,
    `year`, `isHome`, `rounds`, `duration`).
  - Returns `{ ok: true, eventId }` on success, or
    `{ ok: false, error }` on failure (`'no_future_instance_this_year'`,
    `'cant_afford'`, etc.).
  - **Single calendar event per tournament.** A 9-round tournament
    that spans 9 days does not produce 9 events. The player consumes
    one `tournament_start` event, the run loop in C.2b plays every
    round back-to-back, and the calendar advances `daysDuration`
    days at the end. Avoids cluttering the calendar with per-round
    markers.

- **`getEligibleInstancesForYear(year)`.** Builds the lobby view —
  every tournament instance from today onwards in the given year,
  each annotated with the resolved tournament metadata and a fresh
  `canRegister` verdict. The home Tier 1 templates always surface
  regardless of player nationality (they're resolved against the
  current player).

**Tests (`tests/tournament-system.test.js`).** 27 tests, all green.
The harness loads `tournament-data.js` for real and mocks the small
surfaces of `CareerManager` (player + finances) and `CalendarSystem`
(getDate, compareDates, scheduleEvent).

Coverage:
- home resolution: NO → Oslo, FR → Paris, ZZ → Hometown fallback
- non-home tournaments leave city/country untouched
- opponent generation: required fields, Elo within range, name shape,
  fallback safety
- canRegister: unknown id, success path, both hard barriers in
  isolation and combined, soft warning, low-elo home reachability
- register: deducts on success, leaves finances untouched on failure,
  resolves city in payload, picks next valid date when current month
  is past, errors when no future instance in the requested year
- lobby (`getEligibleInstancesForYear`): no past dates leak,
  shape integrity, home instances always surface for any nationality
  (NO/JP/BR/IR/AU/ZZ)

Run with `node tests/tournament-system.test.js`.

**Files touched.**
- New: `js/tournament-system.js` (~360 lines: ~80 data, ~80 helpers,
  ~200 public API).
- New: `tests/tournament-system.test.js` (27 tests).
- `index.html` — `<script>` for `tournament-system.js` after
  `tournament-data.js`, before `avatar-data.js`.
- `CLAUDE.md` — Phase C.2a marked ✅.

`window.cl.tournamentSystem` debug shortcut added.

**Try it in the console** (after creating a character):
```js
cl.tournamentSystem.resolve('local_weekend_open')
// → { ..., city: 'Oslo', country: 'NO', home: true }  (for a Norwegian)

cl.tournamentSystem.canRegister('cappelle')
// → { ok: false, reasons: ['elo_too_low'], warnings: [] }  (at 800 Elo)

cl.tournamentSystem.canRegister('local_weekend_open')
// → { ok: true, reasons: [], warnings: [] }

cl.tournamentSystem.register('local_weekend_open', 2026)
// → { ok: true, eventId: 'ev_xxx' }
//   then check: cl.calendar.getUpcomingEvents()

cl.tournamentSystem.getEligibleInstancesForYear(2026).length
// → ~30+ depending on what's still in the future
```

---

### Phase C.1 — Tournament catalogue (2026-04-10)

First slice of Phase C: a static, pure-data catalogue of real and
fictional chess tournaments at Tier 1 (local amateur) and Tier 2
(national / entry-level international). No tournament logic yet —
that lands in C.2 (`tournament-system.js`).

**New module: `js/tournament-data.js`.**

Catalogue holds **24 tournaments** — 6 universal Tier 1 templates
plus 18 real Tier 2 tournaments across 11 countries. Inspired by the
real annual chess calendar (data sourced from FIDE, the chess
festival sites, and the Continental Chess Association in the US).

- **Tier 1 — universal "home country" templates (6 tournaments)**

  These ALWAYS appear in the player's calendar regardless of which
  nationality they picked at character creation. The
  tournament-system (C.2) localizes the city/country at instance
  time using the player's home country, so a Norwegian player gets
  the same six events scheduled "at home" in Oslo, an American gets
  them in their home city, etc.

  | Template | Frequency | Elo | Rounds | Days | Fee |
  |---|---|---|---|---|---|
  | Local Weekend Open      | 12×/year | 0-1400  | 5 | 2 | 10 |
  | Sunday Rapid            | 10×/year | 0-1300  | 7 | 1 |  8 |
  | New Year Open           | annual (Jan 4)  | 0-1500  | 6 | 3 | 18 |
  | Summer Holiday Open     | annual (Jul 22) | 0-1500  | 7 | 5 | 20 |
  | Autumn Classic          | annual (Oct 17) | 0-1400  | 6 | 2 | 15 |
  | Regional Championship   | annual (Nov 21) | 1000-1600 | 7 | 4 | 25 |

  Schema flag: `home: true`, with `city: null` and `country: null`.

- **Tier 2 — real national / international amateur opens (18 tournaments)**

  Real-world tournaments at fixed locations and historical annual dates.
  Plausible Elo windows and prize pools based on each event's actual size.

  | Tournament | Country | Month | Rounds | Source |
  |---|---|---|---|---|
  | Tata Steel Tienkampen          | NL | Jan 23  | 9  | tatasteelchess.com |
  | Moscow Open                    | RU | Jan 28  | 9  | FIDE calendar |
  | Cappelle-la-Grande Open        | FR | Feb 18  | 9  | annual since 1985 |
  | Prague Challengers Open        | CZ | Feb 25  | 9  | Prague Chess Festival |
  | Atlantic City Open             | US | Mar 27  | 7  | Continental Chess Association |
  | Grenke Chess Open              | DE | Apr 2   | 9  | Easter weekend, Karlsruhe |
  | World Open (Under 1600)        | US | Jun 30  | 9  | World Open, Philadelphia |
  | Czech Open                     | CZ | Jul 17  | 9  | Pardubice multi-section festival |
  | Biel Amateur Tournament        | CH | Jul 18  | 7  | Biel International Chess Festival |
  | Andorra Open                   | AD | Jul 19  | 9  | Escaldes-Engordany |
  | Vienna Open                    | AT | Jul 21  | 9  | Vienna Chess Festival |
  | Politiken Cup                  | DK | Jul 26  | 10 | Helsingør Konventum |
  | British Major Open             | GB | Jul 28  | 9  | British Chess Championship |
  | Continental Open               | US | Aug 12  | 7  | Sturbridge MA |
  | Avignon International Open     | FR | Aug 17  | 9  | Provençal late-summer open |
  | French Amateur Championship    | FR | Aug 22  | 9  | Vichy national title |
  | North American Open            | US | Dec 26  | 7  | Las Vegas, US Chess Grand Prix |
  | Hastings Challengers           | GB | Dec 28  | 9  | running since 1895 |

**Schema (per tournament).**
```text
id, name, city, country (ISO), tier,
eloMin, eloMax,        // soft cap — beyond eloMax the field is too weak
rounds, pairingSystem, // 'swiss' is the only system supported in C
daysDuration,          // total span in calendar days
entryFee,              // money charged at registration
prizes,                // array of payouts by final rank (index 0 = first)
annualDates,           // [{ month, day }, ...] — every START date in a year
description            // one-liner shown in the lobby
```

**Public API.**
```text
TournamentData.getAll()                          → live array (do not mutate)
TournamentData.getById(id)                       → object | null
TournamentData.getByTier(tier)                   → object[]
TournamentData.getHomeTemplates()                → object[] (Tier 1 universal)
TournamentData.getFixedLocationTournaments()     → object[] (Tier 2 real-world)
TournamentData.getEligible(playerElo)            → object[] within [eloMin, eloMax]
TournamentData.getPrizePool(id)                  → sum of every payout
TournamentData.getInstancesForYear(year)         → sorted [{ tournamentId, date }, ...]
TournamentData.getCount()                        → number
```

`getInstancesForYear` is the key function for Phase C.2 — it expands
every tournament's `annualDates` into concrete CalendarDate instances
for a given year, sorted ascending. The tournament system will call
this when populating the calendar at the start of every game year.

**Tests (`tests/tournament-data.test.js`).** 26 tests, all green.
Coverage:
- catalogue integrity (required fields, unique ids, valid tier)
- home flag invariants: every Tier 1 must be a home template,
  no Tier 2 can be a home template, getHomeTemplates and
  getFixedLocationTournaments partition the catalogue
- city/country validation: required strings unless home === true,
  in which case both must be `null`
- monotone descending prizes (rank 1 ≥ rank 2 ≥ … rank N)
- valid month/day across every annual date
- positive rounds / daysDuration / entryFee
- lookups by id and tier (including unknown id)
- eligibility windows for elo 800 / 1500 / 2500
- prize pool sums
- per-year instance generation: sortedness, year correctness,
  monthly count (12 entries for Local Weekend Open), total instance count

Run with `node tests/tournament-data.test.js`.

**Files touched.**
- New: `js/tournament-data.js` (~250 lines, mostly data).
- New: `tests/tournament-data.test.js` (22 tests).
- `index.html` — `<script>` for `tournament-data.js` after
  `calendar-system.js`, before `avatar-data.js`.
- `CLAUDE.md` — Phase C.1 marked ✅; C.2/C.3/C.4 sub-tasks listed.

`window.cl.tournaments` debug shortcut added.

---

### Phase B.6 — Phase B polish (2026-04-10)

Final pass on the Phase B career loop. No new modules — small polish
across the home screen, character creator, and event prompt. Phase B
is now feature-complete: a player can be created, the calendar can
be advanced, events can be scheduled and resolved, and the chess
engine remains accessible via the test game button.

**Home header — Focus stat.**
- New `#career-focus` slot between Elo and Money. Reads
  `CareerManager.focus.get().current` and shows it as a percentage.
- Reflects the persisted between-game focus level (which gets the
  +40% recovery applied at the start of each game by FocusSystem
  itself, so the home value is the "rest level" before next game).

**Home header — country flag.**
- The meta line now shows the full country with its flag emoji
  (`🇫🇷 France`) instead of the bare ISO code (`FR`). Lookup goes
  through `CharacterCreator.COUNTRIES`.

**Calendar header — day of week.**
- The "Today: …" line is now `Today: Friday, April 10, 2026` (added
  the day-of-week prefix via `CalendarSystem.getDayOfWeekName`).

**Continue button — feedback.**
- Brief 200 ms disable after each click so a double-click can't
  queue two advances.
- New `#career-continue-status` line under the button.
  - When `continue()` returns `stoppedBy: 'event'`: cleared.
  - When `continue()` returns `stoppedBy: 'limit'` (the empty-queue
    case that's the only path until Phase C ships tournaments): shows
    `No events scheduled — skipped 365 days.` in the accent color.

**Sound hooks (via SoundManager).**
- Continue button click → `playMove()` (subtle wood click)
- Event prompt open → `playSFActivate()` (electronic notification)
- Event prompt dismiss → `playMove()`
- Back to home button → `playMove()`
- Reset career (confirmed) → `playBlunder()` (descending warning)
- Character creator: Start career → `playFlowEnter(2)` (rising
  arpeggio fanfare)
- Character creator: Randomize → `playMove()`
- Character creator: empty-name validation error → `playBlunder()`

All sounds reuse existing `SoundManager` functions; no new
synthesizer patches were added.

**Files touched.**
- `index.html` — added `#career-focus` stat slot in the home header
  and `#career-continue-status` line under the continue button.
- `css/career.css` — `.career-continue-status` styling (small
  centered text, gold variant via `.warn`).
- `js/ui-career.js` — `_renderHeader` reads focus and renders the
  new stat; `_renderCalendar` prefixes the today line with the
  day-of-week name; `onContinue` shows feedback and locks the button;
  `_openEventPrompt` / `onEventDismiss` / `_bindButtons` (back home
  and reset) all wire SoundManager calls.
- `js/character-creator.js` — Start career, Randomize, and the
  empty-name validation path play SoundManager sounds.
- `CLAUDE.md` — Phase B.6 marked as ✅; Phase B is complete.

**Phase B retrospective.**
- B.1 → B.6 delivered the full **create → calendar → continue → play
  → return** loop with persistence, defensive migration from the
  Phase A flat schema, ZenGM-inspired domain-driven state, a
  Gregorian time engine, a state machine, a layered character
  creator, sound feedback, and 53 unit tests for the calendar.
- The Phase B home screen still has zero real content (no tournaments,
  no inbox, no coaches). That all lands in C → E.

---

### Phase B.5 — Character creator (2026-04-10)

The first-launch flow now opens a real character creation screen
instead of silently spawning a default `Player / Norway`. The home
screen avatar is rendered from the same layer presets, so what you
build in the creator is what you see on the home screen.

**New module: `js/avatar-data.js`.**
Pure data + tiny helpers. Defines six layer arrays:

- `SKIN_TONES`  — 6 colors
- `HAIR_COLORS` — 8 colors
- `HAIR_STYLES` — 6 named styles (each with `height` and `sides` for
  the placeholder renderer)
- `EYE_COLORS`  — 6 colors
- `FACE_SHAPES` — 4 named shapes (each with a `borderRadius` value)
- `OUTFITS`     — 8 colors

Plus `random()` (build a fresh random avatar) and `normalize(avatar)`
(clamp every layer index into its valid range, defends against stale
saves and out-of-bounds writes).

The avatar lives in `CareerManager.player.get().avatar` as integer
indices into these arrays. When real pixel art sprites land in
Phase H, only this file's renderer changes — the schema is stable.

**New module: `js/character-creator.js`.**

- Owns its own draft state. Reads nothing from CareerManager until
  the player clicks **Start career**.
- Avatar preview: 96×128 placeholder built from CSS shapes (hair bar,
  face square with eye dots, outfit bar). Replace with sprite render
  in Phase H.
- 6 layer cyclers (skin / face / eyes / hair / hair color / outfit),
  each with `◀` / `▶` arrows and a label showing the current value.
- **Randomize** button that re-rolls all six layers.
- Identity inputs: name (text, 24 char max), country dropdown (40
  chess nations with flag emojis), gender radios (M / F / X).
- **Start career** button validates the name and calls
  `CareerManager.player.create({ playerName, nationality, gender,
  avatar })`. Empty name → inline error message under the form.
- Public API: `init()`, `show(onComplete)`, `hide()`, `isOpen()`,
  plus `COUNTRIES` exposed for the home header to look up flags.

**Country list.** 40 entries — top FIDE federations plus broad
geographic coverage (Argentina, Armenia, Australia, Azerbaijan,
Brazil, Canada, China, Cuba, Czechia, Denmark, Egypt, England,
France, Germany, Georgia, Hungary, India, Iran, Israel, Italy, Japan,
Kazakhstan, Morocco, Netherlands, Norway, Peru, Philippines, Poland,
Romania, Russia, Serbia, Spain, Sweden, Switzerland, Turkey, Ukraine,
United Kingdom, United States, Uzbekistan, Vietnam). Stored as
`{ code, name, flag }`.

**ui-career.js updates.**

- `SCREENS` array now includes `'character'`.
- `_renderHeader()` reads `CharacterCreator.COUNTRIES` to render the
  flag and full name in the meta line, instead of the bare ISO code.
- New `_renderAvatarInto(rootEl, avatar)` helper renders the same
  six-layer placeholder as the creator, but scaled down to fit the
  56 px header avatar slot. Both renderers read from `AvatarData`,
  so the home and creator stay visually consistent.

**Bootstrap routing.**

- The Phase A/B silent stub is gone. On first launch (no character),
  the bootstrap calls `CharacterCreator.show()` with a callback that
  shows the home screen and re-renders it.
- On subsequent launches (character exists in localStorage), the
  bootstrap jumps straight to the home screen.

**Files touched.**

- New: `js/avatar-data.js` (~100 lines), `js/character-creator.js`
  (~270 lines).
- `index.html` — added `#screen-character` markup, registered
  `<script>` tags for `avatar-data.js` and `character-creator.js`,
  changed `#screen-home` to start hidden.
- `css/career.css` — appended a "Character creator screen" section
  (~200 new lines) and a "Home header avatar" section that styles
  the mini renderer.
- `js/ui-career.js` — `SCREENS` extended; `_renderHeader` swapped to
  the avatar renderer; `_renderAvatarInto` added.
- `js/ui-manager.js` — bootstrap routing replaced (no more silent
  default player creation).

**How to test.** Reset your career
(`localStorage.removeItem('chess_life_career_v2'); location.reload();`)
to land on the character creator. Pick layers, type a name, click
**Start career**. The home screen should show with the avatar you
built and your country flag in the meta line.

---

### Phase B.4 — Career UI: home screen (2026-04-10)

The first visible piece of the new career direction. Loads as the
default screen on bootstrap, replacing the Phase A stub that auto-
showed the chess board.

**New module: `js/ui-career.js`.**
- Owns every career screen (home today; inbox / staff / finance /
  tournament lobby in later phases).
- Central screen router `UICareer.showScreen(name)` toggles
  `.hidden` on `#screen-<name>` divs.
- Sub-namespace `UICareer.home` with `render()`, `onContinue()`,
  `onEventDismiss()`, and three private renderers (`_renderHeader`,
  `_renderCalendar`, `_renderUpcoming`).
- All DOM access lives here. Reads state via `CareerManager.player`,
  `CareerManager.finances`, `CalendarSystem.*`. Never mutates state
  directly.
- `window.cl.ui` debug shortcut.

**Home screen contents.**
- **Player header** — placeholder pixel avatar (first letter of the
  player's name in a colored square), name, nationality, Elo, money.
- **Calendar panel** — month name + year, "Today: …", a 7-column
  monthly grid (ISO 8601 week starts Monday). The current day is
  highlighted in gold; days with scheduled events get a red dot.
- **Continue button** — calls `CalendarSystem.continue()`. If the
  loop stops on an event, opens the event prompt modal. Otherwise the
  date advances and the calendar re-renders.
- **Upcoming events list** — next 5 events from the queue, with
  human date and label. Empty state: *"No events scheduled."*
- **Dev row** — temporary buttons for `Play test game` (opens the
  color choice modal and switches to the game screen) and
  `Reset career` (wipes the save and reloads). Both removed in Phase C
  when real tournaments arrive.

**Event prompt modal (`#modal-event-prompt`).**
A new DaisyUI `<dialog>` that opens when `continue()` matches an
event. Shows the event label, date, and type. The OK button calls
`UICareer.home.onEventDismiss()` which closes the modal and calls
`CalendarSystem.consumeCurrentEvent()`.

**Game screen integration.**
- A new `#btn-back-home` button overlays the game screen (top-left).
  Clicking it syncs Focus and returns to the home screen.
- `UIManager.onGameEnd` is now wired in the bootstrap: when a game
  ends, after a 1.5 s delay (so the player can read the post-game
  status), the screen switches back to home and re-renders.
- The game screen starts hidden by default; the home screen is the
  default landing.

**Calendar system additions.**
- `getDayOfWeek(date)` — Zeller's congruence implementation, ISO
  8601 (0 = Monday … 6 = Sunday). Pure arithmetic, no `Date` object.
- `getDayOfWeekName(date, short?)` — returns `'Monday'` / `'Mon'`.
- `getDaysInMonth(year, month)` — exposed publicly so the UI can
  build a month grid without re-implementing leap year logic.

**Test suite expanded.**
`tests/calendar-system.test.js` now has **53** tests (was 50): three
new tests for `getDayOfWeek` (cross-checked against known dates
including Feb 29 of leap years and the 1900 century non-leap),
`getDayOfWeekName`, and `getDaysInMonth`. Run with
`node tests/calendar-system.test.js`.

**Files touched.**
- New: `js/ui-career.js` (~250 lines), `css/career.css` (~280 lines).
- `index.html` — added `<link rel="stylesheet" href="css/career.css">`,
  `#screen-home` markup, `#btn-back-home` on the game screen,
  `#modal-event-prompt` dialog, `<script src="js/ui-career.js">`.
- `js/calendar-system.js` — three new public helpers
  (`getDayOfWeek`, `getDayOfWeekName`, `getDaysInMonth`).
- `js/ui-manager.js` — bootstrap calls `UICareer.init()` and shows
  the home screen by default; sets `UIManager.onGameEnd` to return
  to home after a delay; the Phase A/B stub now re-renders the home
  screen after creating the default player.
- `tests/calendar-system.test.js` — 3 new tests.
- `CLAUDE.md` — added a "Refactors différés" section noting the
  ZenGM-strict dispatcher pattern as deferred work.

---

### Phase B.3 — Calendar system (2026-04-10)

Pure-logic time engine and phase state machine. No DOM access. The
module owns the canonical Gregorian "today", a sorted event queue, and
the four phases of the career loop. It is the only place in the
project where date arithmetic lives (per CLAUDE.md architecture rules).

**Phases.**
```text
idle           ↔ event_prompt   (continue() / consumeCurrentEvent())
idle           → in_tournament  (enterTournament())
event_prompt   → in_tournament  (enterTournament())
in_tournament  → idle           (exitTournament())
idle           → in_training    (enterTraining())
event_prompt   → in_training    (enterTraining())
in_training    → idle           (exitTraining())
```

Each transition is its own function, mirroring ZenGM's
`src/worker/core/phase/newPhase*.ts` discipline.

**Public API.**
```text
CalendarSystem.init()
CalendarSystem.getDate()                  → CalendarDate clone
CalendarSystem.getPhase()
CalendarSystem.isIdle() / isEventPrompt() / isInTournament() / isInTraining()
CalendarSystem.getCurrentEvent()          → CalendarEvent | null
CalendarSystem.scheduleEvent(ev)          → returns the event id
CalendarSystem.removeEvent(id)
CalendarSystem.getUpcomingEvents(n=10)
CalendarSystem.getEventCount()
CalendarSystem.continue()                 → { stoppedBy, event, daysAdvanced }
CalendarSystem.consumeCurrentEvent()
CalendarSystem.enterTournament() / exitTournament()
CalendarSystem.enterTraining()   / exitTraining()
CalendarSystem.formatDate(d?)             → "April 10, 2026"
CalendarSystem.dateToISO(d)               → "2026-04-10"
CalendarSystem.compareDates(a, b)         → -1 | 0 | 1
CalendarSystem.addDays(d, n)              → CalendarDate
```

**Continue loop.** `continue()` advances day by day until either an
event matches today's date or `MAX_CONTINUE_DAYS` (365) is reached.
The matched event is removed from the queue and the phase moves to
`event_prompt`. The cap exists only as a safety belt — once Phase C
ships tournaments will keep the queue populated.

**Event model.**
```js
{
  id:      'ev_<auto>',
  date:    { year, month, day },
  type:    'tournament_start' | 'tournament_round' | 'training_session' | 'mail_arrival' | ...,
  label:   'Round 3 — Open de Paris',
  payload: { /* type-specific data */ },
}
```

Validation runs on every `scheduleEvent` call (year/month/day integers,
month and day in range, type non-empty). Events are inserted in
date-sorted order via simple linear insertion.

**Persistence.** All mutations go through the live reference returned
by `CareerManager.calendar.get()` followed by `CareerManager.save()`.
The module never touches localStorage directly.

**Inspired by ZenGM.**
- Phase state machine = `src/worker/core/phase/newPhase*.ts`.
- Domain isolation: calendar logic stays out of UI and away from
  other systems' state.
- Continue-button loop = the FM/ZenGM "next" iteration pattern.

**Files touched.**
- `js/calendar-system.js` — new module, ~330 lines, pure logic.
- `index.html` — script load order: `calendar-system.js` after
  `career-manager.js`, before `dialog-system.js`.
- `js/ui-manager.js` — bootstrap calls `CalendarSystem.init()` after
  `CareerManager.init()`.
- `window.cl.calendar` debug shortcut added.

**How to test (Phase B.3 has no UI yet).**
Open the browser console and try:
```js
cl.calendar.getDate()                       // → today
cl.calendar.getPhase()                      // → 'idle'
cl.calendar.scheduleEvent({                 // schedule an event 5 days out
  date: cl.calendar.addDays(cl.calendar.getDate(), 5),
  type: 'mail_arrival',
  label: 'Welcome mail',
})
cl.calendar.getEventCount()                 // → 1
cl.calendar.continue()                      // → { stoppedBy: 'event', daysAdvanced: 5, ... }
cl.calendar.getPhase()                      // → 'event_prompt'
cl.calendar.getCurrentEvent()               // → the welcome mail
cl.calendar.consumeCurrentEvent()
cl.calendar.getPhase()                      // → 'idle'
```

---

### Phase B.2 — Career state refactor, domain-driven (2026-04-10)

Pivot the career-manager from a flat schema to a nested, domain-driven
layout inspired by ZenGM's `src/worker/core/*` structure.

**Rationale.** The flat Phase A schema mixed player attributes, focus
state, finances, and game history at the top level. As more modules
arrive (calendar, tournaments, inbox, coaches), a flat bag would become
a soup of keys with no ownership. Grouping state by domain mirrors
ZenGM's pattern and makes each system's scope obvious.

**Schema change.** `save-manager`'s localStorage key stays at
`chess_life_career_v2`; the migration is detected by presence of a
nested `player` field.

```text
Old (Phase A)                       New (Phase B.2)
─────────────                       ───────────────
playerName                          player.playerName
nationality                         player.nationality
                                    player.gender       (new)
                                    player.avatar       (new, layered)
elo                                 player.elo
focusCurrent                        focus.current
focusMax                            focus.max
money                               finances.money
week                                (removed — replaced by calendar.date)
gameHistory                         history.games
                                    calendar.date       (new, real Gregorian)
                                    calendar.phase      (new, state machine)
                                    calendar.events     (new)
                                    history.tournaments (new)
                                    history.trophies    (new)
                                    inbox.mails         (new, empty)
                                    staff.hiredCoaches  (new, empty)
                                    rivals              (new, empty)
```

**API change.** Domain sub-namespaces on `CareerManager`. Old calls
like `CareerManager.createPlayer(name, nat)` and `recordGame(entry)`
are removed; callers must use the domain path.

```text
CareerManager.player.create({ playerName, nationality, gender, avatar })
CareerManager.player.get()                 → live ref
CareerManager.player.updateElo(score, oppElo)
CareerManager.calendar.get()                → live ref
CareerManager.focus.get()                   → live ref
CareerManager.focus.sync()                  → pulls from FocusSystem
CareerManager.finances.get()                → live ref
CareerManager.finances.addIncome(amt, reason)
CareerManager.finances.addExpense(amt, reason) → returns false if insufficient
CareerManager.finances.canAfford(amt)
CareerManager.history.get()                 → live ref
CareerManager.history.recordGame(entry)     → push + updateElo + save
CareerManager.save()                        → persist _state (used after
                                               mutating a live ref directly)
```

**Inspired by ZenGM.**
- Nested state grouped by domain (mirrors `src/worker/core/*`).
- Live references from getters; callers persist via explicit `save()`
  (mirrors ZenGM's `idb.cache.*.put` discipline).
- JSDoc typedefs document the full `CareerState` shape
  (equivalent to ZenGM's `src/common/types.ts`).
- Global `window.cl` exposes internals for console debugging
  (mirrors ZenGM's `self.bbgm`).
- Defensive migration on `init()` when an older flat save is detected,
  preserving player name, nationality, Elo, focus values, money, and
  full game history.

**Files touched.**
- `js/career-manager.js` — rewritten with nested schema, domain
  sub-namespaces, JSDoc typedefs, migration logic, debug global.
- `js/ui-manager.js` — all CareerManager callsites updated to the new
  domain API. Bootstrap stub now calls `CareerManager.player.create()`
  with a default avatar when no character exists.
- `js/focus-system.js` — `resetForGame()` reads focus state from
  `CareerManager.focus.get()`; `_getEloBasedThreshold()` reads elo from
  `CareerManager.player.get()`.
- `CLAUDE.md` — roadmap Phase A marked as done; Phase B.2 marked as in
  progress.

---

## Phase A — Pivot cleanup (2026-04-10)

Full pivot from the abandoned Pokémon direction (clubs, top-down world,
captain battles) to the Football-Manager-style career simulation
described in [CLAUDE.md](CLAUDE.md).

**Added.**
- [CLAUDE.md](CLAUDE.md) — canonical project reference (vision, stack,
  architecture rules, Phase A → H roadmap, English-only code policy).
- [LEARNINGS.md](LEARNINGS.md) — architectural insights extracted from
  ZenGM (domain-driven folder layout, phase state machine, "minimal
  playable first" golden rule) and Lucas Chess (training module
  triptych, puzzle data format, reinforcement loop).

**Removed.**
- `CONTEXT.md` (superseded by CLAUDE.md).
- `js/world-engine.js`, `js/world-data.js`, `js/game-controller.js`,
  `js/club-data.js`, `js/progression-manager.js`, `css/world.css`
  — the Pokémon-direction scaffolding.
- `index.html`: `screen-world`, `screen-dashboard`, `modal-create-player`,
  `modal-opening-choice`, all references to the removed scripts.

**Rewritten.**
- `js/ui-manager.js` — completely rewritten. Removed dashboard code,
  club rendering, world transitions, and all dependencies on deleted
  modules. Exposes a clean public API (`init`, `setOpponent`,
  `showGameScreen`, `hideGameScreen`, `newGame`, `onGameEnd` callback).
  All user-facing strings translated to English.
- `js/career-manager.js` — flat schema cleaned of Pokémon fields
  (`styleDeJeu`, `ouvertures`, `endgame`, `confiance`), keys renamed
  FR → EN (`nom` → `playerName`, `solde` → `money`, …). A deeper
  restructure lands in B.2.
- `js/save-manager.js` — localStorage key bumped from
  `chess_life_career_v1` to `chess_life_career_v2`. Ancient Pokémon
  saves are orphaned automatically.
- `js/dialog-system.js` — references to `WorldEngine` removed; comments
  translated to English. Module dormant until Phase D (inbox).
- `js/focus-system.js` — latent bug fixed: `_updateConfianceModifier()`
  referenced a field that no longer exists. Method and caller deleted.
  User-visible strings translated to English (zone labels, move eval
  labels, N3 / Takeback / Intuition button texts, tooltips).
- `index.html` — full English pass, Maia loading bar migrated from the
  dashboard (now deleted) to a floating overlay.

**Phase A bootstrap stub.** When no character exists on first load,
`ui-manager.js` creates a default player (`Player` / `Norway`) and shows
the game screen immediately. This stub is replaced by the real
character-creation → calendar flow in Phase B.

**Commit.** `1bf903b` — "Pivot vers simulation de carriere (Football
Manager style)" — 13 files changed, +1293 / −837.
