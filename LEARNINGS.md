# Architecture Learnings — ZenGM & Lucas Chess

Key insights from researching open source projects that overlap with Chess Life's design goals. Read this alongside CLAUDE.md before starting work.

## ZenGM (github.com/zengm-games/zengm)

ZenGM is a family of single-player sports management simulations (Basketball GM, Football GM, Baseball GM, Hockey GM) written in TypeScript, running entirely client-side with IndexedDB persistence. It's the closest architectural model we have for a browser-based career simulation.

### Core insight: domain-driven folder layout

ZenGM's source code is split into three top-level directories under `src/`:

- `src/common/` — shared types, constants, utilities (helpers, random, names, teamInfos, formatters, etc.)
- `src/ui/` — React UI layer, split into `api/`, `components/`, `hooks/`, `router/`, `util/`, `views/`
- `src/worker/` — game logic layer, split into `api/`, `core/`, `data/`, `db/`, `util/`, `views/`

The **killer pattern** is inside `src/worker/core/`. Each game mechanic is a **folder**, not a file:

```
core/
  player/          player creation, progression, ratings
  team/            team state
  league/          league-wide state
  season/          schedule, awards, playoffs
  phase/           named game phases (preseason, regular, playoffs...)
  game/            single-game simulation
  draft/           draft mechanics
  trade/           trade negotiation
  freeAgents/      free agent pool
  contractNegotiation/  contract signing
  finances/        money management
  allStar/         all-star events
  expansionDraft/
  headToHead/
```

Each folder contains many small focused files (`newSchedule.ts`, `addDaysToSchedule.ts`, `getDaysLeftSchedule.ts`, etc.) and an `index.ts` that re-exports the domain's public API.

**Why this matters for us**: we have no bundler and no TypeScript imports, but we can reproduce the *spirit* by having **one file per domain** (e.g. `calendar-system.js`, `tournament-system.js`, `inbox-system.js`) with a **single public object** exposing the API. If a file grows too big (say >800 lines), split it into multiple prefix-named files (`tournament-system.js`, `tournament-pairings.js`, `tournament-data.js`).

### Phase state machine

ZenGM's `src/worker/core/phase/` folder is a concrete state machine for season progression:

```
newPhasePreseason.ts
newPhaseRegularSeason.ts
newPhasePlayoffs.ts
newPhaseBeforeDraft.ts
newPhaseDraft.ts
newPhaseAfterDraft.ts
newPhaseFreeAgency.ts
newPhaseResignPlayers.ts
newPhaseFantasyDraft.ts
newPhaseExpansionDraft.ts
newPhaseAfterTradeDeadline.ts
finalize.ts
index.ts
```

Each `newPhaseXxx.ts` is a transition function that mutates game state when moving into that phase. `finalize.ts` is the common exit path. `index.ts` dispatches to the correct transition.

**For Chess Life**: our `calendar-system.js` should model the game as a state machine with named phases:
- `idle` — between events, continue button advances one day at a time
- `event_prompt` — an event is ready, waiting for the player to open it
- `in_tournament` — inside a tournament, other events queued
- `in_training` — puzzle session in progress
- `post_game` — showing results, post-game review

Each transition is a dedicated function (`enterTournament`, `exitTournament`, `enterTraining`, ...) that handles the state mutation. Keep transitions small and explicit.

### Cache layer on top of IndexedDB

ZenGM wraps IndexedDB with a cache class (`src/worker/db/Cache.ts`). Their README explains: *"IndexedDB should only be accessed for uncommon situations. For simulating games and viewing current data, only the cache should be necessary."* The cache holds the current season's data in memory; IndexedDB is for historical data and cold persistence.

**For Chess Life**: we already use `localStorage` for the full save (via `save-manager.js`), and `IndexedDB` only for the 90 MB Maia model blob. This is fine — our save state is small enough to live in memory + `localStorage`. No need to build a cache layer.

### Worker architecture (DON'T copy this)

ZenGM runs all game logic inside a Shared Worker and keeps the React UI in the main thread, communicating via `toUI` / `toWorker` messages. This makes sense for them because they simulate entire seasons algorithmically (thousands of games) and need to keep the UI responsive.

