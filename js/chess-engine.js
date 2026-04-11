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

    // ── Mode multiPV ──
    if (_evalResolve._multiPV) {
      if (msg.includes('score') && msg.includes(' pv ')) {
        const pvMatch   = msg.match(/multipv (\d+)/);
        const cpMatch   = msg.match(/score cp (-?\d+)/);
        const mateMatch = msg.match(/score mate (-?\d+)/);
        const moveMatch = msg.match(/ pv (\S+)/);

        if (moveMatch) {
          const pvNum = pvMatch ? parseInt(pvMatch[1]) : 1;
          const cp    = cpMatch  ? parseInt(cpMatch[1])
                      : mateMatch ? (parseInt(mateMatch[1]) > 0 ? 10000 : -10000)
                      : 0;
          const move = moveMatch[1];

          // Garder la dernière profondeur pour chaque PV
          const existing = _evalResolve._pvLines.findIndex(p => p.pvNum === pvNum);
          if (existing >= 0) _evalResolve._pvLines[existing] = { pvNum, move, cp };
          else               _evalResolve._pvLines.push({ pvNum, move, cp });
        }
      }
      if (msg.startsWith('bestmove')) {
        const result = _evalResolve._pvLines
          .sort((a, b) => a.pvNum - b.pvNum)
          .map(p => ({ move: p.move, cp: p.cp }));
        const resolve = _evalResolve;
        _evalResolve = null;
        _worker.postMessage('setoption name MultiPV value 1');
        resolve(result);
      }
      return;
    }

    // ── Mode single PV (existant) ──
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

  /**
   * Évalue une position en mode multiPV.
   * @param {string} fen
   * @param {number} depth
   * @param {number} numPV — nombre de variantes
   * @returns {Promise<Array<{move: string, cp: number}>>}
   */
  function _evaluateMultiPV(fen, depth, numPV) {
    return new Promise((resolve) => {
      if (!_worker || !_ready) { resolve([]); return; }

      if (_evalResolve) {
        _worker.postMessage('stop');
        const prev = _evalResolve;
        _evalResolve = null;
        if (prev._multiPV) prev([]);
        else                prev(0);
      }

      resolve._multiPV = true;
      resolve._pvLines = [];
      _evalResolve = resolve;

      _worker.postMessage('setoption name MultiPV value ' + numPV);
      _worker.postMessage('position fen ' + fen);
      _worker.postMessage('go depth ' + depth);
    });
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
   * Fire-and-forget : évalue cpBefore et cpAfter de manière fiable,
   * puis appelle FocusSystem.evaluateMoveDelta().
   * Le joueur n'attend jamais cette fonction.
   *
   * @param {string} fenBefore — FEN AVANT le coup du joueur (pour cpBefore)
   * @param {string} fenAfter  — FEN APRÈS le coup du joueur (pour cpAfter)
   */
  async function _runFocusEval(fenBefore, fenAfter, sfUsedFlag, capturedPiece, plyIndex) {
    _bgEvalRunning = true;

    // cpBefore : utiliser le prefetch s'il correspond, sinon évaluer maintenant
    let cpBefore = 0;
    if (_prefetchPromise && _prefetchFen === fenBefore) {
      cpBefore = await _prefetchPromise;
    } else {
      // Pas de prefetch valide → évaluer la position avant le coup
      cpBefore = await _evaluate(fenBefore, FOCUS_DEPTH);
    }
    _prefetchPromise = null;
    _prefetchFen     = null;

    // Calculer cpAfter (du point de vue de l'adversaire)
    const cpAfter = await _evaluate(fenAfter, FOCUS_DEPTH);

    const deltaCp = cpBefore + cpAfter;
    console.log(`[Engine] cpBefore=${cpBefore}  cpAfter=${cpAfter}(adv)  delta=${deltaCp}`);

    // Vérifier si le coup a été joué dans une position de livre d'ouverture
    const isBookMove = typeof MaiaEngine !== 'undefined' && MaiaEngine.isBookPosition(fenBefore);

    // Compter les pièces sur l'échiquier (pour la pondération de complexité)
    let pieceCount = 0;
    const board = _game.board();
    for (const row of board) {
      for (const sq of row) {
        if (sq) pieceCount++;
      }
    }

    // Pass cpBefore so FocusSystem can dampen gains/losses in
    // positions that are already trivially decided (huge eval gap).
    FocusSystem.evaluateMoveDelta(
      deltaCp, sfUsedFlag, capturedPiece || null,
      plyIndex, isBookMove, pieceCount, cpBefore,
    );

    _bgEvalRunning = false;

    // Lancer le calcul anticipé du meilleur coup pour le N3
    _launchBestMovePrefetch();
  }

  // ── CACHE DU MEILLEUR COUP (N3 instantané) ────────────────────

  /**
   * Lance le calcul du meilleur coup en arrière-plan.
   * Ne se lance que si aucune autre évaluation n'est en cours.
   */
  function _launchBestMovePrefetch() {
    // Ne pas interrompre une évaluation Focus en cours
    if (_bgEvalRunning) return;

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
      const fenBefore = _game.fen(); // Capturer AVANT le coup pour cpBefore fiable

      const move = _game.move({ from, to, promotion: promo });
      if (!move) return null;

      // Invalider le cache du meilleur coup
      _cachedBestMove    = null;
      _cachedBestMoveFen = null;
      _bestMovePromise   = null;

      // Réinitialiser le flag Stockfish
      _usedStockfishThisTurn = false;

      // Évaluer le Focus uniquement pour les coups du joueur humain
      // Ne pas évaluer si le coup met fin à la partie (mat/pat) —
      // Stockfish retourne des scores de mat extrêmes qui faussent le delta.
      if (colorBefore === _playerColor && !_game.game_over()) {
        const plyIndex = _game.history().length;
        _runFocusEval(fenBefore, _game.fen(), sfFlag, move.captured || null, plyIndex);
      }
      // Note : pas de _launchBestMovePrefetch ici pour les coups IA.
      // Le prefetch sera lancé à la fin de _runFocusEval pour éviter
      // d'annuler l'évaluation Focus en cours sur le worker unique.

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

    // ── MULTIPV (FLOW II/III : surbrillance de pièces) ────────────

    /**
     * Retourne les N meilleurs coups pour la position courante.
     * Utilisé par le Flow State pour la surbrillance de pièces.
     * @param {number} numPV — nombre de variantes (ex: 6)
     * @returns {Promise<Array<{move: string, cp: number}>>}
     */
    getMultiPV(numPV) {
      return _evaluateMultiPV(_game.fen(), MANUAL_DEPTH, numPV);
    },

    // ── DÉTECTION DE MENACES (FLOW I) ──────────────────────────────

    /**
     * Retourne la liste des pièces du joueur attaquées par l'ennemi.
     * Utilise un FEN inversé pour simuler le tour de l'adversaire.
     * @returns {Array<{from: string, to: string, piece: string}>}
     */
    getThreats() {
      const fen   = _game.fen();
      const parts = fen.split(' ');

      // Inverser le trait pour donner la main à l'adversaire
      if (_game.turn() === _playerColor) {
        parts[1] = _playerColor === 'w' ? 'b' : 'w';
        parts[3] = '-'; // reset en passant pour éviter les positions illégales
      }

      let temp;
      try {
        temp = new Chess(parts.join(' '));
      } catch (e) { return []; }
      if (!temp) return [];

      // Tous les coups légaux de l'adversaire qui capturent une pièce du joueur
      // Plusieurs pièces peuvent attaquer la même case → on garde chaque flèche
      const moves   = temp.moves({ verbose: true });
      const threats = [];
      const seen    = new Set();

      for (const m of moves) {
        const key = m.from + m.to;
        if (m.captured && !seen.has(key)) {
          seen.add(key);
          threats.push({ from: m.from, to: m.to, piece: m.captured });
        }
      }

      // Trier par valeur de pièce menacée (les plus précieuses d'abord), max 5
      const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };
      threats.sort((a, b) => (VAL[b.piece] || 0) - (VAL[a.piece] || 0));
      return threats.slice(0, 5);
    },

    // ── REPRISE DE COUP (TAKEBACK) ────────────────────────────────

    /**
     * Annule le dernier coup du joueur (et la réponse IA s'il y en a une).
     * Remet la position au moment où c'était le tour du joueur.
     * @returns {boolean} true si la reprise a fonctionné
     */
    takeback() {
      if (_game.history().length === 0) return false;

      // Si c'est le tour du joueur → l'IA a déjà joué → undo 2 coups
      // Si c'est le tour de l'IA → le joueur vient de jouer → undo 1 coup
      if (_game.turn() === _playerColor) {
        // Tour du joueur : undo réponse IA + coup joueur
        const m1 = _game.undo(); // undo IA
        if (!m1) return false;
        const m2 = _game.undo(); // undo joueur
        if (!m2) { _game.move(m1); return false; } // rollback si échec
      } else {
        // Tour de l'IA (coup joueur en attente d'éval) : undo 1 coup joueur
        const m = _game.undo();
        if (!m) return false;
      }

      // Invalider tous les caches
      _cachedBestMove        = null;
      _cachedBestMoveFen     = null;
      _bestMovePromise       = null;
      _prefetchPromise       = null;
      _prefetchFen           = null;
      _usedStockfishThisTurn = false;

      return true;
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

    /**
     * Retourne une promesse qui se résout quand l'évaluation Focus
     * en arrière-plan est terminée. Permet de séquencer les accès
     * au worker Stockfish unique.
     */
    waitForBgEval() {
      if (!_bgEvalRunning) return Promise.resolve();
      return new Promise(resolve => {
        const check = () => {
          if (!_bgEvalRunning) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    },

    /**
     * Retourne les pièces capturées par chaque camp.
     * Compare la position actuelle aux 16 pièces de départ.
     * @returns {{ byWhite: string[], byBlack: string[], diff: number }}
     *   byWhite = pièces noires capturées par les blancs (triées par valeur)
     *   byBlack = pièces blanches capturées par les noirs
     *   diff = avantage matériel des blancs en points (positif = blancs devant)
     */
    getCapturedPieces() {
      const START = { w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
                      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 } };
      const VAL   = { p: 1, n: 3, b: 3, r: 5, q: 9 };
      const ORDER = ['q', 'r', 'b', 'n', 'p'];

      // Compter les pièces restantes sur l'échiquier
      const remaining = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
                          b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
      const board = _game.board();
      for (const row of board) {
        for (const cell of row) {
          if (cell) remaining[cell.color][cell.type]++;
        }
      }

      // Pièces capturées = départ − restantes
      const byWhite = []; // pièces noires prises
      const byBlack = []; // pièces blanches prises
      let whiteMat = 0, blackMat = 0;

      for (const t of ORDER) {
        const takenBlack = START.b[t] - remaining.b[t];
        for (let i = 0; i < takenBlack; i++) byWhite.push('b' + t.toUpperCase());
        whiteMat += (remaining.w[t] || 0) * (VAL[t] || 0);

        const takenWhite = START.w[t] - remaining.w[t];
        for (let i = 0; i < takenWhite; i++) byBlack.push('w' + t.toUpperCase());
        blackMat += (remaining.b[t] || 0) * (VAL[t] || 0);
      }

      return { byWhite, byBlack, diff: whiteMat - blackMat };
    },

  };
})();
