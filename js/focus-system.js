// focus-system.js
// Jauge Focus, modificateurs, évaluation des coups.
// SEUL module autorisé à modifier la valeur du Focus.
// Tous les calculs de Focus passent exclusivement par ce fichier.

const FocusSystem = {

  // ── ÉTAT ─────────────────────────────────────────────────────

  current:   100,
  max:       100,
  modifiers: [],   // Réservé Phase 7 (talismans, upgrades)

  // ── ZONES ────────────────────────────────────────────────────

  ZONES: [
    { min: 80, max: 100, color: '#1d9e75', label: 'Concentration maximale' },
    { min: 50, max: 80,  color: '#378add', label: 'Focus stable'           },
    { min: 20, max: 50,  color: '#ef9f27', label: 'Concentration fragile'  },
    { min: 5,  max: 20,  color: '#e24b4a', label: 'Limite critique'        },
    { min: 0,  max: 5,   color: '#2c2c2a', label: 'Épuisé'                 },
  ],

  /** @returns {object} zone correspondant au Focus actuel */
  getZone() {
    return this.ZONES.find(z => this.current >= z.min) || this.ZONES[4];
  },

  // ── COÛTS STOCKFISH ──────────────────────────────────────────

  SF_COSTS: { 1: 7, 2: 14, 3: 22 },

  // ── MODIFICATION DU FOCUS ────────────────────────────────────

  /**
   * Modifie le Focus courant, clamp entre 0 et max, met à jour le rendu.
   * @param {number} delta  - variation (+/-)
   * @param {string} reason - texte affiché dans le log console
   */
  apply(delta, reason) {
    this.current = Math.max(0, Math.min(this.current + delta, this.max));
    this.render();
    if (reason) this._log(delta, reason);
  },

  // ── GRILLE D'ÉVALUATION DES COUPS ───────────────────────────

  /**
   * Évalue un coup selon le delta centipawns et applique la variation de Focus.
   *
   *   delta 0 cp       → meilleur coup  → +15%
   *   delta 1-49 cp    → bon coup       → +5%
   *   delta 50-99 cp   → neutre         → 0%
   *   delta 100-199 cp → imprécision    → -10%
   *   delta 200+ cp    → gaffe          → -25%
   *
   * @param {number}  deltaCp  - perte en centipawns (0 = parfait, positif = perte)
   * @param {boolean} sfUsed   - true si Stockfish a été utilisé ce tour (supprime les bonus)
   */
  evaluateMoveDelta(deltaCp, sfUsed) {
    const abs = Math.abs(deltaCp);

    if (abs === 0)              { if (!sfUsed) this.onBestMove(); }
    else if (abs <= 49)         { if (!sfUsed) this.onGoodMove(); }
    else if (abs <= 99)         { /* neutre — rien */ }
    else if (abs <= 199)        this.onImprecision();
    else                        this.onBlunder();
  },

  // ── CALLBACKS PAR TYPE DE COUP ───────────────────────────────

  onBestMove() {
    this.apply(+15, 'Meilleur coup trouvé seul');
  },

  onGoodMove() {
    this.apply(+5, 'Bon coup joué');
  },

  onImprecision() {
    this.apply(-10, 'Imprécision détectée');
  },

  onBlunder() {
    this.apply(-25, 'Gaffe — perte significative');
  },

  onGameEnd(won) {
    if (won) this.apply(+20, 'Victoire remportée');
    else     this.apply(-5,  'Défaite');
  },

  // ── ACTIVATION STOCKFISH (COÛTS FOCUS) ──────────────────────

  /**
   * Active l'analyse Stockfish payante.
   * Déduit le coût et signale à ChessEngine que Stockfish a été utilisé ce tour.
   * @param {number} level - 1, 2, ou 3
   * @returns {boolean} true si activé, false si Focus insuffisant
   */
  activateStockfish(level) {
    const cost = this.SF_COSTS[level];
    if (this.current < cost) return false;

    this.apply(-cost, `Stockfish niveau ${level} activé`);
    ChessEngine.setUsedStockfish();
    return true;
  },

  // ── RESET ENTRE LES PARTIES ─────────────────────────────────

  /**
   * Récupération de 40% du Focus max, plafonné à max.
   * Appelé au début de chaque nouvelle partie.
   */
  resetForGame() {
    const recovery = Math.min(this.max, this.current + this.max * 0.4);
    this.current = Math.round(recovery);
    this.render();
  },

  // ── RENDU ────────────────────────────────────────────────────

  /**
   * Met à jour la barre visuelle Focus et les boutons Stockfish.
   * Ajoute/retire la classe de tremblement si zone épuisée.
   */
  render() {
    const pct  = Math.round((this.current / this.max) * 100);
    const zone = this.getZone();

    const bar = document.getElementById('focus-bar');
    const val = document.getElementById('focus-value');
    if (!bar || !val) return;

    bar.style.width           = pct + '%';
    bar.style.backgroundColor = zone.color;
    val.textContent           = Math.round(this.current) + '%  — ' + zone.label;

    // Désactiver les boutons Stockfish si Focus insuffisant + tooltip
    [1, 2, 3].forEach(lvl => {
      const btn     = document.getElementById('btn-sf' + lvl);
      const tooltip = document.getElementById('tooltip-sf' + lvl);
      if (!btn) return;
      const insufficient = this.current < this.SF_COSTS[lvl];
      btn.disabled = insufficient;
      if (tooltip) {
        tooltip.dataset.tip = insufficient
          ? `Focus insuffisant (${this.SF_COSTS[lvl]}% requis)`
          : '';
      }
    });

    // Tremblement ponctuel de l'échiquier en zone épuisée (0-5%)
    const boardEl = document.getElementById('board');
    if (boardEl && zone.min === 0 && zone.max === 5) {
      boardEl.classList.remove('focus-exhausted');
      // Force reflow pour relancer l'animation
      void boardEl.offsetWidth;
      boardEl.classList.add('focus-exhausted');
    }
  },

  // ── LOG ──────────────────────────────────────────────────────

  _log(delta, reason) {
    const sign = delta > 0 ? '+' : '';
    console.log(`[Focus] ${reason} (${sign}${delta}%) → ${Math.round(this.current)}%`);
  },

};
