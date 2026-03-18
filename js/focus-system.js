// focus-system.js
// Jauge Focus, modificateurs, Flow State, évaluation des coups.
// SEUL module autorisé à modifier la valeur du Focus.
// Tous les calculs de Focus passent exclusivement par ce fichier.

const FocusSystem = {

  // ── ÉTAT ─────────────────────────────────────────────────────

  current:   100,
  max:       100,

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

  // ── FLOW STATE ──────────────────────────────────────────────

  consecutiveGoodMoves:   0,
  flowState:              false,
  flowStateCoupsRestants: 0,
  flowStateButtonVisible: false,
  flowDecayRemaining:     0,
  flowDecayPerMove:       0,
  _flowMaxBase:           0,
  shakeTriggered:         false,

  // ── ZONES ────────────────────────────────────────────────────

  ZONES: [
    { min: 80, max: 100, color: '#1d9e75', label: 'Concentration maximale' },
    { min: 50, max: 80,  color: '#378add', label: 'Focus stable'           },
    { min: 20, max: 50,  color: '#ef9f27', label: 'Concentration fragile'  },
    { min: 5,  max: 20,  color: '#e24b4a', label: 'Limite critique'        },
    { min: 0,  max: 5,   color: '#2c2c2a', label: 'Épuisé'                 },
  ],

  /** @returns {object} zone correspondant au Focus actuel (basé sur % du max) */
  getZone() {
    const pct = this.max > 0 ? (this.current / this.max) * 100 : 0;
    return this.ZONES.find(z => pct >= z.min) || this.ZONES[4];
  },

  // ── COÛTS STOCKFISH ──────────────────────────────────────────

  SF_COSTS: { 1: 7, 2: 14, 3: 22 },

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
   * Retourne le max effectif (incluant les bonus passifs ou le 130% Flow State).
   * this.max reste toujours le max de base (persisté dans career).
   */
  _getEffectiveMax() {
    if (this.flowState) return Math.round(this._flowMaxBase * 1.3);
    const n = this.consecutiveGoodMoves;
    let bonus = 0;
    if (n >= 6)      bonus = 0.15;
    else if (n >= 5) bonus = 0.10;
    else if (n >= 4) bonus = 0.05;
    return Math.round(this.max * (1 + bonus));
  },

  // ── MODIFICATION DU FOCUS ──────────────────────────────────

  /**
   * Modifie le Focus courant avec application des modificateurs (Confiance, etc.).
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
   * Évalue un coup selon le delta centipawns, applique la variation de Focus,
   * et met à jour le compteur Flow State.
   *
   *   delta 0 cp       → meilleur coup  → +15%
   *   delta 1-49 cp    → bon coup       → +5%
   *   delta 50-99 cp   → neutre         → 0%
   *   delta 100-199 cp → imprécision    → -10%
   *   delta 200+ cp    → gaffe          → -25%
   *
   * @param {number}  deltaCp  - perte en centipawns (0 = parfait, positif = perte)
   * @param {boolean} sfUsed   - true si Stockfish a été utilisé ce tour
   */
  evaluateMoveDelta(deltaCp, sfUsed) {
    const abs = Math.abs(deltaCp);

    // 1. Appliquer le changement de Focus
    if (abs === 0)              { if (!sfUsed) this.onBestMove(); }
    else if (abs <= 49)         { if (!sfUsed) this.onGoodMove(); }
    else if (abs <= 99)         { /* neutre — rien */ }
    else if (abs <= 199)        this.onImprecision();
    else                        this.onBlunder();

    // 2. Gérer le déclin post-Flow State (sur 2 coups)
    if (this.flowDecayRemaining > 0) {
      this.flowDecayRemaining--;
      if (this.current > this.max) {
        this.current -= this.flowDecayPerMove;
      }
      if (this.flowDecayRemaining <= 0) {
        this.current = Math.min(this.current, this.max);
      }
    }

    // 3. Flow State actif : décrémenter le compteur
    if (this.flowState) {
      this.flowStateCoupsRestants--;
      if (this.flowStateCoupsRestants <= 0) {
        this._endFlowState();
      }
      this.render();
      return;   // Pas de mise à jour du compteur consécutif pendant le Flow State actif
    }

    // 4. Mise à jour du compteur de coups consécutifs
    if (abs < 50 && !sfUsed) {
      this.consecutiveGoodMoves++;
      this._updatePassiveBonuses();
    } else if (abs >= 50) {
      this.consecutiveGoodMoves = 0;
      this.flowStateButtonVisible = false;
      this._removePassiveBonuses();
    }
    // Si sfUsed && abs < 50 : le compteur était déjà remis à 0 dans activateStockfish()
    // mais le bouton reste visible — on ne touche à rien ici

    this.render();
  },

  // ── BONUS PASSIFS FLOW STATE ─────────────────────────────────

  /**
   * Retourne le niveau passif Flow State (0-4) selon les coups consécutifs.
   *   3 → level 1 : SF -10%, focus remplit à 100%
   *   4 → level 2 : SF -20%, focusMax temp +5%
   *   5 → level 3 : SF -30%, focusMax temp +10%
   *   6+→ level 4 : SF -40%, focusMax temp +15%
   */
  _getPassiveLevel() {
    const n = this.consecutiveGoodMoves;
    if (n >= 6) return 4;
    if (n >= 5) return 3;
    if (n >= 4) return 2;
    if (n >= 3) return 1;
    return 0;
  },

  /**
   * Met à jour les bonus passifs selon le niveau courant.
   * Appelé après chaque incrémentation de consecutiveGoodMoves.
   */
  _updatePassiveBonuses() {
    const level = this._getPassiveLevel();

    if (level >= 1) {
      this.flowStateButtonVisible = true;
    }

    // Retirer l'ancien modificateur passif
    this.removeModifier('flow-passive-sf');

    if (level === 0) return;

    // Réduction des coûts Stockfish selon le niveau
    const reductions = { 1: 0.10, 2: 0.20, 3: 0.30, 4: 0.40 };
    this.addModifier({
      id: 'flow-passive-sf',
      type: 'sf-cost-reduction',
      value: reductions[level],
    });

    // À l'entrée du niveau 1 (exactement 3 coups) : remplir le focus au max
    if (this.consecutiveGoodMoves === 3) {
      this.current = this.max;
    }
  },

  /**
   * Retire tous les bonus passifs et clamp le focus au max de base.
   */
  _removePassiveBonuses() {
    this.removeModifier('flow-passive-sf');
    if (this.current > this.max && !this.flowState) {
      this.current = this.max;
    }
  },

  // ── ACTIVATION / FIN DU FLOW STATE ──────────────────────────

  /**
   * Active le Flow State.
   * - Malus permanent au max (10% composé)
   * - Focus monte à 130% du max réduit
   * - Coûts Stockfish -50% pendant 5 coups
   * @returns {boolean} true si activé
   */
  activateFlowState() {
    if (!this.flowStateButtonVisible) return false;

    this.flowState = true;
    this.flowStateCoupsRestants = 5;

    // Stocker le max avant malus pour le calcul du 130%
    this._flowMaxBase = this.max;

    // Focus monte à 130% du max (avant malus)
    this.current = Math.round(this.max * 1.3);

    // Malus permanent au max (10% composé)
    this.max = Math.round(this.max * 0.9);

    // Retirer bonus passifs, ajouter bonus actif (-50% coûts SF)
    this._removePassiveBonuses();
    this.addModifier({
      id: 'flow-active-sf',
      type: 'sf-cost-reduction',
      value: 0.50,
    });

    // Masquer le bouton pendant l'état actif
    this.flowStateButtonVisible = false;

    this.render();
    this._log(0, 'Flow State activé !');
    return true;
  },

  /**
   * Termine le Flow State actif.
   * Programme le déclin du focus vers le max sur 2 coups.
   */
  _endFlowState() {
    this.flowState = false;
    this.flowStateCoupsRestants = 0;
    this.consecutiveGoodMoves = 0;
    this.flowStateButtonVisible = false;
    this._flowMaxBase = 0;
    this.removeModifier('flow-active-sf');

    // Programmer le déclin du focus au-dessus du max sur 2 coups
    if (this.current > this.max) {
      const excess = this.current - this.max;
      this.flowDecayRemaining = 2;
      this.flowDecayPerMove = excess / 2;
    }

    this._log(0, 'Flow State terminé');
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
    // Nettoyer le Flow State actif si la partie se termine pendant
    if (this.flowState) {
      this.flowState = false;
      this.flowStateCoupsRestants = 0;
      this._flowMaxBase = 0;
      this.removeModifier('flow-active-sf');
    }
    this.consecutiveGoodMoves = 0;
    this.flowStateButtonVisible = false;
    this._removePassiveBonuses();
    this.flowDecayRemaining = 0;
    this.flowDecayPerMove = 0;

    if (won) this.apply(+20, 'Victoire remportée');
    else     this.apply(-5,  'Défaite');
  },

  // ── ACTIVATION STOCKFISH (COÛTS FOCUS) ──────────────────────

  /**
   * Active l'analyse Stockfish payante avec coût ajusté par modificateurs.
   * Remet le compteur consécutif à 0 mais garde le bouton Flow State visible.
   * @param {number} level - 1, 2, ou 3
   * @returns {boolean} true si activé, false si Focus insuffisant
   */
  activateStockfish(level) {
    const cost = this.getEffectiveSFCost(level);
    if (this.current < cost) return false;

    this.apply(-cost, `Stockfish niveau ${level} activé`);
    ChessEngine.setUsedStockfish();

    // Remettre le compteur à 0, retirer bonus passifs, mais garder le bouton
    if (!this.flowState) {
      this.consecutiveGoodMoves = 0;
      this._removePassiveBonuses();
      // flowStateButtonVisible reste inchangé — le bouton reste s'il était visible
    }

    return true;
  },

  // ── RESET ENTRE LES PARTIES ──────────────────────────────────

  /**
   * Récupération inter-parties : lit les valeurs sauvegardées dans CareerManager,
   * applique une récupération de 40% de la différence avec focusMax.
   * Formule : focusCurrent + (focusMax - focusCurrent) * 0.4
   */
  resetForGame() {
    // Lire les valeurs persistées
    if (typeof CareerManager !== 'undefined' && CareerManager.hasCharacter()) {
      const player = CareerManager.getPlayer();
      const savedCurrent = player.focusCurrent;
      const savedMax     = player.focusMax;
      this.max = savedMax;
      const recovery = savedCurrent + (savedMax - savedCurrent) * 0.4;
      this.current = Math.min(savedMax, Math.round(recovery));
    } else {
      const recovery = Math.min(this.max, this.current + this.max * 0.4);
      this.current = Math.round(recovery);
    }

    // Réinitialiser le Flow State
    this.consecutiveGoodMoves   = 0;
    this.flowState              = false;
    this.flowStateCoupsRestants = 0;
    this.flowStateButtonVisible = false;
    this.flowDecayRemaining     = 0;
    this.flowDecayPerMove       = 0;
    this._flowMaxBase           = 0;
    this.shakeTriggered         = false;

    // Nettoyer les modificateurs temporaires
    this.removeModifier('flow-passive-sf');
    this.removeModifier('flow-active-sf');

    // Mettre à jour le modificateur de Confiance
    this._updateConfianceModifier();

    this.render();
  },

  // ── CONFIANCE (STAT CACHÉE) ──────────────────────────────────

  /**
   * Met à jour les modificateurs basés sur la Confiance du joueur.
   * Passe par le tableau modifiers[] pour compatibilité Phase 7.
   *
   * Confiance > 70 : gains de Focus × 1.4
   * Confiance 30-70 : neutre
   * Confiance < 30 : gains × 0.7, pertes × 1.2
   */
  _updateConfianceModifier() {
    this.removeModifier('confiance-gain');
    this.removeModifier('confiance-loss');

    if (typeof CareerManager === 'undefined' || !CareerManager.hasCharacter()) return;

    const confiance = CareerManager.getPlayer().confiance;

    if (confiance > 70) {
      this.addModifier({ id: 'confiance-gain', type: 'focus-gain-mult', value: 1.4 });
    } else if (confiance < 30) {
      this.addModifier({ id: 'confiance-gain', type: 'focus-gain-mult', value: 0.7 });
      this.addModifier({ id: 'confiance-loss', type: 'focus-loss-mult', value: 1.2 });
    }
  },

  // ── INFO FLOW STATE (API PUBLIQUE) ──────────────────────────

  /**
   * Retourne l'état complet du Flow State pour l'UI.
   * @returns {{ available: boolean, active: boolean, coupsRestants: number,
   *             consecutiveGoodMoves: number, bonusPassif: number }}
   */
  getFlowStateInfo() {
    return {
      available:            this.flowStateButtonVisible,
      active:               this.flowState,
      coupsRestants:        this.flowStateCoupsRestants,
      consecutiveGoodMoves: this.consecutiveGoodMoves,
      bonusPassif:          this._getPassiveLevel(),
    };
  },

  // ── RENDU ──────────────────────────────────────────────────

  /**
   * Met à jour la barre visuelle Focus, les boutons Stockfish,
   * l'UI du Flow State et les effets visuels de zone.
   */
  render() {
    const pct     = this.max > 0 ? Math.round((this.current / this.max) * 100) : 0;
    const zone    = this.getZone();
    const bar     = document.getElementById('focus-bar');
    const barWrap = document.getElementById('focus-bar-wrap');
    const val     = document.getElementById('focus-value');
    if (!bar || !val) return;

    // ── Barre principale (vert + segment doré en flex) ──
    const goldBar = document.getElementById('focus-bar-gold');
    if (this.flowState && this.current > this.max) {
      // Mode Flow State : deux segments (vert 77% max + doré 23% max)
      const greenPct = Math.min(this.current / this.max, 1) * 77;
      const goldPct  = Math.min(Math.max(0, (this.current - this.max) / (this.max * 0.3)), 1) * 23;
      bar.style.width           = greenPct + '%';
      bar.style.backgroundColor = zone.color;
      bar.style.background      = zone.color;
      bar.style.borderRadius    = '6px 0 0 6px';
      if (goldBar) { goldBar.style.width = goldPct + '%'; }
      if (barWrap) barWrap.style.overflow = 'hidden';
    } else {
      bar.style.width           = Math.min(100, pct) + '%';
      bar.style.backgroundColor = zone.color;
      bar.style.background      = zone.color;
      bar.style.borderRadius    = '6px';
      if (goldBar) { goldBar.style.width = '0'; }
      if (barWrap) barWrap.style.overflow = 'hidden';
    }

    // ── Texte du focus ──
    val.textContent = Math.round(this.current) + '%  — ' + zone.label;

    // ── Bordure pulsante pendant Flow State actif ──
    if (barWrap) {
      barWrap.classList.toggle('flow-pulse', this.flowState);
    }

    // ── Statut Flow State sous la jauge ──
    const flowStatus = document.getElementById('flow-status');
    if (flowStatus) {
      const info = this.getFlowStateInfo();
      if (info.active) {
        flowStatus.innerHTML = '<span class="badge badge-warning badge-lg flow-badge-active">' +
          `Flow State actif ! (${info.coupsRestants} coups restants)</span>`;
      } else if (info.bonusPassif > 0) {
        flowStatus.textContent = `Flow state level ${info.bonusPassif}`;
        flowStatus.className   = 'flow-status flow-status-passive';
      } else {
        flowStatus.textContent = '';
        flowStatus.className   = 'flow-status';
      }
    }

    // ── Bouton Flow State ──
    const flowBtn = document.getElementById('btn-flow-state');
    if (flowBtn) {
      flowBtn.classList.toggle('hidden', !(this.flowStateButtonVisible && !this.flowState));
    }

    // ── Boutons Stockfish avec coûts effectifs ──
    const sfLabels = { 1: 'Évaluateur de coup', 2: 'Guide pièce', 3: 'Meilleur coup' };
    [1, 2, 3].forEach(lvl => {
      const btn     = document.getElementById('btn-sf' + lvl);
      const tooltip = document.getElementById('tooltip-sf' + lvl);
      if (!btn) return;

      const effectiveCost = this.getEffectiveSFCost(lvl);
      const baseCost      = this.SF_COSTS[lvl];
      const insufficient  = this.current < effectiveCost;
      btn.disabled = insufficient;

      if (effectiveCost < baseCost) {
        btn.textContent = `N${lvl} — ${sfLabels[lvl]} (-${effectiveCost}% au lieu de ${baseCost}%)`;
      } else {
        btn.textContent = `N${lvl} — ${sfLabels[lvl]} (-${baseCost}%)`;
      }

      if (tooltip) {
        tooltip.dataset.tip = insufficient
          ? `Focus insuffisant (${effectiveCost}% requis)`
          : '';
      }
    });

    // ── Tremblement continu zone noire (0-5%) sur le conteneur ──
    const boardContainer = document.getElementById('board-container');
    if (boardContainer) {
      boardContainer.classList.toggle('focus-zone-black', zone.min === 0 && zone.max === 5);
    }

    // ── Tremblement ponctuel de l'échiquier (une seule fois par partie, 3s) ──
    const boardEl = document.getElementById('board');
    if (boardEl && zone.min === 0 && zone.max === 5 && !this.shakeTriggered) {
      this.shakeTriggered = true;
      boardEl.classList.remove('focus-exhausted');
      void boardEl.offsetWidth;
      boardEl.classList.add('focus-exhausted');
    }
  },

  // ── LOG ──────────────────────────────────────────────────────

  _log(delta, reason) {
    const sign = delta > 0 ? '+' : '';
    console.log(`[Focus] ${reason} (${sign}${Math.round(delta)}%) → ${Math.round(this.current)}%`);
  },

};
