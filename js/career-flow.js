// career-flow.js
//
// Cross-cutting career flow state. Owns only the current mode and emits
// lifecycle notifications. Rendering remains in UI modules that subscribe
// to GameEvents.

const CareerFlow = (() => {

  let _mode = 'free'; // 'free' | 'tournament'
  let _initialized = false;
  let _unsubscribeTournamentFinished = null;

  function _applyMode(mode) {
    _mode = mode;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('in-tournament', mode === 'tournament');
    }
  }

  return {
    init() {
      if (_initialized) return;
      _initialized = true;
      _applyMode('free');

      _unsubscribeTournamentFinished = GameEvents.on(
        GameEvents.EVENTS.TOURNAMENT_FINISHED,
        () => this.exitTournamentMode(),
      );
    },

    getMode() {
      return _mode;
    },

    enterTournamentMode() {
      _applyMode('tournament');
    },

    exitTournamentMode() {
      _applyMode('free');
    },

    onGameEnd(result) {
      const mode = _mode;

      if (mode === 'tournament') {
        const scoreMap = { win: 1, draw: 0.5, loss: 0 };
        const score = scoreMap[result] !== undefined ? scoreMap[result] : 0.5;
        try {
          TournamentSystem.recordPlayerResult(score);
        } catch (e) {
          console.error('[Tournament] recordPlayerResult failed:', e);
        }
      }

      let opponentId = null;
      let opponentElo = null;
      if (typeof UIManager !== 'undefined') {
        opponentId = UIManager._opponentId || null;
        opponentElo = UIManager._opponentElo || null;
      }

      GameEvents.emit(GameEvents.EVENTS.GAME_ENDED, {
        result,
        mode,
        opponentId,
        opponentElo,
      });
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.flow = CareerFlow;
}
