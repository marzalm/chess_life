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
//   - Pair each round with a simplified Swiss algorithm
//     (score group → top half vs bottom half, no rematch, byes for
//     the leftover odd player).
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
      // Tier 1 home events: 90% locals, 10% visitors.
      // Tier 2 international opens: 60% host country, 40% visitors.
      const visitorChance = tournament.tier === 1 ? 0.10 : 0.40;
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

      // Build the field. Target ~8 players per round to give a
      // reasonable Swiss pool (e.g. 5 rounds → 40 players, 9 → 72).
      const fieldSize = Math.max(8, t.rounds * 8);

      const field = [_buildPlayerEntry(player)];
      const usedNames = new Set();
      usedNames.add(field[0].name);

      for (let i = 0; i < fieldSize - 1; i++) {
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
        daysDuration:    t.daysDuration,
        entryFee:        t.entryFee,
        prizes:          [...t.prizes],
        field,
        currentRound:    1,
        currentPairings: null,
        history:         [],
      };

      instance.currentPairings = _pairRound(instance);

      // Persist into CareerManager.calendar via live reference
      const cal = CareerManager.calendar.get();
      cal.currentTournament = instance;
      cal.phase             = 'in_tournament';
      cal.currentEvent      = null;
      CareerManager.save();

      return instance;
    },

    /** @returns {object | null} the live in-tournament state. */
    getCurrentInstance() {
      const cal = CareerManager.calendar.get();
      return cal.currentTournament || null;
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
            nationality: pairing.opponent.nationality,
          }
        : null;
      const result = _scoreToResult(playerScore, source === 'bye');

      // Walk every pairing of this round, applying or simulating.
      const roundResults = [];
      for (const p of inst.currentPairings) {
        if (p.black === null) {
          // Bye → 1 point, no opponent recorded.
          _addScore(p.white, 1);
          roundResults.push({ white: p.white.id, black: null, scoreW: 1, scoreB: null });
          continue;
        }

        let scoreW;
        if (p.white.id === 'player') {
          scoreW = playerScore;
        } else if (p.black.id === 'player') {
          scoreW = 1 - playerScore;
        } else {
          scoreW = _simulateGame(p.white, p.black);
        }

        const scoreB = 1 - scoreW;
        _addScore(p.white, scoreW);
        _addScore(p.black, scoreB);
        _markFaced(p.white, p.black);
        _markFaced(p.black, p.white);

        roundResults.push({
          white: p.white.id,
          black: p.black.id,
          scoreW,
          scoreB,
        });
      }

      inst.history.push({ round: inst.currentRound, results: roundResults });
      inst.currentRound += 1;

      const finished = inst.currentRound > inst.rounds;
      if (!finished) {
        inst.currentPairings = _pairRound(inst);
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
      const sorted = [...inst.field].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.elo - a.elo;
      });
      return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
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
      const finalDate = _addCalDays(cal.date, inst.daysDuration);
      const eloAfter = CareerManager.player.get().elo;

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

      // Advance the calendar by daysDuration days
      cal.date              = _cloneDate(finalDate);
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

  };

  // ── Internal helpers (C.2b) ────────────────────────────────

  function _cloneDate(d) {
    return { year: d.year, month: d.month, day: d.day };
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
      nationality:    opp.nationality,
      isPlayer:       false,
      score:          0,
      opponentsFaced: [],
    };
  }

  function _addScore(entry, delta) {
    entry.score = (entry.score || 0) + delta;
  }

  function _markFaced(a, b) {
    a.opponentsFaced.push(b.id);
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
    const sorted = [...instance.field].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.elo - a.elo;
    });

    const paired = new Set();
    const pairings = [];

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
