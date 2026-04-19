// tournament-data.js
//
// Static catalogue of real and fictional chess tournaments. Phase C.1
// ships Tier 1 (local amateur, home country) and Tier 2 (national /
// international amateur opens). Phase G extends the catalogue through
// Tier 6 with named international masters and elite events.
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
//   tier:           1 = local amateur
//                   2 = national / amateur international
//                   3 = strong international open
//                   4 = challenger / IM-GM norm corridor
//                   5 = supertournament circuit
//                   6 = world-cycle endgame
//   eloMin:         minimum player Elo to register
//   eloMax:         soft cap — beyond this the tournament is "below your level"
//   rounds:         number of rounds played
//   pairingSystem:  'swiss' | 'roundrobin'
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

    // ══════════════════════════════════════════════════════════
    // TIER 3 — strong international opens
    // ══════════════════════════════════════════════════════════

    {
      id:            'gibraltar_masters',
      name:          'Gibraltar Masters',
      city:          'Gibraltar',
      country:       'GB',
      tier:          3,
      eloMin:        2100,
      eloMax:        2450,
      rounds:        10,
      pairingSystem: 'swiss',
      daysDuration:  8,
      entryFee:      180,
      prizes:        [9000, 4500, 2500, 1600, 1100, 800, 600, 450],
      annualDates: [{ month: 1, day: 24 }],
      description:
        'A major winter open where titled visitors start blending into the scenery.',
    },

    {
      id:            'reykjavik_open',
      name:          'Reykjavik Open',
      city:          'Reykjavik',
      country:       'IS',
      tier:          3,
      eloMin:        2100,
      eloMax:        2450,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  8,
      entryFee:      170,
      prizes:        [7500, 3800, 2200, 1400, 900, 700, 500],
      annualDates: [{ month: 4, day: 9 }],
      description:
        'A cold-weather festival with a warm reputation and a surprisingly sharp field.',
    },

    {
      id:            'hastings_masters',
      name:          'Hastings Masters',
      city:          'Hastings',
      country:       'GB',
      tier:          3,
      eloMin:        2150,
      eloMax:        2475,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  9,
      entryFee:      160,
      prizes:        [6800, 3400, 1900, 1200, 800, 600, 450],
      annualDates: [{ month: 12, day: 28 }],
      description:
        'A stronger masters section orbiting the old Hastings tradition.',
    },

    {
      id:            'isle_of_man_open',
      name:          'Isle of Man Masters',
      city:          'Douglas',
      country:       'GB',
      tier:          3,
      eloMin:        2200,
      eloMax:        2480,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  8,
      entryFee:      210,
      prizes:        [10000, 5000, 2800, 1700, 1200, 800, 600],
      annualDates: [{ month: 10, day: 6 }],
      description:
        'A packed island open where masters and hungry norm chasers collide.',
    },

    {
      id:            'charlotte_open',
      name:          'Charlotte Open',
      city:          'Charlotte',
      country:       'US',
      tier:          3,
      eloMin:        2100,
      eloMax:        2425,
      rounds:        9,
      pairingSystem: 'swiss',
      daysDuration:  6,
      entryFee:      160,
      prizes:        [6000, 3000, 1800, 1100, 700, 500],
      annualDates: [{ month: 6, day: 19 }],
      description:
        'A serious American open where every section feels one pairing tougher than advertised.',
    },

    // ══════════════════════════════════════════════════════════
    // TIER 4 — challengers / norm corridor
    // ══════════════════════════════════════════════════════════

    {
      id:            'tata_steel_challengers',
      name:          'Tata Steel Challengers',
      city:          'Wijk aan Zee',
      country:       'NL',
      tier:          4,
      eloMin:        2350,
      eloMax:        2550,
      rounds:        9,
      pairingSystem: 'roundrobin',
      daysDuration:  10,
      entryFee:      260,
      prizes:        [14000, 7000, 3800, 2400, 1600, 1100],
      annualDates: [{ month: 1, day: 17 }],
      description:
        'The last corridor before the true top circuit. Everyone in the room thinks they belong higher.',
    },

    {
      id:            'prague_challengers_masters',
      name:          'Prague Challengers',
      city:          'Prague',
      country:       'CZ',
      tier:          4,
      eloMin:        2360,
      eloMax:        2560,
      rounds:        9,
      pairingSystem: 'roundrobin',
      daysDuration:  9,
      entryFee:      250,
      prizes:        [13500, 6800, 3600, 2300, 1500, 1000],
      annualDates: [{ month: 2, day: 26 }],
      description:
        'The pressure rises fast here: one good week can open every door above.',
    },

    {
      id:            'norway_challengers',
      name:          'Norway Challengers',
      city:          'Stavanger',
      country:       'NO',
      tier:          4,
      eloMin:        2380,
      eloMax:        2580,
      rounds:        9,
      pairingSystem: 'roundrobin',
      daysDuration:  8,
      entryFee:      275,
      prizes:        [15000, 7600, 4200, 2600, 1700, 1100],
      annualDates: [{ month: 5, day: 25 }],
      description:
        'A narrow doorway into the Nordic elite circuit, with very little forgiveness.',
    },

    {
      id:            'biel_challengers',
      name:          'Biel Challengers',
      city:          'Biel/Bienne',
      country:       'CH',
      tier:          4,
      eloMin:        2350,
      eloMax:        2550,
      rounds:        9,
      pairingSystem: 'roundrobin',
      daysDuration:  9,
      entryFee:      245,
      prizes:        [13200, 6600, 3500, 2200, 1400, 1000],
      annualDates: [{ month: 7, day: 15 }],
      description:
        'Technically a challengers event, practically a test of whether you can breathe at this altitude.',
    },

    {
      id:            'superbet_challengers',
      name:          'Superbet Challengers',
      city:          'Bucharest',
      country:       'RO',
      tier:          4,
      eloMin:        2400,
      eloMax:        2600,
      rounds:        9,
      pairingSystem: 'roundrobin',
      daysDuration:  8,
      entryFee:      290,
      prizes:        [15500, 7800, 4300, 2700, 1800, 1200],
      annualDates: [{ month: 11, day: 4 }],
      description:
        'A polished broadcast stage and a field full of players who expect to become stars.',
    },

    // ══════════════════════════════════════════════════════════
    // TIER 5 — supertournament circuit
    // ══════════════════════════════════════════════════════════

    {
      id:            'tata_steel_masters',
      name:          'Tata Steel Masters',
      city:          'Wijk aan Zee',
      country:       'NL',
      tier:          5,
      eloMin:        2500,
      eloMax:        2750,
      rounds:        11,
      pairingSystem: 'roundrobin',
      daysDuration:  11,
      entryFee:      420,
      prizes:        [30000, 15000, 9000, 6000, 4200, 2800],
      annualDates: [{ month: 1, day: 17 }],
      description:
        'The famous winter stage where the field stops being hopeful and starts being dangerous.',
    },

    {
      id:            'norway_chess',
      name:          'Norway Chess',
      city:          'Stavanger',
      country:       'NO',
      tier:          5,
      eloMin:        2525,
      eloMax:        2770,
      rounds:        11,
      pairingSystem: 'roundrobin',
      daysDuration:  9,
      entryFee:      450,
      prizes:        [32000, 16000, 9600, 6200, 4300, 3000],
      annualDates: [{ month: 5, day: 26 }],
      description:
        'Prestige, cameras, top boards, and no easy rounds anywhere.',
    },

    {
      id:            'sinquefield_cup',
      name:          'Sinquefield Cup',
      city:          'Saint Louis',
      country:       'US',
      tier:          5,
      eloMin:        2550,
      eloMax:        2780,
      rounds:        11,
      pairingSystem: 'roundrobin',
      daysDuration:  9,
      entryFee:      480,
      prizes:        [34000, 17000, 10000, 6500, 4500, 3200],
      annualDates: [{ month: 8, day: 21 }],
      description:
        'One of the modern centerpieces of the elite circuit, unforgiving from round one.',
    },

    {
      id:            'superbet_romania',
      name:          'Superbet Romania',
      city:          'Bucharest',
      country:       'RO',
      tier:          5,
      eloMin:        2525,
      eloMax:        2760,
      rounds:        11,
      pairingSystem: 'roundrobin',
      daysDuration:  8,
      entryFee:      430,
      prizes:        [28000, 14500, 8600, 5600, 3900, 2600],
      annualDates: [{ month: 5, day: 5 }],
      description:
        'A sharp, modern super-event where preparation and nerve both matter.',
    },

    {
      id:            'grand_chess_tour_finals',
      name:          'Grand Chess Tour Finals',
      city:          'London',
      country:       'GB',
      tier:          5,
      eloMin:        2550,
      eloMax:        2780,
      rounds:        11,
      pairingSystem: 'roundrobin',
      daysDuration:  8,
      entryFee:      500,
      prizes:        [36000, 18000, 11000, 7000, 5000, 3500],
      annualDates: [{ month: 12, day: 3 }],
      description:
        'Career-mode Swiss wrapper around a true top-level showcase. Every board looks expensive.',
    },

    // ══════════════════════════════════════════════════════════
    // TIER 6 — world-cycle endgame
    // ══════════════════════════════════════════════════════════

    {
      id:            'grand_swiss',
      name:          'FIDE Grand Swiss',
      city:          'Douglas',
      country:       'GB',
      tier:          6,
      eloMin:        2650,
      eloMax:        2850,
      rounds:        11,
      pairingSystem: 'roundrobin',
      daysDuration:  10,
      entryFee:      650,
      prizes:        [50000, 26000, 15000, 10000, 7000, 5000],
      annualDates: [{ month: 10, day: 24 }],
      description:
        'The strongest large Swiss in the game, and a direct route into the world-cycle conversation.',
    },

    {
      id:            'world_cup',
      name:          'World Cup',
      city:          'Baku',
      country:       'AZ',
      tier:          6,
      eloMin:        2670,
      eloMax:        2850,
      rounds:        9,
      pairingSystem: 'roundrobin',
      daysDuration:  11,
      entryFee:      700,
      prizes:        [52000, 27000, 16000, 10500, 7200, 5200],
      annualDates: [{ month: 7, day: 4 }],
      description:
        'Adapted here as a brutal elite Swiss: survive the room long enough and the whole circuit notices.',
    },

    {
      id:            'candidates',
      name:          'Candidates',
      city:          'Madrid',
      country:       'ES',
      tier:          6,
      eloMin:        2700,
      eloMax:        2850,
      rounds:        7,
      pairingSystem: 'roundrobin',
      daysDuration:  10,
      entryFee:      760,
      prizes:        [60000, 30000, 18000, 12000, 8000, 5500],
      annualDates: [{ month: 6, day: 14 }],
      description:
        'Not the literal Candidates format, but the same level of tension: elite only, no soft landings.',
    },

    {
      id:            'world_championship',
      name:          'World Championship',
      city:          'Singapore',
      country:       'SG',
      tier:          6,
      eloMin:        2725,
      eloMax:        2850,
      rounds:        7,
      pairingSystem: 'roundrobin',
      daysDuration:  11,
      entryFee:      850,
      prizes:        [70000, 36000, 22000, 14000, 9000, 6000],
      annualDates: [{ month: 11, day: 19 }],
      description:
        'A career-mode abstraction of the final stage: if you are here, you have already made it.',
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
