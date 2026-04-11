# Chess Life — Handoff

**Last updated:** 2026-04-11
**Audience:** any LLM or developer taking over. Read this first, then
[CLAUDE.md](CLAUDE.md) (project charter) and [CHANGELOG.md](CHANGELOG.md)
(phase-by-phase history). [LEARNINGS.md](LEARNINGS.md) has the ZenGM and
Lucas Chess architecture notes we lean on.

## 1. Project in one paragraph

Chess Life is a vanilla-JS web game: a chess career simulation in the
spirit of Football Manager. The player creates a character, browses a
calendar, registers for real tournaments, plays each round on an
existing chess board powered by Maia-2 (humanlike AI) and Stockfish
(evaluation), then progresses up Elo tiers toward a world championship.
Two intentions drive every decision: **fun** (FM-style loop, pixel art,
cozy UI) and **hidden trainer** (the player actually improves at chess
while playing).

Stack: HTML5 + plain JS ES6, no framework, no bundler. Tailwind/DaisyUI
via CDN, chess.js 0.10.3, Stockfish.js in a Web Worker, Maia-2 ONNX,
localStorage for saves, IndexedDB only for the Maia model blob. Hosted
on GitHub Pages. Repo: https://github.com/marzalm/chess_life

## 2. Where we are right now

The career loop is **playable end to end**:

1. First launch → character creator (avatar layers, name, country, gender)
2. Home screen: avatar + player header, monthly calendar grid, continue
   button, upcoming events, Browse tournaments button
3. Browse tournaments → lobby with cards (tier badge, dates, fees, prize
   pool, eligibility verdict, Register button)
4. Register → money deducted + calendar event scheduled
5. Continue button advances the calendar day by day; when the event
   fires, a modal opens, clicking OK enters the in-tournament screen
6. In-tournament: header (name/city/round/score/rank), next round card
   (opponent with flag, color indicator, Play button), pairings panel
   (all current-round matchups), scrollable standings, round history
7. Play round → chess board opens, real game against Maia-2, on game
   end the system records the result, simulates all NPC vs NPC games
   of the round with an Elo model, returns to the tournament screen
8. After the last round → Finished panel with rank/score/prize →
   Finalize button pays the prize, records history, advances the
   calendar by `daysDuration`, returns home

Mid-tournament escape is blocked (new-game button and back-to-home
button are hidden via a body class). Closing the tab mid-tournament is
safe — state lives in `CareerManager.calendar.currentTournament` and is
persisted on every round; bootstrap resumes straight into the
tournament screen.

**Phase completion:**

- **Phase A (pivot cleanup)** ✅ — old Pokémon-direction code deleted,
  English strings everywhere
- **Phase B (create + calendar + home)** ✅ — B.1 to B.6 all done
- **Phase C (tournaments)** — C.1 catalogue, C.2a registration + lobby
  data, C.2b run loop, C.3a lobby UI, C.3b in-tournament screen all done;
  C.4 (polish) is in progress — today's commit contains several polish
  fixes

**Phases D (inbox), E (coaches + puzzles), F (rivals), G (high tiers),
H (polish/PWA) haven't started yet.**

## 3. Last session's work (2026-04-10 → 11)

**Bug fix: date-scoped `already_registered`.** The lobby was blocking
the player from re-registering the Local Weekend Open in May after
they'd registered the April instance. Root cause: `canRegister` was
keyed on `tournamentId` alone. Now it takes an optional `targetDate`
and only blocks when the exact same (id, date) is already booked.
`_nextStartDate` also skips dates already in the queue so `register()`
rolls forward to the next free instance automatically. Tests updated.

**Name pools expanded to 27 countries.** New file
[js/name-pools.js](js/name-pools.js) with ~30 first + 30 last names per
country (≈900 combinations each). Replaces the ~8 per country in C.2a.
`TournamentSystem.generateOpponent` prefers `NamePools` at runtime but
keeps its inline fallback for Node tests. `startTournament` now
enforces unique names per field (up to 12 retries before accepting a
collision).

**Tournament screen polish.**
- Flag emoji next to every opponent name in standings, round history,
  and pairings panel
- Standings is fully scrollable (max-height 360px) with a pixel-art
  custom scrollbar that respects the `--px-*` palette
- New **Pairings panel** above standings showing every match of the
  current round with the player's row highlighted in gold; also
  scrollable

**Game screen polish.**
- Player card gets a mini pixel avatar (reuses `UICareer.home._renderAvatarInto`)
- Opponent card gets a big country flag emoji
- **Move navigation** under the board: `⏮ ◀ [Live / Move N/M] ▶ ⏭`.
  `_viewPly = null` = live mode. When set to a number, `renderBoard`
  uses a temporary `new Chess()` that replays the SAN history up to
  that ply and calls `.get(square)` for each square. View mode disables
  clicks, highlights, arrows, eval badges. Any new move (player or AI)
  resets `_viewPly = null` automatically — the navigation follows live
  play without needing a manual Live button click.

