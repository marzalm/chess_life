// career-manager.js
// Entité joueur, formule Elo FIDE et persistance de carrière.
// Boîte noire pure — aucun accès au DOM.
// Tous les calculs de Focus passent exclusivement par FocusSystem.

const CareerManager = (() => {

  let _state = null;

  // Schéma complet du playerState
  const DEFAULT_STATE = {
    nom:               '',
    nationalite:       '',
    styleDeJeu:        '',          // 'Positionnel' | 'Tactique' | 'Universel'
    elo:               800,
    focusMax:          100,
    focusCurrent:      100,
    ouvertures:        10,
    endgame:           10,
    confiance:         50,          // stat cachée — ne jamais exposer dans l'UI
    solde:             500,
    semaine:           1,
    historiqueParties: [],
  };

  function _save() {
    SaveManager.save(_state);
  }

  return {

    // ── INITIALISATION ────────────────────────────────────────────

    /**
     * Charge la sauvegarde ou crée un état vierge.
     * Synchronise FocusSystem avec les valeurs persistées.
     */
    init() {
      if (SaveManager.hasSave()) {
        _state = SaveManager.load();
        // Migrations défensives : ajouter les clés absentes des saves anciennes
        for (const [key, val] of Object.entries(DEFAULT_STATE)) {
          if (_state[key] === undefined) _state[key] = val;
        }
      } else {
        _state = { ...DEFAULT_STATE, historiqueParties: [] };
      }
      // Synchroniser FocusSystem avec les valeurs du joueur
      FocusSystem.current = _state.focusCurrent;
      FocusSystem.max     = _state.focusMax;
      FocusSystem.render();
    },

    /** @returns {boolean} true si un personnage nommé a été créé */
    hasCharacter() {
      return Boolean(_state && _state.nom);
    },

    // ── CRÉATION DU PERSONNAGE ────────────────────────────────────

    /**
     * Crée le personnage. Appelé une seule fois, au premier lancement.
     * @param {string} nom
     * @param {string} nationalite
     * @param {string} styleDeJeu  - 'Positionnel'|'Tactique'|'Universel'
     */
    createPlayer(nom, nationalite, styleDeJeu) {
      _state = {
        ...DEFAULT_STATE,
        historiqueParties: [],
        nom:         nom.trim(),
        nationalite: nationalite.trim(),
        styleDeJeu,
      };
      _save();
    },

    // ── STATS PUBLIQUES ───────────────────────────────────────────

    /**
     * Retourne les stats affichables — confiance exclue.
     * @returns {object}
     */
    getPublicStats() {
      const { confiance, ...visible } = _state;
      return { ...visible };
    },

    /**
     * Retourne l'état complet du joueur, y compris la confiance (stat cachée).
     * Utilisé par FocusSystem pour appliquer les modificateurs de confiance.
     * @returns {object|null}
     */
    getPlayer() {
      return _state ? { ..._state } : null;
    },

    // ── FORMULE ELO FIDE ─────────────────────────────────────────

    /**
     * Calcule et applique le delta Elo après une partie.
     *
     * E  = 1 / (1 + 10 ** ((Elo_opp - Elo_joueur) / 400))
     * D  = K * (score - E)
     * K  = 32 si Elo < 2400, sinon 16
     *
     * @param {number} score       - 1 victoire | 0.5 nulle | 0 défaite
     * @param {number} opponentElo
     * @returns {number}           - delta arrondi (+/-)
     */
    updateElo(score, opponentElo) {
      const E     = 1 / (1 + 10 ** ((opponentElo - _state.elo) / 400));
      const K     = _state.elo < 2400 ? 32 : 16;
      const delta = Math.round(K * (score - E));
      _state.elo  = Math.max(100, _state.elo + delta);
      console.log(`[Elo] E=${E.toFixed(4)}  score=${score}  K=${K}  delta=${delta}  nouvel Elo=${_state.elo}`);
      _save();
      return delta;
    },

    /**
     * Enregistre une partie : applique l'Elo et archive l'entrée.
     * @param {{ opponentName: string, opponentElo: number,
     *           result: 'win'|'draw'|'loss', moves: number }} entry
     * @returns {number} delta Elo
     */
    recordGame(entry) {
      const scoreMap  = { win: 1, draw: 0.5, loss: 0 };
      const eloBefore = _state.elo;
      const delta     = this.updateElo(scoreMap[entry.result], entry.opponentElo);

      _state.historiqueParties.push({
        opponentName: entry.opponentName || '?',
        opponentElo:  entry.opponentElo  || 0,
        result:       entry.result,
        moves:        entry.moves        || 0,
        eloBefore,
        eloAfter:     _state.elo,
        delta,
        date:         new Date().toISOString(),
      });

      _save();
      return delta;
    },

    // ── MODIFICATIONS D'ÉTAT ──────────────────────────────────────

    /**
     * Modifie le solde. Montant positif = gain, négatif = dépense.
     * @param {number} amount
     */
    updateSolde(amount) {
      _state.solde = Math.max(0, _state.solde + amount);
      _save();
    },

    /**
     * Synchronise focusCurrent / focusMax depuis FocusSystem.
     * À appeler après chaque partie.
     */
    syncFocus() {
      _state.focusCurrent = FocusSystem.current;
      _state.focusMax     = FocusSystem.max;
      _save();
    },

    /**
     * Modifie la confiance du joueur. Plafonné entre 0 et 100.
     * Utilisable depuis la console ou les événements narratifs (Phase 6).
     * @param {number} value - nouvelle valeur de confiance
     */
    setConfiance(value) {
      _state.confiance = Math.max(0, Math.min(100, value));
      _save();
    },

    /** Incrémente le compteur de semaines. */
    nextWeek() {
      _state.semaine++;
      _save();
    },

  };

})();
