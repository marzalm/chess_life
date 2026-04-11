// game-events.js
//
// Minimal synchronous pub/sub bus for cross-domain notifications.
//
// Event naming convention:
//   <domain>_<verb_past_tense>
//
// Source of truth for event names and payloads:
//   TOURNAMENT_FINISHED = 'tournament_finished' // { tournamentId, tournamentName, city, country, startDate, rounds, rank, of, score, prize, eloBefore, eloAfter, date }
//   ROUND_PLAYED        = 'round_played'        // { tournamentId, round, opponent, result, score, source }
//   GAME_ENDED          = 'game_ended'          // { result: 'win'|'draw'|'loss', mode: 'free'|'tournament', opponentId?, opponentElo? }
//   ELO_CHANGED         = 'elo_changed'         // { before, after, delta, source, opponentElo? }
//   MAIL_RECEIVED       = 'mail_received'       // { mailId, templateId, vars, date, tag }
//   BONUS_INVOKED       = 'bonus_invoked'       // { source: 'training'|'flow', theme?, coachId? }
//   BONUS_RESOLVED      = 'bonus_resolved'      // { source, theme, success, movesGranted, coachId?, puzzleId }
//
// DISCIPLINE: event handlers MUST NOT emit a new event during their own
// execution. Cascading synchronous emits on the same tick lead to
// reentrancy bugs that are hard to debug. If follow-up work must emit, do
// it in queueMicrotask(...) or setTimeout(..., 0).

const GameEvents = (() => {

  const EVENTS = {
    TOURNAMENT_FINISHED: 'tournament_finished',
    ROUND_PLAYED:        'round_played',
    GAME_ENDED:          'game_ended',
    ELO_CHANGED:         'elo_changed',
    MAIL_RECEIVED:       'mail_received',
    BONUS_INVOKED:       'bonus_invoked',
    BONUS_RESOLVED:      'bonus_resolved',
  };

  /** @type {Map<string, Set<Function>>} */
  const _listeners = new Map();

  function _getBucket(eventName, createIfMissing = false) {
    let bucket = _listeners.get(eventName);
    if (!bucket && createIfMissing) {
      bucket = new Set();
      _listeners.set(eventName, bucket);
    }
    return bucket || null;
  }

  return {
    EVENTS,

    on(eventName, handler) {
      if (typeof handler !== 'function') {
        throw new Error('[GameEvents] handler must be a function');
      }
      const bucket = _getBucket(eventName, true);
      bucket.add(handler);
      return () => this.off(eventName, handler);
    },

    off(eventName, handler) {
      const bucket = _getBucket(eventName, false);
      if (!bucket) return;
      bucket.delete(handler);
      if (bucket.size === 0) {
        _listeners.delete(eventName);
      }
    },

    emit(eventName, payload) {
      const bucket = _getBucket(eventName, false);
      if (!bucket || bucket.size === 0) return;

      for (const handler of bucket) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[GameEvents] Handler failed for '${eventName}':`, err);
        }
      }
    },

    clear(eventName) {
      if (eventName === undefined) {
        _listeners.clear();
        return;
      }
      _listeners.delete(eventName);
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.events = GameEvents;
}
