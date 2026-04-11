// tournament-data.js
//
// Static catalogue of real and fictional chess tournaments. Phase C.1
// ships Tier 1 (local amateur, home country) and Tier 2 (national /
// international amateur opens). Higher tiers (international opens,
// GM round-robins, elite, world cycle) land in Phase G.
//
// Pure data + small lookup helpers. No mutations. No state. Other
// modules read from here via the public API.
//
// Used by tournament-system.js (C.2) to:
//   - browse tournaments the player is eligible for
//   - schedule a tournament's calendar events for a given year
//   - resolve prize money payouts
//
// Schema (one Tournament entry):
//
// {
//   id:             unique string key (snake_case)
//   name:           display name
//   city:           location name, OR null when home === true
//   country:        ISO-like 2-letter code, OR null when home === true
//   home:           true → universal "home country" template. The
//                   tournament-system fills in city/country from the
//                   player's nationality at instance time, so every
//                   player gets these in their calendar regardless of
//                   which nation they picked at character creation.
//   tier:           1 = local amateur, 2 = national amateur
//   eloMin:         minimum player Elo to register
//   eloMax:         soft cap — beyond this the tournament is "below your level"
//   rounds:         number of rounds played
//   pairingSystem:  'swiss' for now (only system supported)
//   daysDuration:   total span of the tournament in calendar days
//   entryFee:       cost in money units, charged on registration
//   prizes:         array of payouts by final rank (index 0 = first place)
//   annualDates:    array of { month, day } describing every START date in a year.
//                   Monthly events list 12 entries. Annual events list 1.
//   description:    one-sentence flavor text shown in the lobby (Phase C.3)
// }

