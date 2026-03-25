// sound-manager.js
// Système de sons 8-bit synthétisés via Web Audio API.
// Sons chiptune cohérents avec l'esthétique pixel art du jeu.
// Module indépendant — communique via fonctions publiques.

const SoundManager = (() => {

  let _ctx      = null;   // AudioContext (créé au premier appel)
  let _enabled  = true;   // toggle SFX
  let _volume   = 0.25;   // volume global SFX (0-1)

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // ── UTILITAIRES DE SYNTHÈSE ───────────────────────────────────

  /**
   * Joue un oscillateur simple.
   * @param {string} type    — 'sine', 'square', 'sawtooth', 'triangle'
   * @param {number} freq    — fréquence Hz
   * @param {number} dur     — durée en secondes
   * @param {number} vol     — volume relatif (0-1)
   * @param {number} [delay] — délai avant le début (secondes)
   */
  function _tone(type, freq, dur, vol, delay = 0) {
    const ctx  = _getCtx();
    const t    = ctx.currentTime + delay;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type            = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(vol * _volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + dur);
  }

  /**
   * Joue du bruit blanc (percussif).
   * @param {number} dur — durée secondes
   * @param {number} vol — volume relatif
   */
  function _noise(dur, vol) {
    const ctx    = _getCtx();
    const t      = ctx.currentTime;
    const len    = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data   = buffer.getChannelData(0);

    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src  = ctx.createBufferSource();
    const gain = ctx.createGain();

    src.buffer = buffer;
    gain.gain.setValueAtTime(vol * _volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  }

  // ── SONS DU JEU ───────────────────────────────────────────────

  return {

    /** Toggle on/off */
    setEnabled(on) { _enabled = on; },
    isEnabled()    { return _enabled; },

    // ────────────────────────────────────────────────────────────
    // 1. DÉPLACEMENT DE PIÈCE — clic sourd et discret
    // ────────────────────────────────────────────────────────────
    playMove() {
      if (!_enabled) return;
      // Clic percussif bois — bruit court + tonalité basse
      _noise(0.04, 0.3);
      _tone('triangle', 120, 0.08, 0.25);
    },

    // ────────────────────────────────────────────────────────────
    // 2. BON COUP — petit ding qui scale avec le momentum
    //    @param {number} momentum — consecutiveGoodMoves (1-10+)
    // ────────────────────────────────────────────────────────────
    playGoodMove(momentum) {
      if (!_enabled) return;
      // Fréquence de base + shift par momentum
      const baseFreq = 660;
      const shift    = Math.min(momentum, 8) * 40;  // +40Hz par momentum level
      const vol      = Math.min(0.25 + momentum * 0.04, 0.55);
      _tone('square', baseFreq + shift, 0.12, vol);
      _tone('square', (baseFreq + shift) * 1.5, 0.08, vol * 0.5, 0.04);
    },

    // ────────────────────────────────────────────────────────────
    // 3. MEILLEUR COUP — double ding ascendant, plus riche
    //    @param {number} momentum
    // ────────────────────────────────────────────────────────────
    playBestMove(momentum) {
      if (!_enabled) return;
      const baseFreq = 880;
      const shift    = Math.min(momentum, 8) * 50;
      const vol      = Math.min(0.3 + momentum * 0.05, 0.6);
      // Accord ascendant : 3 notes rapides
      _tone('square', baseFreq + shift, 0.1, vol);
      _tone('square', (baseFreq + shift) * 1.25, 0.1, vol * 0.8, 0.07);
      _tone('square', (baseFreq + shift) * 1.5, 0.15, vol * 0.6, 0.14);
    },

    // ────────────────────────────────────────────────────────────
    // 4. BLUNDER — son descendant "refusant"
    // ────────────────────────────────────────────────────────────
    playBlunder() {
      if (!_enabled) return;
      _tone('square', 280, 0.15, 0.4);
      _tone('square', 200, 0.15, 0.35, 0.1);
      _tone('sawtooth', 140, 0.25, 0.25, 0.2);
    },

    // ────────────────────────────────────────────────────────────
    // 5. IMPRÉCISION — son négatif plus doux
    // ────────────────────────────────────────────────────────────
    playImprecision() {
      if (!_enabled) return;
      _tone('triangle', 330, 0.12, 0.25);
      _tone('triangle', 260, 0.15, 0.2, 0.08);
    },

    // ────────────────────────────────────────────────────────────
    // 6. FLOW STATE ENTER — mélodie ascendante chiptune
    //    @param {number} palier — 1-4
    // ────────────────────────────────────────────────────────────
    playFlowEnter(palier) {
      if (!_enabled) return;
      // Arpège montant, de plus en plus riche avec le palier
      const notes  = [523, 659, 784, 1047]; // C5, E5, G5, C6
      const count  = Math.min(palier + 1, 4);
      const vol    = 0.25 + palier * 0.05;
      for (let i = 0; i < count; i++) {
        _tone('square', notes[i], 0.12, vol, i * 0.08);
      }
    },

    // ────────────────────────────────────────────────────────────
    // 7. FLOW STATE EXIT — son descendant mélancolique
    // ────────────────────────────────────────────────────────────
    playFlowExit() {
      if (!_enabled) return;
      _tone('triangle', 523, 0.15, 0.3);
      _tone('triangle', 392, 0.15, 0.25, 0.1);
      _tone('triangle', 330, 0.2, 0.2, 0.2);
    },

    // ────────────────────────────────────────────────────────────
    // 8. UTILISATION SF / REPRISE — son "activation" électronique
    // ────────────────────────────────────────────────────────────
    playSFActivate() {
      if (!_enabled) return;
      _tone('sawtooth', 440, 0.06, 0.2);
      _tone('square', 880, 0.08, 0.15, 0.04);
      _tone('square', 1320, 0.06, 0.1, 0.08);
    },

    // ────────────────────────────────────────────────────────────
    // 9. FOCUS À 0 — son grave menaçant
    // ────────────────────────────────────────────────────────────
    playFocusEmpty() {
      if (!_enabled) return;
      _tone('sawtooth', 80, 0.4, 0.35);
      _tone('square', 60, 0.5, 0.25, 0.1);
      _noise(0.15, 0.2);
    },

    // ────────────────────────────────────────────────────────────
    // 10. CAPTURE — petit impact satisfaisant
    // ────────────────────────────────────────────────────────────
    playCapture() {
      if (!_enabled) return;
      _noise(0.05, 0.35);
      _tone('square', 200, 0.06, 0.3);
      _tone('triangle', 160, 0.1, 0.2, 0.03);
    },

    // ────────────────────────────────────────────────────────────
    // 11. REPRISE DE COUP — son "rewind" distinctif
    // ────────────────────────────────────────────────────────────
    playTakeback() {
      if (!_enabled) return;
      _tone('square', 660, 0.08, 0.25);
      _tone('square', 440, 0.08, 0.2, 0.06);
      _tone('square', 330, 0.1, 0.15, 0.12);
      _tone('triangle', 220, 0.12, 0.1, 0.18);
    },

    // ────────────────────────────────────────────────────────────
    // 12. VICTOIRE — fanfare chiptune triomphante
    // ────────────────────────────────────────────────────────────
    playVictory() {
      if (!_enabled) return;
      // Fanfare ascendante en Do majeur : C5 E5 G5 → C6 (tenu)
      _tone('square',   523, 0.12, 0.35);          // C5
      _tone('square',   659, 0.12, 0.35, 0.10);    // E5
      _tone('square',   784, 0.12, 0.35, 0.20);    // G5
      _tone('square',  1047, 0.30, 0.40, 0.32);    // C6 tenu
      // Accord final enrichi
      _tone('triangle', 523, 0.35, 0.20, 0.32);    // C5 soutien
      _tone('triangle', 659, 0.30, 0.15, 0.32);    // E5 soutien
      _tone('square',  1319, 0.20, 0.20, 0.50);    // E6 brillant
      _noise(0.04, 0.15);                            // petit éclat
    },

    // ────────────────────────────────────────────────────────────
    // 13. DÉFAITE — son sombre descendant
    // ────────────────────────────────────────────────────────────
    playDefeat() {
      if (!_enabled) return;
      _tone('triangle', 392, 0.20, 0.30);          // G4
      _tone('triangle', 330, 0.20, 0.25, 0.15);    // E4
      _tone('triangle', 262, 0.25, 0.20, 0.30);    // C4
      _tone('sawtooth', 196, 0.40, 0.15, 0.45);    // G3 sombre
    },

  };

})();
