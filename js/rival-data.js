// rival-data.js
//
// Static catalogue of 8 named NPC rivals (Phase F.1).
//
// Each rival is a persistent character with an Elo curve that evolves
// in parallel with the player. They show up in tournaments, accumulate
// head-to-head history, and drive the narrative inbox beats.
//
// Fields:
//   id            — stable unique key, persisted in career.rivals
//   name          — display name
//   nationality   — ISO-ish country code (matches TournamentSystem pools)
//   startElo      — Elo at career start
//   archetype     — offscreen progression profile:
//                     'rising'    strong positive drift
//                     'steady'    near-zero drift
//                     'declining' negative drift
//                     'volatile'  larger-amplitude random swings
//   tagline       — one-line flavor used by UI / inbox
//   portraitSeed  — stable seed used to pick placeholder background hue

const RivalData = (() => {

  const RIVALS = [
    {
      id:           'rival_novak_pavel',
      name:         'Pavel Novák',
      nationality:  'CZ',
      startElo:     950,
      archetype:    'rising',
      tagline:      'Prague club prodigy chasing his first title.',
      portraitSeed: 'PN',
    },
    {
      id:           'rival_tanaka_yuki',
      name:         'Yuki Tanaka',
      nationality:  'JP',
      startElo:     1150,
      archetype:    'steady',
      tagline:      'Methodical and hard to surprise over the board.',
      portraitSeed: 'YT',
    },
    {
      id:           'rival_ferreira_bruno',
      name:         'Bruno Ferreira',
      nationality:  'BR',
      startElo:     1300,
      archetype:    'volatile',
      tagline:      'Plays every position like it owes him money.',
      portraitSeed: 'BF',
    },
    {
      id:           'rival_ostrowska_lena',
      name:         'Lena Ostrowska',
      nationality:  'PL',
      startElo:     1450,
      archetype:    'rising',
      tagline:      'Rapid-tournament circuit regular with a sharp repertoire.',
      portraitSeed: 'LO',
    },
    {
      id:           'rival_hassan_omar',
      name:         'Omar Hassan',
      nationality:  'EG',
      startElo:     1650,
      archetype:    'steady',
      tagline:      'Cairo endgame specialist, relentless in long games.',
      portraitSeed: 'OH',
    },
    {
      id:           'rival_lindqvist_anders',
      name:         'Anders Lindqvist',
      nationality:  'SE',
      startElo:     1850,
      archetype:    'volatile',
      tagline:      'Aggressive attacker, either brilliant or self-destructive.',
      portraitSeed: 'AL',
    },
    {
      id:           'rival_beaumont_claire',
      name:         'Claire Beaumont',
      nationality:  'FR',
      startElo:     2000,
      archetype:    'rising',
      tagline:      'Former youth champion aiming for the IM norm circuit.',
      portraitSeed: 'CB',
    },
    {
      id:           'rival_volkov_grigori',
      name:         'Grigori Volkov',
      nationality:  'RU',
      startElo:     2200,
      archetype:    'declining',
      tagline:      'Ex-rising star now fighting to stay above the crowd.',
      portraitSeed: 'GV',
    },
  ];

  return {
    /** @returns {Array} the raw catalogue (do not mutate). */
    getAll() {
      return RIVALS.slice();
    },

    /** @param {string} id */
    getById(id) {
      return RIVALS.find((r) => r.id === id) || null;
    },

    /** @returns {number} */
    count() {
      return RIVALS.length;
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.rivalData = RivalData;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RivalData;
}
