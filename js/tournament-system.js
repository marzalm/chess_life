// tournament-system.js
//
// Phase C.2 — orchestration layer that turns the static catalogue
// (tournament-data.js) into actionable in-game tournaments.
//
// Phase C.2a (registration & lobby) responsibilities:
//   - Resolve `home: true` templates against the player's nationality
//     so a Norwegian player gets the Local Weekend Open in Oslo, an
//     American gets it in New York, etc.
//   - Generate plausible opponent names per country with a small
//     hand-curated pool plus a generic fallback.
//   - Enforce two hard registration barriers from the data: minimum
//     player Elo (`eloMin`) and an entry fee (`entryFee` deducted from
//     CareerManager.finances).
//   - Surface a single `tournament_start` calendar event per
//     registration.
//
// Phase C.2b (run loop & payout) responsibilities:
//   - When the player consumes a `tournament_start` event, build the
//     full field of opponents and persist it as
//     CareerManager.calendar.currentTournament.
//   - Pair each round either with a simplified Swiss algorithm
//     (score group → top half vs bottom half, no rematch, byes for
//     the leftover odd player) or with a pre-generated round-robin
//     schedule for closed elite events.
//   - Let the player play their game on the existing chess board
//     (the actual UI integration lives in C.3); record the result
//     and simulate every other pairing's result with an Elo-based
//     probability model.
//   - Compute final standings, pay prize money to the player, push
//     a row into CareerManager.history.tournaments, advance the
//     calendar by `daysDuration` days, and return to the idle phase.
//
// Pure logic, no DOM. Reads from TournamentData / CareerManager /
// CalendarSystem via their public APIs.

