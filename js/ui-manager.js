// ui-manager.js
// Rendu DOM et gestion des interactions utilisateur.
// Communique avec ChessEngine et FocusSystem uniquement via leurs API publiques.

const UIManager = {

  // ── ÉTAT INTERNE ─────────────────────────────────────────────

  selectedSquare:   null,
  legalMoves:       [],
  lastMove:         null,
  pendingPromotion: null,

  PIECES: {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  },

  // ── INITIALISATION ───────────────────────────────────────────

  init() {
    this._bindButtons();
    this.renderBoard();
    FocusSystem.render();
    this.showStatus('Lance une partie pour commencer.');
  },

  // ── RENDU DE L'ÉCHIQUIER ─────────────────────────────────────

  /**
   * Reconstruit entièrement le DOM de l'échiquier.
   * Lit l'état courant via ChessEngine — ne prend pas de FEN en paramètre
   * pour rester synchronisé avec la source de vérité.
   */
  renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    const files     = ['a','b','c','d','e','f','g','h'];
    const ranks     = [8, 7, 6, 5, 4, 3, 2, 1];

    const legalTargets   = this.legalMoves.map(m => m.to);
    const captureTargets = this.legalMoves
      .filter(m => m.flags.includes('c') || m.flags.includes('e'))
      .map(m => m.to);

    const inCheck    = ChessEngine.isInCheck();
    const kingSquare = inCheck ? this._findKing(ChessEngine.getTurn()) : null;

    ranks.forEach((rank, ri) => {
      files.forEach((file, fi) => {
        const square  = file + rank;
        const piece   = ChessEngine.getPiece(square);
        const isLight = (ri + fi) % 2 === 0;

        const el = document.createElement('div');
        el.className      = 'square ' + (isLight ? 'light' : 'dark');
        el.dataset.square = square;

        if (square === this.selectedSquare)                             el.classList.add('selected');
        if (this.lastMove?.from === square || this.lastMove?.to === square) el.classList.add('last-move');
        if (legalTargets.includes(square) && !captureTargets.includes(square)) el.classList.add('legal-move');
        if (captureTargets.includes(square))                            el.classList.add('legal-capture');
        if (inCheck && square === kingSquare)                           el.classList.add('in-check');

        // Coordonnées (rang à gauche, colonne en bas)
        if (fi === 0) {
          const r = document.createElement('span');
          r.className   = 'coord-rank';
          r.textContent = rank;
          el.appendChild(r);
        }
        if (ri === ranks.length - 1) {
          const f = document.createElement('span');
          f.className   = 'coord-file';
          f.textContent = file;
          el.appendChild(f);
        }

        // Pièce
        if (piece) {
          const p = document.createElement('div');
          p.className   = 'piece';
          p.textContent = this.PIECES[piece.color + piece.type.toUpperCase()];
          el.appendChild(p);
        }

        el.addEventListener('click', () => this.onSquareClick(square));
        board.appendChild(el);
      });
    });
  },

  // ── SURBRILLANCES ────────────────────────────────────────────

  /**
   * Ajoute la classe 'legal-move' à une liste de cases.
   * @param {string[]} squares - ex: ['e4', 'e5', 'd4']
   */
  highlightSquares(squares) {
    squares.forEach(sq => {
      const el = document.querySelector(`[data-square="${sq}"]`);
      if (el) el.classList.add('legal-move');
    });
  },

  /** Retire toutes les surbrillances de sélection/coup légal. */
  clearHighlights() {
    document.querySelectorAll('.square').forEach(el => {
      el.classList.remove('legal-move', 'legal-capture', 'selected');
    });
  },

  // ── STATUT ET HISTORIQUE ─────────────────────────────────────

  /**
   * Affiche un message dans la zone de statut.
   * @param {string} msg
   */
  showStatus(msg) {
    const el = document.getElementById('game-status');
    if (el) el.textContent = msg;
  },

  /** Reconstruit l'historique des coups dans le panneau droite. */
  updateMoveHistory() {
    const history = ChessEngine.getHistory();
    const list    = document.getElementById('moves-list');
    list.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const num = document.createElement('span');
      num.className   = 'move-num';
      num.textContent = (i / 2 + 1) + '.';

      const white = document.createElement('span');
      white.className   = 'move-white';
      white.textContent = history[i] || '';

      const black = document.createElement('span');
      black.className   = 'move-black';
      black.textContent = history[i + 1] || '';

      row.appendChild(num);
      row.appendChild(white);
      row.appendChild(black);
      list.appendChild(row);
    }

    list.scrollTop = list.scrollHeight;
  },

  // ── GESTION DES CLICS ────────────────────────────────────────

  onSquareClick(square) {
    if (ChessEngine.isGameOver()) return;

    const piece = ChessEngine.getPiece(square);
    const turn  = ChessEngine.getTurn();

    // Sélectionner une pièce du joueur au trait
    if (piece && piece.color === turn) {
      this.selectedSquare = square;
      this.legalMoves     = ChessEngine.getLegalMoves(square);
      this.renderBoard();
      return;
    }

    // Tenter un déplacement si une pièce est sélectionnée
    if (this.selectedSquare) {
      const move = this.legalMoves.find(m => m.to === square);
      if (move) {
        this._executeMove(move);
      } else {
        // Clic sur une case non-légale → désélectionner
        this.selectedSquare = null;
        this.legalMoves     = [];
        this.renderBoard();
      }
    }
  },

  // ── PROMOTION ────────────────────────────────────────────────

  /**
   * Ouvre le modal DaisyUI de promotion.
   * @param {'w'|'b'} color - couleur du pion en promotion
   */
  openPromotionModal(color) {
    const modal   = document.getElementById('promotion-modal');
    const choices = document.getElementById('promotion-choices');

    const pieces = color === 'w'
      ? ['♕', '♖', '♗', '♘']
      : ['♛', '♜', '♝', '♞'];
    const types = ['q', 'r', 'b', 'n'];

    choices.innerHTML = '';
    pieces.forEach((p, i) => {
      const el       = document.createElement('div');
      el.className   = 'promo-piece';
      el.textContent = p;
      el.onclick     = () => {
        modal.close();
        const pending         = this.pendingPromotion;
        this.pendingPromotion = null;
        this._applyMove(pending.from, pending.to, types[i]);
      };
      choices.appendChild(el);
    });

    modal.showModal();
  },

  // ── LOGIQUE DE JEU ───────────────────────────────────────────

  /** Lance une nouvelle partie. */
  newGame() {
    ChessEngine.reset();

    this.selectedSquare   = null;
    this.legalMoves       = [];
    this.lastMove         = null;
    this.pendingPromotion = null;

    FocusSystem.resetForGame();

    document.getElementById('moves-list').innerHTML = '';
    document.getElementById('sf-feedback').textContent =
      'Active Stockfish pour analyser la position.';

    this.renderBoard();
    this.showStatus('À Blancs de jouer.');
  },

  // ── FONCTIONS PRIVÉES ────────────────────────────────────────

  _executeMove(move) {
    if (move.flags.includes('p')) {
      // Promotion : ouvrir le modal avant d'appliquer
      this.pendingPromotion = move;
      this.openPromotionModal(move.color);
    } else {
      this._applyMove(move.from, move.to);
    }
  },

  _applyMove(from, to, promo = 'q') {
    const result = ChessEngine.makeMove(from, to, promo);
    if (!result) return;

    this.lastMove       = { from, to };
    this.selectedSquare = null;
    this.legalMoves     = [];

    FocusSystem.onGoodMove();

    this.renderBoard();
    this.updateMoveHistory();
    this._checkGameEnd();
  },

  _checkGameEnd() {
    if (!ChessEngine.isGameOver()) {
      const turn = ChessEngine.getTurn() === 'w' ? 'Blancs' : 'Noirs';
      this.showStatus(`À ${turn} de jouer.`);
      return;
    }

    const result = ChessEngine.getGameResult();
    let msg = '';

    if (result === 'checkmate') {
      const winner = ChessEngine.getTurn() === 'w' ? 'Noirs' : 'Blancs';
      msg = `Échec et mat — ${winner} gagnent !`;
    } else if (result === 'stalemate') {
      msg = 'Pat — partie nulle.';
    } else if (result === 'draw') {
      msg = 'Partie nulle.';
    }

    FocusSystem.onGameEnd(false);
    this.showStatus(msg);
  },

  _findKing(color) {
    const board = ChessEngine.getBoard();
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === color) {
          return cell.square;
        }
      }
    }
    return null;
  },

  _bindButtons() {
    document.getElementById('btn-new-game').onclick = () => this.newGame();

    [1, 2, 3].forEach(lvl => {
      const btn = document.getElementById('btn-sf' + lvl);
      if (!btn) return;
      btn.onclick = () => {
        const result = FocusSystem.activateStockfish(lvl);
        if (!result) return;
        const fb = document.getElementById('sf-feedback');
        fb.innerHTML =
          `<strong>Stockfish N${lvl}</strong> — ${result.msg}<br>` +
          `<small style="color:#777">${result.reliability}</small>`;
      };
    });
  },

};

// ── LANCEMENT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  ChessEngine.init();
  UIManager.init();
});
