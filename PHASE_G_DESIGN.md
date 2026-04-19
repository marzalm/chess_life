# Phase G Design / Shipped State

**Last updated:** 2026-04-17  
**Status:** G.1 and G.2 are shipped. This file is now the current
reference for Phase G. Future G.3+ work should extend this file rather
than relying on scattered discussion history.

## 1. Purpose of Phase G

Phase G exists to solve one problem: **the career ladder must remain
finishable by a real human beginner while still feeling like a climb
through serious chess opposition**.

By the end of Phase E/F, the game already had:

- Maia-2 ONNX for humanlike 1100-1900 opponents
- Stockfish WASM for evaluation only
- strong in-game aid systems (Focus, Flow, puzzle rewards, coach prep)
- a strict architectural constraint: **one Stockfish Worker total**

Phase G starts the transition from "Maia-only opposition" to a true
two-engine ladder:

- Maia continues to handle accessible / humanlike opponents
- humanized Stockfish takes over above Maia's ceiling
- the project now runs in a single permanent difficulty mode:
  **realistic-only**

## 2. Shipped in G.1 — Accessibility baseline

### 2.1 Difficulty model

The original G.1 accessibility layer has since been simplified to a
single global mode:

- `realistic`

There is no longer any Elo dampening layer and no tier-based cap.
Displayed Elo and played Elo are now the same number.

### 2.2 Character creator and persistence

`player.settings.difficulty` is now persisted in
[js/career-manager.js](js/career-manager.js), with defensive migration
for old saves.

The character creator no longer offers a difficulty choice.
`player.settings.difficulty` is persisted as `'realistic'` only, and
older saves are defensively migrated to that value.

## 3. Shipped in G.2 — Humanized Stockfish opponent

### 3.1 Shared-worker rule kept intact

No second Stockfish Worker was introduced.

New seam in [js/chess-engine.js](js/chess-engine.js):

- `ChessEngine.requestOpponentMove(fen, { movetimeMs, multipv })`

This serializes opponent requests on the existing Worker and blocks eval
traffic until the opponent request completes. That keeps the "one worker
only" architecture intact.

### 3.2 Humanization model

New module: [js/stockfish-opponent.js](js/stockfish-opponent.js)

Current shipped baseline:

- `MultiPV = 10`
- movetime interpolation:
  - `250ms @ 2000`
  - `300ms @ 2400`
  - `450ms @ 2800`
- temperature interpolation:
  - `60cp @ 2000`
  - `30cp @ 2400`
  - `15cp @ 2800`
- move selection:
  - ask Stockfish for top MultiPV lines
  - compute `delta_cp = best_cp - line_cp`
  - sample by `exp(-delta_cp / T)`

This gives a single, tunable humanization surface without adding
multiple opaque weakening systems.

### 3.3 Live routing

Runtime routing now lives in [js/ui-manager.js](js/ui-manager.js),
through `UIManager._pickOpponentMove(...)`.

Current rule:

- displayed Elo `<= 2000` → Maia
- displayed Elo `> 2000` → `StockfishOpponent`

### 3.4 Shared-worker race fix

After the first G.2 drop, a real bug appeared: a cancelled eval on the
shared Stockfish Worker could leak an orphan `bestmove` into the
opponent-move resolver. This was most visible during puzzle playback,
but the same race also existed in ordinary Stockfish-routed games.

The shipped fix is now:

- `_cancelAndDrain()` in [js/chess-engine.js](js/chess-engine.js)
- cancel current eval with `stop`
- safely resolve the cancelled caller
- post `isready`
- wait for `readyok` before arming the next resolver
- fail open after `500ms` to avoid a hard hang

This drain barrier is now used by:

- `_evaluate`
- `_evaluateMultiPV`
- `_evaluateWithMove`
- `requestOpponentMove`

Additional optimization (not the primary correctness fix):

- skip `_runFocusEval()` during puzzle playback
- skip `_launchBestMovePrefetch()` during puzzle playback
- skip `_launchBestMovePrefetch()` while `_opponentBusy` is true

Result: the single-worker architecture is preserved without misrouting
stale `bestmove` messages.

## 4. Focus / G-tuning that is already shipped

Phase G already has one early tuning pass on top of the engine work:

- `FocusSystem` still derives a "good move" threshold from the player Elo
- but it now also tightens that threshold when the displayed opponent is
  stronger
- and it now reads that value directly from `UIManager._opponentElo`

Current shipped base thresholds:

- `<1000` → `100cp`
- `<1200` → `90cp`
- `<1400` → `75cp`
- `<1600` → `65cp`
- `<1800` → `55cp`
- `1800+` → `45cp`

Additional rules:

- only stronger opponents tighten the threshold
- the same Elo gap penalizes high-Elo players more than low-Elo players
- final floor remains `15cp`

This keeps the mechanic aligned with the actual opponent strength now
that realistic-only has removed the dampening layer.

## 5. Pre-Phase H continuity work now shipped

### 5.1 FIDE title layer

All major named actors now expose a visible FIDE-style title derived
from Elo:

- no title below `2000`
- `CM` at `2000+`
- `FM` at `2300+`
- `IM` at `2400+`
- `GM` at `2500+`

Shipped behavior:

