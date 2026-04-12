// calendar-system.js
//
// Time engine and phase state machine for Chess Life. Pure logic —
// no DOM access. Reads and writes through CareerManager.calendar.get()
// (a live reference into the nested career state).
//
// Responsibilities:
//   - Owns the canonical notion of "today" (real Gregorian calendar).
//   - Owns a sorted event queue and the continue-until-next-event loop.
//   - Owns the calendar phase state machine:
//       'idle'         → between events, continue advances day by day
//       'event_prompt' → an event is due, waiting for the player to open it
//       'in_tournament'→ inside a tournament, other events are queued
//       'in_training'  → inside a puzzle session with a coach
//
// All phase transitions happen through the explicit functions below
// (inspired by ZenGM's src/worker/core/phase/newPhase* discipline).
// Other modules must not mutate calendar state directly.
//
// This module is the only place in the project where date arithmetic
// lives (per CLAUDE.md architecture rules).

const CalendarSystem = (() => {

  // ── CONSTANTS ────────────────────────────────────────────────

  /** @type {'idle' | 'event_prompt' | 'in_tournament' | 'in_training'} */
  const PHASES = Object.freeze({
    IDLE:          'idle',
    EVENT_PROMPT:  'event_prompt',
    IN_TOURNAMENT: 'in_tournament',
    IN_TRAINING:   'in_training',
  });

  /**
   * Safety cap on the continue() loop. Prevents runaway iteration if
   * the player has no events scheduled. In practice the event queue
   * is rarely empty once Phase C lands, but the cap stays as a belt.
   */
  const MAX_CONTINUE_DAYS = 365;

  const MONTH_NAMES = [
    'January', 'February', 'March',     'April',   'May',      'June',
    'July',    'August',   'September', 'October', 'November', 'December',
  ];

  /**
   * Day-of-week names. ISO 8601 order: 0 = Monday, 6 = Sunday.
   * Both the long and short forms are used by the home screen header.
   */
  const DOW_NAMES_LONG  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DOW_NAMES_SHORT = ['Mon',    'Tue',     'Wed',       'Thu',      'Fri',    'Sat',      'Sun'];

  /** @type {Set<Function>} */
  const _dayTickHandlers = new Set();

  // ── GREGORIAN DATE MATH (self-contained, no Date objects) ──

  function _isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function _daysInMonth(year, month) {
    switch (month) {
      case 1: case 3: case 5: case 7: case 8: case 10: case 12:
        return 31;
      case 4: case 6: case 9: case 11:
        return 30;
      case 2:
        return _isLeap(year) ? 29 : 28;
      default:
        throw new Error(`[Calendar] Invalid month: ${month}`);
    }
  }

  /**
   * Compare two CalendarDate objects.
   * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
   */
  function _cmpDates(a, b) {
    if (a.year !== b.year)   return a.year  < b.year  ? -1 : 1;
    if (a.month !== b.month) return a.month < b.month ? -1 : 1;
    if (a.day !== b.day)     return a.day   < b.day   ? -1 : 1;
    return 0;
  }

  /** Deep copy a date (never mutate callers' objects). */
  function _cloneDate(d) {
    return { year: d.year, month: d.month, day: d.day };
  }

  /**
   * Return a new date one day after `d`. Handles month rollover and
   * leap years. Does not mutate `d`.
   */
  function _addOneDay(d) {
    const out = _cloneDate(d);
    out.day += 1;
    if (out.day > _daysInMonth(out.year, out.month)) {
      out.day = 1;
      out.month += 1;
      if (out.month > 12) {
        out.month = 1;
        out.year += 1;
      }
    }
    return out;
  }

  /** Return a new date `n` days after `d`. */
  function _addDays(d, n) {
    let cur = _cloneDate(d);
    for (let i = 0; i < n; i++) cur = _addOneDay(cur);
    return cur;
  }

  /**
   * Day of week via Zeller's congruence. Pure arithmetic — no Date.
   * Returns 0 = Monday, 1 = Tuesday, …, 6 = Sunday (ISO 8601 order).
   */
  function _dayOfWeek(date) {
    let { year, month, day } = date;
    // In Zeller's formula, January and February are months 13 and 14
    // of the previous year.
    if (month < 3) {
      month += 12;
      year  -= 1;
    }
    const K = year % 100;
    const J = Math.floor(year / 100);
    // h: 0 = Saturday, 1 = Sunday, 2 = Monday, …, 6 = Friday
    const h = (
      day
      + Math.floor((13 * (month + 1)) / 5)
      + K
      + Math.floor(K / 4)
      + Math.floor(J / 4)
      + 5 * J
    ) % 7;
    // Convert to ISO 8601: 0 = Monday … 6 = Sunday
    // Zeller h:   0=Sat 1=Sun 2=Mon 3=Tue 4=Wed 5=Thu 6=Fri
    // ISO target: 5    6    0    1    2    3    4
    return (h + 5) % 7;
  }

  // ── EVENT VALIDATION & ID GENERATION ────────────────────────

  let _idCounter = 0;
  function _genEventId() {
    _idCounter += 1;
    return `ev_${Date.now().toString(36)}_${_idCounter}`;
  }

  function _validateEvent(ev) {
    if (!ev || typeof ev !== 'object') {
      throw new Error('[Calendar] Event must be an object');
    }
    if (!ev.date || typeof ev.date !== 'object') {
      throw new Error('[Calendar] Event must have a .date');
    }
    const { year, month, day } = ev.date;
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      throw new Error('[Calendar] Event date fields must be integers');
    }
    if (month < 1 || month > 12) {
      throw new Error(`[Calendar] Event month out of range: ${month}`);
    }
    if (day < 1 || day > _daysInMonth(year, month)) {
      throw new Error(`[Calendar] Event day out of range: ${day}/${month}/${year}`);
    }
    if (typeof ev.type !== 'string' || !ev.type) {
      throw new Error('[Calendar] Event must have a .type string');
    }
  }

  // ── INTERNAL HELPERS ────────────────────────────────────────

  /** @returns {CalendarState} live reference. */
  function _state() {
    return CareerManager.calendar.get();
  }

  function _persist() {
    CareerManager.save();
  }

  /**
   * Insert an event into the sorted events[] at the right position.
   * Events on the same date are appended after existing ones
   * (stable order by insertion time).
   */
  function _insertSorted(events, ev) {
    let i = 0;
    while (i < events.length && _cmpDates(events[i].date, ev.date) <= 0) {
      i += 1;
    }
    events.splice(i, 0, ev);
  }

  function _fireDayTickHandlers(date) {
    for (const handler of _dayTickHandlers) {
      try {
        handler(_cloneDate(date));
      } catch (err) {
        console.error('[Calendar] Day tick handler failed:', err);
      }
    }
  }

  // ── PHASE TRANSITIONS ───────────────────────────────────────
  // Mirrors ZenGM's src/worker/core/phase/newPhase*.ts discipline:
  // one function per transition, each function mutates state once.

  /** Transition into `idle` and clear the current event. */
  function _enterIdle() {
    const s = _state();
    s.phase = PHASES.IDLE;
    s.currentEvent = null;
    _persist();
  }

  /** Transition into `event_prompt` with the given event. */
  function _enterEventPrompt(ev) {
    const s = _state();
    s.phase = PHASES.EVENT_PROMPT;
    s.currentEvent = ev;
    _persist();
  }

  // ── PUBLIC API ──────────────────────────────────────────────

  return {

    /** Phase name constants, for external consumers. */
    PHASES,

    /**
     * Initialize the calendar subsystem. Must be called after
     * CareerManager.init() so that calendar state exists.
     */
    init() {
      const s = _state();
      // Defensive: if a legacy save lacks fields we added later.
      if (!s.phase)         s.phase = PHASES.IDLE;
      if (!Array.isArray(s.events)) s.events = [];
      if (s.currentEvent === undefined) s.currentEvent = null;
      _persist();
    },

    // ── Date accessors ──

    /** @returns {CalendarDate} a clone of today's date. */
    getDate() {
      return _cloneDate(_state().date);
    },

    /** @returns {string} ISO-like string "YYYY-MM-DD". */
    dateToISO(d) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
    },

    /** @returns {string} human-readable "April 10, 2026". */
    formatDate(d) {
      const date = d || _state().date;
      return `${MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;
    },

    /** Compare two dates. Exposed for external use. @returns {-1|0|1} */
    compareDates(a, b) {
      return _cmpDates(a, b);
    },

    /** @returns {CalendarDate} a new date n days after `d`. */
    addDays(d, n) {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`[Calendar] addDays: n must be a non-negative integer, got ${n}`);
      }
      return _addDays(d, n);
    },

    /**
     * Day of week, ISO 8601 order: 0 = Monday … 6 = Sunday.
     * @param {CalendarDate} d
     * @returns {number}
     */
    getDayOfWeek(d) {
      return _dayOfWeek(d);
    },

    /**
     * @param {CalendarDate} d
     * @param {boolean} [short=false]
     * @returns {string} 'Monday' / 'Mon'
     */
    getDayOfWeekName(d, short = false) {
      const i = _dayOfWeek(d);
      return short ? DOW_NAMES_SHORT[i] : DOW_NAMES_LONG[i];
    },

    /**
     * @param {number} year
     * @param {number} month  1-12
     * @returns {number}      28 / 29 / 30 / 31
     */
    getDaysInMonth(year, month) {
      return _daysInMonth(year, month);
    },

    // ── Phase accessors ──

    /** @returns {'idle'|'event_prompt'|'in_tournament'|'in_training'} */
    getPhase() {
      return _state().phase;
    },

    isIdle()         { return _state().phase === PHASES.IDLE; },
    isEventPrompt()  { return _state().phase === PHASES.EVENT_PROMPT; },
    isInTournament() { return _state().phase === PHASES.IN_TOURNAMENT; },
    isInTraining()   { return _state().phase === PHASES.IN_TRAINING; },

    /** @returns {CalendarEvent | null} */
    getCurrentEvent() {
      return _state().currentEvent;
    },

    // ── Event queue ──

    /**
     * Schedule a new event. Auto-generates an id if missing.
     * Inserts into the events[] in date order.
     * @param {CalendarEvent} ev
     * @returns {string} the event id
     */
    scheduleEvent(ev) {
      _validateEvent(ev);
      const s = _state();
      const event = {
        id:      ev.id || _genEventId(),
        date:    _cloneDate(ev.date),
        type:    ev.type,
        label:   ev.label || '',
        payload: ev.payload || {},
      };
      _insertSorted(s.events, event);
      _persist();
      return event.id;
    },

    /**
     * Remove an event by id. No-op if not found.
     * @returns {boolean} true if an event was removed.
     */
    removeEvent(id) {
      const s = _state();
      const idx = s.events.findIndex((e) => e.id === id);
      if (idx === -1) return false;
      s.events.splice(idx, 1);
      _persist();
      return true;
    },

    /**
     * @param {number} [n=10]
     * @returns {CalendarEvent[]} the next n upcoming events (copy of the head of the queue).
     */
    getUpcomingEvents(n = 10) {
      return _state().events.slice(0, n);
    },

    /**
     * @returns {CalendarEvent[]} a shallow copy of the full event queue.
     *   Callers should treat the returned array as read-only —
     *   mutations must go through scheduleEvent / removeEvent.
     */
    getAllEvents() {
      return _state().events.slice();
    },

    /** @returns {number} the total number of scheduled events. */
    getEventCount() {
      return _state().events.length;
    },

    onDayAdvanced(handler) {
      if (typeof handler !== 'function') {
        throw new Error('[Calendar] onDayAdvanced handler must be a function');
      }
      _dayTickHandlers.add(handler);
      return () => this.offDayAdvanced(handler);
    },

    offDayAdvanced(handler) {
      _dayTickHandlers.delete(handler);
    },

    // ── Continue button ─────────────────────────────────────

    /**
     * Advance the calendar day by day until either:
     *   - An event becomes due (date <= today) → phase = event_prompt
     *   - MAX_CONTINUE_DAYS is reached         → stay idle
     *
     * Only callable from the `idle` phase. If an event is already in
     * progress, the caller must resolve it first (consumeCurrentEvent
     * or enter a downstream phase).
     *
     * @returns {{ stoppedBy: 'event' | 'limit', event: CalendarEvent | null, daysAdvanced: number }}
     */
    continue() {
      const s = _state();
      if (s.phase !== PHASES.IDLE) {
        throw new Error(`[Calendar] continue() only valid in 'idle' phase, currently '${s.phase}'`);
      }

      let daysAdvanced = 0;
      for (let i = 0; i < MAX_CONTINUE_DAYS; i++) {
        // Check if any event is due today BEFORE advancing. This
        // matters on the first iteration: a freshly scheduled event
        // matching today's date should fire immediately.
        const head = s.events[0];
        if (head && _cmpDates(head.date, s.date) <= 0) {
          // Remove from queue and enter event_prompt
          s.events.shift();
          s.phase = PHASES.EVENT_PROMPT;
          s.currentEvent = head;
          _persist();
          return { stoppedBy: 'event', event: head, daysAdvanced };
        }
        // No event today → advance one day
        s.date = _addOneDay(s.date);
        daysAdvanced += 1;
        _fireDayTickHandlers(s.date);
      }

      _persist();
      return { stoppedBy: 'limit', event: null, daysAdvanced };
    },

    /**
     * Advance the calendar by exactly one day, fire day-tick handlers,
     * persist, and leave phase/event state unchanged.
     */
    advanceOneDay() {
      const s = _state();
      s.date = _addOneDay(s.date);
      _fireDayTickHandlers(s.date);
      _persist();
      return _cloneDate(s.date);
    },

    /**
     * Mark the current event as handled and return to idle.
     * Called after the player dismisses a non-interactive event
     * (e.g. a news mail that doesn't require further action).
     */
    consumeCurrentEvent() {
      const s = _state();
      if (s.phase !== PHASES.EVENT_PROMPT) {
        throw new Error(`[Calendar] consumeCurrentEvent() only valid in 'event_prompt', currently '${s.phase}'`);
      }
      _enterIdle();
    },

    // ── Tournament and training transitions ─────────────────
    // Phase C (tournaments) and Phase E (training) will call these.

    /** Enter a tournament phase. Call after resolving an event_prompt. */
    enterTournament() {
      const s = _state();
      if (s.phase !== PHASES.IDLE && s.phase !== PHASES.EVENT_PROMPT) {
        throw new Error(`[Calendar] enterTournament() invalid from '${s.phase}'`);
      }
      s.phase = PHASES.IN_TOURNAMENT;
      s.currentEvent = null;
      _persist();
    },

    /** Exit a tournament phase. Returns to idle. */
    exitTournament() {
      const s = _state();
      if (s.phase !== PHASES.IN_TOURNAMENT) {
        throw new Error(`[Calendar] exitTournament() invalid from '${s.phase}'`);
      }
      _enterIdle();
    },

    /** Enter a training session. */
    enterTraining() {
      const s = _state();
      if (s.phase !== PHASES.IDLE && s.phase !== PHASES.EVENT_PROMPT) {
        throw new Error(`[Calendar] enterTraining() invalid from '${s.phase}'`);
      }
      s.phase = PHASES.IN_TRAINING;
      s.currentEvent = null;
      _persist();
    },

    /** Exit a training session. */
    exitTraining() {
      const s = _state();
      if (s.phase !== PHASES.IN_TRAINING) {
        throw new Error(`[Calendar] exitTraining() invalid from '${s.phase}'`);
      }
      _enterIdle();
    },

  };

})();

// Extend the debug global with a calendar shortcut for devtools access.
if (typeof window !== 'undefined' && window.cl) {
  window.cl.calendar = CalendarSystem;
}
