// career-manager.js
//
// Canonical holder and persistence layer for the full career state.
// Pure black box — no DOM access. All Focus computation stays in
// FocusSystem; CareerManager only stores/syncs values.
//
// Design inspired by ZenGM's src/worker/core/* layout: state is grouped
// by domain (player, calendar, focus, finances, history, inbox, staff,
// training, rivals) and each domain exposes its own sub-namespace on the public
// API. Callers should reach into one domain at a time:
//
//     const player = CareerManager.player.get();     // live reference
//     player.elo += 10;                               // mutate
//     CareerManager.save();                           // persist
//
// Getters return LIVE references into the canonical state. This mirrors
// ZenGM's "mutate the cache, then call put" discipline — it avoids
// deep-clone overhead and keeps ownership obvious. When a mutator
// wraps push/update semantics itself (e.g. history.recordGame), it
// persists automatically. Otherwise callers must call
// CareerManager.save() after mutating.

// ── TYPE DEFINITIONS (JSDoc typedefs, common/types.ts equivalent) ──

/**
 * @typedef {object} PlayerAvatar
 * @property {number} skinTone
 * @property {number} faceShape
 * @property {number} eyeColor
 * @property {number} hairStyle
 * @property {number} hairColor
 * @property {number} outfit
 */

/**
 * @typedef {object} PlayerSettings
 * @property {'realistic'} difficulty
 */

/**
 * @typedef {object} PlayerState
 * @property {string} playerName
 * @property {string} nationality  Country name or ISO-like code
 * @property {string} gender       'M' | 'F' | 'X' | ''
 * @property {PlayerAvatar} avatar
 * @property {number} elo
 * @property {'CM' | 'FM' | 'IM' | 'GM' | null} title
 * @property {PlayerSettings} settings
 */

/**
 * @typedef {object} CalendarDate
 * @property {number} year
 * @property {number} month  1-12
 * @property {number} day    1-31
 */

/**
 * @typedef {object} CalendarEvent
 * @property {string} id
 * @property {CalendarDate} date
 * @property {string} type    Event type key ('tournament_start', 'training_session', ...)
 * @property {string} label   Display label
 * @property {object} payload Arbitrary event data
 */

/**
 * Calendar phase state machine. Transitions live in calendar-system.js.
 * @typedef {'idle' | 'event_prompt' | 'in_tournament' | 'in_training'} CalendarPhase
 */

/**
 * @typedef {object} CalendarState
 * @property {CalendarDate} date
 * @property {CalendarPhase} phase
 * @property {CalendarEvent[]} events        Sorted by date ascending.
 * @property {CalendarEvent | null} currentEvent
 */

/**
 * @typedef {object} FocusState
 * @property {number} current
 * @property {number} max
 */

/**
 * @typedef {object} FinancesState
 * @property {number} money
 */

/**
 * @typedef {object} GameHistoryEntry
 * @property {string} opponentName
 * @property {number} opponentElo
 * @property {'win' | 'draw' | 'loss'} result
 * @property {number} moves
 * @property {number} eloBefore
 * @property {number} eloAfter
 * @property {number} delta
 * @property {string} date    ISO timestamp
 */

/**
 * @typedef {object} HistoryState
 * @property {GameHistoryEntry[]} games
 * @property {object[]} tournaments     Populated in Phase C.
 * @property {object[]} trophies        Populated in Phase C.
 */

/**
 * @typedef {object} InboxState
 * @property {object[]} mails           Populated in Phase D.
 */

/**
 * @typedef {object} StaffState
 * @property {{ id: string, hireDate: CalendarDate, lastPaidDate: CalendarDate } | null} currentCoach
 */

/**
 * @typedef {object} TrainingStats
 * @property {number} sessionsCompleted
 * @property {number} sessionsPassed
 * @property {number} puzzlesAttempted
 * @property {number} puzzlesSolvedAllTime
 * @property {number} reinforcementPuzzlesSolved
 * @property {number} bonusesUsedTraining
 * @property {number} bonusesUsedFlow
 * @property {object} byTheme
 */

/**
 * @typedef {object} TrainingState
 * @property {Object.<string, 1>} seenPuzzleIds
 * @property {Object.<string, Array<{ puzzleId: string, state: string, confirmations: number }>>} reinforcementQueues
 * @property {Object.<string, { prepared: boolean, usedThisGame: boolean, lockedUntilTournamentEnd: boolean }>} trainingBonuses
 * @property {{ earned: boolean, reservedPuzzleId: string | null }} flowBonus
 * @property {Object.<string, number>} puzzleRatings
 * @property {Object.<string, number>} puzzleRatingRds
 * @property {TrainingStats} stats
 */