- `CareerManager` persists `player.title`
- old saves defensively derive a missing player title from current Elo
- player promotions are permanent and never downgrade on rating loss
- `GameEvents.title_earned` now exists and feeds an inbox mail
- tournament opponents, champions, and rivals all expose derived titles
- UI surfaces render titled names (`GM Viktor Holm`, etc.)

### 5.2 Resignation flow

The live board now supports resignation on both sides:

- the player can resign from the game screen through a confirmation modal
- resignation is recorded as a normal rated result in career history
- resignation intentionally skips post-game review
- the opponent can resign after a sustained run of clearly losing evals
  (`5` consecutive losing checks, with probability bands at `-600`,
  `-800`, and `-1000` cp from the opponent point of view)

### 5.3 Voluntary draw offers

The live board now supports voluntary draw offers on both sides:

- the player can offer a draw directly from the game screen
- opening positions are auto-refused to avoid spam
- endgames and equal positions accept more often, especially when the
  opponent is lower rated
- the player offer path uses a short cooldown
- the opponent can propose a draw after a long streak of equal evals in
  low-material positions
- accepted draw offers reuse the same rated end-of-game flow as other
  non-checkmate results and intentionally skip review

### 5.4 Closed elite tournament formats

Tier 4-6 tournaments now use a closed-event round-robin wrapper instead
of the Swiss approximation used earlier in development.

Shipped behavior:

- Tier 1-3 stay Swiss
- Tier 4-6 now use pre-generated Berger-style round-robin schedules
- field size for round robin is derived from `rounds + 1`
- odd fields are supported with a virtual BYE
- round-robin standings break ties by Sonneborn-Berger first, then Elo

## 6. Tests now covering Phase G

New suites:

- [tests/stockfish-opponent.test.js](tests/stockfish-opponent.test.js)
- [tests/ui-manager-ai-routing.test.js](tests/ui-manager-ai-routing.test.js)
- [tests/chess-engine-worker-race.test.js](tests/chess-engine-worker-race.test.js)
- [tests/champion-data.test.js](tests/champion-data.test.js)
- [tests/career-manager.test.js](tests/career-manager.test.js)
- [tests/ui-manager-resign.test.js](tests/ui-manager-resign.test.js)
- [tests/ui-manager-draw-offers.test.js](tests/ui-manager-draw-offers.test.js)

These cover:

- temperature and movetime interpolation
- softmax sampling behavior
- ChessEngine wrapper integration
- live Maia-vs-Stockfish routing
- shared-worker orphan isolation / drain behavior
- adaptive Focus threshold on displayed opponent Elo
- champion catalogue integrity
- title thresholds, player promotion, and save migration
- player resignation and AI resignation thresholds
- player draw-offer acceptance, cooldown, and AI draw-offer flow
- round-robin schedule generation and Sonneborn-Berger standings

Current project baseline: **407 passed, 0 failed**.

## 7. Manual tooling shipped for Phase G

There is now a temporary manual validation tool:

- [js/dev-tools.js](js/dev-tools.js)
- home-screen `🛠 Dev panel`
- console entry point: `window.cl.dev.open()`

Purpose:

- force player Elo, opponent Elo, tier, and color
- preview `displayed Elo -> Maia/Stockfish route`
- launch real G.1/G.2 games that the public tournament catalogue cannot
  yet produce organically

Known caveat:

- it is intentionally ephemeral and stateful
- it can mutate the saved player Elo for the session
- it should be treated as a dev-only tool, not as shipped player UX

## 8. What is intentionally NOT done yet

These are not missing bugs; they are deferred scope:

- **Style-biased Stockfish personalities**  
  `attacker / positional / universal` weight bias has not shipped yet.
  Current G.2 is pure Elo-based humanization.

- **Maia-not-ready fallback to Stockfish**  
  The game still prefers honest Maia loading for Maia-tier opponents.
  There is no silent fallback yet.

- **Difficulty settings screen**  
  No longer relevant while the project is realistic-only.

- **Named elite champion personalities**  
  Elite flavor still comes from general game context, not champion
  specific openings / style signatures.

## 9. Planned next work after G.2

The likely next slices are:

### G.3 — elite personalities / champions

Planned direction:

- named champions at elite tiers
- personality expressed mostly through:
  - opening-book bias
  - tiny temperature offsets
  - dialogue / inbox flavor

Not planned:

- separate engines per champion
- multiple Stockfish workers

### G.4 — tuning / calibration pass

Expected future tuning targets:

- calibration of `T` and movetime anchors from actual feel, not theory
- more playtest-driven balancing of the adaptive Focus threshold
  (base values + gap penalty strength)

### Phase H polish / settings

Deferred beyond Phase G:

- proper settings screen with difficulty change path
- richer accessibility onboarding / recalibration
- stronger audiovisual identity for elite opponents

## 10. Rules to keep in mind when extending Phase G

- **One Stockfish Worker only**
- `UIManager` owns the live routing decision
- `ChessEngine` owns the shared-worker arbitration
- Maia remains the humanlike baseline under the elite threshold
- Focus thresholding must use the live displayed opponent Elo

If a future Phase G change reintroduces hidden dampening, it should be
treated as a design regression and revisited before shipping.