const TournamentSystem = (() => {

  const SIMULATION_PLAYER_PENALTY = 50;

  // ── Default home cities by ISO country code ────────────────
  // The player can later override this with a custom home city
  // (Phase E or beyond). For now we pick a sensible default for
  // every nationality offered by the character creator.

  const HOME_CITIES = {
    AR: 'Buenos Aires', AM: 'Yerevan',     AU: 'Sydney',
    AZ: 'Baku',         BR: 'São Paulo',   CA: 'Toronto',
    CN: 'Shanghai',     CU: 'Havana',      CZ: 'Prague',
    DK: 'Copenhagen',   EG: 'Cairo',       EN: 'London',
    FR: 'Paris',        DE: 'Berlin',      GE: 'Tbilisi',
    HU: 'Budapest',     IN: 'Mumbai',      IR: 'Tehran',
    IL: 'Tel Aviv',     IT: 'Rome',        JP: 'Tokyo',
    KZ: 'Almaty',       MA: 'Casablanca',  NL: 'Amsterdam',
    NO: 'Oslo',         PE: 'Lima',        PH: 'Manila',
    PL: 'Warsaw',       RO: 'Bucharest',   RU: 'Moscow',
    RS: 'Belgrade',     ES: 'Madrid',      SE: 'Stockholm',
    CH: 'Zurich',       TR: 'Istanbul',    UA: 'Kyiv',
    GB: 'London',       US: 'New York',    UZ: 'Tashkent',
    VN: 'Hanoi',
  };

  // ── Name pools for opponent generation ─────────────────────
  // The big catalogue lives in name-pools.js (NamePools). This
  // small in-module NAMES table is kept as a hard-coded fallback
  // used only when NamePools is not loaded (tests, standalone use).

  const NAMES = {
    NO: {
      first: ['Magnus', 'Aryan', 'Johan', 'Lars', 'Erik', 'Henrik', 'Sigurd', 'Aksel'],
      last:  ['Olsen', 'Hansen', 'Andersen', 'Nilsen', 'Carlsen', 'Berg', 'Halvorsen', 'Vik'],
    },
    FR: {
      first: ['Maxime', 'Étienne', 'Romain', 'Hugo', 'Léo', 'Antoine', 'Julien', 'Pierre'],
      last:  ['Lefèvre', 'Bernard', 'Moreau', 'Petit', 'Roux', 'Dupont', 'Lemoine', 'Vidal'],
    },
    GB: {
      first: ['Oliver', 'Harry', 'Jack', 'George', 'Charlie', 'Thomas', 'James', 'William'],
      last:  ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Davies', 'Roberts'],
    },
    EN: {
      first: ['Oliver', 'Harry', 'Jack', 'George', 'Charlie', 'Thomas', 'James', 'William'],
      last:  ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Davies', 'Roberts'],
    },
    US: {
      first: ['Hikaru', 'Wesley', 'Fabiano', 'Sam', 'Ray', 'Daniel', 'Hans', 'Awonder'],
      last:  ['Robson', 'Liang', 'Caruana', 'Sevian', 'Moradiabadi', 'Naroditsky', 'Niemann', 'Shankland'],
    },
    DE: {
      first: ['Vincent', 'Alexander', 'Daniel', 'Niclas', 'Liam', 'Felix', 'Matthias', 'Jonas'],
      last:  ['Keymer', 'Donchenko', 'Fridman', 'Huschenbeth', 'Bluebaum', 'Ragger', 'Rapport', 'Schmidt'],
    },
    NL: {
      first: ['Anish', 'Jorden', 'Erwin', 'Jan-Krzysztof', 'Robin', 'Max', 'Roeland', 'Loek'],
      last:  ['Giri', 'van den Doel', "L'Ami", 'Duda', 'van Kampen', 'Warmerdam', 'Pruijssers', 'van Wely'],
    },
    RU: {
      first: ['Sergey', 'Daniil', 'Vladimir', 'Andrey', 'Dmitry', 'Nikita', 'Maxim', 'Evgeny'],
      last:  ['Karjakin', 'Dubov', 'Fedoseev', 'Esipenko', 'Andreikin', 'Vitiugov', 'Matlakov', 'Tomashevsky'],
    },
    IN: {
      first: ['Vidit', 'Pentala', 'Krishnan', 'Aravindh', 'Nihal', 'Rameshbabu', 'Gukesh', 'Arjun'],
      last:  ['Gujrathi', 'Harikrishna', 'Sasikiran', 'Chithambaram', 'Sarin', 'Praggnanandhaa', 'Dommaraju', 'Erigaisi'],
    },
    CN: {
      first: ['Ding', 'Wei', 'Yu', 'Bu', 'Xu', 'Wang', 'Lu', 'Li'],
      last:  ['Liren', 'Yi', 'Yangyi', 'Xiangzhi', 'Xiangyu', 'Hao', 'Shanglei', 'Chao'],
    },
    ES: {
      first: ['David', 'Paco', 'Jaime', 'Iván', 'Alberto', 'Daniel', 'Jorge', 'Miguel'],
      last:  ['Antón', 'Vallejo', 'Santos', 'Salgado', 'Anand', 'Alsina', 'Cori', 'Granda'],
    },
    PL: {
      first: ['Jan-Krzysztof', 'Radosław', 'Mateusz', 'Kamil', 'Bartosz', 'Igor', 'Krzysztof', 'Paweł'],
      last:  ['Duda', 'Wojtaszek', 'Bartel', 'Mitoń', 'Soćko', 'Janik', 'Tomczak', 'Czarnota'],
    },
    UA: {
      first: ['Vasyl', 'Anton', 'Pavlo', 'Yuriy', 'Andriy', 'Igor', 'Mikhail', 'Eljanov'],
      last:  ['Ivanchuk', 'Korobov', 'Eljanov', 'Kryvoruchko', 'Volokitin', 'Kovalenko', 'Areshchenko', 'Pavel'],
    },
    AM: {
      first: ['Levon', 'Gabriel', 'Hrant', 'Robert', 'Karen', 'Tigran', 'Artur', 'Sergei'],
      last:  ['Aronian', 'Sargissian', 'Melkumyan', 'Hovhannisyan', 'Grigoryan', 'Petrosian', 'Babujian', 'Movsesian'],
    },
    AZ: {
      first: ['Shakhriyar', 'Teimour', 'Vasif', 'Rauf', 'Eltaj', 'Nijat', 'Aydin', 'Vugar'],
      last:  ['Mamedyarov', 'Radjabov', 'Durarbayli', 'Mamedov', 'Safarli', 'Abasov', 'Suleymanli', 'Gashimov'],
    },
    CZ: {
      first: ['David', 'Viktor', 'Thai', 'Štěpán', 'Jan', 'Vlastimil', 'Jiří', 'Pavel'],
      last:  ['Navara', 'Láznička', 'Dai', 'Žilka', 'Krejčí', 'Babula', 'Štoček', 'Šimáček'],
    },
    HU: {
      first: ['Richárd', 'Péter', 'Csaba', 'Zoltán', 'Benjamin', 'Ferenc', 'Viktor', 'Tamás'],
      last:  ['Rapport', 'Lékó', 'Balogh', 'Almási', 'Gledura', 'Berkes', 'Erdős', 'Bánusz'],
    },
    SE: {
      first: ['Nils', 'Jonny', 'Tiger', 'Erik', 'Pia', 'Axel', 'Hans', 'Andreas'],
      last:  ['Grandelius', 'Hector', 'Hillarp', 'Blomqvist', 'Cramling', 'Smith', 'Tikkanen', 'Lindberg'],
    },
    DK: {
      first: ['Bjørn', 'Jens', 'Allan', 'Mads', 'Jakob', 'Sune', 'Jonas', 'Carsten'],
      last:  ['Møller', 'Jensen', 'Stubberud', 'Andreasen', 'Jakobsen', 'Berg Hansen', 'Bjerre', 'Høi'],
    },
    IT: {
      first: ['Daniele', 'Fabiano', 'Sabino', 'Lorenzo', 'Pier Luigi', 'Axel', 'Luca', 'Sergio'],
      last:  ['Vocaturo', 'Caruana', 'Brunello', 'Lodici', 'Basso', 'Rombaldoni', 'Moroni', 'Mariotti'],
    },
  };

  // Generic fallback name pool used when the country has no entry above.
  const NAMES_FALLBACK = {
    first: ['Alex', 'Sam', 'Jordan', 'Robin', 'Chris', 'Pat', 'Lee', 'Kim', 'Andrea', 'Lou'],
    last:  ['Walker', 'Carter', 'Foster', 'Hayes', 'Reed', 'Brooks', 'Hill', 'Cole', 'Ward', 'Fox'],
  };

  // ── Internal helpers ───────────────────────────────────────

  function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function _shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /**
   * Prefer the richer NamePools module when loaded. Fall back to
   * the small in-module NAMES table otherwise.
   */
  function _getPool(countryCode) {
    if (typeof NamePools !== 'undefined') {
      return NamePools.getPool(countryCode);
    }
    return NAMES[countryCode] || NAMES_FALLBACK;
  }

  function _getAvailableCountries() {
    if (typeof NamePools !== 'undefined') {
      return NamePools.getCountries();
    }
    return Object.keys(NAMES);
  }

  /**
   * Sample a random country code from a sensible chess-playing pool.
   * Used when generating an "international visitor" opponent.
   */
  function _randomInternationalCountry() {
    const pool = _getAvailableCountries();
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function _visitorChanceForTournament(tournament) {
    if (tournament.tier <= 1) return 0.10;
    if (tournament.tier === 2) return 0.40;
    if (tournament.tier === 3) return 0.65;
    if (tournament.tier === 4) return 0.78;
    if (tournament.tier === 5) return 0.88;
    return 0.94;
  }

  /**
   * Pick a first/last name for a player from the given country.
   * Falls back to the generic pool when the country isn't curated.
   */
  function _generateName(countryCode) {
    const pool = _getPool(countryCode);
    return {
      first: _pick(pool.first),
      last:  _pick(pool.last),
    };
  }

  /**
   * Resolve a tournament template against the player's nationality.
   * For `home: true` templates, fills in city + country from the
   * HOME_CITIES table. Non-home tournaments are returned unchanged.
   *
   * @returns {object} a shallow copy with city/country resolved.
   */
  function _resolveTournament(t) {
    if (!t.home) return { ...t };
    const player = CareerManager.player.get();
    const country = player.nationality || 'US';
    const city    = HOME_CITIES[country] || 'Hometown';
    return { ...t, city, country };
  }

  /**
   * Find the next available start date of a tournament in a given
   * year — that is on or after today, AND not already scheduled in
   * the calendar for this tournament id.
   * Returns null if every annualDate has either passed or is
   * already booked.
   */
  function _nextStartDate(t, year) {
    const today = CalendarSystem.getDate();

    // Dates already booked for this tournament in the event queue.
    const bookedKeys = new Set(
      CalendarSystem.getAllEvents()
        .filter(
          (e) =>
            e.type === 'tournament_start' &&
            e.payload &&
            e.payload.tournamentId === t.id,
        )
        .map((e) => `${e.date.year}-${e.date.month}-${e.date.day}`),
    );

    // Also exclude the date of a currently-running instance
    const liveInstance = CareerManager.calendar.get().currentTournament;
    if (
      liveInstance &&
      liveInstance.tournamentId === t.id &&
      liveInstance.startDate
    ) {
      const d = liveInstance.startDate;
      bookedKeys.add(`${d.year}-${d.month}-${d.day}`);
    }

    // Sort candidates by date ascending so we always pick the
    // earliest available slot.
    const candidates = t.annualDates
      .map((d) => ({ year, month: d.month, day: d.day }))
      .filter((c) => CalendarSystem.compareDates(c, today) >= 0)
      .filter((c) => !bookedKeys.has(`${c.year}-${c.month}-${c.day}`))
      .sort((a, b) => CalendarSystem.compareDates(a, b));

    return candidates[0] || null;
  }

  // ── Public API ─────────────────────────────────────────────

  return {

    // Static lookup tables, exposed for tests and the lobby UI
    HOME_CITIES,

    /**
     * Resolve a tournament template against the current player.
     * For `home: true` templates the result includes the player's
     * home city/country. For fixed-location tournaments, returns
     * a shallow copy of the catalogue entry.
     *
     * @param {string} tournamentId
     * @returns {object | null}
     */
    resolve(tournamentId) {
      const t = TournamentData.getById(tournamentId);
      if (!t) return null;
      return _resolveTournament(t);
    },

    /**
     * Generate a single opponent for a given tournament.
     * Used internally by the run loop (C.2b) and exposed for tests.
     *
     * @param {object} tournament
     * @param {string} hostCountry resolved country of the tournament
     */
    generateOpponent(tournament, hostCountry) {
      // Lower tiers are mostly local. Higher tiers become sharply more
      // international, with only a small host-country slice surviving.
      const visitorChance = _visitorChanceForTournament(tournament);
      const isVisitor = Math.random() < visitorChance;
      const country = isVisitor ? _randomInternationalCountry() : hostCountry;

      const { first, last } = _generateName(country);

      // Bias the elo toward the middle of the tournament's window.
      // mid ± up to half the span, clamped to [eloMin, eloMax].
      const min = tournament.eloMin;
      const max = tournament.eloMax;
      const mid = Math.round((min + max) / 2);
      const span = Math.round((max - min) / 2);
      const elo = Math.max(min, Math.min(max, mid + _randInt(-span, span)));

      return {
        id:          'opp_' + Math.random().toString(36).slice(2, 10),
        name:        `${first} ${last}`,
        elo,
        title:       _titleForElo(elo),
        nationality: country,
      };
    },

    /**
     * Decide whether the player can register for a specific instance
     * of a tournament. When `targetDate` is omitted, the check
     * resolves to "the next future instance" — matching what
     * `register()` would actually schedule.
     *
     * Hard barriers (block registration):
     *   - 'unknown_tournament' — id not in catalogue
     *   - 'elo_too_low'        — playerElo < tournament.eloMin
     *   - 'cant_afford'        — playerMoney < tournament.entryFee
     *   - 'already_registered' — a tournament_start event for this
     *                            tournamentId AND this exact date is
     *                            already in the calendar queue, OR
     *                            the player is currently playing
     *                            this exact instance (same id and
     *                            same start date)
     *
     * Soft warnings (do not block):
     *   - 'below_your_level'   — playerElo > tournament.eloMax
     *
     * @param {string} tournamentId
     * @param {CalendarDate} [targetDate]  the specific instance the
     *        player is trying to register for. If omitted, we try to
     *        resolve it to the next future instance this year.
     * @returns {{ ok: boolean, reasons: string[], warnings: string[] }}
     */
    canRegister(tournamentId, targetDate) {
      const t = TournamentData.getById(tournamentId);
      if (!t) return { ok: false, reasons: ['unknown_tournament'], warnings: [] };

      const player   = CareerManager.player.get();
      const finances = CareerManager.finances.get();

      const reasons  = [];
      const warnings = [];

      if (player.elo < t.eloMin)            reasons.push('elo_too_low');
      if (finances.money < t.entryFee)      reasons.push('cant_afford');
      if (player.elo > t.eloMax)            warnings.push('below_your_level');

      // Fall back to the next future date of this tournament in the
      // current year if the caller didn't supply a specific one.
      const today = CalendarSystem.getDate();
      const effectiveDate = targetDate || _nextStartDate(t, today.year);

      if (effectiveDate) {
        // Duplicate check: is there already a tournament_start event
        // for this id AND this exact date in the calendar queue?
        const scheduled = CalendarSystem.getAllEvents().some(
          (e) =>
            e.type === 'tournament_start' &&
            e.payload &&
            e.payload.tournamentId === tournamentId &&
            e.date &&
            CalendarSystem.compareDates(e.date, effectiveDate) === 0,
        );
        if (scheduled) reasons.push('already_registered');

        // Or is the player currently playing this exact instance?
        const cal = CareerManager.calendar.get();
        const live = cal.currentTournament;
        if (
          live &&
          live.tournamentId === tournamentId &&
          live.startDate &&
          CalendarSystem.compareDates(live.startDate, effectiveDate) === 0
        ) {
          if (!reasons.includes('already_registered')) {
            reasons.push('already_registered');
          }
        }
      }

      return { ok: reasons.length === 0, reasons, warnings };
    },

    /**
     * Register the player for the next instance of a tournament in
     * the given year. Deducts the entry fee from CareerManager.finances
     * and schedules a `tournament_start` event in the calendar.
     *
     * The actual round play happens in C.2b when the player consumes
     * the calendar event.
     *
     * @param {string} tournamentId
     * @param {number} year
     * @returns {{ ok: boolean, eventId?: string, error?: string }}
     */
    register(tournamentId, year) {
      const t = TournamentData.getById(tournamentId);
      if (!t) return { ok: false, error: 'unknown_tournament' };

      const date = _nextStartDate(t, year);
      if (!date) {
        return { ok: false, error: 'no_future_instance_this_year' };
      }

      const verdict = this.canRegister(tournamentId, date);
      if (!verdict.ok) {
        return { ok: false, error: verdict.reasons[0] || 'cannot_register' };
      }

      const resolved = _resolveTournament(t);

      // Deduct entry fee. canRegister already checked affordability,
      // so this should succeed — but addExpense is the source of truth.
      const paid = CareerManager.finances.addExpense(
        t.entryFee,
        `Entry fee — ${resolved.name}`,
      );
      if (!paid) {
        return { ok: false, error: 'cant_afford' };
      }

      const eventId = CalendarSystem.scheduleEvent({
        date,
        type:  'tournament_start',
        label: `${resolved.name} — ${resolved.city}`,
        payload: {
          tournamentId,
          city:    resolved.city,
          country: resolved.country,
          year,
          isHome:  Boolean(t.home),
          rounds:  t.rounds,
          duration: t.daysDuration,
        },
      });

      // F.4 — co-registration: met rivals in the Elo window may decide
      // to sign up for the same event. Delegates probability and state
      // writes to RivalSystem to keep tournament as a pure orchestrator.
      if (typeof RivalSystem !== 'undefined' && RivalSystem.rollRivalCoRegistrations) {
        try {
          RivalSystem.rollRivalCoRegistrations(tournamentId, t, date, resolved.name);
        } catch (e) {
          console.error('[Tournament] rival co-registration failed:', e);
        }
      }

      return { ok: true, eventId };
    },

    /**
     * Build the lobby view for a year: every tournament instance
     * whose start date is today or later, with its resolved metadata
     * and the player's eligibility verdict.
     *
     * @param {number} year
     * @returns {Array<{
     *   tournamentId: string,
     *   tournament: object,            resolved tournament (city/country filled)
     *   date: { year, month, day },
     *   eligible: { ok, reasons, warnings },
     * }>}
     */
    getEligibleInstancesForYear(year) {
      const all   = TournamentData.getInstancesForYear(year);
      const today = CalendarSystem.getDate();

      const out = [];
      for (const inst of all) {
        if (CalendarSystem.compareDates(inst.date, today) < 0) continue;
        const t = TournamentData.getById(inst.tournamentId);
        if (!t) continue;
        out.push({
          tournamentId: inst.tournamentId,
          tournament:   _resolveTournament(t),
          date:         inst.date,
          eligible:     this.canRegister(inst.tournamentId, inst.date),
        });
      }
      return out;
    },

    // ════════════════════════════════════════════════════════
    // PHASE C.2b — RUN LOOP
    // ════════════════════════════════════════════════════════

    /**
     * Begin a tournament. Called when the player consumes a
     * `tournament_start` calendar event. Generates the full field
     * (player + opponents), pairs round 1, sets the calendar phase
     * to `in_tournament`, persists, and returns the live instance.
     *
     * @param {object} payload  the calendar event's payload as built
     *                          by register()
     * @returns {object} the live tournament instance
     */
    startTournament(payload) {
      const t = TournamentData.getById(payload.tournamentId);
      if (!t) throw new Error(`[Tournament] Unknown id: ${payload.tournamentId}`);

      const player = CareerManager.player.get();

      // The host country is whatever the registration resolved.
      // For home: true tournaments this is the player's nationality;
      // for fixed-location ones it's the catalogue country.
      const hostCountry = payload.country || _resolveTournament(t).country;

      const fieldSize = _fieldSizeForTournament(t);

      const field = [_buildPlayerEntry(player)];
      const usedNames = new Set();
      usedNames.add(field[0].name);

      // F.2 — inject 1..3 rivals eligible for this tournament's window.
      // We inject BEFORE generic opponents so their names reserve slots.
      const rivalEntries = _buildRivalEntries(t, CalendarSystem.getDate());
      for (const entry of rivalEntries) {
        if (field.length >= fieldSize) break;
        field.push(entry);
        usedNames.add(entry.name);
      }

      const championEntries = _buildChampionEntries(t);
      for (const entry of championEntries) {
        if (field.length >= fieldSize) break;
        field.push(entry);
        usedNames.add(entry.name);
      }

      const remaining = fieldSize - field.length;
      for (let i = 0; i < remaining; i++) {
        // Try up to 12 times to get a unique name before accepting a
        // collision. 12 is enough for any realistically sized pool —
        // even the fallback has ~24 * 24 = 576 combinations.
        let opp = this.generateOpponent(t, hostCountry);
        for (let attempt = 0; attempt < 12 && usedNames.has(opp.name); attempt++) {
          opp = this.generateOpponent(t, hostCountry);
        }
        usedNames.add(opp.name);
        field.push({
          ..._buildOpponentEntry(opp),
        });
      }

      const instance = {
        tournamentId:    payload.tournamentId,
        tournamentName:  t.name,
        city:            payload.city,
        country:         payload.country,
        isHome:          Boolean(payload.isHome),
        startDate:       _cloneDate(CalendarSystem.getDate()),
        playerEloStart:  player.elo,
        rounds:          t.rounds,
        pairingSystem:   t.pairingSystem || 'swiss',
        daysDuration:    t.daysDuration,
        entryFee:        t.entryFee,
        prizes:          [...t.prizes],
        field,
        currentRound:    1,
        currentPairings: null,
        rrSchedule:      t.pairingSystem === 'roundrobin'
          ? _generateRoundRobinSchedule(field.length)
          : null,
        history:         [],
      };

      instance.currentPairings = _relinkCurrentPairings(instance, _pairRound(instance));

      // Persist into CareerManager.calendar via live reference
      const cal = CareerManager.calendar.get();
      cal.currentTournament = instance;
      cal.phase             = 'in_tournament';
      cal.currentEvent      = null;
      CareerManager.save();

      if (typeof GameEvents !== 'undefined' && GameEvents.EVENTS && GameEvents.EVENTS.TOURNAMENT_STARTED) {
        GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_STARTED, {
          tournamentId:   instance.tournamentId,
          tournamentName: instance.tournamentName,
          city:           instance.city,
          country:        instance.country,
          champions: championEntries.map((entry) => ({
            id:          entry.id,
            name:        entry.name,
            elo:         entry.elo,
            title:       entry.title || _titleForElo(entry.elo),
            nationality: entry.nationality,
            tagline:     entry.tagline || '',
          })),
        });
      }

      return instance;
    },

    /** @returns {object | null} the live in-tournament state. */
    getCurrentInstance() {
      const cal = CareerManager.calendar.get();
      const inst = cal.currentTournament || null;
      if (!inst) return null;
      inst.currentPairings = _relinkCurrentPairings(inst, inst.currentPairings);
      return inst;
    },

    /**
     * @returns {{ opponent: object | null, color: 'w'|'b'|'bye' } | null}
     *   the player's pairing for the current round, or null if no
     *   tournament is in progress.
     */
    getCurrentPlayerPairing() {
      const inst = this.getCurrentInstance();
      if (!inst || !inst.currentPairings) return null;
      const me = inst.currentPairings.find(
        (p) => p.white && p.white.id === 'player' || p.black && p.black.id === 'player'
      );
      if (!me) return null;
      if (me.white && me.white.id === 'player') {
        return {
          opponent: me.black,
          color:    me.black === null ? 'bye' : 'w',
        };
      }
      return {
        opponent: me.white,
        color:    'b',
      };
    },

    /**
     * Apply the player's result for the current round, simulate every
     * other pairing in the same round, store the round in history,
     * and either pair the next round or mark the tournament as done.
     *
     * @param {1 | 0.5 | 0} playerScore  player's perspective
     * @param {'board' | 'simulated' | 'bye'} source
     * @returns {{ ok: boolean, finished: boolean, result?: string, round?: number, opponent?: object | null }}
     */
    recordPlayerResult(playerScore, source = 'board') {
      const inst = this.getCurrentInstance();
      if (!inst) return { ok: false, finished: false };
      if (![0, 0.5, 1].includes(playerScore)) {
        throw new Error(`[Tournament] Invalid score: ${playerScore}`);
      }

      const pairing = this.getCurrentPlayerPairing();
      const round = inst.currentRound;
      const opponent = pairing && pairing.opponent
        ? {
            id:          pairing.opponent.id,
            name:        pairing.opponent.name,
            elo:         pairing.opponent.elo,
            title:       pairing.opponent.title || _titleForElo(pairing.opponent.elo),
            nationality: pairing.opponent.nationality,
            champion:    pairing.opponent.isChampion ? _buildChampionPayload(pairing.opponent) : null,
          }
        : null;
      const result = _scoreToResult(playerScore, source === 'bye');

      // Walk every pairing of this round, applying or simulating.
      const roundResults = [];
      for (const p of inst.currentPairings) {
        const whiteEntry = _getCanonicalFieldEntry(inst, p.white && p.white.id);
        if (p.black === null) {
          // Bye → 1 point, no opponent recorded.
          _addScore(whiteEntry, 1);
          roundResults.push({ white: whiteEntry.id, black: null, scoreW: 1, scoreB: null });
          continue;
        }
        const blackEntry = _getCanonicalFieldEntry(inst, p.black.id);

        let scoreW;
        if (whiteEntry.id === 'player') {
          scoreW = playerScore;
        } else if (blackEntry.id === 'player') {
          scoreW = 1 - playerScore;
        } else {
          scoreW = _simulateGame(whiteEntry, blackEntry);
        }

        const scoreB = 1 - scoreW;
        _addScore(whiteEntry, scoreW);
        _addScore(blackEntry, scoreB);
        _markFaced(whiteEntry, blackEntry);
        _markFaced(blackEntry, whiteEntry);

        roundResults.push({
          white: whiteEntry.id,
          black: blackEntry.id,
          scoreW,
          scoreB,
        });
      }

      // Build the notable rival results list BEFORE clearing pairings
      // for the next round.
      const notableResults = _extractNotableRivalResults(inst, roundResults);

      inst.history.push({ round: inst.currentRound, results: roundResults });
      inst.currentRound += 1;

      const finished = inst.currentRound > inst.rounds;
      if (!finished) {
        inst.currentPairings = _relinkCurrentPairings(inst, _pairRound(inst));
      } else {
        inst.currentPairings = null;
      }

      CareerManager.save();
      if (typeof GameEvents !== 'undefined' && GameEvents.EVENTS && GameEvents.EVENTS.ROUND_PLAYED) {
        GameEvents.emit(GameEvents.EVENTS.ROUND_PLAYED, {
          tournamentId: inst.tournamentId,
          round,
          opponent,
          result,
          score: playerScore,
          source,
        });
      }
      if (typeof GameEvents !== 'undefined' && GameEvents.EVENTS && GameEvents.EVENTS.TOURNAMENT_ROUND_FINISHED) {
        GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_ROUND_FINISHED, {
          tournamentId:   inst.tournamentId,
          tournamentName: inst.tournamentName,
          round,
          opponent,
          playerResult:   result,
          notableResults,
          finished,
        });
      }
      return { ok: true, finished, result, round, opponent };
    },

    /**
     * Resolve the player's current pairing without opening the board.
     * Simulated rounds still count as real career games, so the Elo
     * / history path runs before the tournament standings update.
     *
     * @returns {{ ok: boolean, finished: boolean, result?: string, score?: number, round?: number, opponent?: object | null, source?: string }}
     */
    simulatePlayerRound() {
      const pairing = this.getCurrentPlayerPairing();
      if (!pairing) return { ok: false, finished: false };

      if (pairing.color === 'bye') {
        const byeResult = this.recordPlayerResult(1, 'bye');
        return {
          ...byeResult,
          score: 1,
          source: 'bye',
        };
      }

      const player = CareerManager.player.get();
      const effectivePlayerElo = player.elo - SIMULATION_PLAYER_PENALTY;
      const score = _simulatePlayerGame(
        effectivePlayerElo,
        pairing.opponent.elo,
      );
      const result = _scoreToResult(score, false);

      if (CareerManager.history && typeof CareerManager.history.recordGame === 'function') {
        CareerManager.history.recordGame({
          opponentName: pairing.opponent.name,
          opponentElo:  pairing.opponent.elo,
          result,
          moves:        0,
        });
      }

      const outcome = this.recordPlayerResult(score, 'simulated');

      if (typeof FocusSystem !== 'undefined' &&
          typeof FocusSystem.onRoundSimulated === 'function') {
        FocusSystem.onRoundSimulated();
      }

      return {
        ...outcome,
        score,
        source: 'simulated',
      };
    },

    /** @returns {boolean} true if every round has been played. */
    isFinished() {
      const inst = this.getCurrentInstance();
      if (!inst) return false;
      return inst.currentRound > inst.rounds;
    },

    /**
     * @returns {object[]} the field sorted by score desc, then Elo
     *   desc as a simple tiebreak. Each entry includes a `rank` field
     *   (1-based).
     */
    getStandings() {
      const inst = this.getCurrentInstance();
      if (!inst) return [];
      const sbScores = inst.pairingSystem === 'roundrobin'
        ? _getRoundRobinSonnebornBergerMap(inst)
        : null;
      const sorted = [...inst.field].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (sbScores) {
          const sbA = sbScores.get(a.id) || 0;
          const sbB = sbScores.get(b.id) || 0;
          if (sbB !== sbA) return sbB - sbA;
        }
        return b.elo - a.elo;
      });
      return sorted.map((p, i) => ({
        ...p,
        sb: sbScores ? (sbScores.get(p.id) || 0) : null,
        rank: i + 1,
      }));
    },

    /**
     * Finalize a finished tournament: pay prize money to the player
     * based on rank, push a result into CareerManager.history.tournaments,
     * advance the calendar by `daysDuration` days, leave the in-tournament
     * phase, and clear `currentTournament`.
     *
     * @returns {{ rank: number, score: number, prize: number, of: number }}
     */
    finalize() {
      const inst = this.getCurrentInstance();
      if (!inst) throw new Error('[Tournament] No tournament in progress');
      if (!this.isFinished()) {
        throw new Error('[Tournament] Cannot finalize before all rounds are played');
      }

      const eloBefore = inst.playerEloStart ?? CareerManager.player.get().elo;

      const standings  = this.getStandings();
      const playerRow  = standings.find((s) => s.id === 'player');
      const playerRank = playerRow ? playerRow.rank : standings.length;
      const prize      = inst.prizes[playerRank - 1] || 0;

      if (prize > 0) {
        CareerManager.finances.addIncome(
          prize,
          `Prize: ${inst.tournamentName} (${playerRank}${_ordinal(playerRank)} place)`,
        );
      }

      const cal = CareerManager.calendar.get();
      const eloAfter = CareerManager.player.get().elo;

      // F.3 fix — apply rival encounters once, at finalize time, so
      // rival Elo never drifts mid-tournament and bias the Swiss sort.
      // Walk the full history and record each direct player-vs-rival
      // pairing against the rival's live state.
      if (typeof RivalSystem !== 'undefined') {
        try {
          const playerEloNow = CareerManager.player.get().elo;
          for (const round of inst.history) {
            for (const rr of round.results) {
              if (rr.black === null) continue;
              const whiteIsPlayer = rr.white === 'player';
              const blackIsPlayer = rr.black === 'player';
              if (!whiteIsPlayer && !blackIsPlayer) continue;
              const rivalId = whiteIsPlayer ? rr.black : rr.white;
              if (typeof rivalId !== 'string' || !rivalId.startsWith('rival_')) continue;

              const playerScore = whiteIsPlayer ? rr.scoreW : rr.scoreB;
              const result = playerScore === 1 ? 'win' : (playerScore === 0.5 ? 'draw' : 'loss');

              RivalSystem.markMet(rivalId, inst.startDate);
              RivalSystem.recordEncounter(rivalId, result, playerEloNow, inst.startDate);
            }
          }
          // Clear any leftover commitment for this instance.
          if (RivalSystem.clearCommitment) {
            for (const r of RivalSystem.getAll()) {
              RivalSystem.clearCommitment(r.id, inst.tournamentId, inst.startDate);
            }
          }
        } catch (e) {
          console.error('[Tournament] finalize rival sync failed:', e);
        }
      }

      // Fire day ticks for every skipped day so recurring subscribers
      // (coach salary, rival drift, provocation mails) run normally.
      const finalDate = CalendarSystem.advanceDaysSilently
        ? CalendarSystem.advanceDaysSilently(inst.daysDuration)
        : _addCalDays(cal.date, inst.daysDuration);

      const summary = {
        tournamentId:   inst.tournamentId,
        tournamentName: inst.tournamentName,
        city:           inst.city,
        country:        inst.country,
        startDate:      _cloneDate(inst.startDate),
        rounds:         inst.rounds,
        rank:           playerRank,
        of:             standings.length,
        score:          playerRow ? playerRow.score : 0,
        prize,
        eloBefore,
        eloAfter,
        date:           _cloneDate(finalDate),
      };

      const history = CareerManager.history.get();
      history.tournaments.push(summary);
      if (typeof PuzzleSystem !== 'undefined' && PuzzleSystem.clearTrainingBonusesAfterTournament) {
        PuzzleSystem.clearTrainingBonusesAfterTournament();
      }

      // advanceDaysSilently already moved cal.date; when unavailable
      // (fallback), _addCalDays returned the target date.
      if (!CalendarSystem.advanceDaysSilently) {
        cal.date = _cloneDate(finalDate);
      }
      cal.phase             = 'idle';
      cal.currentTournament = null;
      cal.currentEvent      = null;
      CareerManager.save();
      if (typeof GameEvents !== 'undefined') GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, summary);

      return {
        rank:  playerRank,
        score: summary.score,
        prize,
        of:    summary.of,
      };
    },

    _generateRoundRobinSchedule(fieldSize) {
      return _generateRoundRobinSchedule(fieldSize);
    },

  };

  // ── Internal helpers (C.2b) ────────────────────────────────

  function _cloneDate(d) {
    return { year: d.year, month: d.month, day: d.day };
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

  function _fieldSizeForTournament(tournament) {
    if (tournament && tournament.pairingSystem === 'roundrobin') {
      return Math.max(2, (tournament.rounds || 0) + 1);
    }
    return Math.max(8, (tournament.rounds || 0) * 8);
  }

  /**
   * Re-implementation of CalendarSystem._addOneDay to keep this module
   * self-contained for testing — but we delegate to CalendarSystem.addDays
   * at runtime so we don't duplicate Gregorian rules.
   */
  function _addCalDays(date, n) {
    return CalendarSystem.addDays(date, n);
  }

  function _buildPlayerEntry(player) {
    return {
      id:             'player',
      name:           player.playerName || 'You',
      elo:            player.elo,
      title:          player.title || _titleForElo(player.elo),
      nationality:    player.nationality || '',
      isPlayer:       true,
      score:          0,
      opponentsFaced: [],
    };
  }

  function _buildOpponentEntry(opp) {
    return {
      id:             opp.id,
      name:           opp.name,
      elo:            opp.elo,
      title:          opp.title || _titleForElo(opp.elo),
      nationality:    opp.nationality,
      isPlayer:       false,
      isRival:        Boolean(opp.isRival),
      isChampion:     Boolean(opp.isChampion),
      tagline:        opp.tagline || '',
      portraitSeed:   opp.portraitSeed || null,
      openingRepertoire: opp.openingRepertoire || null,
      score:          0,
      opponentsFaced: [],
    };
  }

  function _buildChampionPayload(entry) {
    return {
      id:           entry.id,
      name:         entry.name,
      title:        entry.title || _titleForElo(entry.elo),
      tagline:      entry.tagline || '',
      portraitSeed: entry.portraitSeed || null,
      openingRepertoire: entry.openingRepertoire || null,
    };
  }

  /**
   * Collect round results involving a rival (excluding the player's own
   * match — that is already the `playerResult` in the payload).
   * Each entry: { rivalId, name, opponentId, opponentName, result }
   * where result is from the rival's perspective ('win'|'draw'|'loss').
   */
  function _extractNotableRivalResults(inst, roundResults) {
    const out = [];
    for (const rr of roundResults) {
      const whiteId = rr.white;
      const blackId = rr.black;
      if (blackId === null) continue; // bye

      const whiteIsPlayer = whiteId === 'player';
      const blackIsPlayer = blackId === 'player';
      if (whiteIsPlayer || blackIsPlayer) continue;

      const whiteIsRival = typeof whiteId === 'string' && whiteId.startsWith('rival_');
      const blackIsRival = typeof blackId === 'string' && blackId.startsWith('rival_');
      if (!whiteIsRival && !blackIsRival) continue;

      const whiteEntry = _getCanonicalFieldEntry(inst, whiteId);
      const blackEntry = _getCanonicalFieldEntry(inst, blackId);

      if (whiteIsRival) {
        const res = rr.scoreW === 1 ? 'win' : (rr.scoreW === 0.5 ? 'draw' : 'loss');
        out.push({
          rivalId:      whiteId,
          name:         whiteEntry.name,
          title:        whiteEntry.title || _titleForElo(whiteEntry.elo),
          opponentId:   blackId,
          opponentName: blackEntry.name,
          opponentTitle: blackEntry.title || _titleForElo(blackEntry.elo),
          result:       res,
        });
      }
      if (blackIsRival) {
        const res = rr.scoreB === 1 ? 'win' : (rr.scoreB === 0.5 ? 'draw' : 'loss');
        out.push({
          rivalId:      blackId,
          name:         blackEntry.name,
          title:        blackEntry.title || _titleForElo(blackEntry.elo),
          opponentId:   whiteId,
          opponentName: whiteEntry.name,
          opponentTitle: whiteEntry.title || _titleForElo(whiteEntry.elo),
          result:       res,
        });
      }
    }
    return out;
  }

  /**
   * Build rival field entries for a tournament instance. Committed
   * rivals (Phase F.4 co-registration) are always included. On top of
   * that, random eligible rivals fill up to 3 total.
   */
  function _buildRivalEntries(t, startDate) {
    if (typeof RivalSystem === 'undefined' || typeof RivalData === 'undefined') {
      return [];
    }

    const committed = startDate && RivalSystem.getCommittedRivalsForTournament
      ? RivalSystem.getCommittedRivalsForTournament(t.id, startDate)
      : [];
    const committedIds = new Set(committed.map((r) => r.id));

    const pool = RivalSystem.getEligibleForTournament(t.eloMin, t.eloMax)
      .filter((r) => !committedIds.has(r.id));

    // Shuffle the non-committed pool with Fisher-Yates to avoid order bias.
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    const baseTarget = Math.max(1, Math.min(3, 1 + Math.floor(Math.random() * 3)));
    const finalTarget = Math.min(3, Math.max(committed.length, baseTarget));

    // Always include committed first, then top up from the shuffled pool.
    const selected = committed.slice();
    for (const r of shuffled) {
      if (selected.length >= finalTarget) break;
      selected.push(r);
    }

    const out = [];
    for (const live of selected) {
      const proto = RivalData.getById(live.id);
      if (!proto) continue;
      out.push({
        id:             live.id,
        name:           proto.name,
        elo:            live.elo,
        title:          _titleForElo(live.elo),
        nationality:    proto.nationality,
        isPlayer:       false,
        isRival:        true,
        score:          0,
        opponentsFaced: [],
      });
    }
    return out;
  }

  function _championTargetForTier(tier, poolSize) {
    if (poolSize <= 0) return 0;
    if (tier === 3) return 1;
    if (tier === 4) return Math.min(poolSize, 1 + Math.floor(Math.random() * 2));
    if (tier >= 5) return Math.min(poolSize, 2 + Math.floor(Math.random() * 2));
    return 0;
  }

  function _buildChampionEntries(t) {
    if (t.tier < 3) return [];
    if (typeof ChampionData === 'undefined' || !ChampionData.getByEloRange) {
      return [];
    }

    const pool = ChampionData.getByEloRange(t.eloMin, t.eloMax);
    if (pool.length === 0) return [];

    const target = _championTargetForTier(t.tier, pool.length);
    const selected = _shuffle(pool).slice(0, target);

    return selected.map((champion) => _buildOpponentEntry({
      id:             champion.id,
      name:           champion.name,
      elo:            champion.elo,
      title:          _titleForElo(champion.elo),
      nationality:    champion.nationality,
      isChampion:     true,
      tagline:        champion.tagline,
      portraitSeed:   champion.portraitSeed,
      openingRepertoire: champion.openingRepertoire || null,
    }));
  }

  function _addScore(entry, delta) {
    entry.score = (entry.score || 0) + delta;
  }

  function _getCanonicalFieldEntry(instance, id) {
    const entry = instance && instance.field
      ? instance.field.find((f) => f.id === id)
      : null;
    if (!entry) {
      throw new Error(`[Tournament] Missing field entry for id: ${id}`);
    }
    return entry;
  }

  function _relinkCurrentPairings(instance, pairings) {
    if (!instance || !Array.isArray(pairings)) return pairings || null;
    return pairings.map((p) => ({
      white: p.white ? _getCanonicalFieldEntry(instance, p.white.id) : null,
      black: p.black ? _getCanonicalFieldEntry(instance, p.black.id) : null,
    }));
  }

  function _markFaced(a, b) {
    a.opponentsFaced.push(b.id);
  }

  function _generateRoundRobinSchedule(fieldSize) {
    if (!Number.isInteger(fieldSize) || fieldSize < 2) {
      throw new Error(`[Tournament] Invalid round-robin field size: ${fieldSize}`);
    }

    const hasBye = fieldSize % 2 === 1;
    const ring = [];
    for (let i = 0; i < fieldSize; i++) ring.push(i);
    if (hasBye) ring.push(-1);

    const rounds = [];
    const slots = ring.length;
    const boardsPerRound = slots / 2;
    const whiteCounts = Array.from({ length: fieldSize }, () => 0);
    const blackCounts = Array.from({ length: fieldSize }, () => 0);
    let order = ring.slice();

    for (let round = 0; round < slots - 1; round++) {
      const pairings = [];
      for (let board = 0; board < boardsPerRound; board++) {
        const left = order[board];
        const right = order[slots - 1 - board];

        if (left === -1 || right === -1) {
          const playerIndex = left === -1 ? right : left;
          pairings.push({ white: playerIndex, black: -1 });
          continue;
        }

        const forwardCost =
          Math.abs((whiteCounts[left] + 1) - blackCounts[left]) +
          Math.abs(whiteCounts[right] - (blackCounts[right] + 1));
        const reverseCost =
          Math.abs((whiteCounts[right] + 1) - blackCounts[right]) +
          Math.abs(whiteCounts[left] - (blackCounts[left] + 1));

        let white = left;
        let black = right;
        if (reverseCost < forwardCost || (reverseCost === forwardCost && (round + board) % 2 === 1)) {
          white = right;
          black = left;
        }

        whiteCounts[white] += 1;
        blackCounts[black] += 1;

        pairings.push({ white, black });
      }

      rounds.push(pairings);
      order = [order[0], order[slots - 1], ...order.slice(1, slots - 1)];
    }

    return rounds;
  }

  function _pairRoundRobin(instance) {
    const roundIndex = (instance.currentRound || 1) - 1;
    const round = instance.rrSchedule && instance.rrSchedule[roundIndex];
    if (!round) return [];
    return round.map((pairing) => ({
      white: pairing.white === -1 ? null : instance.field[pairing.white] || null,
      black: pairing.black === -1 ? null : instance.field[pairing.black] || null,
    }));
  }

  function _getRoundRobinSonnebornBergerMap(instance) {
    const finalScores = new Map(
      instance.field.map((entry) => [entry.id, entry.score || 0]),
    );
    const sbScores = new Map(
      instance.field.map((entry) => [entry.id, 0]),
    );

    for (const round of instance.history || []) {
      for (const result of round.results || []) {
        if (result.black === null) continue;

        const whiteOpponentScore = finalScores.get(result.black) || 0;
        const blackOpponentScore = finalScores.get(result.white) || 0;

        if (result.scoreW === 1) {
          sbScores.set(result.white, (sbScores.get(result.white) || 0) + whiteOpponentScore);
        } else if (result.scoreW === 0.5) {
          sbScores.set(result.white, (sbScores.get(result.white) || 0) + (whiteOpponentScore / 2));
        }

        if (result.scoreB === 1) {
          sbScores.set(result.black, (sbScores.get(result.black) || 0) + blackOpponentScore);
        } else if (result.scoreB === 0.5) {
          sbScores.set(result.black, (sbScores.get(result.black) || 0) + (blackOpponentScore / 2));
        }
      }
    }

    return sbScores;
  }

  /**
   * Simplified Swiss pairings for the next round of a tournament.
   *
   * Algorithm (Monrad-style, minimal):
   *   1. Sort field by score desc, then by elo desc
   *   2. Iterate top to bottom; for each unpaired player, find the
   *      next unpaired player they have not faced and pair them
   *   3. Any leftover unpaired player gets a bye (1 point gift)
   *
   * Color assignment: simply alternates white/black around the pairings
   * (even index → white, odd index → black). Color balancing across
   * rounds is deferred to a later refinement.
   */
  function _pairRound(instance) {
    if (instance.pairingSystem === 'roundrobin') {
      return _pairRoundRobin(instance);
    }

    const sorted = [...instance.field].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.elo - a.elo;
    });

    const paired = new Set();
    const pairings = [];

    // Phase F.4 — soft pairing bias: on the LAST round only, if the
    // player and a met rival are both in the top 4 with a score gap
    // of <= 1 point, and neither has faced the other, pair them
    // preferentially. Swiss integrity is otherwise preserved.
    const isLastRound = instance.currentRound === instance.rounds;
    const biasPair = isLastRound ? _findLastRoundRivalBias(sorted) : null;
    if (biasPair) {
      const whiteFirst = Math.random() < 0.5;
      pairings.push(
        whiteFirst
          ? { white: biasPair.player, black: biasPair.rival }
          : { white: biasPair.rival, black: biasPair.player },
      );
      paired.add(biasPair.player.id);
      paired.add(biasPair.rival.id);
    }

    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      if (paired.has(a.id)) continue;

      let partner = null;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (paired.has(b.id)) continue;
        if (a.opponentsFaced.includes(b.id)) continue;
        partner = b;
        break;
      }

      // If everyone left has been faced, accept a rematch with the
      // closest unpaired player to keep the round running.
      if (!partner) {
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j];
          if (!paired.has(b.id)) { partner = b; break; }
        }
      }

      if (partner) {
        // Alternate color by pairing index for simple variety
        const whiteFirst = pairings.length % 2 === 0;
        pairings.push(
          whiteFirst
            ? { white: a, black: partner }
            : { white: partner, black: a },
        );
        paired.add(a.id);
        paired.add(partner.id);
      } else {
        // Lone player → bye
        pairings.push({ white: a, black: null });
        paired.add(a.id);
      }
    }

    return pairings;
  }

  /**
   * Find a player-vs-met-rival pairing that satisfies F.4 drama rules.
   * Returns { player, rival } if valid, else null. Never forces the
   * choice: the caller uses this only as a preference.
   */
  function _findLastRoundRivalBias(sorted) {
    if (typeof RivalSystem === 'undefined') return null;
    const top4 = sorted.slice(0, 4);
    const player = top4.find((p) => p.id === 'player');
    if (!player) return null;

    const candidates = top4.filter((p) =>
      p.id !== 'player' &&
      typeof p.id === 'string' &&
      p.id.startsWith('rival_') &&
      Math.abs(p.score - player.score) <= 1 &&
      !player.opponentsFaced.includes(p.id),
    );
    if (candidates.length === 0) return null;

    // Prefer met rivals; if none met, skip (avoid unmet rival override).
    const met = candidates.filter((c) => {
      const live = RivalSystem.getById(c.id);
      return live && live.met;
    });
    if (met.length === 0) return null;

    // Closest in score, tiebreak by Elo proximity to player.
    met.sort((a, b) => {
      const da = Math.abs(a.score - player.score);
      const db = Math.abs(b.score - player.score);
      if (da !== db) return da - db;
      return Math.abs(a.elo - player.elo) - Math.abs(b.elo - player.elo);
    });
    return { player, rival: met[0] };
  }

  /**
   * Probabilistic Elo-based result for an NPC vs NPC game.
   * Returns 1 (white wins), 0.5 (draw), or 0 (white loses).
   */
  function _simulateGame(a, b) {
    const E = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
    // 30% draw rate as a flat baseline (chess Swiss roughly)
    if (Math.random() < 0.30) return 0.5;
    return Math.random() < E ? 1 : 0;
  }

  function _simulatePlayerGame(playerElo, opponentElo) {
    const E = 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
    if (Math.random() < 0.30) return 0.5;
    return Math.random() < E ? 1 : 0;
  }

  function _scoreToResult(score, isBye = false) {
    if (isBye) return 'bye';
    if (score === 1) return 'win';
    if (score === 0.5) return 'draw';
    return 'loss';
  }

  function _ordinal(n) {
    const mod10  = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'st';
    if (mod10 === 2 && mod100 !== 12) return 'nd';
    if (mod10 === 3 && mod100 !== 13) return 'rd';
    return 'th';
  }

})();

// Debug global
if (typeof window !== 'undefined' && window.cl) {
  window.cl.tournamentSystem = TournamentSystem;
}