**For Chess Life**: we don't have that problem. Our "simulation" is the player actually playing one game at a time. Stockfish already runs in a dedicated worker (just for engine evaluation). Adding another worker layer would be overkill. Keep it simple: single main thread, except for Stockfish.

### Golden rule from the ZenGM blog post

From "So you want to write a sports sim game" (zengm.com/blog/2019/07):

> *"Don't do everything at once. Make a minimal playable game, and iterate on it."*
>
> *"I find I'm much more likely to complete a project when I can actually play around with it as soon as possible."*

**Applied**: Phase B of our roadmap delivers a minimal playable loop (create character → see calendar → click continue → date advances) with ZERO tournaments, ZERO mails, ZERO coaches. Everything else stacks on top of that working skeleton.

---

## Lucas Chess (github.com/lukasmonk/lucaschessR2)

Lucas Chess is a free UCI-compliant chess GUI in Python/Qt designed to teach chess through exercises. It's our reference for the pedagogical ("hidden trainer") dimension of Chess Life.

### The training catalogue

Lucas Chess has a folder per training type under `bin/Code/`:

```
Tactics/            tactical puzzles
Openings/           opening training
Endings/            endgame training
Mate15/             mate in 1-5
BestMoveTraining/
ForcingMoves/
SingularMoves/
CountsCaptures/
TurnOnLights/
Washing/            position "washing" drills
LearnGame/          game study
Resistance/         endurance training
```

Each training type is a self-contained module. This is the same domain-folder pattern as ZenGM, just for a different kind of content.

**For Chess Life**: we don't need all of these at the start. Phase E ships with **tactics puzzles only** (themed by opening / tactic / endgame). Future phases can add modules mirroring Lucas Chess: opening drills, mate-in-N, forcing moves, etc. Plan the directory to welcome them:

```
js/
  training-tactics.js       (Phase E)
  training-openings.js      (later)
  training-endgame.js       (later)
  training-mate-in-n.js     (later)
  training-data-*.js        (puzzle databases)
```

### Module triptych: data + manager + window

Every Lucas Chess training module follows the same 3-file structure. For `Tactics/`:

- `Tactics.py` — puzzle data classes (`Tactic`, `Tactics` parent, `Reinforcement` error-tracking). Pure logic. No UI.
- `ManagerTactics.py` — orchestrator. Handles session state, player moves, transitions. Talks to the UI manager but doesn't own widgets.
- `WindowTactics.py` — Qt window with all the widgets for the training screen.

**For Chess Life**: mirror this pattern for every training type. Example for tactics:

- `puzzle-system.js` — logic (session state, move validation, reinforcement tracking). Pure, testable, no DOM.
- `puzzle-data.js` — static puzzle catalogue (FEN + solution + theme + difficulty).
- `ui-career.training` — the screen that renders the puzzle, takes input, calls back into `puzzle-system`.

### Puzzle data format (Lucas Chess `.fns` files)

Lucas Chess stores puzzles in `.fns` text files (FEN + solution lines), organized in folders like `Resources/Trainings/Checkmates in GM games/`. Each exercise group has an INI-style config:

```
FOLDER=../Resources/Trainings/Checkmates in GM games

[ALIAS]
M1=Mate in 1.fns
M2=Mate in 2.fns
...

[TACTIC1]
MENU=Mate in 1
FILESW=M1:100
```

The `Tactics` class reads the INI, builds a menu of training groups, and dispatches to a `Tactic` instance per group.

**For Chess Life**: we'll use a simpler JSON format inline in `puzzle-data.js`:

```js
const PUZZLES = [
  {
    id: "ruy_001",
    fen: "r1bqkbnr/pp1p1ppp/2n5/2p1p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4",
    solution: ["Bb5"],           // sequence of best moves (UCI or SAN)
    theme: "opening:ruy_lopez",
    difficulty: 1200,
    source: "lichess:abc123"     // keep attribution
  },
  // ...
]
```

