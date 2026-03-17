// chess-engine.js
// Source de vérité de l'état de la partie.
// Boîte noire pure : aucun accès au DOM, aucun appel à d'autres modules.
// Toute communication vers l'extérieur passe par les fonctions publiques ci-dessous.

const ChessEngine = (() => {
  let _game = null;

  return {

    // ── API PUBLIQUE ──────────────────────────────────────────────

    /** Initialise une nouvelle instance chess.js. */
    init() {
      _game = new Chess();
    },

    /** Remet la partie à zéro (position initiale). */
    reset() {
      _game = new Chess();
    },

    /**
     * Tente de jouer un coup.
     * @param {string} from   - case d'origine  (ex: 'e2')
     * @param {string} to     - case de destination (ex: 'e4')
     * @param {string} promo  - pièce de promotion : 'q'|'r'|'b'|'n' (défaut: 'q')
     * @returns {object|null} - objet move de chess.js, ou null si coup illégal
     */
    makeMove(from, to, promo = 'q') {
      return _game.move({ from, to, promotion: promo });
    },

    /**
     * Retourne les coups légaux pour une case donnée.
     * @param {string} square - ex: 'e2'. Si omis, retourne tous les coups légaux.
     * @returns {object[]}    - tableau de move objects verbose
     */
    getLegalMoves(square) {
      if (square) return _game.moves({ square, verbose: true });
      return _game.moves({ verbose: true });
    },

    /** @returns {string} FEN de la position courante */
    getFEN() {
      return _game.fen();
    },

    /** @returns {string[]} historique SAN (ex: ['e4', 'e5', 'Nf3', ...]) */
    getHistory() {
      return _game.history();
    },

    /** @returns {boolean} true si la partie est terminée */
    isGameOver() {
      return _game.game_over();
    },

    // ── FONCTIONS AUXILIAIRES (utilisées par ui-manager) ─────────

    /** @returns {'w'|'b'} couleur du joueur dont c'est le tour */
    getTurn() {
      return _game.turn();
    },

    /** @returns {boolean} true si le joueur au trait est en échec */
    isInCheck() {
      return _game.in_check();
    },

    /**
     * Résultat de fin de partie.
     * @returns {string|null} 'checkmate'|'stalemate'|'draw'|null si partie en cours
     */
    getGameResult() {
      if (!_game.game_over()) return null;
      if (_game.in_checkmate()) return 'checkmate';
      if (_game.in_stalemate()) return 'stalemate';
      if (_game.in_draw())      return 'draw';
      return 'unknown';
    },

    /**
     * Pièce sur une case.
     * @param {string} square - ex: 'e1'
     * @returns {{type: string, color: string}|null}
     */
    getPiece(square) {
      return _game.get(square);
    },

    /**
     * Tableau 8×8 de la position courante (tel que retourné par chess.js).
     * @returns {Array}
     */
    getBoard() {
      return _game.board();
    },

  };
})();
