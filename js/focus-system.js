// focus-system.js
// Jauge Focus, modificateurs, Flow State (paliers auto), évaluation des coups.
// SEUL module autorisé à modifier la valeur du Focus.
// Tous les calculs de Focus passent exclusivement par ce fichier.

const FocusSystem = {

  // ── ÉTAT ─────────────────────────────────────────────────────

  current:   100,
  max:       100,          // max de base (réduit par usage SF, reset chaque partie)

  /**
   * Tableau de modificateurs dynamiques.
   * Format : { id: string, type: string, value: number }
   *
   * Types supportés :
   *   'sf-cost-reduction'  → réduction additive des coûts SF (0.10 = -10%)
   *   'focus-gain-mult'    → multiplicateur des gains de Focus (1.4 = +40%)
   *   'focus-loss-mult'    → multiplicateur des pertes de Focus (1.2 = +20% de perte)
   *
   * Compatible Phase 7 (talismans, upgrades).
   */
  modifiers: [],

  // ── MOMENTUM ──────────────────────────────────────────────────

  consecutiveGoodMoves: 0,

  // ── FLOW STATE (PALIERS) ──────────────────────────────────────

  /**
   * Palier Flow dérivé de consecutiveGoodMoves :
   *   0-2 : pas de Flow
   *   3-4 : Flow I
   *   5-6 : Flow II
   *   7-9 : Flow III
   *   10+ : Flow MAX
   */
  flowPalier: 0,     // cache recalculé après chaque changement de compteur

  shakeTriggered: false,

  // ── CLASSIFICATION DU DERNIER COUP ──────────────────────────
  lastMoveEval:      null,   // { key, label, cls, ply }
  _moveEvalCallback: null,   // fonction appelée par l'UI après chaque évaluation

  // ── ZONES ────────────────────────────────────────────────────

  ZONES: [
    { min: 80, max: 100, color: '#1d9e75', label: 'Peak concentration'    },
    { min: 50, max: 80,  color: '#378add', label: 'Focus steady'          },
    { min: 20, max: 50,  color: '#ef9f27', label: 'Concentration fading'  },
    { min: 5,  max: 20,  color: '#e24b4a', label: 'Critical'              },
    { min: 0,  max: 5,   color: '#2c2c2a', label: 'Exhausted'             },
  ],

  /** @returns {object} zone correspondant au Focus actuel (basé sur % du max) */
  getZone() {
    const pct = this.max > 0 ? (this.current / this.max) * 100 : 0;
    return this.ZONES.find(z => pct >= z.min) || this.ZONES[4];
  },

  // ── COÛTS STOCKFISH ──────────────────────────────────────────

  SF_COSTS:         { 1: 7, 2: 14, 3: 22 },
  SF_MAX_PENALTIES: { 1: 0.03, 2: 0.05, 3: 0.08 },

  TAKEBACK_COST:        30,   // coût Focus de la reprise de coup
  TAKEBACK_MAX_PENALTY: 0.08, // pénalité au max (même qu'un N3)

  /**
   * Retourne le coût effectif Stockfish après application des modificateurs.
   * @param {number} level - 1, 2, ou 3
   * @returns {number}
   */
  getEffectiveSFCost(level) {
    const base = this.SF_COSTS[level];
    const reduction = this.modifiers
      .filter(m => m.type === 'sf-cost-reduction')
      .reduce((sum, m) => sum + m.value, 0);
    return Math.max(1, Math.round(base * (1 - Math.min(reduction, 0.9))));
  },

  /**
   * Retourne le coût Focus réel de SF en tenant compte de la gratuité Flow.
   * En Flow I: N1 gratuit. En Flow II: N1+N2 gratuits. En Flow III+: tout gratuit.
   * @param {number} level
   * @returns {number} 0 si gratuit en Flow, sinon coût effectif
   */
  _getFlowAdjustedCost(level) {
    if (this.flowPalier === 0) return this.getEffectiveSFCost(level);
    const freeN = this.FLOW_CONFIG[this.flowPalier].freeN;
    if (level <= freeN) return 0;
    return this.getEffectiveSFCost(level);
  },

  // ── INTUITION (SURBRILLANCES FLOW) ──────────────────────────

  /**
   * Coût Focus de l'Intuition par palier Flow.
   * Palier 0-1 : non disponible.
   * Palier 2 : -15%, Palier 3 : -10%, Palier 4 (MAX) : gratuit.
   */
  INTUITION_COST: { 2: 15, 3: 10, 4: 0 },

  /**
   * Vérifie si l'Intuition est disponible (Flow II+).
   * @returns {boolean}
   */
  canUseIntuition() {
    if (this.flowPalier < 2) return false;
    const cost = this.INTUITION_COST[this.flowPalier] || 0;
    return this.current >= cost;
  },

  /**
   * Active l'Intuition : dépense du Focus, retourne le coût.
   * @returns {number|false} coût payé, ou false si indisponible
   */
  activateIntuition() {
    if (this.flowPalier < 2) return false;
    const cost = this.INTUITION_COST[this.flowPalier] || 0;
    if (this.current < cost) return false;

    if (cost > 0) {
      this.apply(-cost, 'Intuition');
    } else {
      this._log(0, 'Intuition (gratuit en Flow MAX)');
    }

    this.render();
    return cost;
  },

  /**
   * Appelé quand le joueur choisit une pièce après Intuition.
   * Si c'est un leurre et qu'on n'est pas en Flow MAX → sort du Flow.
   * @param {boolean} correct — true si le joueur a choisi la bonne pièce
   */
  onIntuitionResult(correct) {
    if (!correct && this.flowPalier > 0 && this.flowPalier < 4) {
      this._exitFlow();
      this._log(0, 'Mauvais choix d\'Intuition — sortie du Flow !');
    }
  },

  // ── FLOW STATE CONFIG ────────────────────────────────────────

  /**
   * Configuration de chaque palier Flow.
   *   gainMult:  multiplicateur des gains Focus
   *   capBonus:  bonus au Focus max effectif (0.10 = +10%)
   *   freeN:     niveaux SF gratuits (1 = N1, 2 = N1+N2, 3 = N1+N2+N3)
   *   tightening: réduction du seuil "bon coup" en cp
   */
  FLOW_CONFIG: {
    1: { gainMult: 1.25, capBonus: 0.10, freeN: 1, tightening: 0  },
    2: { gainMult: 1.50, capBonus: 0.20, freeN: 2, tightening: 10 },
    3: { gainMult: 1.75, capBonus: 0.30, freeN: 3, tightening: 20 },
    4: { gainMult: 2.00, capBonus: 0.30, freeN: 3, tightening: 25 },
  },

  /**
   * Seuil de consecutiveGoodMoves pour atteindre chaque palier.
   */
  FLOW_THRESHOLDS: { 1: 3, 2: 5, 3: 7, 4: 10 },

  // ── SEUILS ADAPTATIFS PAR ELO ─────────────────────────────────

  /**
   * Retourne le seuil "bon coup" de base en centipawns selon l'Elo du joueur.
   * Données basées sur les ACPL moyens observés par tranche de rating.
   * Sources : 33rdsquare.com, chess.com, lichess.org
   */
  _getBaseThreshold() {
    const elo = this._getPlayerElo();
    if (elo < 1000) return 90;
    if (elo < 1200) return 75;
    if (elo < 1400) return 60;
    if (elo < 1600) return 50;
    if (elo < 1800) return 40;
    return 30;
  },

  /**
   * Retourne le seuil "bon coup" effectif, incluant le tightening du palier Flow actuel.
   * @returns {number} seuil en cp (un coup en dessous = bon coup)
   */
  _getGoodMoveThreshold() {
    const base = this._getBaseThreshold();
    if (this.flowPalier === 0) return base;
    const tightening = this.FLOW_CONFIG[this.flowPalier].tightening;
    return Math.max(15, base - tightening);
  },

  _getPlayerElo() {
    if (typeof CareerManager !== 'undefined' && CareerManager.hasCharacter()) {
      return CareerManager.player.get().elo;
    }
    return 800;
  },

  // ── CAPTURE MICRO-REGEN ───────────────────────────────────────

  CAPTURE_FOCUS: { p: 1, n: 2, b: 2, r: 3, q: 5 },

  // ── MOMENTUM : GAINS PROGRESSIFS ──────────────────────────────

  /**
   * Retourne le gain Focus pour un bon coup selon le momentum (consecutiveGoodMoves).
   * @param {boolean} isBest — true si delta 0cp (meilleur coup)
   * @returns {number} gain brut (avant multiplicateurs)
   */
  _getMomentumGain(isBest) {
    const n = this.consecutiveGoodMoves; // valeur AVANT incrément (le +1 est fait après)
    if (isBest) {
      if (n >= 3) return 18;
      if (n >= 2) return 15;
      if (n >= 1) return 12;
      return 8;
    }
    // Bon coup (pas meilleur)
    if (n >= 3) return 10;
    if (n >= 2) return 7;
    if (n >= 1) return 5;
    return 3;
  },

  // ── PÉNALITÉS GRADUELLES ──────────────────────────────────────

  /**
   * Retourne la pénalité Focus pour un mauvais coup (≥100cp).
   * Formule continue : -min(35, 5 + delta/20)
   * @param {number} abs — delta en cp (valeur absolue)
   * @returns {number} pénalité (nombre négatif)
   */
  _getGraduatedPenalty(abs) {
    return -Math.round(Math.min(35, 5 + abs / 20));
  },

  // ── CALLBACK ÉVALUATION ──────────────────────────────────────

  setMoveEvalCallback(fn) { this._moveEvalCallback = fn; },
  getLastMoveEval()       { return this.lastMoveEval; },

  /**
   * Classifie un coup selon son delta cp (indépendamment de sfUsed).
   * @returns {{ key: string, label: string, cls: string }}
   */
  _classifyMove(abs, threshold) {
    // abs <= 12 : "Meilleur" — tolérance pour la variance Stockfish entre prefetch et post-eval
    if (abs <= 12)                   return { key: 'best',        label: 'Best!',       cls: 'eval-best' };
    if (abs <= threshold * 0.5)      return { key: 'excellent',   label: 'Excellent!',  cls: 'eval-excellent' };
    if (abs < threshold)             return { key: 'good',        label: 'Good',        cls: 'eval-good' };
    if (abs < 100)                   return { key: 'neutral',     label: 'Neutral',     cls: 'eval-neutral' };
    if (abs < 200)                   return { key: 'imprecision', label: 'Inaccurate',  cls: 'eval-imprecis' };
    return                                    { key: 'blunder',    label: 'Blunder!',    cls: 'eval-blunder' };
  },

  // ── MODIFICATEURS ──────────────────────────────────────────

  addModifier(mod) {
    this.removeModifier(mod.id);
    this.modifiers.push(mod);
  },

  removeModifier(id) {
    this.modifiers = this.modifiers.filter(m => m.id !== id);
  },

  _getFocusGainMult() {
    return this.modifiers
      .filter(m => m.type === 'focus-gain-mult')
      .reduce((acc, m) => acc * m.value, 1);
  },

  _getFocusLossMult() {
    return this.modifiers
      .filter(m => m.type === 'focus-loss-mult')
      .reduce((acc, m) => acc * m.value, 1);
  },

  // ── MAX EFFECTIF ─────────────────────────────────────────────

  /**
   * Retourne le max effectif incluant le cap bonus du palier Flow.
   * this.max reste le max de base (réduit par usage SF).
   */
  _getEffectiveMax() {
    if (this.flowPalier === 0) return this.max;
    const config = this.FLOW_CONFIG[this.flowPalier];
    return Math.round(this.max * (1 + config.capBonus));
  },

  // ── MODIFICATION DU FOCUS ──────────────────────────────────

  /**
   * Modifie le Focus courant avec application des modificateurs (Flow, puzzle bonuses, etc.).
   * Clamp entre 0 et effectiveMax.
   * @param {number} delta  - variation brute (+/-)
   * @param {string} reason - texte affiché dans le log console
   */
  apply(delta, reason) {
    let adjusted = delta;
    if (delta > 0) {
      adjusted = delta * this._getFocusGainMult();
    } else if (delta < 0) {
      adjusted = delta * this._getFocusLossMult();
    }
    const effectiveMax = this._getEffectiveMax();
    this.current = Math.max(0, Math.min(this.current + adjusted, effectiveMax));
    this.render();
    if (reason) this._log(adjusted, reason);
  },

  // ── GRILLE D'ÉVALUATION DES COUPS ───────────────────────────

  /**
   * Évalue un coup selon le delta centipawns et le contexte.
   *
   * Système :
   *   delta < threshold   → bon/meilleur coup → gains progressifs (momentum)
   *   threshold ≤ delta < 100 → neutre → 0%
   *   100 ≤ delta < 200   → imprécision → pénalité graduée
   *   delta ≥ 200          → blunder → pénalité graduée + sortie Flow
   *
   * @param {number}  deltaCp       - perte en centipawns (0 = parfait)
   * @param {boolean} sfUsed        - true si Stockfish a été utilisé ce tour
   * @param {string|null} captured  - type de pièce capturée ('p','n','b','r','q') ou null
   * @param {number}  [plyIndex=0]  - numéro du demi-coup (pour traçabilité UI)
   */
  evaluateMoveDelta(deltaCp, sfUsed, captured, plyIndex, isBookMove, pieceCount, cpBefore) {
    const abs = Math.abs(deltaCp);
    const threshold = this._getGoodMoveThreshold();

    // Complexité de la position : 32 pièces = 1.0, 10 pièces = 0.4, 6 = 0.25
    // Réduit les gains de flow en finale triviale
    const complexity = pieceCount != null
      ? Math.max(0.25, Math.min(1.0, (pieceCount - 4) / 28))
      : 1.0;

    // One-sided factor: when the position is already decisively won
    // or lost (huge |cpBefore|), the "best move" is easy to find —
    // push the king, win the exchange, avoid stalemate. Focus gains
    // should be damped there so trivial wins don't farm the Flow
    // state. Scale smoothly:
    //   |cpBefore| < 200  → 1.00  (normal gains)
    //   |cpBefore| = 400  → 0.70
    //   |cpBefore| = 600  → 0.45
    //   |cpBefore| ≥ 900  → 0.20  (minimum)
    // Losses are also damped (if I'm already winning a piece up, a
    // blunder that only drops me back to still-winning shouldn't
    // cost full focus).
    let oneSided = 1.0;
    if (typeof cpBefore === 'number') {
      const absBefore = Math.abs(cpBefore);
      if (absBefore > 200) {
        oneSided = Math.max(0.20, 1.0 - (absBefore - 200) / 800);
      }
    }

    // Classification du coup (pour l'UI : historique + texte flottant)
    let evalInfo;
    if (isBookMove && abs < threshold) {
      // Coup de livre d'ouverture — classification spéciale
      evalInfo = { key: 'book', label: '📖', cls: 'eval-book' };
    } else {
      evalInfo = this._classifyMove(abs, threshold);
    }
    evalInfo.ply = plyIndex || 0;
    evalInfo.isBookMove = !!isBookMove;
    this.lastMoveEval = evalInfo;

    // 1. Capture micro-regen (indépendant de la qualité du coup)
    if (captured && this.CAPTURE_FOCUS[captured]) {
      this.apply(+this.CAPTURE_FOCUS[captured], `Capture (${captured})`);
    }

    // 2. Évaluation de la qualité du coup
    if (abs < threshold && !sfUsed) {
      // ── Bon ou meilleur coup ──
      const isBest = abs <= 12;
      const gain   = Math.round(
        this._getMomentumGain(isBest) * complexity * oneSided,
      );
      this.apply(+gain, isBest ? 'Meilleur coup' : 'Bon coup');

      // Incrémenter le compteur :
      //   - 0.5x pour les coups de livre (ouvertures théoriques)
      //   - pondéré par la complexité en finale (min 0.5x à 6 pièces)
      let increment = 1;
      if (isBookMove) {
        increment = 0.5;
      } else if (complexity < 0.7) {
        // Finale simple → crédit réduit proportionnellement
        increment = Math.max(0.5, complexity);
      }
      this.consecutiveGoodMoves += increment;
      this._updateFlowFromCounter();

      // Son
      if (typeof SoundManager !== 'undefined') {
        if (isBest) SoundManager.playBestMove(this.consecutiveGoodMoves);
        else        SoundManager.playGoodMove(this.consecutiveGoodMoves);
      }

    } else if (abs >= 100) {
      // ── Mauvais coup (imprécision ou blunder) ──
      // Dampen the penalty too when the position is one-sided:
      // a blunder from +800 to +200 still leaves you winning.
      const rawPenalty = this._getGraduatedPenalty(abs);
      const penalty    = Math.round(rawPenalty * oneSided);
      const isBlunder  = abs >= 200;
      this.apply(penalty, isBlunder ? 'Blunder' : 'Imprécision');

      // Dégradation du Flow
      if (this.flowPalier > 0) {
        if (isBlunder) {
          this._exitFlow();
        } else {
          this._dropFlowPalier();
        }
      }
      this.consecutiveGoodMoves = 0;

      // Son
      if (typeof SoundManager !== 'undefined') {
        if (isBlunder) SoundManager.playBlunder();
        else           SoundManager.playImprecision();
      }

    } else {
      // ── Neutre (threshold ≤ abs < 100) ──
      // Pas de gain ni perte. Le compteur reste inchangé. Le Flow maintient son palier.
      if (sfUsed) {
        // Si SF utilisé et coup neutre : le compteur a déjà été reset dans activateStockfish
      }
    }

    // 3. Son Focus à 0
    if (this.current <= 0 && typeof SoundManager !== 'undefined') {
      SoundManager.playFocusEmpty();
    }

    this.render();

    // 4. Callback UI (historique + texte flottant)
    if (this._moveEvalCallback) this._moveEvalCallback(evalInfo);
  },

  // ── FLOW STATE : TRANSITIONS ───────────────────────────────

  /**
   * Dérive le palier Flow du compteur de coups consécutifs
   * et gère les transitions (entrée, progression).
   */
  _updateFlowFromCounter() {
    const n = this.consecutiveGoodMoves;
    let newPalier = 0;
    if (n >= 10) newPalier = 4;
    else if (n >= 7) newPalier = 3;
    else if (n >= 5) newPalier = 2;
    else if (n >= 3) newPalier = 1;

    if (newPalier > this.flowPalier) {
      const oldPalier = this.flowPalier;
      this.flowPalier = newPalier;
      this._updateFlowModifiers();

      const names = ['', 'I', 'II', 'III', 'MAX'];
      if (oldPalier === 0) {
        this._log(0, `Flow State ${names[newPalier]} activé !`);
      } else {
        this._log(0, `Flow State monte à ${names[newPalier]} !`);
      }

      // Son Flow State
      if (typeof SoundManager !== 'undefined') SoundManager.playFlowEnter(newPalier);
    }
  },

  /**
   * Descend d'un palier Flow (imprécision 100-199cp).
   * Remet le compteur au seuil d'entrée du palier inférieur.
   */
  _dropFlowPalier() {
    if (this.flowPalier <= 1) {
      this._exitFlow();
      return;
    }

    this.flowPalier--;
    // Remettre le compteur au seuil d'entrée du palier actuel
    this.consecutiveGoodMoves = this.FLOW_THRESHOLDS[this.flowPalier];
    this._updateFlowModifiers();

    const names = ['', 'I', 'II', 'III', 'MAX'];
    this._log(0, `Flow State descend à ${names[this.flowPalier]}`);
  },

  /**
   * Sort complètement du Flow State.
   */
  _exitFlow() {
    const wasInFlow = this.flowPalier > 0;
    this.flowPalier = 0;
    this.consecutiveGoodMoves = 0;
    this.removeModifier('flow-gain-mult');

    // Clamp focus au max de base si on dépasse
    if (this.current > this.max) {
      this.current = this.max;
    }

    if (wasInFlow) {
      this._log(0, 'Flow State terminé');
      if (typeof SoundManager !== 'undefined') SoundManager.playFlowExit();
    }
  },

  /**
   * Met à jour le modificateur de gain Focus selon le palier Flow actuel.
   */
  _updateFlowModifiers() {
    if (this.flowPalier === 0) {
      this.removeModifier('flow-gain-mult');
      return;
    }
    const config = this.FLOW_CONFIG[this.flowPalier];
    this.addModifier({
      id: 'flow-gain-mult',
      type: 'focus-gain-mult',
      value: config.gainMult,
    });
  },

  // ── CALLBACKS GAME END ─────────────────────────────────────

  onGameEnd(won) {
    // Nettoyer le Flow State
    if (this.flowPalier > 0) {
      this.flowPalier = 0;
      this.removeModifier('flow-gain-mult');
    }
    this.consecutiveGoodMoves = 0;

    if (won) this.apply(+20, 'Victoire remportée');
    else     this.apply(-5,  'Défaite');
  },

  // ── ACTIVATION STOCKFISH (COÛTS FOCUS + PÉNALITÉ MAX) ──────

  /**
   * Active l'analyse Stockfish.
   * - Coût Focus : gratuit si le palier Flow le permet, sinon coût standard.
   * - Pénalité max : réduit this.max (permanent pour la partie en cours).
   * - Flow State : sortie (ou descente à III si en Flow MAX).
   *
   * @param {number} level - 1, 2, ou 3
   * @returns {boolean} true si activé, false si Focus insuffisant
   */
  activateStockfish(level) {
    const cost = this._getFlowAdjustedCost(level);
    if (this.current < cost) return false;

    // Appliquer le coût Focus
    if (cost > 0) {
      this.apply(-cost, `Stockfish N${level}`);
    } else {
      this._log(0, `Stockfish N${level} (gratuit en Flow)`);
    }

    // Pénalité permanente au Focus max (composée)
    const penalty = this.SF_MAX_PENALTIES[level];
    this.max = Math.max(20, Math.round(this.max * (1 - penalty)));

    ChessEngine.setUsedStockfish();

    // Son
    if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();

    // Gestion du Flow State
    if (this.flowPalier > 0) {
      if (this.flowPalier === 4) {
        // Flow MAX : descend à Flow III au lieu de sortir
        this.flowPalier = 3;
        this.consecutiveGoodMoves = this.FLOW_THRESHOLDS[3]; // 7
        this._updateFlowModifiers();
        this._log(0, 'Flow State descend à III (usage SF en MAX)');
      } else {
        this._exitFlow();
      }
    } else {
      // Hors Flow : remettre le compteur à 0
      this.consecutiveGoodMoves = 0;
    }

    return true;
  },

  // ── REPRISE DE COUP ──────────────────────────────────────────

  /**
   * Vérifie si le joueur peut se payer une reprise de coup.
   * @returns {boolean}
   */
  canTakeback() {
    return this.current >= this.TAKEBACK_COST;
  },

  /**
   * Active une reprise de coup.
   * - Coût : TAKEBACK_COST en Focus
   * - Pénalité max : TAKEBACK_MAX_PENALTY (composée)
   * - Sort du Flow State
   * @returns {boolean} true si activé
   */
  activateTakeback() {
    if (!this.canTakeback()) return false;

    this.apply(-this.TAKEBACK_COST, 'Reprise de coup');

    // Son
    if (typeof SoundManager !== 'undefined') SoundManager.playTakeback();

    // Pénalité permanente au max
    this.max = Math.max(20, Math.round(this.max * (1 - this.TAKEBACK_MAX_PENALTY)));

    // Sort du Flow State
    if (this.flowPalier > 0) {
      this._exitFlow();
    } else {
      this.consecutiveGoodMoves = 0;
    }

    this.render();
    return true;
  },

  // ── RESET ENTRE LES PARTIES ──────────────────────────────────

  /**
   * Récupération inter-parties : lit les valeurs sauvegardées dans CareerManager,
   * applique une récupération de 40% de la différence avec focusMax.
   * Focus max revient toujours à 100 (pénalités N sont par partie).
   */
  resetForGame() {
    // Lire les valeurs persistées pour le current, mais remettre max à 100
    if (typeof CareerManager !== 'undefined' && CareerManager.hasCharacter()) {
      const focusState = CareerManager.focus.get();
      const savedCurrent = focusState.current;
      this.max = 100; // Reset max chaque partie (pénalités SF sont intra-partie)
      const recovery = savedCurrent + (100 - savedCurrent) * 0.4;
      this.current = Math.min(100, Math.round(recovery));
    } else {
      this.max = 100;
      const recovery = Math.min(100, this.current + 100 * 0.4);
      this.current = Math.round(recovery);
    }

    // Réinitialiser le Flow State et le momentum
    this.consecutiveGoodMoves = 0;
    this.flowPalier           = 0;
    this.shakeTriggered       = false;

    // Nettoyer les modificateurs temporaires
    this.removeModifier('flow-gain-mult');

    this.render();
  },

  // ── INFO FLOW STATE (API PUBLIQUE) ──────────────────────────

  /**
   * Retourne l'état complet du Flow State pour l'UI.
   * @returns {{ palier: number, consecutiveGoodMoves: number,
   *             threshold: number, nextPalierAt: number }}
   */
  getFlowStateInfo() {
    const nextThresholds = { 0: 3, 1: 5, 2: 7, 3: 10, 4: Infinity };
    return {
      palier:               this.flowPalier,
      consecutiveGoodMoves: this.consecutiveGoodMoves,
      threshold:            this._getGoodMoveThreshold(),
      nextPalierAt:         nextThresholds[this.flowPalier],
      maxPenalty:            Math.round((1 - this.max / 100) * 100),
    };
  },

  // ── RENDU ──────────────────────────────────────────────────

  render() {
    const zone    = this.getZone();
    const bar     = document.getElementById('focus-bar');
    const barWrap = document.getElementById('focus-bar-wrap');
    const val     = document.getElementById('focus-value');
    if (!bar || !val) return;

    // ── Barre principale (vert + segment doré en Flow) ──
    const goldBar    = document.getElementById('focus-bar-gold');
    const effMax     = this._getEffectiveMax();
    const inFlowOver = this.flowPalier > 0 && this.current > this.max;

    if (inFlowOver) {
      const greenPct = Math.min(this.current / effMax, this.max / effMax) * 100;
      const goldPct  = Math.min(Math.max(0, (this.current - this.max) / effMax), 1) * 100;
      bar.style.width           = greenPct + '%';
      bar.style.backgroundColor = zone.color;
      bar.style.background      = zone.color;
      bar.style.borderRadius    = '6px 0 0 6px';
      if (goldBar) goldBar.style.width = goldPct + '%';
      if (barWrap) barWrap.style.overflow = 'hidden';
    } else {
      const displayPct = effMax > 0 ? Math.min(100, (this.current / effMax) * 100) : 0;
      bar.style.width           = displayPct + '%';
      bar.style.backgroundColor = zone.color;
      bar.style.background      = zone.color;
      bar.style.borderRadius    = '6px';
      if (goldBar) goldBar.style.width = '0';
      if (barWrap) barWrap.style.overflow = 'hidden';
    }

    // ── Texte du focus ──
    const maxPenalty = Math.round((1 - this.max / 100) * 100);
    let focusText = Math.round(this.current) + '%  — ' + zone.label;
    if (maxPenalty > 0) {
      focusText += ` (max: ${this.max}%)`;
    }
    val.textContent = focusText;

    // ── Pulsation Flow State actif ──
    if (barWrap) {
      barWrap.classList.toggle('flow-pulse', this.flowPalier > 0);
    }

    // ── Statut Flow State sous la jauge ──
    const flowStatus = document.getElementById('flow-status');
    if (flowStatus) {
      if (this.flowPalier > 0) {
        const names = ['', 'I', 'II', 'III', 'MAX'];
        let progressText = '';
        if (this.flowPalier < 4) {
          const currentThreshold = this.FLOW_THRESHOLDS[this.flowPalier];
          const nextThreshold    = this.FLOW_THRESHOLDS[this.flowPalier + 1];
          const done   = Math.floor(this.consecutiveGoodMoves - currentThreshold);
          const needed = nextThreshold - currentThreshold;
          progressText = ` (${done}/${needed})`;
        }
        flowStatus.innerHTML = '<span class="badge badge-warning badge-lg flow-badge-active">' +
          `Flow ${names[this.flowPalier]}${progressText}</span>`;
      } else if (this.consecutiveGoodMoves >= 1) {
        flowStatus.textContent = `Momentum: ${Math.floor(this.consecutiveGoodMoves)}/3`;
        flowStatus.className   = 'flow-status flow-status-passive';
      } else {
        flowStatus.textContent = '';
        flowStatus.className   = 'flow-status';
      }
    }

    // ── Bouton Flow State (caché — activation automatique maintenant) ──
    const flowBtn = document.getElementById('btn-flow-state');
    if (flowBtn) flowBtn.classList.add('hidden');

    // ── Bouton Stockfish N3 (seul niveau disponible) ──
    {
      const lvl = 3;
      const btn     = document.getElementById('btn-sf3');
      const tooltip = document.getElementById('tooltip-sf3');
      if (btn) {
        const flowCost     = this._getFlowAdjustedCost(lvl);
        const baseCost     = this.SF_COSTS[lvl];
        const isFree       = flowCost === 0;
        const insufficient = this.current < flowCost;
        btn.disabled = insufficient;

        if (isFree) {
          btn.textContent = `N3 — Best move (FREE ⚡)`;
        } else {
          btn.textContent = `N3 — Best move (-${baseCost}%)`;
        }

        if (tooltip) {
          if (insufficient) {
            tooltip.dataset.tip = `Not enough Focus (${flowCost}% required)`;
          } else if (isFree) {
            tooltip.dataset.tip = 'Free in Flow State — but exits Flow!';
          } else {
            tooltip.dataset.tip = '';
          }
        }
      }
    }

    // ── Takeback button ──
    const takebackBtn = document.getElementById('btn-takeback');
    if (takebackBtn) {
      takebackBtn.disabled = !this.canTakeback();
      takebackBtn.textContent = `Takeback (-${this.TAKEBACK_COST}%)`;
    }

    // ── Bouton Intuition (Flow II+) ──
    const intuBtn = document.getElementById('btn-intuition');
    if (intuBtn) {
      const canUse = this.canUseIntuition();
      intuBtn.classList.toggle('hidden', this.flowPalier < 2);
      intuBtn.disabled = !canUse;
      if (this.flowPalier >= 2) {
        const cost = this.INTUITION_COST[this.flowPalier] || 0;
        if (cost > 0) {
          intuBtn.textContent = `✦ Intuition (-${cost}%)`;
        } else {
          intuBtn.textContent = '✦ Intuition (FREE ⚡)';
        }
      }
    }

    // ── Tremblement continu zone noire (0-5%) sur la barre de focus ──
    const focusBarWrap = document.getElementById('focus-bar-wrap');
    if (focusBarWrap) {
      focusBarWrap.classList.toggle('focus-zone-black', zone.min === 0 && zone.max === 5);
    }

    // ── Tremblement ponctuel (une seule fois par partie) ──
    if (focusBarWrap && zone.min === 0 && zone.max === 5 && !this.shakeTriggered) {
      this.shakeTriggered = true;
      focusBarWrap.classList.remove('focus-exhausted');
      void focusBarWrap.offsetWidth;
      focusBarWrap.classList.add('focus-exhausted');
    }
  },

  // ── LOG ──────────────────────────────────────────────────────

  _log(delta, reason) {
    const sign = delta > 0 ? '+' : '';
    console.log(`[Focus] ${reason} (${sign}${Math.round(delta)}%) → ${Math.round(this.current)}%`);
  },

};