**Focus dampening in trivial positions.** `cpBefore` is now passed to
`FocusSystem.evaluateMoveDelta`. A new `oneSided` factor scales both
gains and penalties when `|cpBefore| > 200`:

| `|cpBefore|` | Factor |
|---|---|
| < 200 | 1.00 |
| 400 | 0.70 |
| 600 | 0.45 |
| 800 | 0.25 |
| ≥ 900 | 0.20 (floor) |

Prevents the player from farming Focus during a trivial endgame win or
a lost position where only one sensible move exists.

**Test status:** 133 tests green (54 tournament-system, 53 calendar,
26 tournament-data). Run:
```bash
cd "/home/noidedbb/Documents/chess life/chess_life"
node tests/calendar-system.test.js
node tests/tournament-data.test.js
node tests/tournament-system.test.js
```

## 4. Deferred work the user has explicitly asked to remember

Each item below is already documented in detail in [CLAUDE.md](CLAUDE.md)
under **"Intentions futures"** or **"Refactors différés"**. Do NOT
implement any of these on the next session unless the user asks. They
are here so the next LLM knows what's in the user's head.

### Gameplay intentions

- **Dynamic difficulty scaling** (priority when you wire it up). Not a
  flat `-300 Elo` offset. Use a sigmoid-style dampening of the Elo
  gap that scales DOWN the opponent's effective Elo more when the gap
  is big, and less when the player is close. Pseudo-code and an exact
  table of factors live in CLAUDE.md. Point of integration:
  `UIManager._triggerAIMove` where we pass the Elo to
  `MaiaEngine.getMove`. The displayed Elo in the UI, standings,
  barriers, and prize calculations all stay on the catalogue value.

- **Form rating (coached-form)** (Phase E+). The user's instinct was to
  dynamically lower opponent Elo when the player gains Elo via coaching.
  The recommendation is instead to keep a hidden "form" stat that
  modifies the **player** (via Focus system modifiers) not the world.
  Mathematically equivalent, explainable. Already documented.

- **Tournament registration via mail and coach advice** (Phase D and E).
  The lobby remains the manual source but invitations also arrive via
  inbox mails (sponsor offer, federation invite) and via coach
  suggestions. The canonical entry point stays
  `TournamentSystem.register(id, year)` — probably extend to
  `register(id, year, { source, feeOverride })` to trace origin and
  allow subsidized fees.

- **Lobby sorting** by country / prestige / tier / date when the
  catalogue grows beyond the current 24 entries. Filters and a
  grouping affordance, not just the flat grid.

### Technical deferred refactors

- **Calendar dispatcher à la ZenGM strict**. Our
  `calendar-system.js` uses direct named transitions
  (`enterTournament`, `exitTournament`, …). ZenGM uses a central
  dispatcher with a lookup table and separate files. Refactor triggers:
  we hit >6 phases, or we need a cross-cutting `finalize()` hook.
- **Swiss color balancing**. Current `_pairRound` alternates by pairing
  index, not by each player's color history. Refactor trigger: player
  complains about playing Black 5 times in 9.
- **Swiss tiebreaks**. Current standings tiebreak is Elo. Real Swiss
  uses Buchholz / Sonneborn-Berger. Refactor trigger: public standings
  where ties matter.

## 5. File map

```
chess_life/
├── CLAUDE.md            # project charter, rules, roadmap, deferred work
├── CHANGELOG.md         # phase-by-phase history with commit tags
├── LEARNINGS.md         # ZenGM + Lucas Chess architecture lessons
├── HANDOFF.md           # this file
├── index.html           # all screens: character / home / lobby / tournament / game
├── css/
│   ├── board.css        # chess board squares and pieces
│   ├── ui.css           # pixel art palette, game screen sidebar, move nav
│   └── career.css       # home, lobby, tournament screen, character creator
├── js/
│   ├── save-manager.js        # localStorage key chess_life_career_v2
│   ├── career-manager.js      # nested domain state, save/load, migration, window.cl
│   ├── calendar-system.js     # Gregorian time engine, phase state machine, event queue
│   ├── tournament-data.js     # 24 tournaments (6 home templates + 18 real)
│   ├── name-pools.js          # 27 countries × ~30×30 names
│   ├── tournament-system.js   # resolve/register/lobby + run loop + pairings + payouts
│   ├── avatar-data.js         # avatar layer presets
│   ├── character-creator.js   # first-launch screen
│   ├── dialog-system.js       # typewriter (dormant until Phase D)
│   ├── chess-engine.js        # chess.js + Stockfish Worker
│   ├── maia-engine.js         # Maia-2 ONNX
│   ├── focus-system.js        # Focus gauge, Flow State, one-sided dampening
│   ├── review-manager.js      # post-game review
│   ├── sound-manager.js       # 8-bit synth
│   ├── ui-manager.js          # game screen + bootstrap + move navigation + avatars
│   └── ui-career.js           # home + lobby + tournament screens + mode dispatcher
├── tests/
│   ├── calendar-system.test.js   # 53 tests
│   ├── tournament-data.test.js   # 26 tests
│   └── tournament-system.test.js # 54 tests
└── lib/
    ├── chess.js
    ├── stockfish.js
    └── maia/                   # ONNX model (cached in IndexedDB after first load)
```

