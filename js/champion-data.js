// champion-data.js
//
// Static catalogue of named elite champions introduced in Phase G.3.
//
// These are persistent, recognizable opponents that can be injected
// into higher-tier tournament fields. Most are simple named entries
// with nationality / Elo / flavor. The top 10 seeds also carry a tiny
// opening fingerprint used only for the first move they play.

const ChampionData = (() => {

  const CHAMPIONS = [
    {
      id:           'champ_kovac_mateo',
      name:         'Mateo Kovac',
      nationality:  'RS',
      elo:          2850,
      tagline:      'Turns clean development into a slow, clinical squeeze.',
      portraitSeed: 'MK',
      openingRepertoire: {
        asWhite: ['e2e4'],
        vsE4:    'c7c5',
        vsD4:    'g8f6',
        prob:    0.70,
      },
    },
    {
      id:           'champ_jun_wei',
      name:         'Wei Jun',
      nationality:  'CN',
      elo:          2838,
      tagline:      'Calculates faster than the room can breathe.',
      portraitSeed: 'WJ',
      openingRepertoire: {
        asWhite: ['d2d4'],
        vsE4:    'e7e5',
        vsD4:    'd7d5',
        prob:    0.70,
      },
    },
    {
      id:           'champ_mehta_arjun',
      name:         'Arjun Mehta',
      nationality:  'IN',
      elo:          2826,
      tagline:      'Comfortable in chaos and somehow even better in endgames.',
      portraitSeed: 'AM',
      openingRepertoire: {
        asWhite: ['c2c4'],
        vsE4:    'e7e6',
        vsD4:    'g8f6',
        prob:    0.70,
      },
    },
    {
      id:           'champ_holm_viktor',
      name:         'Viktor Holm',
      nationality:  'NO',
      elo:          2814,
      tagline:      'Former youth prodigy. Grinds microscopic edges into full points.',
      portraitSeed: 'VH',
      openingRepertoire: {
        asWhite: ['d2d4'],
        vsE4:    'c7c5',
        vsD4:    'g8f6',
        prob:    0.70,
      },
    },
    {
      id:           'champ_dubois_leon',
      name:         'Leon Dubois',
      nationality:  'FR',
      elo:          2802,
      tagline:      'Never looks rushed, even when the position is on fire.',
      portraitSeed: 'LD',
      openingRepertoire: {
        asWhite: ['e2e4'],
        vsE4:    'e7e5',
        vsD4:    'd7d5',
        prob:    0.70,
      },
    },
    {
      id:           'champ_ortega_david',
      name:         'David Ortega',
      nationality:  'ES',
      elo:          2794,
      tagline:      'Keeps asking difficult questions until the clock breaks you.',
      portraitSeed: 'DO',
      openingRepertoire: {
        asWhite: ['g1f3'],
        vsE4:    'c7c6',
        vsD4:    'g8f6',
        prob:    0.70,
      },
    },
    {
      id:           'champ_arsenyan_lev',
      name:         'Lev Arsenyan',
      nationality:  'AM',
      elo:          2786,
      tagline:      'Always seems to know where the kingside is weakest.',
      portraitSeed: 'LA',
      openingRepertoire: {
        asWhite: ['c2c4'],
        vsE4:    'e7e5',
        vsD4:    'f7f5',
        prob:    0.70,
      },
    },
    {
      id:           'champ_lindner_markus',
      name:         'Markus Lindner',
      nationality:  'DE',
      elo:          2778,
      tagline:      'Dry positions become dangerous the moment he likes them.',
      portraitSeed: 'ML',
      openingRepertoire: {
        asWhite: ['e2e4'],
        vsE4:    'c7c5',
        vsD4:    'd7d5',
        prob:    0.70,
      },
    },
    {
      id:           'champ_zielinski_tomasz',
      name:         'Tomasz Zielinski',
      nationality:  'PL',
      elo:          2770,
      tagline:      'Resourceful defender with a habit of surviving everything.',
      portraitSeed: 'TZ',
      openingRepertoire: {
        asWhite: ['d2d4'],
        vsE4:    'e7e6',
        vsD4:    'g8f6',
        prob:    0.70,
      },
    },
    {
      id:           'champ_van_doren_emil',
      name:         'Emil van Doren',
      nationality:  'NL',
      elo:          2762,
      tagline:      'Modern prep, sharp memory, no interest in mercy.',
      portraitSeed: 'ED',
      openingRepertoire: {
        asWhite: ['c2c4'],
        vsE4:    'c7c5',
        vsD4:    'g8f6',
        prob:    0.70,
      },
    },
    {
      id:           'champ_shaw_julian',
      name:         'Julian Shaw',
      nationality:  'GB',
      elo:          2748,
      tagline:      'Looks calm, then uncorks a tactical sequence nobody saw.',
      portraitSeed: 'JS',
    },
    {
      id:           'champ_rahimi_kian',
      name:         'Kian Rahimi',
      nationality:  'IR',
      elo:          2736,
      tagline:      'Fast hands, sharp instincts, relentless conversion.',
      portraitSeed: 'KR',
    },
    {
      id:           'champ_alvarez_sofia',
      name:         'Sofia Alvarez',
      nationality:  'AR',
      elo:          2724,
      tagline:      'A queen-side technician who loves long strategic fights.',
      portraitSeed: 'SA',
    },
    {
      id:           'champ_petrescu_andrei',
      name:         'Andrei Petrescu',
      nationality:  'RO',
      elo:          2712,
      tagline:      'Finds active counterplay from positions others would suffer.',
      portraitSeed: 'AP',
    },
    {
      id:           'champ_rashad_eltaj',
      name:         'Eltaj Rashad',
      nationality:  'AZ',
      elo:          2700,
      tagline:      'Explosive preparation backed by clean technique.',
      portraitSeed: 'ER',
    },
    {
      id:           'champ_berg_elias',
      name:         'Elias Berg',
      nationality:  'SE',
      elo:          2688,
      tagline:      'Makes every move look simple and every simplification hurt.',
      portraitSeed: 'EB',
    },
    {
      id:           'champ_moretti_luca',
      name:         'Luca Moretti',
      nationality:  'IT',
      elo:          2676,
      tagline:      'Thrives in open files, opposite-side castling, and time pressure.',
      portraitSeed: 'LU',
    },
    {
      id:           'champ_nasr_hadi',
      name:         'Hadi Nasr',
      nationality:  'EG',
      elo:          2664,
      tagline:      'Patient in defense and punishing once the balance shifts.',
      portraitSeed: 'HN',
    },
    {
      id:           'champ_silva_rafael',
      name:         'Rafael Silva',
      nationality:  'BR',
      elo:          2652,
      tagline:      'Adds practical venom to every slightly better position.',
      portraitSeed: 'RS',
    },
    {
      id:           'champ_balogh_miklos',
      name:         'Miklos Balogh',
      nationality:  'HU',
      elo:          2640,
      tagline:      'A dangerous theoretician who enjoys forcing lines.',
      portraitSeed: 'MB',
    },
    {
      id:           'champ_rybak_oleg',
      name:         'Oleg Rybak',
      nationality:  'UA',
      elo:          2628,
      tagline:      'Resourceful under pressure, ruthless once he escapes.',
      portraitSeed: 'OG',
    },
    {
      id:           'champ_sato_hikaru',
      name:         'Hikaru Sato',
      nationality:  'JP',
      elo:          2616,
      tagline:      'Rarely the loudest player in the room, often the last one standing.',
      portraitSeed: 'HS',
    },
    {
      id:           'champ_larsen_freja',
      name:         'Freja Larsen',
      nationality:  'DK',
      elo:          2604,
      tagline:      'Finds dynamic equality and then keeps pressing anyway.',
      portraitSeed: 'FL',
    },
    {
      id:           'champ_novotny_marek',
      name:         'Marek Novotny',
      nationality:  'CZ',
      elo:          2592,
      tagline:      'Pragmatic and precise, especially when the board empties.',
      portraitSeed: 'MN',
    },
    {
      id:           'champ_keller_jonas',
      name:         'Jonas Keller',
      nationality:  'CH',
      elo:          2580,
      tagline:      'Endgame-heavy style, almost allergic to loose pawns.',
      portraitSeed: 'JK',
    },
    {
      id:           'champ_reed_owen',
      name:         'Owen Reed',
      nationality:  'US',
      elo:          2568,
      tagline:      'Plays faster than you expect and usually with a point.',
      portraitSeed: 'OW',
    },
    {
      id:           'champ_tkemaladze_nika',
      name:         'Nika Tkemaladze',
      nationality:  'GE',
      elo:          2556,
      tagline:      'Always ready to turn a theoretical sideline into a fistfight.',
      portraitSeed: 'NT',
    },
    {
      id:           'champ_aksoy_kerem',
      name:         'Kerem Aksoy',
      nationality:  'TR',
      elo:          2529,
      tagline:      'Never far from a central break or a direct kingside jab.',
      portraitSeed: 'KA',
    },
    {
      id:           'champ_benhadi_youssef',
      name:         'Youssef Benhadi',
      nationality:  'MA',
      elo:          2498,
      tagline:      'Prefers clean structure, but calculates when it matters.',
      portraitSeed: 'YB',
    },
    {
      id:           'champ_nguyen_quang',
      name:         'Quang Nguyen',
      nationality:  'VN',
      elo:          2464,
      tagline:      'Excellent in practical scrambles and better than advertised in prep.',
      portraitSeed: 'QN',
    },
    {
      id:           'champ_ivanov_petar',
      name:         'Petar Ivanov',
      nationality:  'RS',
      elo:          2418,
      tagline:      'Solid on paper, stubborn on the board.',
      portraitSeed: 'PI',
    },
    {
      id:           'champ_chen_xinyi',
      name:         'Xinyi Chen',
      nationality:  'CN',
      elo:          2360,
      tagline:      'Sharp tactician with a taste for asymmetry.',
      portraitSeed: 'XC',
    },
    {
      id:           'champ_muller_lina',
      name:         'Lina Muller',
      nationality:  'DE',
      elo:          2315,
      tagline:      'Keeps her worst positions alive and her best ones merciless.',
      portraitSeed: 'LI',
    },
    {
      id:           'champ_dias_caio',
      name:         'Caio Dias',
      nationality:  'BR',
      elo:          2260,
      tagline:      'Still climbing, already dangerous, not here to be impressed.',
      portraitSeed: 'CD',
    },
    {
      id:           'champ_kovac_ana',
      name:         'Ana Kovac',
      nationality:  'RS',
      elo:          2208,
      tagline:      'The lowest seed in the circuit and still more than good enough.',
      portraitSeed: 'AK',
    },
  ];

  function _topSeeds(limit = CHAMPIONS.length) {
    return CHAMPIONS.slice(0, Math.max(0, limit));
  }

  return {
    getAll() {
      return CHAMPIONS.slice();
    },

    getById(id) {
      return CHAMPIONS.find((c) => c.id === id) || null;
    },

    getByEloRange(minElo, maxElo) {
      return CHAMPIONS.filter((c) => c.elo >= minElo && c.elo <= maxElo);
    },

    getTopSeeds(limit = 10) {
      return _topSeeds(limit);
    },

    count() {
      return CHAMPIONS.length;
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.championData = ChampionData;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChampionData;
}
