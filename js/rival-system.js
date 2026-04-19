// rival-system.js
//
// Phase F.1 — owner of persistent NPC rival state.
//
// Responsibilities:
//   - Seed `career.rivals` from RivalData on first run / after reset.
//   - Update Elo and head-to-head counters from direct player-vs-rival
//     encounters (called by TournamentSystem.finalize).
//   - Evolve rivals offscreen with a small archetype-based Elo drift
//     on a weekly cadence via CalendarSystem.onDayAdvanced.
//   - Derive the `friend / neutral / antagonist` relation from H2H.
//
// Boundary rules:
//   - Only this module writes to `career.rivals`.
//   - Elo updates for non-direct encounters do NOT happen here; offscreen
//     drift is the one canonical source outside direct matches.
//   - First-meeting framing: rivals start with `met = false`. The flag
//     flips true via `markMet(id)` the first time a player-vs-rival
//     pairing is resolved in a tournament. Inbox templates referring
//     to a rival as a "rival" must wait until `met === true`.

const RivalSystem = (() => {

  const OFFSCREEN_TICK_DAYS = 7;

  const ARCHETYPE_DRIFT = {
    rising:    { weeklyMean:  8,  weeklyAmp: 4, clampMin: -1200, clampMax: +1500 },
    steady:    { weeklyMean:  0,  weeklyAmp: 3, clampMin: -200,  clampMax: +200  },
    declining: { weeklyMean: -6,  weeklyAmp: 4, clampMin: -1500, clampMax: +400  },
    volatile:  { weeklyMean:  2,  weeklyAmp: 14, clampMin: -800,  clampMax: +1000 },
  };

  const RELATION_ANTAGONIST_DIFF = 2;
  const RELATION_FRIEND_DIFF     = 3;
  const RELATION_FRIEND_MIN_TOTAL = 3;

  const HEATED_RIVALRY_TOTAL = 3;

  const CO_REGISTRATION_BASE_CHANCE = 0.50;
  const CO_REGISTRATION_HEATED_BONUS = 0.10;
  const PROVOCATION_MAIL_LEAD_DAYS = 3;

  let _initialized = false;
  let _tickUnsubscribe = null;

  function _state() {
    return CareerManager._rawState();
  }

  function _cloneDate(d) {
    return { year: d.year, month: d.month, day: d.day };
  }

  function _compareDates(a, b) {
    if (typeof CalendarSystem !== 'undefined' && CalendarSystem.compareDates) {
      return CalendarSystem.compareDates(a, b);
    }
    if (a.year !== b.year) return a.year < b.year ? -1 : 1;
    if (a.month !== b.month) return a.month < b.month ? -1 : 1;
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    return 0;
  }

  function _addDays(date, n) {
    if (typeof CalendarSystem !== 'undefined' && CalendarSystem.addDays) {
      return CalendarSystem.addDays(date, n);
    }
    // Minimal fallback used only in degraded tests.
    const out = _cloneDate(date);
    for (let i = 0; i < n; i++) {
      out.day += 1;
      if (out.day > 28) { out.day = 1; out.month += 1; }
      if (out.month > 12) { out.month = 1; out.year += 1; }
    }
    return out;
  }

  /**
   * Ensure career.rivals is populated with one entry per catalogue rival
   * in the right schema shape. Preserves existing runtime data when the
   * save already has it.
   */
  function _normalizeState() {
    const s = _state();
    if (!Array.isArray(s.rivals)) s.rivals = [];

    const byId = new Map(s.rivals.map((r) => [r.id, r]));
    const normalized = [];

    for (const proto of RivalData.getAll()) {
      const existing = byId.get(proto.id);
      if (existing) {
        normalized.push({
          id:             proto.id,
          elo:            Number.isFinite(existing.elo) ? existing.elo : proto.startElo,
          startElo:       proto.startElo,
          archetype:      proto.archetype,
          headToHead:     existing.headToHead || { wins: 0, losses: 0, draws: 0 },
          met:            existing.met === true,
          lastMetDate:    existing.lastMetDate || null,
          lastDriftDate:  existing.lastDriftDate || null,
          recentForm:     existing.recentForm || [],
          committedTournaments: Array.isArray(existing.committedTournaments) ? existing.committedTournaments : [],
        });
      } else {
        normalized.push({
          id:             proto.id,
          elo:            proto.startElo,
          startElo:       proto.startElo,
          archetype:      proto.archetype,
          headToHead:     { wins: 0, losses: 0, draws: 0 },
          met:            false,
          lastMetDate:    null,
          lastDriftDate:  null,
          recentForm:     [],
          committedTournaments: [],
        });
      }
    }

    s.rivals = normalized;
  }

  function _findRival(id) {
    const s = _state();
    return s.rivals.find((r) => r.id === id) || null;
  }

  function _clampDrift(rival, delta) {
    const rules = ARCHETYPE_DRIFT[rival.archetype] || ARCHETYPE_DRIFT.steady;
    const diff = rival.elo + delta - rival.startElo;
    if (diff < rules.clampMin) return rules.clampMin + rival.startElo - rival.elo;
    if (diff > rules.clampMax) return rules.clampMax + rival.startElo - rival.elo;
    return delta;
  }

  function _weeklyDriftFor(rival) {
    const rules = ARCHETYPE_DRIFT[rival.archetype] || ARCHETYPE_DRIFT.steady;
    const noise = (Math.random() * 2 - 1) * rules.weeklyAmp;
    const raw = Math.round(rules.weeklyMean + noise);
    return _clampDrift(rival, raw);
  }

  function _titleForElo(elo) {
    if (typeof CareerManager !== 'undefined' && CareerManager.titleForElo) {
      return CareerManager.titleForElo(elo);
    }
    if (elo >= 2500) return 'GM';
    if (elo >= 2400) return 'IM';
    if (elo >= 2300) return 'FM';
    if (elo >= 2200) return 'CM';
    return null;
  }

  function _snapshotRival(rival) {
    return {
      ...JSON.parse(JSON.stringify(rival)),
      title: _titleForElo(rival.elo),
    };
  }

  function _formatName(name, title) {
    if (typeof CareerManager !== 'undefined' && CareerManager.formatTitledName) {
      return CareerManager.formatTitledName(name, title);
    }
    return title ? `${title} ${name}` : name;
  }

  function _pushRecentForm(rival, tag) {
    rival.recentForm.push(tag);
    if (rival.recentForm.length > 10) rival.recentForm.shift();
  }

  return {

    ARCHETYPE_DRIFT,
    OFFSCREEN_TICK_DAYS,

    init() {
      _normalizeState();
      CareerManager.save();
      if (_initialized) return;
      _initialized = true;

      if (typeof CalendarSystem !== 'undefined' && CalendarSystem.onDayAdvanced) {
        _tickUnsubscribe = CalendarSystem.onDayAdvanced((date) => {
          this.tickOffscreenProgression(date);
          this.processCommitmentMails(date);
        });
      }
    },

    /** Testing aid — forget all runtime state. */
    _teardown() {
      if (_tickUnsubscribe) {
        _tickUnsubscribe();
        _tickUnsubscribe = null;
      }
      _initialized = false;
    },

    /** @returns {Array} a deep copy of the live rivals array. */
    getAll() {
      return _state().rivals.map((r) => _snapshotRival(r));
    },

    /** @param {string} id */
    getById(id) {
      const live = _findRival(id);
      return live ? _snapshotRival(live) : null;
    },

    /**
     * Return the N rivals whose Elo is closest to the player's current
     * Elo. Ties broken by absolute delta then id for stability.
     */
    getNearestToPlayer(playerElo, n) {
      const rivals = _state().rivals.slice();
      rivals.sort((a, b) => {
        const da = Math.abs(a.elo - playerElo);
        const db = Math.abs(b.elo - playerElo);
        if (da !== db) return da - db;
        return a.id < b.id ? -1 : 1;
      });
      return rivals.slice(0, Math.max(0, n | 0)).map((r) => _snapshotRival(r));
    },

    /**
     * Return a list of rivals eligible to show up in a tournament whose
     * Elo window is [eloMin, eloMax]. Order is stable by id for deterministic
     * injection choices.
     */
    getEligibleForTournament(eloMin, eloMax) {
      return _state().rivals
        .filter((r) => r.elo >= eloMin && r.elo <= eloMax)
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((r) => _snapshotRival(r));
    },

    /**
     * Flip `met` to true the first time a player-vs-rival pairing
     * appears in a live tournament. Idempotent.
     *
     * @param {string} id
     * @param {object} [date] calendar date of the meeting
     * @returns {boolean} true if this call actually flipped the flag
     */
    markMet(id, date) {
      const r = _findRival(id);
      if (!r) return false;
      if (r.met) {
        if (date) r.lastMetDate = _cloneDate(date);
        CareerManager.save();
        return false;
      }
      r.met = true;
      r.lastMetDate = date ? _cloneDate(date) : (
        typeof CalendarSystem !== 'undefined' ? _cloneDate(CalendarSystem.getDate()) : null
      );
      CareerManager.save();
      return true;
    },

    /**
     * Record a direct player-vs-rival match outcome. Updates H2H and
     * the rival's Elo using the same FIDE formula as the player side.
     *
     * @param {string} id
     * @param {'win'|'draw'|'loss'} playerResult  from the player's POV
     * @param {number} playerElo                  used for rival's Elo math
     * @param {object} [date]
     * @returns {{ eloBefore: number, eloAfter: number, delta: number } | null}
     */
    recordEncounter(id, playerResult, playerElo, date) {
      const r = _findRival(id);
      if (!r) return null;
      if (!['win', 'draw', 'loss'].includes(playerResult)) {
        throw new Error('[Rivals] bad playerResult: ' + playerResult);
      }

      if (playerResult === 'win')  r.headToHead.losses += 1;
      if (playerResult === 'loss') r.headToHead.wins   += 1;
      if (playerResult === 'draw') r.headToHead.draws  += 1;

      // Rival score is the mirror of the player's result.
      const rivalScoreMap = { win: 0, draw: 0.5, loss: 1 };
      const score = rivalScoreMap[playerResult];
      const elo = r.elo;
      const E = 1 / (1 + 10 ** ((playerElo - elo) / 400));
      const K = elo < 2400 ? 32 : 16;
      const delta = Math.round(K * (score - E));
      const eloBefore = elo;
      r.elo = Math.max(100, elo + delta);

      if (date) r.lastMetDate = _cloneDate(date);
      _pushRecentForm(r, playerResult === 'loss' ? 'W' : (playerResult === 'win' ? 'L' : 'D'));

      if (!r.met) {
        r.met = true;
      }

      CareerManager.save();
      return { eloBefore, eloAfter: r.elo, delta };
    },

    /**
     * Step offscreen progression for every rival whose last drift is
     * older than OFFSCREEN_TICK_DAYS. Called from the CalendarSystem
     * day-tick.
     *
     * @param {{year,month,day}} currentDate
     */
    tickOffscreenProgression(currentDate) {
      if (!currentDate) return;
      const s = _state();
      let mutated = false;

      for (const r of s.rivals) {
        if (!r.lastDriftDate) {
          r.lastDriftDate = _cloneDate(currentDate);
          mutated = true;
          continue;
        }
        const next = _addDays(r.lastDriftDate, OFFSCREEN_TICK_DAYS);
        if (_compareDates(currentDate, next) < 0) continue;

        const delta = _weeklyDriftFor(r);
        r.elo = Math.max(100, r.elo + delta);
        r.lastDriftDate = _cloneDate(currentDate);
        _pushRecentForm(r, delta > 0 ? '+' : (delta < 0 ? '-' : '='));
        mutated = true;
      }

      if (mutated) CareerManager.save();
    },

    /**
     * Derive the narrative relation from H2H. Not persisted — computed
     * on demand so we never drift out of sync with the raw counters.
     *
     * @param {string} id
     * @returns {'friend'|'neutral'|'antagonist'}
     */
    getRelation(id) {
      const r = _findRival(id);
      if (!r) return 'neutral';
      const h = r.headToHead;
      const total = h.wins + h.losses + h.draws;
      const diff  = h.wins - h.losses; // player-POV: wins = player losses? No — see note.
      // Note on semantics: `wins` counts rival wins, `losses` counts rival
      // losses, from the rival's perspective. So a rival who BEATS the
      // player often (high wins) feels antagonistic, and a rival who
      // LOSES to the player often (high losses) feels like a friendly
      // sparring partner.
      if (diff >= RELATION_ANTAGONIST_DIFF) return 'antagonist';
      if (-diff >= RELATION_FRIEND_DIFF && total >= RELATION_FRIEND_MIN_TOTAL) return 'friend';
      return 'neutral';
    },

    /** @returns {boolean} true once H2H has reached the "heated" threshold. */
    isHeatedRivalry(id) {
      const r = _findRival(id);
      if (!r) return false;
      const h = r.headToHead;
      return (h.wins + h.losses + h.draws) >= HEATED_RIVALRY_TOTAL;
    },

    /**
     * Return the committed-tournament entry for a rival, or null.
     *
     * @param {string} rivalId
     * @param {string} tournamentId
     * @param {object} startDate
     */
    getCommitment(rivalId, tournamentId, startDate) {
      const r = _findRival(rivalId);
      if (!r || !Array.isArray(r.committedTournaments)) return null;
      return r.committedTournaments.find((c) =>
        c.tournamentId === tournamentId &&
        c.startDate &&
        _compareDates(c.startDate, startDate) === 0,
      ) || null;
    },

    /**
     * Return rivals who have COMMITTED to a given tournament instance.
     *
     * @param {string} tournamentId
     * @param {object} startDate
     */
    getCommittedRivalsForTournament(tournamentId, startDate) {
      const out = [];
      for (const r of _state().rivals) {
        if (!Array.isArray(r.committedTournaments)) continue;
        const hit = r.committedTournaments.find((c) =>
          c.tournamentId === tournamentId &&
          c.startDate &&
          _compareDates(c.startDate, startDate) === 0,
        );
        if (hit) out.push(_snapshotRival(r));
      }
      return out;
    },

    /**
     * Remove a commitment record (called once the tournament is under
     * way or cancelled — prevents the provocation mail from firing
     * forever).
     */
    clearCommitment(rivalId, tournamentId, startDate) {
      const r = _findRival(rivalId);
      if (!r || !Array.isArray(r.committedTournaments)) return;
      r.committedTournaments = r.committedTournaments.filter((c) =>
        !(c.tournamentId === tournamentId &&
          c.startDate &&
          _compareDates(c.startDate, startDate) === 0),
      );
      CareerManager.save();
    },

    /**
     * Phase F.4 — roll each met + Elo-eligible rival for co-registration
     * at the given tournament instance. Commitments are persisted so
     * `_buildRivalEntries` guarantees them in the field and the day-tick
     * pushes a J-3 provocation mail.
     *
     * @param {string} tournamentId
     * @param {object} tournament   catalogue entry (for eloMin/eloMax)
     * @param {object} startDate    resolved start date of this instance
     * @param {string} tournamentName display name for the mail
     */
    rollRivalCoRegistrations(tournamentId, tournament, startDate, tournamentName) {
      const rivals = _state().rivals;
      let mutated = false;
      for (const r of rivals) {
        if (!r.met) continue;
        if (r.elo < tournament.eloMin || r.elo > tournament.eloMax) continue;

        const already = (r.committedTournaments || []).some((c) =>
          c.tournamentId === tournamentId &&
          c.startDate &&
          _compareDates(c.startDate, startDate) === 0,
        );
        if (already) continue;

        const isHeated = (r.headToHead.wins + r.headToHead.losses + r.headToHead.draws) >= HEATED_RIVALRY_TOTAL;
        const chance = CO_REGISTRATION_BASE_CHANCE + (isHeated ? CO_REGISTRATION_HEATED_BONUS : 0);
        if (Math.random() >= chance) continue;

        r.committedTournaments.push({
          tournamentId,
          tournamentName: tournamentName || tournamentId,
          startDate: _cloneDate(startDate),
          committedAt: typeof CalendarSystem !== 'undefined' ? _cloneDate(CalendarSystem.getDate()) : null,
          provocationMailPushed: false,
        });
        mutated = true;
      }
      if (mutated) CareerManager.save();
    },

    /**
     * Process provocation-mail dispatch and stale-commit cleanup.
     * Called from the CalendarSystem day tick right after offscreen
     * drift.
     *
     * @param {object} currentDate
     */
    processCommitmentMails(currentDate) {
      if (!currentDate) return;
      const rivals = _state().rivals;
      let mutated = false;

      for (const r of rivals) {
        if (!Array.isArray(r.committedTournaments)) continue;
        for (const c of r.committedTournaments) {
          if (c.provocationMailPushed) continue;
          const fireDate = _addDays(c.startDate, -PROVOCATION_MAIL_LEAD_DAYS);
          // If today is on or after the J-3 date (and still before the
          // tournament starts), fire the mail.
          const onOrAfterFire = _compareDates(currentDate, fireDate) >= 0;
          const beforeStart   = _compareDates(currentDate, c.startDate) < 0;
          if (!onOrAfterFire) continue;

          if (beforeStart && typeof InboxSystem !== 'undefined') {
            const proto = RivalData.getById(r.id);
            const rivalName = proto
              ? _formatName(proto.name, _titleForElo(r.elo))
              : 'A rival';
            const text = _provocationText(r);
            InboxSystem.push('rival_provocation_before_tournament', {
              rivalName,
              tournamentName: c.tournamentName || 'the tournament',
              provocationText: text,
            });
          }
          c.provocationMailPushed = true;
          mutated = true;
        }

        // Drop commitments whose tournament start has already passed.
        const before = r.committedTournaments.length;
        r.committedTournaments = r.committedTournaments.filter((c) =>
          _compareDates(currentDate, c.startDate) <= 0,
        );
        if (r.committedTournaments.length !== before) mutated = true;
      }
      if (mutated) CareerManager.save();
    },
  };

  function _provocationText(rival) {
    const relation = (() => {
      const h = rival.headToHead;
      const diff = h.wins - h.losses;
      if (diff >= RELATION_ANTAGONIST_DIFF) return 'antagonist';
      if (-diff >= RELATION_FRIEND_DIFF && (h.wins + h.losses + h.draws) >= RELATION_FRIEND_MIN_TOTAL) return 'friend';
      return 'neutral';
    })();
    if (relation === 'antagonist') {
      return 'I see you signed up. Hope you brought better ideas than last time.';
    }
    if (relation === 'friend') {
      return 'Looking forward to another friendly battle over the board. Good luck.';
    }
    return 'Saw your name on the entry list. Let us see what happens.';
  }

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.rivals = RivalSystem;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RivalSystem;
}