The Lichess puzzle database is CC0 and exports a CSV with `PuzzleId,FEN,Moves,Rating,Themes`. Later we can write an importer. For Phase E we hand-pick 30-50 puzzles across 5 themes to ship fast.

### Reinforcement loop (the smart part)

The `Reinforcement` class in `Tactics.py` tracks positions the player failed. When the error count hits a threshold, it re-queues those failed positions in a shuffled review cycle (configurable `cycles` parameter, default repeats each failure multiple times). Only when the player solves all failed positions does the reinforcement loop deactivate.

```python
def add_error(self, num):
    if num not in self.li_num_fens:
        self.li_num_fens.append(num)
        if len(self.li_num_fens) >= self.max_errors:
            self.activate()

def activate(self):
    li = self.li_num_fens[:]
    random.shuffle(li)
    self.li_work_fens = []
    for cycle in range(self.cycles):
        self.li_work_fens.extend(li)
    self.active = True
```

**Why this is pedagogically important**: the player can't cheese training by ignoring failures. Mistakes come back, shuffled, multiple times, until mastered. This is **the hidden trainer in action** — it's spaced-repetition-lite for chess positions.

**For Chess Life**: implement this faithfully in `puzzle-system.js`. Each coach session tracks errors. When the session ends, failed puzzles go into a reinforcement queue stored on the coach's state. The next time the player books a session with the same coach, reinforcement puzzles come first. Simple persistence, large pedagogical payoff.

### Progression via "advanced" and penalties

Lucas Chess lets a puzzle have an "advanced" mode (time pressure + limited hints) that adds more realism. Errors and hints both cost "penalization" seconds added to the clock. This gamifies accuracy.

**For Chess Life (later)**: Phase H can add an advanced mode where puzzle sessions have a clock, and requesting the solution costs Focus that the player would otherwise gain. Optional, but a nice lever for advanced players.

### What we're NOT copying from Lucas Chess

- **Qt/PySide UI** — we're vanilla JS + DaisyUI, obviously
- **Multiple language dialect engines** — Lucas Chess supports many UCI engines; we only use Stockfish + Maia
- **SQL storage via UtilSQL** — we use localStorage and IndexedDB (only for the Maia model)
- **The full training catalogue at once** — we start with tactics only, grow later
- **Competition modes** — out of scope

---

## Summary: concrete rules for Chess Life

1. **One file per domain.** If a domain grows over ~800 lines, split into prefix-named siblings (`tournament-system.js` → `tournament-system.js` + `tournament-pairings.js`).
2. **Public API via a single global object per module.** No hidden access to internals. Mirror ZenGM's `index.ts` discipline.
3. **Calendar as a state machine.** Named phases, explicit transition functions. Don't let phase logic leak into UI.
4. **Every training module has 3 layers.** Data file (`*-data.js`), logic file (`*-system.js`), UI screen (a namespace under `ui-career`).
5. **Ship a minimal playable loop first.** Create character → calendar → continue button. Everything else is a layer on top.
6. **Puzzles use Lucas Chess's reinforcement pattern.** Failed puzzles come back, shuffled, in cycles, until mastered. This is the hidden trainer.
7. **No worker layer for game logic.** Only Stockfish runs in a worker. Everything else on the main thread.
8. **Keep the save state small.** localStorage for career, IndexedDB only for the Maia model. No cache layer needed.

---

## Sources

- ZenGM GitHub: https://github.com/zengm-games/zengm
- ZenGM blog — sports sim design: https://zengm.com/blog/2019/07/so-you-want-to-write-a-sports-sim-game/
- ZenGM worker/core: https://github.com/zengm-games/zengm/tree/master/src/worker/core
- ZenGM phase module: https://github.com/zengm-games/zengm/tree/master/src/worker/core/phase
- Lucas Chess R2: https://github.com/lukasmonk/lucaschessR2
- Lucas Chess Tactics module: https://github.com/lukasmonk/lucaschessR2/tree/main/bin/Code/Tactics
- Lichess puzzle database (CC0): https://database.lichess.org/#puzzles