const TournamentData = (() => {

  const TOURNAMENTS = [

    // ══════════════════════════════════════════════════════════
    // TIER 1 — universal "home country" templates
    //
    // These ALWAYS appear in the player's calendar regardless of
    // which nationality they picked. tournament-system.js (C.2)
    // localizes the city/country field at instance time using
    // the player's home country.
    // ══════════════════════════════════════════════════════════

    {
      id:            'local_weekend_open',
      name:          'Local Weekend Open',
      city:          null,
      country:       null,
      home:          true,
      tier:          1,
      eloMin:        0,
      eloMax:        1400,
      rounds:        5,
      pairingSystem: 'swiss',
      daysDuration:  2,
      entryFee:      10,
      prizes:        [200, 100, 50, 30, 20],
      annualDates: [
        { month: 1,  day: 11 }, { month: 2,  day: 8  },
        { month: 3,  day: 14 }, { month: 4,  day: 11 },
        { month: 5,  day: 9  }, { month: 6,  day: 13 },
        { month: 7,  day: 11 }, { month: 8,  day: 8  },
        { month: 9,  day: 12 }, { month: 10, day: 10 },
        { month: 11, day: 14 }, { month: 12, day: 12 },
      ],
      description:
        'A small five-round Swiss for club players in your home city. Bring a thermos.',
    },

    {
      id:            'sunday_rapid',
      name:          'Sunday Rapid',
      city:          null,
      country:       null,
      home:          true,
      tier:          1,
      eloMin:        0,
      eloMax:        1300,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  1,
      entryFee:      8,
      prizes:        [120, 60, 40, 20],
      annualDates: [
        { month: 1,  day: 25 }, { month: 2,  day: 22 },
        { month: 3,  day: 22 }, { month: 4,  day: 26 },
        { month: 5,  day: 24 }, { month: 6,  day: 21 },
        { month: 9,  day: 20 }, { month: 10, day: 25 },
        { month: 11, day: 22 }, { month: 12, day: 20 },
      ],
      description:
        'A one-day seven-round rapid event for casual locals. Quick wins, friendly atmosphere.',
    },

    {
      id:            'new_year_open',
      name:          'New Year Open',
      city:          null,
      country:       null,
      home:          true,
      tier:          1,
      eloMin:        0,
      eloMax:        1500,
      rounds:        6,
      pairingSystem: 'swiss',
      daysDuration:  3,
      entryFee:      18,
      prizes:        [350, 180, 100, 60, 40],
      annualDates: [{ month: 1, day: 4 }],
      description:
        'The first weekend of the year — clubs across the country host a kickoff Swiss.',
    },

    {
      id:            'summer_holiday_open',
      name:          'Summer Holiday Open',
      city:          null,
      country:       null,
      home:          true,
      tier:          1,
      eloMin:        0,
      eloMax:        1500,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  5,
      entryFee:      20,
      prizes:        [400, 200, 100, 60, 40, 30],
      annualDates: [{ month: 7, day: 22 }],
      description:
        'A relaxed five-day summer open. Perfect for taking a few days off work.',
    },

    {
      id:            'autumn_classic',
      name:          'Autumn Classic',
      city:          null,
      country:       null,
      home:          true,
      tier:          1,
      eloMin:        0,
      eloMax:        1400,
      rounds:        6,
      pairingSystem: 'swiss',
      daysDuration:  2,
      entryFee:      15,
      prizes:        [280, 140, 80, 50],
      annualDates: [{ month: 10, day: 17 }],
      description:
        'A weekend event marking the start of the indoor chess season.',
    },

    {
      id:            'regional_championship',
      name:          'Regional Championship',
      city:          null,
      country:       null,
      home:          true,
      tier:          1,
      eloMin:        1000,
      eloMax:        1600,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  4,
      entryFee:      25,
      prizes:        [500, 250, 150, 100, 60, 40],
      annualDates: [{ month: 11, day: 21 }],
      description:
        'The annual regional crown — a step up from local opens. Title to defend!',
    },

    // ══════════════════════════════════════════════════════════
    // TIER 2 — real national / international amateur opens
    //
    // These are real tournaments at fixed locations. The player has
    // to "travel" to attend (Phase E will charge a travel fee).
    // ══════════════════════════════════════════════════════════

    // ── France ──

    {
      id:            'cappelle',
      name:          'Cappelle-la-Grande Open',
      city:          'Cappelle-la-Grande',
      country:       'FR',
      tier:          2,
      eloMin:        1400,
      eloMax:        2400,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      60,
      prizes:        [3000, 1500, 800, 500, 300, 200, 150, 100, 80, 60],
      annualDates: [{ month: 2, day: 18 }],
      description:
        'One of the largest open tournaments in Europe, held annually in northern France since 1985.',
    },

    {
      id:            'avignon_international',
      name:          'Avignon International Open',
      city:          'Avignon',
      country:       'FR',
      tier:          2,
      eloMin:        1500,
      eloMax:        2300,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  8,
      entryFee:      55,
      prizes:        [2200, 1100, 600, 400, 250, 150, 100],
      annualDates: [{ month: 8, day: 17 }],
      description:
        'A late-summer Provençal open known for friendly atmosphere and a strong local field.',
    },

    {
      id:            'french_amateur_championship',
      name:          'French Amateur Championship',
      city:          'Vichy',
      country:       'FR',
      tier:          2,
      eloMin:        1400,
      eloMax:        2000,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      70,
      prizes:        [2000, 1000, 600, 400, 250, 200, 150, 100, 80],
      annualDates: [{ month: 8, day: 22 }],
      description:
        'The national amateur title — played each summer in central France.',
    },

    // ── United Kingdom ──

    {
      id:            'hastings_challengers',
      name:          'Hastings Challengers',
      city:          'Hastings',
      country:       'GB',
      tier:          2,
      eloMin:        1500,
      eloMax:        2300,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      80,
      prizes:        [2500, 1200, 700, 400, 250, 150, 100, 80],
      annualDates: [{ month: 12, day: 28 }],
      description:
        'The traditional new-year tournament on the south coast of England, running since 1895.',
    },

    {
      id:            'british_major_open',
      name:          'British Major Open',
      city:          'Coventry',
      country:       'GB',
      tier:          2,
      eloMin:        1400,
      eloMax:        2100,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      75,
      prizes:        [1800, 900, 500, 350, 200, 150, 100],
      annualDates: [{ month: 7, day: 28 }],
      description:
        'The Major section of the British Chess Championship summer congress.',
    },

    // ── Netherlands ──

    {
      id:            'tata_steel_amateurs',
      name:          'Tata Steel Tienkampen',
      city:          'Wijk aan Zee',
      country:       'NL',
      tier:          2,
      eloMin:        1400,
      eloMax:        2300,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  10,
      entryFee:      90,
      prizes:        [2000, 1000, 600, 400, 250, 150, 100],
      annualDates: [{ month: 1, day: 23 }],
      description:
        'The famous amateur sections played alongside the elite tournament in Wijk aan Zee.',
    },

    // ── Czech Republic ──

    {
      id:            'czech_open',
      name:          'Czech Open',
      city:          'Pardubice',
      country:       'CZ',
      tier:          2,
      eloMin:        1500,
      eloMax:        2400,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  10,
      entryFee:      65,
      prizes:        [2400, 1200, 700, 450, 280, 180, 130, 90],
      annualDates: [{ month: 7, day: 17 }],
      description:
        'A massive multi-section festival in Pardubice — chess, bridge, and games for two weeks.',
    },

    {
      id:            'prague_challengers',
      name:          'Prague Challengers Open',
      city:          'Prague',
      country:       'CZ',
      tier:          2,
      eloMin:        1500,
      eloMax:        2400,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  11,
      entryFee:      85,
      prizes:        [2800, 1400, 800, 500, 300, 200, 150, 100],
      annualDates: [{ month: 2, day: 25 }],
      description:
        'The Challengers section of the Prague International Chess Festival, late February.',
    },

    // ── Austria ──

    {
      id:            'vienna_open',
      name:          'Vienna Open',
      city:          'Vienna',
      country:       'AT',
      tier:          2,
      eloMin:        1400,
      eloMax:        2300,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  7,
      entryFee:      70,
      prizes:        [2500, 1200, 700, 450, 280, 180, 100],
      annualDates: [{ month: 7, day: 21 }],
      description:
        'A summer Swiss in the Austrian capital, often featuring 1000+ players.',
    },

    // ── Denmark ──

    {
      id:            'politiken_cup',
      name:          'Politiken Cup',
      city:          'Helsingør',
      country:       'DK',
      tier:          2,
      eloMin:        1500,
      eloMax:        2400,
      rounds:        10,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      85,
      prizes:        [3000, 1500, 800, 500, 300, 200, 150, 100, 80, 60],
      annualDates: [{ month: 7, day: 26 }],
      description:
        'The main feature of the Copenhagen Chess Festival — ten rounds at the Konventum in scenic Helsingør.',
    },

    // ── Andorra ──

    {
      id:            'andorra_open',
      name:          'Andorra Open',
      city:          'Escaldes-Engordany',
      country:       'AD',
      tier:          2,
      eloMin:        1500,
      eloMax:        2300,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      60,
      prizes:        [2000, 1000, 600, 400, 250, 150, 100, 80],
      annualDates: [{ month: 7, day: 19 }],
      description:
        'A long-running summer open in the Pyrenees principality, charming and competitive.',
    },

    // ── Germany ──

    {
      id:            'grenke_open',
      name:          'Grenke Chess Open',
      city:          'Karlsruhe',
      country:       'DE',
      tier:          2,
      eloMin:        1400,
      eloMax:        2400,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  5,
      entryFee:      90,
      prizes:        [3500, 1800, 1000, 600, 400, 300, 200, 150, 100, 80],
      annualDates: [{ month: 4, day: 2 }],
      description:
        'The Easter open at the Karlsruhe Convention Centre, the largest open in Germany.',
    },

    // ── Switzerland ──

    {
      id:            'biel_amateur',
      name:          'Biel Amateur Tournament',
      city:          'Biel/Bienne',
      country:       'CH',
      tier:          2,
      eloMin:        1400,
      eloMax:        2200,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  7,
      entryFee:      65,
      prizes:        [1500, 800, 500, 300, 200, 150, 100],
      annualDates: [{ month: 7, day: 18 }],
      description:
        'The Amateur Tournament of the historic Biel International Chess Festival, running since 1968.',
    },

    // ── Russia ──

    {
      id:            'moscow_open',
      name:          'Moscow Open',
      city:          'Moscow',
      country:       'RU',
      tier:          2,
      eloMin:        1400,
      eloMax:        2300,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      55,
      prizes:        [2200, 1100, 600, 400, 250, 200, 150, 100],
      annualDates: [{ month: 1, day: 28 }],
      description:
        'A late-January open in the Russian capital with multiple rating sections.',
    },

    // ── United States ──

    {
      id:            'world_open_under1600',
      name:          'World Open (Under 1600)',
      city:          'Philadelphia',
      country:       'US',
      tier:          2,
      eloMin:        1200,
      eloMax:        1600,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  6,
      entryFee:      120,
      prizes:        [3500, 1800, 1000, 600, 400, 300, 200, 150, 100],
      annualDates: [{ month: 6, day: 30 }],
      description:
        'The Under 1600 section of the famous World Open — Continental Chess Association, July 4 weekend.',
    },

    {
      id:            'north_american_open',
      name:          'North American Open',
      city:          'Las Vegas',
      country:       'US',
      tier:          2,
      eloMin:        1400,
      eloMax:        2200,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  5,
      entryFee:      130,
      prizes:        [2500, 1300, 700, 450, 300, 200, 150, 100],
      annualDates: [{ month: 12, day: 26 }],
      description:
        'The end-of-year Continental Chess Association open in Las Vegas, US Chess Grand Prix status.',
    },

    {
      id:            'atlantic_city_open',
      name:          'Atlantic City Open',
      city:          'Atlantic City',
      country:       'US',
      tier:          2,
      eloMin:        1400,
      eloMax:        2200,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  5,
      entryFee:      110,
      prizes:        [2000, 1000, 600, 400, 250, 200, 150, 100],
      annualDates: [{ month: 3, day: 27 }],
      description:
        'The new spring Continental Chess Association event on the New Jersey shore.',
    },

    {
      id:            'continental_open',
      name:          'Continental Open',
      city:          'Sturbridge',
      country:       'US',
      tier:          2,
      eloMin:        1400,
      eloMax:        2200,
      rounds:        7,
      pairingSystem: 'swiss',
      daysDuration:  5,
      entryFee:      90,
      prizes:        [1800, 900, 500, 350, 200, 150, 100],
      annualDates: [{ month: 8, day: 12 }],
      description:
        'A mid-August open at a Massachusetts resort, traditional Continental Chess Association event.',
    },

  ];

  // ── Indexes ────────────────────────────────────────────────

  const _byId = new Map(TOURNAMENTS.map((t) => [t.id, t]));

  // ── Public API ─────────────────────────────────────────────

  return {

    /** All tournaments in the catalogue (live array — do not mutate). */
    getAll() {
      return TOURNAMENTS;
    },

    /** @returns {object | null} */
    getById(id) {
      return _byId.get(id) || null;
    },

    /** @returns {object[]} all tournaments at the given tier. */
    getByTier(tier) {
      return TOURNAMENTS.filter((t) => t.tier === tier);
    },

    /** @returns {object[]} only the universal "home country" templates. */
    getHomeTemplates() {
      return TOURNAMENTS.filter((t) => t.home === true);
    },

    /** @returns {object[]} only the fixed-location tournaments (non-home). */
    getFixedLocationTournaments() {
      return TOURNAMENTS.filter((t) => t.home !== true);
    },

    /**
     * All tournaments the player is eligible for (their elo is within
     * [eloMin, eloMax]). The eloMax is a soft cap representing
     * "beyond this, the field is too weak for you" — useful so the
     * lobby can hide trivial events from advanced players.
     */
    getEligible(elo) {
      return TOURNAMENTS.filter((t) => elo >= t.eloMin && elo <= t.eloMax);
    },

    /**
     * Total prize pool for a tournament — sum of every payout bucket.
     * Used by the lobby preview.
     */
    getPrizePool(id) {
      const t = _byId.get(id);
      if (!t) return 0;
      return t.prizes.reduce((a, b) => a + b, 0);
    },

    /**
     * Build the full list of tournament instances scheduled for a
     * given year, sorted by start date. Each entry is
     * { tournamentId, date }, where date is a CalendarDate.
     *
     * Note: home: true templates appear with their generic country
     * field still null. The tournament-system (C.2) is responsible
     * for resolving the player's home country at the moment it
     * actually instantiates a tournament for play.
     */
    getInstancesForYear(year) {
      const instances = [];
      for (const t of TOURNAMENTS) {
        for (const d of t.annualDates) {
          instances.push({
            tournamentId: t.id,
            date: { year, month: d.month, day: d.day },
          });
        }
      }
      instances.sort((a, b) => {
        if (a.date.year  !== b.date.year)  return a.date.year  - b.date.year;
        if (a.date.month !== b.date.month) return a.date.month - b.date.month;
        return a.date.day - b.date.day;
      });
      return instances;
    },

    /** @returns {number} how many tournaments live in the catalogue. */
    getCount() {
      return TOURNAMENTS.length;
    },

  };

})();

// Debug global
if (typeof window !== 'undefined' && window.cl) {
  window.cl.tournaments = TournamentData;
}
