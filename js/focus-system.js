const FocusSystem = {
  current: 100,
  max: 100,

  ZONES: [
    { min: 80, max: 100, color: '#1d9e75', label: 'Concentration maximale' },
    { min: 50, max: 80,  color: '#378add', label: 'Focus stable'           },
    { min: 20, max: 50,  color: '#ef9f27', label: 'Concentration fragile'  },
    { min: 5,  max: 20,  color: '#e24b4a', label: 'Limite critique'        },
    { min: 0,  max: 5,   color: '#2c2c2a', label: 'Épuisé'                 },
  ],

  SF_COSTS: { 1: 8, 2: 18, 3: 30 },

  SF_MESSAGES: {
    1: {
      good: ['Position saine.', 'Coup jouable.', 'Rien à craindre ici.'],
      bad:  ['Attention — position fragile.', 'Coup risqué.', 'Danger potentiel.'],
    },
    2: {
      good: [
        'Coup correct. Meilleure réponse adverse : e5.',
        'Solide. L\'ordi jouera probablement Cf6.',
        'Bonne idée. Attention à Db4 en réponse.',
      ],
      bad: [
        'Coup faible. Meilleure réponse : Txf7+!',
        'Erreur tactique. L\'ordi va jouer Dc3.',
        'Risqué. Meilleure réponse adverse : d5.',
      ],
    },
    3: {
      good: [
        'Coup fort. Variation : ...e5 Cf3 Cc6 — vous êtes mieux.',
        'Correct. Variation : ...d5 exd5 Cxd5 = égalité.',
        'Bon plan. Variation : ...Dc7 b4 a5 avec avantage d\'espace.',
      ],
      bad: [
        'Gaffe. Variation : ...Txf7! Rxf7 Dh5+ — mat en 4.',
        'Erreur. Variation : ...d5! exd5 Dxd5 — votre centre s\'effondre.',
        'Coup faible. Variation : ...Cc4! gagne une pièce immédiatement.',
      ],
    },
  },

  getZone() {
    return this.ZONES.find(z => this.current >= z.min) || this.ZONES[4];
  },

  apply(delta, reason) {
    this.current = Math.max(0, Math.min(this.current + delta, this.max));
    this.render();
    if (reason) this.log(delta, reason);
  },

  activateStockfish(level) {
    const cost = this.SF_COSTS[level];
    if (this.current < cost) return null;

    this.apply(-cost, `Stockfish niveau ${level} activé`);

    const zone    = this.getZone();
    const quality = this.current > 60 ? 'good'
                  : this.current > 20 ? 'good'  // dégradé mais pas totalement mauvais
                  : 'bad';
    const msgs    = this.SF_MESSAGES[level][quality];
    const msg     = msgs[Math.floor(Math.random() * msgs.length)];

    const reliability = this.current > 60 ? 'Analyse fiable.'
                      : this.current > 20 ? 'Analyse dégradée — à confirmer.'
                      : 'Signal très bruité — fiabilité faible.';

    return { msg, reliability, level };
  },

  onGoodMove() {
    this.apply(+3, 'Coup correct joué');
  },

  onBestMove() {
    this.apply(+15, 'Meilleur coup trouvé seul');
  },

  onBlunder() {
    this.apply(-25, 'Gaffe — pièce perdue');
  },

  onGameEnd(won) {
    if (won) this.apply(+20, 'Victoire remportée');
    else     this.apply(-5,  'Défaite');
  },

  resetForGame() {
    // Le Focus repart au niveau actuel + récupération de 40%
    const recovery = Math.min(this.max, this.current + this.max * 0.4);
    this.current = Math.round(recovery);
    this.render();
  },

  render() {
    const pct  = Math.round((this.current / this.max) * 100);
    const zone = this.getZone();

    const bar = document.getElementById('focus-bar');
    const val = document.getElementById('focus-value');
    if (!bar || !val) return;

    bar.style.width           = pct + '%';
    bar.style.backgroundColor = zone.color;
    val.textContent           = Math.round(this.current) + '%  — ' + zone.label;

    // Désactiver les boutons Stockfish si Focus insuffisant
    [1, 2, 3].forEach(lvl => {
      const btn = document.getElementById('btn-sf' + lvl);
      if (btn) btn.disabled = this.current < this.SF_COSTS[lvl];
    });
  },

  log(delta, reason) {
    const sign = delta > 0 ? '+' : '';
    console.log(`[Focus] ${reason} (${sign}${delta}%) → ${Math.round(this.current)}%`);
  },
};