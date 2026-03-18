// chess-engine.js
// Source de vérité de l'état de la partie.
// Phase 3a : Stockfish Web Worker pour évaluation en centipawns.
// Le Worker est instancié UNE SEULE FOIS dans init() et réutilisé.
// Les coups sont SYNCHRONES — l'évaluation Focus tourne en arrière-plan.

const ChessEngine = (() => {
  let _game        = null;
  let _worker      = null;
  let _ready       = false;
  let _evalResolve = null;

  // Évaluation anticipée (prefetch au premier clic)
  let _prefetchPromise = null;
  let _prefetchFen     = null;

  // Empêche le prefetch d'annuler un cpAfter en cours
  let _bgEvalRunning = false;
  let _playerColor   = 'w';   // couleur du joueur humain ('w' ou 'b')
  let _usedStockfishThisTurn = false;

  // Cache du meilleur coup (Bug 3 — N3 instantané)
  let _cachedBestMove    = null;   // { from, to, cp } ou null
  let _cachedBestMoveFen = null;   // FEN correspondant au cache
  let _bestMovePromise   = null;   // Promise en cours ou null

  const FOCUS_DEPTH  = 10;
  const MANUAL_DEPTH = 14;

  // ── STOCKFISH WEB WORKER (instance unique) ──────────────────

  function _initWorker() {
    _worker = new Worker('lib/stockfish.js');
    _worker.onmessage = _onWorkerMessage;
    _worker.postMessage('uci');
  }

  function _onWorkerMessage(e) {
    const msg = e.data;
    if (typeof msg !== 'string') return;

    if (msg === 'uciok')  { _worker.postMessage('isready'); return; }
    if (msg === 'readyok') { _ready = true; return; }
    if (!_evalResolve) return;

    if (msg.includes('score cp')) {
      const m = msg.match(/score cp (-?\d+)/);
      if (m) _evalResolve._lastCp = parseInt(m[1], 10);
    }
    if (msg.includes('score mate')) {
      const m = msg.match(/score mate (-?\d+)/);
      if (m) _evalResolve._lastCp = parseInt(m[1], 10) > 0 ? 10000 : -10000;
    }
    if (msg.startsWith('bestmove')) {
      const cp      = _evalResolve._lastCp !== undefined ? _evalResolve._lastCp : 0;
      const bm      = msg.match(/bestmove\s+(\S+)/);
      if (bm) _evalResolve._bestMove = bm[1];
      const resolve = _evalResolve;
      _evalResolve  = null;
      resolve(cp);
    }
  }

  function _evaluate(fen, depth) {
    return new Promise((resolve) => {
      if (!_worker || !_ready) { resolve(0); return; }

      // Annuler une éventuelle évaluation en cours
      if (_evalResolve) {
        _worker.postMessage('stop');
        const prev = _evalResolve;
        _evalResolve = null;
        prev(0);
      }

      resolve._lastCp   = undefined;
      resolve._bestMove = null;
      _evalResolve = resolve;
      _worker.postMessage('position fen ' + fen);
      _worker.postMessage('go depth ' + depth);
    });
  }

  /**
   * Évalue une position et retourne { cp, bestMove }.
   * bestMove est en notation UCI (ex: "e2e4").
   */
  function _evaluateWithMove(fen, depth) {
    return new Promise((resolve) => {
      if (!_worker || !_ready) { resolve({ cp: 0, bestMove: null }); return; }

      if (_evalResolve) {
        _worker.postMessage('stop');
        const prev = _evalResolve;
        _evalResolve = null;
        prev(0);
      }

      const wrapper = (cp) => {
        resolve({ cp, bestMove: wrapper._bestMove || null });
      };
      wrapper._lastCp   = undefined;
      wrapper._bestMove = null;
      _evalResolve = wrapper;
      _worker.postMessage('position fen ' + fen);
      _worker.postMessage('go depth ' + depth);
    });
  }

  // ── ÉVALUATION FOCUS EN ARRIÈRE-PLAN ────────────────────────

  /**
   * Fire-and-forget : récupère cpBefore du prefetch, calcule cpAfter,
   * puis appelle FocusSystem.evaluateMoveDelta().
   * Le joueur n'attend jamais cette fonction.
   */
  async function _runFocusEval(fenAfter, sfUsedFlag, capturedPiece) {
    _bgEvalRunning = true;

    // Récupérer cpBefore depuis le prefetch (peut encore être en cours)
    let cpBefore = 0;
    if (_prefetchPromise) {
      cpBefore = await _prefetchPromise;
    }
    _prefetchPromise = null;
    _prefetchFen     = null;

    // Calculer cpAfter
    const cpAfter = await _evaluate(fenAfter, FOCUS_DEPTH);

    const deltaCp = cpBefore + cpAfter;
    console.log(`[Engine] cpBefore=${cpBefore}  cpAfter=${cpAfter}(adv)  delta=${deltaCp}`);

    FocusSystem.evaluateMoveDelta(deltaCp, sfUsedFlag, capturedPiece || null);

    _bgEvalRunning = false;

    // Bug 3 : lancer le calcul anticipé du meilleur coup pour le N3
    _launchBestMovePrefetch();
  }

  // ── CACHE DU MEILLEUR COUP (N3 instantané) ────────────────────

  /**
   * Lance le calcul du meilleur coup en arrière-plan.
   * Ne se lance que si aucune autre évaluation n'est en cours.
   */
  function _launchBestMovePrefetch() {
    const fen = _game.fen();
    // Déjà en cache ou en cours pour cette position
    if (_cachedBestMoveFen === fen && (_cachedBestMove || _bestMovePromise)) return;

    _cachedBestMoveFen = fen;
    _cachedBestMove    = null;

    _bestMovePromise = _evaluateWithMove(fen, MANUAL_DEPTH).then(({ cp, bestMove }) => {
      _bestMovePromise = null;
      // Position a changé pendant le calcul → résultat périmé
      if (_cachedBestMoveFen !== fen) return null;
      if (!bestMove || bestMove.length < 4) return null;

      _cachedBestMove = {
        from: bestMove.substring(0, 2),
        to:   bestMove.substring(2, 4),
        cp,
      };
      console.log(`[Engine] Best move cached: ${_cachedBestMove.from}→${_cachedBestMove.to}`);
      return _cachedBestMove;
    });
  }

  return {

    // ── INITIALISATION ────────────────────────────────────────────

    init() {
      _game = new Chess();
      _initWorker();
    },

    reset() {
      _game = new Chess();
      _prefetchPromise        = null;
      _prefetchFen            = null;
      _bgEvalRunning          = false;
      _usedStockfishThisTurn  = false;
      _cachedBestMove         = null;
      _cachedBestMoveFen      = null;
      _bestMovePromise        = null;
      if (_worker) {
        _worker.postMessage('stop');
        _worker.postMessage('ucinewgame');
        _worker.postMessage('isready');
      }
    },

    /** @param {'w'|'b'} color */
    setPlayerColor(color) { _playerColor = color; },
    /** @returns {'w'|'b'} */
    getPlayerColor()      { return _playerColor; },

    /** Marque que Stockfish a été utilisé ce tour. */
    setUsedStockfish()    { _usedStockfishThisTurn = true; },
    /** @returns {boolean} */
    wasStockfishUsed()    { return _usedStockfishThisTurn; },

    // ── ÉVALUATION ANTICIPÉE ──────────────────────────────────────

    /**
     * Lance l'évaluation de la position courante en arrière-plan.
     * Appelé au moment où le joueur sélectionne une pièce (premier clic).
     * No-op si une évaluation cpAfter est en cours.
     */
    prefetchEval() {
      if (_bgEvalRunning) return;
      const fen = _game.fen();
      if (_prefetchFen === fen && _prefetchPromise) return;
      _prefetchFen     = fen;
      _prefetchPromise = _evaluate(fen, FOCUS_DEPTH);
    },

    // ── JOUER UN COUP (SYNCHRONE) ─────────────────────────────────

    /**
     * Joue un coup immédiatement. L'évaluation Focus est lancée en
     * arrière-plan et ne bloque jamais l'UI.
     *
     * @param {string} from
     * @param {string} to
     * @param {string} promo
     * @returns {object|null} objet move de chess.js, ou null si illégal
     */
    makeMove(from, to, promo = 'q') {
      const colorBefore = _game.turn();
      // Bug 2 fix : capturer le flag AVANT de le remettre à false
      const sfFlag = _usedStockfishThisTurn;
      const move = _game.move({ from, to, promotion: promo });
      if (!move) return null;

      // Invalider le cache du meilleur coup
      _cachedBestMove    = null;
      _cachedBestMoveFen = null;
      _bestMovePromise   = null;

      // Réinitialiser le flag Stockfish
      _usedStockfishThisTurn = false;

      // Évaluer le Focus uniquement pour les coups du joueur humain
      if (colorBefore === _playerColor) {
        _runFocusEval(_game.fen(), sfFlag, move.captured || null);
      } else {
        // Coup adverse — lancer le prefetch du meilleur coup directement
        _launchBestMovePrefetch();
      }

      return move;
    },

    /**
     * Évalue une position à depth 14 — pour les boutons Stockfish manuels.
     * @param {string} fen
     * @returns {Promise<number>}
     */
    evaluatePosition(fen) {
      return _evaluate(fen, MANUAL_DEPTH);
    },

    /**
     * Retourne le meilleur coup Stockfish pour la position courante.
     * Utilise le cache si disponible (Bug 3 — N3 instantané).
     * @returns {Promise<{from: string, to: string, cp: number}|null>}
     */
    async getBestMove() {
      const fen = _game.fen();

      // Cache hit
      if (_cachedBestMoveFen === fen && _cachedBestMove) {
        return _cachedBestMove;
      }

      // Calcul en cours pour cette position — attendre
      if (_cachedBestMoveFen === fen && _bestMovePromise) {
        return await _bestMovePromise;
      }

      // Aucun cache — lancer le calcul (fallback)
      _launchBestMovePrefetch();
      return await _bestMovePromise;
    },

    /**
     * Évalue la qualité d'un coup spécifique (pour N1 badge).
     * Compare le meilleur coup Stockfish avec le coup proposé via delta cp.
     * Utilise deux évaluations séquentielles (avant puis après le coup).
     * @param {string} from
     * @param {string} to
     * @returns {Promise<number>} delta centipawns (0 = meilleur coup)
     */
    async evaluateMoveQuality(from, to) {
      // Jouer le coup temporairement pour obtenir le FEN résultant
      const move = _game.move({ from, to, promotion: 'q' });
      if (!move) return 999;
      const fenAfter = _game.fen();
      _game.undo();

      // Évaluer la position après le coup (du point de vue adverse)
      const cpAfter = await _evaluate(fenAfter, FOCUS_DEPTH);

      // Évaluer la position avant le coup (du point de vue du joueur)
      const cpBefore = await _evaluate(_game.fen(), FOCUS_DEPTH);

      // delta = cpBefore + cpAfter (perte du joueur, 0 = parfait)
      return cpBefore + cpAfter;
    },

    // ── ÉVALUATION POUR LA REVUE POST-PARTIE ──────────────────────

    /**
     * Évalue une position et retourne { cp, bestMove }.
     * Utilisé par ReviewManager pour analyser chaque position.
     * @param {string} fen
     * @returns {Promise<{ cp: number, bestMove: string|null }>}
     */
    evaluateForReview(fen) {
      return _evaluateWithMove(fen, MANUAL_DEPTH);
    },

    // ── FONCTIONS DE LECTURE ──────────────────────────────────────

    getLegalMoves(square) {
      if (square) return _game.moves({ square, verbose: true });
      return _game.moves({ verbose: true });
    },

    getFEN()        { return _game.fen(); },
    getHistory()    { return _game.history(); },
    isGameOver()    { return _game.game_over(); },
    getTurn()       { return _game.turn(); },
    isInCheck()     { return _game.in_check(); },

    getGameResult() {
      if (!_game.game_over()) return null;
      if (_game.in_checkmate()) return 'checkmate';
      if (_game.in_stalemate()) return 'stalemate';
      if (_game.in_draw())      return 'draw';
      return 'unknown';
    },

    getPiece(square) { return _game.get(square); },
    getBoard()       { return _game.board(); },

  };
})();
