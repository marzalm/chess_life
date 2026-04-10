// career-manager.js
// Player entity, FIDE Elo formula, career persistence.
// Pure black box — no DOM access.
// All Focus calculations go exclusively through FocusSystem.
//
// Phase A: flat schema. Phase B will restructure into nested domains
// (player / calendar / finances / ...).

const CareerManager = (() => {

  let _state = null;

  const DEFAULT_STATE = {
    playerName:   '',
    nationality:  '',
    elo:          800,
    focusMax:     100,
    focusCurrent: 100,
    money:        500,
    week:         1,
    gameHistory:  [],
  };

  function _save() {
    SaveManager.save(_state);
  }

  return {

    // ── INIT ──────────────────────────────────────────────────────

    init() {
      if (SaveManager.hasSave()) {
        _state = SaveManager.load();
        // Defensive migration: fill missing keys from defaults
        for (const [key, val] of Object.entries(DEFAULT_STATE)) {
          if (_state[key] === undefined) _state[key] = val;
        }
      } else {
        _state = { ...DEFAULT_STATE, gameHistory: [] };
      }
      FocusSystem.current = _state.focusCurrent;
      FocusSystem.max     = _state.focusMax;
      FocusSystem.render();
    },

    hasCharacter() {
      return Boolean(_state && _state.playerName);
    },

    // ── CHARACTER CREATION ────────────────────────────────────────

    /**
     * Create the player. Called once, at first launch.
     * @param {string} playerName
     * @param {string} nationality - ISO code or name
     */
    createPlayer(playerName, nationality) {
      _state = {
        ...DEFAULT_STATE,
        gameHistory: [],
        playerName:  playerName.trim(),
        nationality: nationality.trim(),
      };
      _save();
    },

    // ── PUBLIC STATS ──────────────────────────────────────────────

    getPublicStats() {
      return _state ? { ..._state } : null;
    },

    getPlayer() {
      return _state ? { ..._state } : null;
    },

    // ── FIDE ELO FORMULA ──────────────────────────────────────────

    /**
     * Compute and apply the Elo delta after a game.
     *
     *   E  = 1 / (1 + 10 ** ((opponentElo - playerElo) / 400))
     *   D  = K * (score - E)
     *   K  = 32 if elo < 2400, otherwise 16
     *
     * @param {number} score       - 1 win | 0.5 draw | 0 loss
     * @param {number} opponentElo
     * @returns {number} rounded delta
     */
    updateElo(score, opponentElo) {
      const E     = 1 / (1 + 10 ** ((opponentElo - _state.elo) / 400));
      const K     = _state.elo < 2400 ? 32 : 16;
      const delta = Math.round(K * (score - E));
      _state.elo  = Math.max(100, _state.elo + delta);
      console.log(`[Elo] E=${E.toFixed(4)}  score=${score}  K=${K}  delta=${delta}  newElo=${_state.elo}`);
      _save();
      return delta;
    },

    /**
     * Record a played game: apply Elo and archive the entry.
     * @param {{ opponentName: string, opponentElo: number,
     *           result: 'win'|'draw'|'loss', moves: number }} entry
     * @returns {number} Elo delta
     */
    recordGame(entry) {
      const scoreMap  = { win: 1, draw: 0.5, loss: 0 };
      const eloBefore = _state.elo;
      const delta     = this.updateElo(scoreMap[entry.result], entry.opponentElo);

      _state.gameHistory.push({
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

    // ── STATE MUTATIONS ───────────────────────────────────────────

    /**
     * Modify money. Positive = income, negative = expense.
     * @param {number} amount
     */
    updateMoney(amount) {
      _state.money = Math.max(0, _state.money + amount);
      _save();
    },

    /**
     * Sync focusCurrent / focusMax from FocusSystem.
     * Call after each game.
     */
    syncFocus() {
      _state.focusCurrent = FocusSystem.current;
      _state.focusMax     = FocusSystem.max;
      _save();
    },

    nextWeek() {
      _state.week++;
      _save();
    },

  };

})();
