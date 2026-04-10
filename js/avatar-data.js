// avatar-data.js
//
// Static avatar presets shared by character-creator.js (where the
// player picks layers) and ui-career.js (where the chosen avatar is
// rendered in the home header).
//
// Phase B.5 ships placeholder layers built from CSS shapes and color
// swatches. Real pixel art sprites will replace these palettes in
// Phase H without changing the schema — only the renderer changes.
//
// Schema match: see PlayerAvatar in career-manager.js
//   { skinTone, faceShape, eyeColor, hairStyle, hairColor, outfit }
// Each field is an integer index into the corresponding array below.

const AvatarData = (() => {

  const SKIN_TONES = [
    '#fde0c8',  // very fair
    '#f5d0a3',  // fair
    '#e5b78c',  // light
    '#c8916b',  // medium
    '#9a6a4a',  // tan
    '#6e4830',  // dark
  ];

  const HAIR_COLORS = [
    '#1a1208',  // black
    '#4a2c1a',  // dark brown
    '#7a4a2a',  // brown
    '#c89a4a',  // dirty blond
    '#e8c878',  // blond
    '#a04030',  // red
    '#8a8a8a',  // grey
    '#3a5a8a',  // unnatural blue
  ];

  // Hair "style" is encoded as the height of the colored bar above
  // the face plus a shape variation. Will become a sprite index later.
  const HAIR_STYLES = [
    { name: 'Short',  height: 10, sides: 0 },
    { name: 'Buzz',   height: 6,  sides: 0 },
    { name: 'Medium', height: 16, sides: 4 },
    { name: 'Spiky',  height: 14, sides: 0 },
    { name: 'Long',   height: 22, sides: 6 },
    { name: 'Curly',  height: 18, sides: 8 },
  ];

  const EYE_COLORS = [
    '#3a2418',  // dark brown
    '#7a4a2a',  // hazel
    '#3a5a8a',  // blue
    '#3a7a4a',  // green
    '#5a3a7a',  // violet
    '#888888',  // grey
  ];

  // faceShape maps to border-radius on the face div in the placeholder
  // renderer. Once real sprites land, this becomes a sprite-set index.
  const FACE_SHAPES = [
    { name: 'Square',   borderRadius: '2px'  },
    { name: 'Soft',     borderRadius: '6px'  },
    { name: 'Round',    borderRadius: '14px' },
    { name: 'Oval',     borderRadius: '50% / 40%' },
  ];

  const OUTFITS = [
    '#3a4a8a',  // navy
    '#8a3a3a',  // burgundy
    '#3a8a4a',  // forest
    '#8a7a3a',  // mustard
    '#5a3a8a',  // purple
    '#3a3a3a',  // black
    '#8a8a8a',  // grey
    '#c89a4a',  // gold
  ];

  /**
   * Build a random valid avatar (used as the default when the
   * character creator first opens).
   */
  function random() {
    const pick = (arr) => Math.floor(Math.random() * arr.length);
    return {
      skinTone:  pick(SKIN_TONES),
      faceShape: pick(FACE_SHAPES),
      eyeColor:  pick(EYE_COLORS),
      hairStyle: pick(HAIR_STYLES),
      hairColor: pick(HAIR_COLORS),
      outfit:    pick(OUTFITS),
    };
  }

  /** Clamp every layer index into [0, length). */
  function normalize(avatar) {
    const a = avatar || {};
    return {
      skinTone:  ((a.skinTone  ?? 0) % SKIN_TONES.length  + SKIN_TONES.length)  % SKIN_TONES.length,
      faceShape: ((a.faceShape ?? 0) % FACE_SHAPES.length + FACE_SHAPES.length) % FACE_SHAPES.length,
      eyeColor:  ((a.eyeColor  ?? 0) % EYE_COLORS.length  + EYE_COLORS.length)  % EYE_COLORS.length,
      hairStyle: ((a.hairStyle ?? 0) % HAIR_STYLES.length + HAIR_STYLES.length) % HAIR_STYLES.length,
      hairColor: ((a.hairColor ?? 0) % HAIR_COLORS.length + HAIR_COLORS.length) % HAIR_COLORS.length,
      outfit:    ((a.outfit    ?? 0) % OUTFITS.length     + OUTFITS.length)     % OUTFITS.length,
    };
  }

  return {
    SKIN_TONES,
    HAIR_COLORS,
    HAIR_STYLES,
    EYE_COLORS,
    FACE_SHAPES,
    OUTFITS,
    random,
    normalize,
  };
})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.avatar = AvatarData;
}
