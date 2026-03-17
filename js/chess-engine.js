const ChessEngine = {
  game: null,
  stockfish: null,
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  playerColor: 'w',
  opponentElo: 1200,
  opponentName: 'Adversaire',
  isThinking: false,
  pendingPromotion: null,

  PIECES: {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  },

  NAMES: [
    'Magnus', 'Fabiano', 'Hikaru', 'Anish', 'Wesley', 'Levon',
    'Maxime', 'Vishy', 'Boris', 'Alexei', 'Ivan', 'Dmitri',
    'Carlos', 'Leinier', 'Shakhriyar', 'Teimour', 'Peter', 'Jan',
  ],

  init() {
    this.game = new Chess();
    this.initStockfish();
    this.bindButtons();
    this.renderBoard();
    FocusSystem.render();
  },

  // ── STOCKFISH ──────────────────────────────────────────────────

  initStockfish() {
    this.stockfish = new Worker('lib/stockfish.js');
    this.stockfish.onmessage = (e) => this.handleStockfishMessage(e.data);
    this.stockfish.postMessage('uci');
    this.stockfish.postMessage('isready');
  },

  getStockfishConfig(elo) {
    const skill = Math.round(Math.min(20, Math.max(0, (elo - 500) / 100)));
    const depth = skill < 5  ? 2
                : skill < 10 ? 5
                : skill < 15 ? 10
                : skill < 18 ? 15
                : 20;
    return { skill, depth };
  },

  setOpponentLevel(elo) {
    const { skill, depth } = this.getStockfishConfig(elo);
    this.stockfish.postMessage('setoption name Skill Level value ' + skill);
    this.currentDepth = depth;
  },

  askStockfishMove() {
    if (this.isThinking) return;
    this.isThinking = true;
    this.setStatus('L\'adversaire réfléchit...');
    this.stockfish.postMessage('position fen ' + this.game.fen());
    this.stockfish.postMessage('go depth ' + this.currentDepth);
  },

  handleStockfishMessage(msg) {
    if (msg.startsWith('bestmove')) {
      const parts = msg.split(' ');
      const move  = parts[1];
      if (!move || move === '(none)') return;

      const from = move.slice(0, 2);
      const to   = move.slice(2, 4);
      const promo = move[4] || undefined;

      // Détecter si Stockfish capture une pièce (gaffe détectée)
      const target = this.game.get(to);

      const result = this.game.move({ from, to, promotion: promo || 'q' });
      if (!result) return;

      this.lastMove = { from, to };
      this.isThinking = false;

      // Évaluer si c'était une capture significative
      if (target && this.getPieceValue(target.type) >= 3) {
        // L'adversaire a pris une pièce — pas forcément une gaffe du joueur
      }

      this.renderBoard();
      this.updateMoveHistory();
      this.checkGameEnd();

      if (!this.game.game_over()) {
        this.setStatus('À ton tour.');
      }
    }
  },

  getPieceValue(type) {
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return values[type] || 0;
  },

  // ── PARTIE ────────────────────────────────────────────────────

  newGame() {
    const elos  = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];
    this.opponentElo  = elos[Math.floor(Math.random() * elos.length)];
    this.opponentName = this.NAMES[Math.floor(Math.random() * this.NAMES.length)];
    this.playerColor  = Math.random() > 0.5 ? 'w' : 'b';

    this.game            = new Chess();
    this.selectedSquare  = null;
    this.legalMoves      = [];
    this.lastMove        = null;
    this.isThinking      = false;
    this.pendingPromotion = null;

    this.setOpponentLevel(this.opponentElo);
    FocusSystem.resetForGame();

    document.getElementById('opponent-name').textContent = this.opponentName;
    document.getElementById('opponent-elo').textContent  = this.opponentElo;
    document.getElementById('moves-list').innerHTML      = '';
    document.getElementById('sf-feedback').textContent   =
      'Active Stockfish pour analyser la position.';

    this.renderBoard();

    if (this.playerColor === 'b') {
      this.setStatus('L\'adversaire joue en premier...');
      setTimeout(() => this.askStockfishMove(), 500);
    } else {
      this.setStatus('À ton tour. Tu joues les Blancs.');
    }
  },

  // ── INTERACTIONS ──────────────────────────────────────────────

  onSquareClick(square) {
    if (this.game.game_over()) return;
    if (this.isThinking) return;
    if (this.game.turn() !== this.playerColor) return;

    const piece = this.game.get(square);

    // Sélectionner une pièce du joueur
    if (piece && piece.color === this.playerColor) {
      this.selectedSquare = square;
      this.legalMoves     = this.game.moves({ square, verbose: true });
      this.renderBoard();
      return;
    }

    // Tenter un déplacement
    if (this.selectedSquare) {
      const move = this.legalMoves.find(m => m.to === square);
      if (move) {
        this.executePlayerMove(move);
      } else {
        this.selectedSquare = null;
        this.legalMoves     = [];
        this.renderBoard();
      }
    }
  },

  executePlayerMove(move) {
    // Promotion
    if (move.flags.includes('p')) {
      this.pendingPromotion = move;
      this.showPromotionModal(move.color);
      return;
    }
    this.applyPlayerMove(move.from, move.to);
  },

  applyPlayerMove(from, to, promotion = 'q') {
    const pieceBefore = this.game.get(to);
    const result      = this.game.move({ from, to, promotion });
    if (!result) return;

    this.lastMove       = { from, to };
    this.selectedSquare = null;
    this.legalMoves     = [];

    // Focus : évaluer la qualité du coup
    this.evaluateMoveForFocus(result, pieceBefore);

    this.renderBoard();
    this.updateMoveHistory();

    if (!this.game.game_over()) {
      setTimeout(() => this.askStockfishMove(), 300);
    } else {
      this.checkGameEnd();
    }
  },

  evaluateMoveForFocus(move, capturedPiece) {
    // Gaffe détectée : on a laissé une pièce en prise sans compensation
    // (Simplifié pour Phase 1 — s'affine plus tard)
    if (move.flags.includes('c') || move.flags.includes('e')) {
      // On a capturé quelque chose — bon signe
      FocusSystem.onGoodMove();
    } else {
      FocusSystem.onGoodMove();
    }
  },

  // ── PROMOTION ─────────────────────────────────────────────────

  showPromotionModal(color) {
    const modal   = document.getElementById('promotion-modal');
    const choices = document.getElementById('promotion-choices');
    const pieces  = color === 'w'
      ? ['♕', '♖', '♗', '♘']
      : ['♛', '♜', '♝', '♞'];
    const types = ['q', 'r', 'b', 'n'];

    choices.innerHTML = '';
    pieces.forEach((p, i) => {
      const el = document.createElement('div');
      el.className   = 'promo-piece';
      el.textContent = p;
      el.onclick     = () => {
        modal.classList.add('hidden');
        const m = this.pendingPromotion;
        this.pendingPromotion = null;
        this.applyPlayerMove(m.from, m.to, types[i]);
      };
      choices.appendChild(el);
    });

    modal.classList.remove('hidden');
  },

  // ── FIN DE PARTIE ─────────────────────────────────────────────

  checkGameEnd() {
    if (!this.game.game_over()) return;

    let msg = '';
    let won = false;

    if (this.game.in_checkmate()) {
      const winner = this.game.turn() === 'w' ? 'Noirs' : 'Blancs';
      won = (winner === 'Blancs' && this.playerColor === 'w') ||
            (winner === 'Noirs'  && this.playerColor === 'b');
      msg = won ? 'Tu as gagné par échec et mat !' : 'Échec et mat — tu as perdu.';
    } else if (this.game.in_draw()) {
      msg = 'Partie nulle.';
    } else if (this.game.in_stalemate()) {
      msg = 'Pat — partie nulle.';
    }

    FocusSystem.onGameEnd(won);
    this.setStatus(msg);
  },

  // ── RENDU ─────────────────────────────────────────────────────

  renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = this.playerColor === 'w'
      ? [8,7,6,5,4,3,2,1]
      : [1,2,3,4,5,6,7,8];
    const fileOrder = this.playerColor === 'w'
      ? files
      : [...files].reverse();

    const legalTargets  = this.legalMoves.map(m => m.to);
    const captureTargets = this.legalMoves
      .filter(m => m.flags.includes('c') || m.flags.includes('e'))
      .map(m => m.to);

    ranks.forEach((rank, ri) => {
      fileOrder.forEach((file, fi) => {
        const square = file + rank;
        const piece  = this.game.get(square);
        const isLight = (ri + fi) % 2 === 0;

        const el = document.createElement('div');
        el.className = 'square ' + (isLight ? 'light' : 'dark');
        el.dataset.square = square;

        if (square === this.selectedSquare)         el.classList.add('selected');
        if (this.lastMove?.from === square ||
            this.lastMove?.to   === square)          el.classList.add('last-move');
        if (legalTargets.includes(square) &&
            !captureTargets.includes(square))        el.classList.add('legal-move');
        if (captureTargets.includes(square))         el.classList.add('legal-capture');

        // Échec au roi
        if (this.game.in_check()) {
          const kingSquare = this.findKing(this.game.turn());
          if (square === kingSquare) el.classList.add('in-check');
        }

        // Coordonnées
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

  findKing(color) {
    const board = this.game.board();
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === color) {
          return cell.square;
        }
      }
    }
    return null;
  },

  // ── HISTORIQUE ────────────────────────────────────────────────

  updateMoveHistory() {
    const history = this.game.history();
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

  // ── UTILITAIRES ───────────────────────────────────────────────

  setStatus(msg) {
    document.getElementById('game-status').textContent = msg;
  },

  bindButtons() {
    document.getElementById('btn-new-game').onclick = () => this.newGame();

    [1, 2, 3].forEach(lvl => {
      document.getElementById('btn-sf' + lvl).onclick = () => {
        const result = FocusSystem.activateStockfish(lvl);
        if (!result) return;
        const fb = document.getElementById('sf-feedback');
        fb.innerHTML = `<strong>Stockfish N${lvl}</strong> — ${result.msg}<br>
          <small style="color:#777">${result.reliability}</small>`;
      };
    });
  },
};

// Lancement
window.addEventListener('DOMContentLoaded', () => {
  // Créer le modal de promotion s'il n'existe pas
  if (!document.getElementById('promotion-modal')) {
    const modal = document.createElement('div');
    modal.id        = 'promotion-modal';
    modal.className = 'hidden';
    modal.innerHTML = '<div id="promotion-choices"></div>';
    document.body.appendChild(modal);
  }
  ChessEngine.init();
});