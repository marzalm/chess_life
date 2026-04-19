// stockfish-opponent.js
//
// Phase G.2 — humanized Stockfish opponent.
//
// Uses the single existing Stockfish Worker (via ChessEngine.requestOpponentMove)
// to produce moves at a target Elo above Maia-2's ceiling (>2000).
//
// Humanization recipe:
//   1. Ask Stockfish for the top-N MultiPV moves at a tuned movetime.
//   2. Compute delta_i = best_eval - eval_i (from the side-to-move POV).
//   3. Sample a move with probability exp(-delta_i / T), where T is a
//      linear function of the target Elo (higher Elo → lower T → sharper).
//   4. Return the chosen UCI move.
//
// No bespoke engines per champion. Flavor lives in opening books and,
// later in Phase G.3, in tiny style offsets.

const StockfishOpponent = (() => {

  // Temperature anchor points (centipawns). Linear interpolation in
  // between, linear extrapolation outside. Tuning knob — expect to
  // revisit once playtests produce real error profiles.
  const T_AT_2000 = 60;
  const T_AT_2400 = 30;
  const T_AT_2800 = 15;

  // Movetime anchor points (ms). Same interpolation scheme.
  const MT_AT_2000 = 250;
  const MT_AT_2400 = 300;
  const MT_AT_2800 = 450;

  // MultiPV width. 10 is a good balance between humanlike breadth and
  // Worker runtime at short movetimes.
  const DEFAULT_MULTIPV = 10;

  function _lerp(x, x0, y0, x1, y1) {
    if (x1 === x0) return y0;
    const t = (x - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
  }

  /**
   * Temperature T (in centipawns) for a given target Elo.
   * Piecewise linear through 2000/2400/2800 anchors, extrapolated
   * linearly outside, clamped to a reasonable positive range.
   */
  function TEMPERATURE_AT(targetElo) {
    if (!Number.isFinite(targetElo)) return T_AT_2400;
    let T;
    if (targetElo <= 2400) {
      T = _lerp(targetElo, 2000, T_AT_2000, 2400, T_AT_2400);
    } else {
      T = _lerp(targetElo, 2400, T_AT_2400, 2800, T_AT_2800);
    }
    return Math.max(3, T);
  }

  /** Movetime in ms for a given target Elo. */
  function MOVETIME_AT(targetElo) {
    if (!Number.isFinite(targetElo)) return MT_AT_2400;
    let mt;
    if (targetElo <= 2400) {
      mt = _lerp(targetElo, 2000, MT_AT_2000, 2400, MT_AT_2400);
    } else {
      mt = _lerp(targetElo, 2400, MT_AT_2400, 2800, MT_AT_2800);
    }
    return Math.max(80, Math.round(mt));
  }

  /**
   * Softmax-sample a move from the MultiPV lines.
   * Probability of line i ∝ exp(-delta_i / T)
   * where delta_i = best_cp - cp_i (so best move has delta 0, weaker
   * moves have positive delta).
   *
   * @param {Array<{ move: string, cp: number }>} lines
   * @param {number} T                    temperature in cp
   * @param {() => number} [randFn]       injectable for tests
   * @returns {string|null}               UCI move or null on empty
   */
  function sampleMove(lines, T, randFn) {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    if (lines.length === 1) return lines[0].move;

    // The engine reports cp from the side-to-move perspective; the
    // "best" move is the one with the highest cp (most favorable).
    let bestCp = -Infinity;
    for (const l of lines) if (l.cp > bestCp) bestCp = l.cp;

    const safeT = Math.max(1, T);
    const weights = lines.map((l) => Math.exp(-(bestCp - l.cp) / safeT));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0 || !Number.isFinite(total)) return lines[0].move;

    const r = (randFn ? randFn() : Math.random()) * total;
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
      acc += weights[i];
      if (r <= acc) return lines[i].move;
    }
    return lines[lines.length - 1].move;
  }

  return {

    TEMPERATURE_AT,
    MOVETIME_AT,
    DEFAULT_MULTIPV,
    sampleMove,

    /**
     * Ask the shared Stockfish Worker for a humanized move at `targetElo`.
     *
     * @param {string} fen
     * @param {number} targetElo
     * @param {{ multipv?: number, movetimeMs?: number }} [opts]
     * @returns {Promise<{ move: string, lines: Array<{ move, cp }>, T: number, movetimeMs: number }>}
     *          `move` is the UCI move chosen by the humanizer. May
     *          equal the top move frequently when T is low.
     */
    async getMove(fen, targetElo, opts = {}) {
      if (typeof ChessEngine === 'undefined' || !ChessEngine.requestOpponentMove) {
        throw new Error('[StockfishOpponent] ChessEngine.requestOpponentMove unavailable');
      }
      const multipv    = Number.isFinite(opts.multipv) ? opts.multipv : DEFAULT_MULTIPV;
      const movetimeMs = Number.isFinite(opts.movetimeMs) ? opts.movetimeMs : MOVETIME_AT(targetElo);
      const T          = TEMPERATURE_AT(targetElo);

      const result = await ChessEngine.requestOpponentMove(fen, { movetimeMs, multipv });
      const lines = Array.isArray(result.lines) ? result.lines : [];

      let move;
      if (lines.length === 0) {
        move = result.bestMove || null;
      } else {
        move = sampleMove(lines, T);
      }

      return { move, lines, T, movetimeMs };
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.stockfishOpponent = StockfishOpponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StockfishOpponent;
}