/**
 * The whole career save — everything that persists to localStorage.
 * @typedef {object} CareerState
 * @property {number} version
 * @property {PlayerState} player
 * @property {CalendarState} calendar
 * @property {FocusState} focus
 * @property {FinancesState} finances
 * @property {HistoryState} history
 * @property {InboxState} inbox
 * @property {StaffState} staff
 * @property {TrainingState} training
 * @property {object[]} rivals           Populated in Phase F.
 */

const CareerManager = (() => {

  const TITLE_ORDER = [null, 'CM', 'FM', 'IM', 'GM'];
  const TITLE_FULL_NAMES = {
    CM: 'Candidate Master',
    FM: 'FIDE Master',
    IM: 'International Master',
    GM: 'Grandmaster',
  };
  const TITLE_THRESHOLDS = [
    { minElo: 2500, title: 'GM' },
    { minElo: 2400, title: 'IM' },
    { minElo: 2300, title: 'FM' },
    { minElo: 2200, title: 'CM' },
  ];

  /** @type {CareerState | null} */
  let _state = null;

  /** Canonical defaults. Start date is the real today. */
  const DEFAULT_STATE = {
    version: 2,
    player: {
      playerName:  '',
      nationality: '',
      gender:      '',
      avatar: {
        skinTone:  0,
        faceShape: 0,
        eyeColor:  0,
        hairStyle: 0,
        hairColor: 0,
        outfit:    0,
      },
      elo: 800,
      title: null,
      settings: {
        difficulty: 'realistic',
      },
    },
    calendar: {
      date:              { year: 2026, month: 4, day: 10 },
      phase:             'idle',
      events:            [],
      currentEvent:      null,
      currentTournament: null,
    },
    focus: {
      current: 100,
      max:     100,
    },
    finances: {
      money: 500,
    },
    history: {
      games:       [],
      tournaments: [],
      trophies:    [],
    },
    inbox: { mails: [] },
    staff: { currentCoach: null },
    training: {
      seenPuzzleIds: {},
      reinforcementQueues: {},
      trainingBonuses: {},
      flowBonus: {
        earned: false,
        reservedPuzzleId: null,
      },
      puzzleRatings: {},
      puzzleRatingRds: {},
      stats: {
        sessionsCompleted: 0,
        sessionsPassed: 0,
        puzzlesAttempted: 0,
        puzzlesSolvedAllTime: 0,
        reinforcementPuzzlesSolved: 0,
        bonusesUsedTraining: 0,
        bonusesUsedFlow: 0,
        byTheme: {},
      },
    },
    rivals: [],
  };

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _titleForElo(elo) {
    const numericElo = Number.isFinite(elo) ? elo : 0;
    const match = TITLE_THRESHOLDS.find((entry) => numericElo >= entry.minElo);
    return match ? match.title : null;
  }

  function _isValidTitle(title) {
    return TITLE_ORDER.includes(title);
  }

  function _titleRank(title) {
    return TITLE_ORDER.indexOf(_isValidTitle(title) ? title : null);
  }

  function _normalizePlayerTitle(title, elo) {
    const safeTitle = _isValidTitle(title) ? title : null;
    const eloTitle = _titleForElo(elo);
    return _titleRank(eloTitle) > _titleRank(safeTitle) ? eloTitle : safeTitle;
  }

  function _formatName(name, title) {
    const safeName = (name || '').trim();
    if (!safeName) return '';
    return safeName;
  }

  function _formatTitledName(name, title) {
    const safeName = _formatName(name, title);
    if (!safeName) return title || '';
    return title ? `${title} ${safeName}` : safeName;
  }

  function _formatTitleBadgeHTML(title) {
    if (!_isValidTitle(title) || !title) return '';
    return `<span class="title-badge title-${String(title).toLowerCase()}">${title}</span>`;
  }

  function _promotePlayerTitleIfNeeded(emitEvent = false) {
    const player = _state && _state.player ? _state.player : null;
    if (!player) return null;

    const current = _isValidTitle(player.title) ? player.title : null;
    const next = _normalizePlayerTitle(current, player.elo);
    player.title = next;

    if (next === current) return null;

    if (
      emitEvent &&
      next &&
      typeof GameEvents !== 'undefined' &&
      GameEvents.EVENTS &&
      GameEvents.EVENTS.TITLE_EARNED
    ) {
      GameEvents.emit(GameEvents.EVENTS.TITLE_EARNED, { title: next });
    }
    return next;
  }

  function _save() {
    if (_state) SaveManager.save(_state);
  }

  function _ensure() {
    if (!_state) throw new Error('[CareerManager] Not initialized — call init() first');
  }

  /**
   * Detect and migrate an older flat Phase A schema into the new nested
   * layout. The localStorage key stayed at `chess_life_career_v2`; the
   * migration is triggered when no `player` sub-object is present.
   */
  function _migrateIfNeeded(loaded) {
    if (loaded && loaded.player !== undefined) {
      return loaded; // already nested
    }
    if (!loaded) return _clone(DEFAULT_STATE);

    console.log('[CareerManager] Migrating flat Phase A save → nested schema');
    const migrated = _clone(DEFAULT_STATE);
    migrated.player.playerName  = loaded.playerName  || '';
    migrated.player.nationality = loaded.nationality || '';
    migrated.player.elo         = loaded.elo ?? 800;
    migrated.focus.current      = loaded.focusCurrent ?? 100;
    migrated.focus.max          = loaded.focusMax     ?? 100;
    migrated.finances.money     = loaded.money ?? 500;
    migrated.history.games      = Array.isArray(loaded.gameHistory) ? loaded.gameHistory : [];
    return migrated;
  }

  /**
   * Fill any missing top-level keys with defaults. Protects against
   * older saves that predate the arrival of a new domain.
   * Also fills nested calendar keys that arrived after Phase B.
   */
  function _fillDefaults(s) {
    for (const [key, val] of Object.entries(DEFAULT_STATE)) {
      if (s[key] === undefined) s[key] = _clone(val);
    }
    // Phase C.2b — currentTournament slot may be missing on older saves
    if (s.calendar && s.calendar.currentTournament === undefined) {
      s.calendar.currentTournament = null;
    }
    // Phase G.1 — player.settings may be missing on older saves
    if (s.player && (!s.player.settings || typeof s.player.settings !== 'object')) {
      s.player.settings = _clone(DEFAULT_STATE.player.settings);
    }
    if (s.player) {
      s.player.settings.difficulty = 'realistic';
      s.player.title = _normalizePlayerTitle(s.player.title, s.player.elo);
    }
    return s;
  }

  // ── PUBLIC API ──────────────────────────────────────────────

  return {

    // ── Core ──

    init() {
      const loaded = SaveManager.hasSave() ? SaveManager.load() : null;
      _state = _fillDefaults(_migrateIfNeeded(loaded));

      // Sync FocusSystem with persisted values
      FocusSystem.current = _state.focus.current;
      FocusSystem.max     = _state.focus.max;
      FocusSystem.render();
    },

    /** @returns {boolean} true if a named player has been created. */
    hasCharacter() {
      return Boolean(_state && _state.player && _state.player.playerName);
    },

    /** Persist the whole state. Call after mutating a live reference. */
    save() {
      _save();
    },

    /** Wipe the save and reset to defaults (in-memory and on disk). */
    reset() {
      _state = _clone(DEFAULT_STATE);
      SaveManager.deleteSave();
    },

    /** Debug only — full live state reference. Prefer domain accessors. */
    _rawState() {
      return _state;
    },

    // ── PLAYER DOMAIN ───────────────────────────────────────────

    player: {
      /** @returns {PlayerState} live reference — call CareerManager.save() after mutating. */
      get() {
        _ensure();
        return _state.player;
      },

      /**
       * Create the player. Called once, at character creation.
       * @param {{ playerName: string, nationality: string, gender?: string, avatar?: Partial<PlayerAvatar> }} data
       */
      create(data) {
        _ensure();
        _state.player = {
          playerName:  (data.playerName  || '').trim(),
          nationality: (data.nationality || '').trim(),
          gender:      data.gender || '',
          avatar:      { ...DEFAULT_STATE.player.avatar, ...(data.avatar || {}) },
          elo:         DEFAULT_STATE.player.elo,
          title:       null,
          settings:    { difficulty: 'realistic' },
        };
        _save();
      },

      titleForElo(elo) {
        return _titleForElo(elo);
      },

      checkTitlePromotion() {
        _ensure();
        const earnedTitle = _promotePlayerTitleIfNeeded(true);
        _save();
        return earnedTitle;
      },

      /**
       * Apply and persist the FIDE Elo formula.
       *   E  = 1 / (1 + 10 ** ((oppElo - elo) / 400))
       *   D  = K * (score - E), K = 32 if elo < 2400 else 16
       * @param {number} score       1 win | 0.5 draw | 0 loss
       * @param {number} opponentElo
       * @returns {number} rounded delta
       */
      updateElo(score, opponentElo) {
        _ensure();
        const elo   = _state.player.elo;
        const E     = 1 / (1 + 10 ** ((opponentElo - elo) / 400));
        const K     = elo < 2400 ? 32 : 16;
        const delta = Math.round(K * (score - E));
        _state.player.elo = Math.max(100, elo + delta);
        _promotePlayerTitleIfNeeded(true);
        console.log(`[Elo] E=${E.toFixed(4)}  score=${score}  K=${K}  delta=${delta}  newElo=${_state.player.elo}`);
        _save();
        return delta;
      },
    },

    // ── CALENDAR DOMAIN ────────────────────────────────────────
    // Business logic (continue-until-event, phase transitions, event
    // scheduling) lives in calendar-system.js (Phase B.3). This namespace
    // is a thin state holder.

    calendar: {
      /** @returns {CalendarState} live reference. */
      get() {
        _ensure();
        return _state.calendar;
      },
    },

    // ── FOCUS DOMAIN ───────────────────────────────────────────
    // FocusSystem owns the runtime values during a game; CareerManager
    // just persists between-game snapshots.

    focus: {
      /** @returns {FocusState} live reference. */
      get() {
        _ensure();
        return _state.focus;
      },

      /** Pull current runtime values from FocusSystem and persist them. */
      sync() {
        _ensure();
        _state.focus.current = FocusSystem.current;
        _state.focus.max     = FocusSystem.max;
        _save();
      },
    },

    // ── FINANCES DOMAIN ────────────────────────────────────────

    finances: {
      /** @returns {FinancesState} live reference. */
      get() {
        _ensure();
        return _state.finances;
      },

      /** @param {number} amount positive expected. */
      addIncome(amount, reason) {
        _ensure();
        _state.finances.money += amount;
        console.log(`[Finances] +${amount} (${reason || 'income'}) → ${_state.finances.money}`);
        _save();
      },

      /**
       * @param {number} amount positive expected.
       * @returns {boolean} false if the player can't afford it; no change in that case.
       */
      addExpense(amount, reason) {
        _ensure();
        if (_state.finances.money < amount) return false;
        _state.finances.money -= amount;
        console.log(`[Finances] -${amount} (${reason || 'expense'}) → ${_state.finances.money}`);
        _save();
        return true;
      },

      canAfford(amount) {
        _ensure();
        return _state.finances.money >= amount;
      },
    },

    // ── HISTORY DOMAIN ─────────────────────────────────────────

    history: {
      /** @returns {HistoryState} live reference. */
      get() {
        _ensure();
        return _state.history;
      },

      /**
       * Record a finished game. Applies the Elo delta via
       * player.updateElo and archives the entry with before/after Elo.
       * @param {{ opponentName: string, opponentElo: number,
       *           result: 'win'|'draw'|'loss', moves: number }} entry
       * @returns {number} Elo delta
       */
      recordGame(entry) {
        _ensure();
        const scoreMap  = { win: 1, draw: 0.5, loss: 0 };
        const eloBefore = _state.player.elo;
        const delta     = CareerManager.player.updateElo(
          scoreMap[entry.result],
          entry.opponentElo,
        );

        _state.history.games.push({
          opponentName: entry.opponentName || '?',
          opponentElo:  entry.opponentElo  || 0,
          result:       entry.result,
          moves:        entry.moves        || 0,
          eloBefore,
          eloAfter:     _state.player.elo,
          delta,
          date:         new Date().toISOString(),
        });

        _save();
        return delta;
      },
    },

    // ── INBOX DOMAIN ───────────────────────────────────────────

    inbox: {
      /** @returns {InboxState} live reference. */
      get() {
        _ensure();
        return _state.inbox;
      },
    },

    // ── STAFF DOMAIN ───────────────────────────────────────────

    staff: {
      /** @returns {StaffState} live reference. */
      get() {
        _ensure();
        return _state.staff;
      },
    },

    // ── TRAINING DOMAIN ────────────────────────────────────────

    training: {
      /** @returns {TrainingState} live reference. */
      get() {
        _ensure();
        return _state.training;
      },
    },

    titleForElo(elo) {
      return _titleForElo(elo);
    },

    titleFullName(title) {
      return TITLE_FULL_NAMES[title] || '';
    },

    formatName(name, title) {
      return _formatName(name, title);
    },

    formatTitledName(name, title) {
      return _formatTitledName(name, title);
    },

    formatTitleBadgeHTML(title) {
      return _formatTitleBadgeHTML(title);
    },

  };

})();

// Debug global: mirror ZenGM's self.bbgm. Only exposed in the browser.
// Access the raw state from the devtools console via window.cl.state.
if (typeof window !== 'undefined') {
  window.cl = {
    get state() { return CareerManager._rawState(); },
    manager:    CareerManager,
  };
}