## 6. Architecture rules (non-negotiable)

From CLAUDE.md, enforced in review:

- Every module is a black box. Public API only.
- All Focus computation goes through `FocusSystem`.
- All time/event manipulation goes through `CalendarSystem`.
- All tournament actions go through `TournamentSystem`.
- Tournaments are declared statically in `tournament-data.js`.
- One Stockfish worker for the whole app. Never instantiate a second.
- No React/Vue/Angular/Vite/Webpack. Ever.
- Phase work is sequential. Don't skip ahead or anticipate a later
  phase's code.
- English for code, identifiers, comments, user-facing strings. French
  only in CLAUDE.md / CHANGELOG.md / LEARNINGS.md / HANDOFF.md
  (design docs).

## 7. What to do next session

### If the user says "resume":

1. Read CLAUDE.md → "Phases du plan" section to see the current roadmap
2. Read CHANGELOG.md's `[Unreleased]` section to see what's the latest
   work
3. Run the three test suites to confirm the baseline is green
4. Ask the user what they want to work on — options:
   - **C.4 polish** — more bug hunting in the tournament flow,
     possibly a real Settings screen for the difficulty picker
   - **Phase D** — inbox system (email templates, mail arrival
     events, press articles after tournaments)
   - **Phase E** — coaches and puzzles (the hidden trainer's first
     concrete manifestation)
   - **Difficulty system** — the dynamic scaling described in
     CLAUDE.md. Small scope, high impact.

### If the user wants to test:

1. `cd "/home/noidedbb/Documents/chess life/chess_life"`
2. `python3 -m http.server 8000` (the service worker needs HTTPS or
   localhost)
3. Open `http://localhost:8000` in Chrome/Firefox
4. If they're coming back from a broken save: hard-reset with
   `localStorage.removeItem('chess_life_career_v2'); location.reload();`
   in the devtools console
5. Full loop: create → browse → register → continue → play round →
   finalize

### If the user reports a bug:

1. Don't ask for full code. Get the exact console error + the file/line
2. Check the relevant module only
3. Never modify state without testing the fix against the affected
   test suite
4. When adding a new behavior, add a test first

## 8. Debug handles in the browser console

`window.cl` exposes everything, modeled after ZenGM's `self.bbgm`:

```js
cl.state                  // full career state (live reference)
cl.manager                // CareerManager public API
cl.calendar               // CalendarSystem
cl.tournaments            // TournamentData (catalogue)
cl.tournamentSystem       // TournamentSystem (runtime)
cl.names                  // NamePools
cl.avatar                 // AvatarData
cl.creator                // CharacterCreator
cl.ui                     // UICareer
```

Useful tricks:

```js
// Skip straight to a tournament date
cl.state.calendar.date = { year: 2026, month: 7, day: 20 };
cl.manager.save();
cl.ui.home.render();

// Give yourself money to test high-tier lobby
cl.state.finances.money = 10000; cl.ui.home.render();

// Inspect a freshly-generated opponent pool
const t = cl.tournaments.getById('cappelle');
Array.from({length: 10}, () => cl.tournamentSystem.generateOpponent(t, 'FR'));

// Force-enter a tournament without the calendar dance
cl.tournamentSystem.register('local_weekend_open', 2026);
cl.calendar.continue();
cl.ui.home.onEventDismiss();
```

## 9. Commit discipline

- Commits are in French (the user's working language) but code is in
  English.
- Always include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.
- The user pushes from their own terminal (ksshaskpass needs interactive
  input that isn't available here). Just prepare the commit, confirm
  the status is clean, and tell them to push.
- Never commit without explicit user request.

## 10. Current open tabs / loose ends

- **C.4 polish pending**: whatever new bugs show up on the next
  playtest. The user has been finding one or two per session.
- **Difficulty system not yet implemented**. All the pieces are
  documented in CLAUDE.md but no code exists.
- **Lobby sort/filter not yet implemented**. 24 tournaments × up to
  12 instances per year = ~50 cards, getting crowded.
- **No Settings screen yet**. The user will need one for difficulty,
  sound volume, language (deferred to Phase H).
- **Phase D (inbox) and beyond: not started.** The `dialog-system.js`
  module is written but dormant — it'll drive the mail reader.

That's the whole state of play. If you're a new LLM reading this, you
now have everything to pick up where the previous session left off.
Run the tests first, ask the user what they want, then work
phase-by-phase.
