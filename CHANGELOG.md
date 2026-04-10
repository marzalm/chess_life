# Changelog

All notable changes to Chess Life are documented here.

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Project timeline is organized by **Phases** (A → H) as defined in [CLAUDE.md](CLAUDE.md).

---

## [Unreleased]

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
