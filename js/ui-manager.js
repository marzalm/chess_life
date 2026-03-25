// ui-manager.js
// Rendu DOM et gestion des interactions utilisateur.
// Communique avec ChessEngine, FocusSystem et CareerManager via leurs API publiques.

const UIManager = {

  // ── ÉTAT INTERNE ─────────────────────────────────────────────

  selectedSquare:   null,
  legalMoves:       [],
  lastMove:         null,
  pendingPromotion: null,

  // ── ÉTAT IA ────────────────────────────────────────────────
  _aiThinking:    false,
  _opponentName:  null,
  _opponentElo:   null,

  // ── ÉTAT STOCKFISH VISUEL ──────────────────────────────────
  sfArrow:          null,    // N3 : { from, to } de la flèche

  // ── ÉTAT FLOW REWARDS ────────────────────────────────────────
  flowThreats:        [],    // Flow I : [{from, to}] flèches rouges menaces
  flowHighlights:     [],    // Flow II/III : cases des pièces surbrillance
  flowCorrectSquare:  null,  // case source du meilleur coup (pour vérifier le choix)
  _flowRewardsLoading: false,

  // ── ÉVALUATION DES COUPS ────────────────────────────────────
  _moveEvals:        {},     // { ply: evalInfo } — évaluation de chaque coup joueur
  _moveEvalSquares:  {},     // { ply: square } — case destination pour le texte flottant

  PIECES: {
    wK: 'assets/pieces/wK.png', wQ: 'assets/pieces/wQ.png',
    wR: 'assets/pieces/wR.png', wB: 'assets/pieces/wB.png',
    wN: 'assets/pieces/wN.png', wP: 'assets/pieces/wP.png',
    bK: 'assets/pieces/bK.png', bQ: 'assets/pieces/bQ.png',
    bR: 'assets/pieces/bR.png', bB: 'assets/pieces/bB.png',
    bN: 'assets/pieces/bN.png', bP: 'assets/pieces/bP.png',
  },

  // Unicode fallback pour promotion modal et pièces capturées
  PIECES_UNICODE: {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  },

  _OPPONENT_NAMES: [
    'Viktor Antonov', 'Svetlana Karpova', 'Rajesh Anand',
    'Magnus Lindström', 'Isabella Ferrari', 'Chen Wei',
    'Alexandre Dubois', 'Yuki Tanaka', 'David Fischer',
    'Olga Petrova', 'Hans Müller', 'Carmen López',
    'Nikolai Sokolov', 'Priya Sharma', 'Thomas Eriksen',
    'Fatima Al-Rashid', 'Luca Moretti', 'Anya Volkova',
    'James Morrison', 'Sofia Papadopoulos', 'Boris Ivanov',
    'Mei Lin Zhang', 'André Philidor', 'Eva Steinitz',
    'Sergei Botvinnik', 'Amara Diallo', 'Kim Hyun-woo',
    'Maria Capablanca', 'Emil Lasker', 'Aisha Patel',
  ],

  // ── INITIALISATION ───────────────────────────────────────────

  init() {
    this._bindButtons();
    this.renderBoard();
    FocusSystem.render();

    // Callback pour recevoir les évaluations de coups du FocusSystem
    FocusSystem.setMoveEvalCallback((evalInfo) => this._onMoveEvaluated(evalInfo));

    if (!CareerManager.hasCharacter()) {
      this._openCharacterCreation();
    } else {
      this.showScreen('dashboard');
    }
  },

  // ── GESTION DES ÉCRANS ───────────────────────────────────────

  showScreen(name) {
    document.getElementById('screen-dashboard').classList.toggle('hidden', name !== 'dashboard');
    document.getElementById('screen-game').classList.toggle('hidden', name !== 'game');

    if (name === 'dashboard') {
      this.renderDashboard();
    }
  },

  // ── DASHBOARD ────────────────────────────────────────────────

  renderDashboard() {
    const stats = CareerManager.getPublicStats();

    document.getElementById('dash-player-name').textContent = stats.nom;
    document.getElementById('dash-player-meta').textContent =
      `${stats.nationalite} · ${stats.styleDeJeu} · Semaine ${stats.semaine}`;
    document.getElementById('dash-elo').textContent       = stats.elo;
    document.getElementById('dash-solde').textContent     = stats.solde + ' €';
    document.getElementById('dash-focus-max').textContent = stats.focusMax + ' %';

    const parties = stats.historiqueParties;
    document.getElementById('dash-games-count').textContent = parties.length;

    if (parties.length > 0) {
      const wins   = parties.filter(p => p.result === 'win').length;
      const draws  = parties.filter(p => p.result === 'draw').length;
      const losses = parties.length - wins - draws;
      document.getElementById('dash-record').textContent =
        `${wins}V · ${draws}N · ${losses}D`;
    } else {
      document.getElementById('dash-record').textContent = 'Aucune partie jouée';
    }

    this._setSkillBar('ouvertures', stats.ouvertures);
    this._setSkillBar('endgame',    stats.endgame);
    this._renderRecentHistory(parties);
    this._updateMaiaUI(MaiaEngine.getStatus(), MaiaEngine.getProgress());
  },

  _setSkillBar(key, value) {
    const bar = document.getElementById('skill-' + key);
    const val = document.getElementById('skill-' + key + '-val');
    if (bar) bar.value = value;
    if (val) val.textContent = value;
  },

  _renderRecentHistory(parties) {
    const list = document.getElementById('dash-history-list');
    list.innerHTML = '';

    const recent = [...parties].reverse().slice(0, 5);

    if (recent.length === 0) {
      list.innerHTML = '<p class="history-empty">Aucune partie jouée pour l\'instant.</p>';
      return;
    }

    const resultLabel = { win: 'Victoire', draw: 'Nulle', loss: 'Défaite' };
    const resultClass = { win: 'h-result-win', draw: 'h-result-draw', loss: 'h-result-loss' };

    recent.forEach(p => {
      const row = document.createElement('div');
      row.className = 'history-entry';

      const deltaSign  = p.delta >= 0 ? '+' : '';
      const deltaClass = p.delta >= 0 ? 'h-delta-pos' : 'h-delta-neg';

      row.innerHTML = `
        <span class="h-opponent">${p.opponentName} (${p.opponentElo})</span>
        <span class="${resultClass[p.result]}">${resultLabel[p.result]}</span>
        <span class="${deltaClass}">${deltaSign}${p.delta} Elo</span>
      `;
      list.appendChild(row);
    });
  },

  // ── CRÉATION DU PERSONNAGE ────────────────────────────────────

  _openCharacterCreation() {
    document.getElementById('modal-create-player').showModal();
  },

  // ── RENDU DE L'ÉCHIQUIER ─────────────────────────────────────

  renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    const isFlipped = ChessEngine.getPlayerColor() === 'b';
    const files = isFlipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
    const ranks = isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

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

        if (square === this.selectedSquare)                                    el.classList.add('selected');
        if (this.lastMove?.from === square || this.lastMove?.to === square)    el.classList.add('last-move');
        if (legalTargets.includes(square) && !captureTargets.includes(square)) el.classList.add('legal-move');
        if (captureTargets.includes(square))                                   el.classList.add('legal-capture');
        if (inCheck && square === kingSquare)                                  el.classList.add('in-check');
        if (this.flowHighlights.includes(square))                             el.classList.add('flow-highlight');

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

        if (piece) {
          const p = document.createElement('img');
          p.className = 'piece';
          p.src       = this.PIECES[piece.color + piece.type.toUpperCase()];
          p.alt       = piece.color + piece.type.toUpperCase();
          p.draggable = false;
          el.appendChild(p);
        }

        el.addEventListener('click', () => this.onSquareClick(square));
        board.appendChild(el);
      });
    });

    // Flèche SVG N3
    this._renderArrow();

    // Flèches rouges de menaces (Flow I+)
    this._renderThreatArrows();

    // Pièces capturées
    this._renderCapturedPieces();
  },

  // ── SURBRILLANCES ────────────────────────────────────────────

  highlightSquares(squares) {
    squares.forEach(sq => {
      const el = document.querySelector(`[data-square="${sq}"]`);
      if (el) el.classList.add('legal-move');
    });
  },

  clearHighlights() {
    document.querySelectorAll('.square').forEach(el => {
      el.classList.remove('legal-move', 'legal-capture', 'selected');
    });
  },

  // ── STATUT ET HISTORIQUE ─────────────────────────────────────

  showStatus(msg) {
    const el = document.getElementById('game-status');
    if (el) el.textContent = msg;
  },

  updateMoveHistory() {
    const history     = ChessEngine.getHistory();
    const list        = document.getElementById('moves-list');
    const playerColor = ChessEngine.getPlayerColor();
    list.innerHTML = '';

    // Annotations chess-standard pour chaque classification
    const EVAL_SYMBOLS = {
      best:        { sym: '!!', cls: 'eval-best' },
      excellent:   { sym: '!',  cls: 'eval-excellent' },
      good:        { sym: '',   cls: 'eval-good' },
      neutral:     { sym: '',   cls: '' },
      imprecision: { sym: '?!', cls: 'eval-imprecis' },
      blunder:     { sym: '??', cls: 'eval-blunder' },
    };

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

      // Annotation d'évaluation pour les coups du joueur
      // history[i] = ply i+1 (blancs), history[i+1] = ply i+2 (noirs)
      if (playerColor === 'w') {
        this._appendEvalAnnotation(white, i + 1);
      }
      if (playerColor === 'b' && history[i + 1]) {
        this._appendEvalAnnotation(black, i + 2);
      }

      row.appendChild(num);
      row.appendChild(white);
      row.appendChild(black);
      list.appendChild(row);
    }

    list.scrollTop = list.scrollHeight;
  },

  /**
   * Ajoute un badge d'annotation (!! ! ?! ??) après le texte d'un coup dans l'historique.
   */
  _appendEvalAnnotation(moveSpan, ply) {
    const evalInfo = this._moveEvals[ply];
    if (!evalInfo || evalInfo.key === 'neutral' || evalInfo.key === 'good') return;

    const SYMBOLS = {
      best:        '!!',
      excellent:   '!',
      imprecision: '?',
      blunder:     '?!',
      book:        '📖',
    };
    const sym = SYMBOLS[evalInfo.key];
    if (!sym) return;

    const badge = document.createElement('span');
    badge.className   = 'move-eval ' + evalInfo.cls;
    badge.textContent = sym;
    moveSpan.appendChild(badge);
  },

  // ── GESTION DES CLICS ────────────────────────────────────────

  onSquareClick(square) {
    if (ChessEngine.isGameOver()) return;
    if (this._aiThinking) return;
    if (ChessEngine.getTurn() !== ChessEngine.getPlayerColor()) return;

    const piece = ChessEngine.getPiece(square);
    const turn  = ChessEngine.getTurn();

    // ── Clic sur une de ses propres pièces → sélection ──
    if (piece && piece.color === turn) {
      this.selectedSquare = square;
      this.legalMoves     = ChessEngine.getLegalMoves(square);
      // Lancer l'évaluation anticipée pendant que le joueur choisit sa case
      ChessEngine.prefetchEval();
      this.renderBoard();
      return;
    }

    // ── Clic sur une case destination ──
    if (this.selectedSquare) {
      const move = this.legalMoves.find(m => m.to === square);
      if (move) {
        this._executeMove(move);
      } else {
        this.selectedSquare = null;
        this.legalMoves     = [];
        this.renderBoard();
      }
    }
  },

  // ── PROMOTION ────────────────────────────────────────────────

  openPromotionModal(color) {
    const modal   = document.getElementById('promotion-modal');
    const choices = document.getElementById('promotion-choices');

    const pieceKeys = color === 'w'
      ? ['wQ', 'wR', 'wB', 'wN']
      : ['bQ', 'bR', 'bB', 'bN'];
    const types = ['q', 'r', 'b', 'n'];

    choices.innerHTML = '';
    pieceKeys.forEach((key, i) => {
      const el   = document.createElement('div');
      el.className = 'promo-piece';
      const img  = document.createElement('img');
      img.src    = this.PIECES[key];
      img.alt    = key;
      img.draggable = false;
      el.appendChild(img);
      el.onclick = () => {
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

  newGame(playerColor = 'w') {
    ChessEngine.reset();
    ChessEngine.setPlayerColor(playerColor);

    this.selectedSquare   = null;
    this.legalMoves       = [];
    this.lastMove         = null;
    this.pendingPromotion = null;
    this._aiThinking      = false;
    this._clearStockfishVisuals();
    this._moveEvals       = {};
    this._moveEvalSquares = {};

    FocusSystem.resetForGame();

    // Générer l'adversaire IA
    this._generateOpponent();

    const stats = CareerManager.getPublicStats();
    document.getElementById('player-elo').textContent   = stats.elo;
    document.getElementById('opponent-name').textContent = this._opponentName;
    document.getElementById('opponent-elo').textContent  = this._opponentElo;
    document.getElementById('moves-list').innerHTML = '';
    document.getElementById('sf-feedback').textContent =
      'Active Stockfish pour analyser la position.';
    document.getElementById('flow-status').textContent = '';
    document.getElementById('flow-status').className   = 'flow-status';

    this.renderBoard();

    // Si le joueur est noir, l'IA joue le premier coup
    if (playerColor === 'b') {
      this.showStatus('L\'adversaire commence…');
      this._triggerAIMove();
    } else {
      this.showStatus('À toi de jouer.');
    }
  },

  // ── FONCTIONS PRIVÉES ────────────────────────────────────────

  _executeMove(move) {
    if (move.flags.includes('p')) {
      this.pendingPromotion = move;
      this.openPromotionModal(move.color);
    } else {
      this._applyMove(move.from, move.to);
    }
  },

  /**
   * Applique un coup via ChessEngine.makeMove (synchrone).
   * L'évaluation Focus se fait en arrière-plan sans bloquer l'UI.
   * Si c'est le tour de l'IA après ce coup, déclenche _triggerAIMove().
   */
  _applyMove(from, to, promo = 'q') {
    const move = ChessEngine.makeMove(from, to, promo);
    if (!move) return;

    // Son de déplacement (ou capture)
    if (typeof SoundManager !== 'undefined') {
      if (move.captured) SoundManager.playCapture();
      else               SoundManager.playMove();
    }

    // Tracer la case destination pour le texte flottant d'évaluation
    const ply = ChessEngine.getHistory().length;
    this._moveEvalSquares[ply] = to;

    this.lastMove       = { from, to };
    this.selectedSquare = null;
    this.legalMoves     = [];
    this._clearStockfishVisuals();

    this.renderBoard();
    this.updateMoveHistory();

    if (this._checkGameEnd()) return;

    // Tour de l'IA
    if (ChessEngine.getTurn() !== ChessEngine.getPlayerColor()) {
      this._triggerAIMove();
    } else {
      this.showStatus('À toi de jouer.');
    }
  },

  /**
   * Vérifie si la partie est terminée. Si oui, enregistre le résultat,
   * met à jour le Focus et lance la revue post-partie.
   * @returns {boolean} true si la partie est terminée
   */
  _checkGameEnd() {
    if (!ChessEngine.isGameOver()) return false;

    const result      = ChessEngine.getGameResult();
    const playerColor = ChessEngine.getPlayerColor();
    let msg       = '';
    let won       = false;
    let resultKey = 'draw';

    if (result === 'checkmate') {
      const loserColor = ChessEngine.getTurn();
      won       = loserColor !== playerColor;
      resultKey = won ? 'win' : 'loss';
      const winner = loserColor === 'w' ? 'Noirs' : 'Blancs';
      msg = `Échec et mat — ${winner} gagnent !`;
    } else if (result === 'stalemate') {
      msg = 'Pat — partie nulle.';
    } else if (result === 'draw') {
      msg = 'Partie nulle.';
    }

    // Son de fin de partie
    if (typeof SoundManager !== 'undefined') {
      if (won)              SoundManager.playVictory();
      else if (!won && resultKey === 'loss') SoundManager.playDefeat();
    }

    FocusSystem.onGameEnd(won);
    CareerManager.syncFocus();

    // Enregistrer la partie dans le palmarès
    if (this._opponentName) {
      CareerManager.recordGame({
        opponentName: this._opponentName,
        opponentElo:  this._opponentElo,
        result:       resultKey,
        moves:        ChessEngine.getHistory().length,
      });
    }

    this.showStatus(msg);

    // Lancer la revue post-partie automatiquement
    const history = ChessEngine.getHistory();
    if (history.length >= 4) {
      ReviewManager.startReview(history);
    }

    return true;
  },

  // ── STOCKFISH VISUEL ─────────────────────────────────────────

  /**
   * Convertit une case algébrique en coordonnées pixel (centre) sur le SVG 576×576.
   */
  _squareToXY(sq) {
    const files = 'abcdefgh';
    let col = files.indexOf(sq[0]);
    let row = 8 - parseInt(sq[1], 10);
    if (ChessEngine.getPlayerColor() === 'b') {
      col = 7 - col;
      row = 7 - row;
    }
    return { x: col * 72 + 36, y: row * 72 + 36 };
  },

  /** Dessine ou efface la flèche N3 (sprite pixel art) sur le plateau. */
  _renderArrow() {
    // Nettoyer les flèches existantes
    const old = document.getElementById('sf-arrow-img');
    if (old) old.remove();

    if (!this.sfArrow) return;

    const container = document.getElementById('board-container');
    if (!container) return;

    const from = this._squareToXY(this.sfArrow.from);
    const to   = this._squareToXY(this.sfArrow.to);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI); // 0° = droite

    // Centrer l'image au milieu du segment from→to
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;

    const img = document.createElement('img');
    img.id          = 'sf-arrow-img';
    img.src         = 'assets/ui/arrow-best-move.png';
    img.draggable   = false;
    img.className   = 'sf-arrow-sprite';

    // Étirer la largeur sur toute la distance, hauteur fixe 40px
    const h = 40;
    img.style.width    = dist + 'px';
    img.style.height   = h + 'px';
    img.style.left     = (cx - dist / 2) + 'px';
    img.style.top      = (cy - h / 2) + 'px';
    img.style.transform = `rotate(${angle}deg)`;

    container.appendChild(img);
  },

  /** Dessine les flèches rouges de menaces (Flow I+). */
  _renderThreatArrows() {
    // Nettoyer les anciennes flèches
    document.querySelectorAll('.threat-arrow-img').forEach(el => el.remove());

    if (this.flowThreats.length === 0) return;

    const container = document.getElementById('board-container');
    if (!container) return;

    this.flowThreats.forEach((threat, i) => {
      const from = this._squareToXY(threat.from);
      const to   = this._squareToXY(threat.to);

      const dx    = to.x - from.x;
      const dy    = to.y - from.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const cx    = (from.x + to.x) / 2;
      const cy    = (from.y + to.y) / 2;

      const el = document.createElement('div');
      el.className = 'threat-arrow-img';
      const h = 24;
      el.style.width     = dist + 'px';
      el.style.height    = h + 'px';
      el.style.left      = (cx - dist / 2) + 'px';
      el.style.top       = (cy - h / 2) + 'px';
      el.style.transform = `rotate(${angle}deg)`;

      container.appendChild(el);
    });
  },

  /** Affiche les pièces capturées de chaque côté avec la différence matérielle. */
  _renderCapturedPieces() {
    const capWhiteEl = document.getElementById('captured-white');
    const capBlackEl = document.getElementById('captured-black');
    if (!capWhiteEl || !capBlackEl) return;

    const { byWhite, byBlack, diff } = ChessEngine.getCapturedPieces();
    const playerColor = ChessEngine.getPlayerColor();

    // Le joueur est toujours en bas. "captured-white" est en bas, "captured-black" en haut.
    // En bas : pièces que le joueur a capturées
    // En haut : pièces que l'adversaire a capturées
    const playerCaptures   = playerColor === 'w' ? byWhite : byBlack;
    const opponentCaptures = playerColor === 'w' ? byBlack : byWhite;
    const playerDiff       = playerColor === 'w' ? diff : -diff;

    capWhiteEl.innerHTML = '';
    capBlackEl.innerHTML = '';

    // Rendu des mini-pièces capturées (en bas = joueur, en haut = adversaire)
    this._fillCapturedRow(capWhiteEl, playerCaptures, playerDiff > 0 ? playerDiff : 0);
    this._fillCapturedRow(capBlackEl, opponentCaptures, playerDiff < 0 ? -playerDiff : 0);
  },

  _fillCapturedRow(container, pieces, advantage) {
    pieces.forEach(key => {
      const img = document.createElement('img');
      img.src       = this.PIECES[key];
      img.alt       = key;
      img.draggable = false;
      img.className = 'captured-piece-img';
      container.appendChild(img);
    });
    if (advantage > 0) {
      const span = document.createElement('span');
      span.className   = 'captured-advantage';
      span.textContent = '+' + advantage;
      container.appendChild(span);
    }
  },

  // ── FLOW REWARDS (surbrillances) ────────────────────────────

  /**
   * Sélectionne les pièces à mettre en surbrillance selon le palier Flow.
   * Flow II : 3 pièces (1 correcte + 1 leurre crédible + 1 piège attractif)
   * Flow III/MAX : 2 pièces (1 correcte + 1 leurre/piège)
   */
  async _computeFlowHighlights(palier) {
    const pvLines = await ChessEngine.getMultiPV(8);
    if (pvLines.length === 0) { this.flowHighlights = []; return; }

    const bestMove = pvLines[0];
    const bestFrom = bestMove.move.substring(0, 2);
    this.flowCorrectSquare = bestFrom;

    // Grouper les coups par pièce source
    const byPiece = {};
    for (const pv of pvLines) {
      const from = pv.move.substring(0, 2);
      if (!byPiece[from]) byPiece[from] = [];
      byPiece[from].push(pv);
    }

    // Candidats leurres crédibles : pièces différentes du meilleur coup,
    // dont le meilleur coup est dans les 120cp du top
    const credible = [];
    for (const [sq, moves] of Object.entries(byPiece)) {
      if (sq === bestFrom) continue;
      const bestCp = moves[0].cp;
      const delta  = bestMove.cp - bestCp;
      if (delta <= 120 && delta >= 0) {
        credible.push({ square: sq, delta });
      }
    }
    credible.sort((a, b) => a.delta - b.delta);

    // Candidats pièges : pièces avec un coup qui SEMBLE bon (capture ou échec)
    // mais dont l'éval est > 100cp pire que le meilleur coup
    const traps = [];
    const fen  = ChessEngine.getFEN();
    const allMoves = ChessEngine.getLegalMoves();

    for (const m of allMoves) {
      if (m.from === bestFrom) continue;
      const isCapture = m.flags.includes('c') || m.flags.includes('e');
      const isCheck   = m.san.includes('+');
      if (!isCapture && !isCheck) continue;

      // Vérifier si ce coup est dans les PV (si oui, c'est crédible, pas un piège)
      const inPV = pvLines.some(pv => pv.move === m.from + m.to);
      if (inPV) continue;

      // Ce coup agressif n'est PAS dans les top 8 → probablement mauvais
      if (!traps.find(t => t.square === m.from)) {
        traps.push({
          square:    m.from,
          isCapture: isCapture,
          isCheck:   isCheck,
          piece:     m.piece,
        });
      }
    }

    // Elo-based trap probability
    const elo = typeof CareerManager !== 'undefined' && CareerManager.hasCharacter()
      ? CareerManager.getPlayer().elo : 800;
    const trapChance = elo < 1200 ? 0.6 : elo < 1600 ? 0.5 : 0.35;

    // Sélection finale
    const numPieces = palier >= 3 ? 2 : 3;
    const highlights = [bestFrom];

    if (numPieces === 3) {
      // Flow II : 1 correct + 1 crédible + 1 piège (ou 2 crédibles si pas de piège)
      const useTraps = traps.length > 0 && Math.random() < trapChance;

      if (useTraps) {
        // 1 crédible + 1 piège
        if (credible.length > 0) highlights.push(credible[0].square);
        highlights.push(traps[Math.floor(Math.random() * traps.length)].square);
      } else {
        // 2 crédibles
        for (let i = 0; i < 2 && i < credible.length; i++) {
          highlights.push(credible[i].square);
        }
      }

      // Compléter si pas assez de candidats
      if (highlights.length < 3) {
        for (const t of traps) {
          if (highlights.length >= 3) break;
          if (!highlights.includes(t.square)) highlights.push(t.square);
        }
      }
      if (highlights.length < 3) {
        for (const m of allMoves) {
          if (highlights.length >= 3) break;
          if (!highlights.includes(m.from) && m.from !== bestFrom) highlights.push(m.from);
        }
      }
    } else {
      // Flow III : 1 correct + 1 leurre/piège
      const useTraps = traps.length > 0 && Math.random() < trapChance;
      if (useTraps) {
        highlights.push(traps[Math.floor(Math.random() * traps.length)].square);
      } else if (credible.length > 0) {
        highlights.push(credible[0].square);
      } else if (traps.length > 0) {
        highlights.push(traps[0].square);
      } else {
        // Fallback : n'importe quelle autre pièce
        for (const m of allMoves) {
          if (!highlights.includes(m.from)) { highlights.push(m.from); break; }
        }
      }
    }

    // Mélanger pour que la bonne pièce ne soit pas toujours en premier
    for (let i = highlights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [highlights[i], highlights[j]] = [highlights[j], highlights[i]];
    }

    this.flowHighlights = highlights;
  },

  /** Efface tous les visuels Stockfish et Flow rewards. */
  _clearStockfishVisuals() {
    this.sfArrow          = null;
    this.flowThreats      = [];
    this.flowHighlights   = [];
    this.flowCorrectSquare = null;
  },

  // ── ÉVALUATION DES COUPS (callback FocusSystem) ─────────────

  /**
   * Appelé par FocusSystem après chaque évaluation de coup du joueur.
   * Met à jour l'historique et affiche le texte flottant sur l'échiquier.
   */
  _onMoveEvaluated(evalInfo) {
    if (!evalInfo || !evalInfo.ply) return;
    this._moveEvals[evalInfo.ply] = evalInfo;
    this.updateMoveHistory();

    // Texte flottant sur la case destination
    const square = this._moveEvalSquares[evalInfo.ply];
    if (square && evalInfo.key !== 'neutral') {
      this._showFloatingEval(square, evalInfo);
    }
  },

  /**
   * Affiche un texte flottant animé (monte + disparaît) sur la case indiquée.
   */
  _showFloatingEval(square, evalInfo) {
    const el = document.querySelector(`[data-square="${square}"]`);
    if (!el) return;

    const float = document.createElement('span');
    float.className   = 'floating-eval ' + evalInfo.cls;
    float.textContent = evalInfo.label;
    el.appendChild(float);

    // Supprimer après l'animation (1.5s)
    setTimeout(() => float.remove(), 1600);
  },

  // ── MAIA UI (barre de progression dashboard) ────────────────

  _updateMaiaUI(status, progress) {
    const btn  = document.getElementById('dash-btn-play');
    const wrap = document.getElementById('maia-loading-bar');
    const bar  = document.getElementById('maia-loading-progress');
    const text = document.getElementById('maia-loading-text');
    if (!btn) return;

    if (status === 'ready') {
      btn.disabled = false;
      btn.textContent = '♟ Jouer une partie';
      if (wrap) wrap.classList.add('hidden');
    } else if (status === 'downloading') {
      btn.disabled = true;
      btn.textContent = 'Chargement de l\'IA…';
      if (wrap) wrap.classList.remove('hidden');
      if (bar)  bar.value = progress;
      if (text) text.textContent = `Chargement de l'IA… ${progress}%`;
    } else if (status === 'loading') {
      btn.disabled = true;
      btn.textContent = 'Chargement de l\'IA…';
      if (wrap) wrap.classList.remove('hidden');
    } else if (status === 'error') {
      btn.disabled = true;
      btn.textContent = 'Erreur IA';
      if (text) text.textContent = 'Erreur de chargement. Rechargez la page.';
      if (wrap) wrap.classList.remove('hidden');
      if (bar)  bar.classList.add('hidden');
    }
  },

  // ── ADVERSAIRE IA ───────────────────────────────────────────

  /**
   * Génère un adversaire avec nom et Elo proches du joueur (±200).
   */
  _generateOpponent() {
    const stats     = CareerManager.getPublicStats();
    const playerElo = stats.elo;
    const delta     = Math.floor(Math.random() * 401) - 200; // -200 à +200
    this._opponentElo  = Math.max(400, playerElo + delta);
    this._opponentName = this._OPPONENT_NAMES[
      Math.floor(Math.random() * this._OPPONENT_NAMES.length)
    ];
  },

  /**
   * Déclenche le coup de l'IA après le coup du joueur.
   * Désactive le plateau, attend un délai naturel, appelle Maia, joue le coup.
   */
  async _triggerAIMove() {
    this._aiThinking = true;
    this.showStatus('L\'adversaire réfléchit…');

    try {
      const fen       = ChessEngine.getFEN();
      const playerElo = CareerManager.getPublicStats().elo;

      // 1. Obtenir le coup de l'IA
      let move = null;
      const plyCount = ChessEngine.getHistory().length;
      if (plyCount < 12) {
        const bookMove = await MaiaEngine.getOpeningMove(fen, this._opponentElo);
        if (bookMove) move = bookMove;
      }
      if (!move) {
        const result = await MaiaEngine.getMove(fen, this._opponentElo, playerElo);
        move = result.move;
      }

      if (ChessEngine.isGameOver() || ChessEngine.getFEN() !== fen) {
        this._aiThinking = false;
        return;
      }

      const from  = move.substring(0, 2);
      const to    = move.substring(2, 4);
      const promo = move.length > 4 ? move[4] : 'q';

      // 2. Appliquer le coup silencieusement (pas de render encore)
      const moveResult = ChessEngine.makeMove(from, to, promo);
      if (!moveResult) {
        console.error('[AI] Coup illégal de Maia:', move);
        this._aiThinking = false;
        return;
      }

      // 3. Délai "réflexion" en parallèle de : attente éval Focus + Flow rewards
      const minDelay = new Promise(r => setTimeout(r, 800 + Math.random() * 700));

      // Attendre que l'éval Focus du coup précédent termine
      // avant de toucher au worker Stockfish (multiPV, etc.)
      const flowRewardsPromise = (async () => {
        await ChessEngine.waitForBgEval();
        const flowInfo = FocusSystem.getFlowStateInfo();
        // Menaces (synchrone, rapide)
        if (flowInfo.palier >= 1) {
          this.flowThreats = ChessEngine.getThreats();
        }
        // Surbrillances multiPV (async, utilise le worker)
        if (flowInfo.palier >= 2) {
          await this._computeFlowHighlights(flowInfo.palier);
        }
      })();

      await Promise.all([minDelay, flowRewardsPromise]);

      // 4. Son + rendu (tout d'un coup, après le "temps de réflexion")
      if (typeof SoundManager !== 'undefined') {
        if (moveResult.captured) SoundManager.playCapture();
        else                     SoundManager.playMove();
      }

      this.lastMove = { from, to };
      this.renderBoard();
      this.updateMoveHistory();
      this._aiThinking = false;

      if (this._checkGameEnd()) return;
      this.showStatus('À toi de jouer.');
    } catch (e) {
      console.error('[AI] Erreur:', e);
      this._aiThinking = false;
      this.showStatus('Erreur IA — relance une partie.');
    }
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
    // Création du personnage
    document.getElementById('btn-create-player').onclick = () => {
      const nom         = document.getElementById('input-nom').value.trim();
      const nationalite = document.getElementById('input-nationalite').value.trim();
      const style       = document.getElementById('input-style').value;

      if (!nom) {
        document.getElementById('input-nom').focus();
        return;
      }

      CareerManager.createPlayer(nom, nationalite || '—', style);
      document.getElementById('modal-create-player').close();
      this.showScreen('dashboard');
    };

    // Dashboard — ouvrir le choix de couleur
    document.getElementById('dash-btn-play').onclick = () => {
      if (!MaiaEngine.isReady()) return;
      document.getElementById('modal-color-choice').showModal();
    };

    // Choix de couleur → lancer la partie
    const startWithColor = (color) => {
      document.getElementById('modal-color-choice').close();
      this.showScreen('game');
      this.newGame(color);
    };
    document.getElementById('pick-white').onclick  = () => startWithColor('w');
    document.getElementById('pick-black').onclick  = () => startWithColor('b');
    document.getElementById('pick-random').onclick = () => startWithColor(Math.random() < 0.5 ? 'w' : 'b');

    document.getElementById('dash-btn-delete').onclick = () => {
      if (confirm('Effacer la sauvegarde ? Cette action est irréversible.')) {
        SaveManager.deleteSave();
        location.reload();
      }
    };

    // Écran jeu
    document.getElementById('btn-back-dashboard').onclick = () => {
      CareerManager.syncFocus();
      this.showScreen('dashboard');
    };

    document.getElementById('btn-new-game').onclick = () => this.newGame();

    // N3 — Meilleur coup : flèche source → destination
    document.getElementById('btn-sf3').onclick = async () => {
      // Bloquer pendant le tour de l'IA
      if (this._aiThinking) return;

      // En Flow III+ : N3 gratuit (pas de coût Focus, mais pénalité max + sort du Flow)
      const flowInfo = FocusSystem.getFlowStateInfo();
      const isFreeN3 = flowInfo.palier >= 3;

      if (isFreeN3) {
        // N3 gratuit en Flow III+ : applique seulement la pénalité max et sort du Flow
        FocusSystem.activateStockfish(3);
      } else {
        if (!FocusSystem.activateStockfish(3)) return;
      }
      document.getElementById('sf-feedback').textContent = 'N3 — Analyse en cours…';

      // Attendre que l'éval Focus termine pour ne pas corrompre le worker
      await ChessEngine.waitForBgEval();
      const best = await ChessEngine.getBestMove();
      if (best) {
        this.sfArrow = { from: best.from, to: best.to };
        document.getElementById('sf-feedback').textContent =
          'N3 actif — la flèche montre le meilleur coup.';
        this.renderBoard();
      } else {
        document.getElementById('sf-feedback').textContent = 'N3 — Aucun coup trouvé.';
      }
    };

    // Reprise de coup
    document.getElementById('btn-takeback').onclick = () => {
      // Ne pas permettre pendant le tour de l'IA
      if (this._aiThinking) return;
      if (ChessEngine.getHistory().length === 0) return;
      if (!FocusSystem.activateTakeback()) return;

      // Annuler le(s) coup(s) dans le moteur
      if (!ChessEngine.takeback()) return;

      // Rafraîchir l'UI
      this.lastMove       = null;
      this.selectedSquare = null;
      this.legalMoves     = [];
      this._clearStockfishVisuals();
      this.renderBoard();
      this.updateMoveHistory();
      this.showStatus('Coup repris — à toi de jouer.');
    };

    // Revue post-partie — fermeture
    document.getElementById('btn-close-review').onclick = () => {
      ReviewManager.stopReview();
      CareerManager.syncFocus();
      this.showScreen('dashboard');
    };

  },

};

// ── LANCEMENT ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  ChessEngine.init();
  MaiaEngine.setStatusCallback((status, progress) => {
    UIManager._updateMaiaUI(status, progress);
  });
  MaiaEngine.init();   // async — tourne en arrière-plan
  CareerManager.init();
  UIManager.init();

  // ── Musique de fond (ON par défaut) ──
  const bgMusic = document.getElementById('bg-music');
  const btnMusic = document.getElementById('btn-music');
  if (bgMusic && btnMusic) {
    bgMusic.volume = 0.15;
    let musicWanted = true;   // l'utilisateur veut la musique

    // Les navigateurs bloquent autoplay avant toute interaction.
    // On tente play() immédiatement ; si ça échoue, on relance au
    // premier clic n'importe où sur la page.
    function startMusic() {
      if (!musicWanted) return;
      bgMusic.play().then(() => {
        btnMusic.textContent = '♫ ON';
        btnMusic.classList.add('music-on');
      }).catch(() => {});
    }
    startMusic();
    document.addEventListener('click', function autoStart() {
      startMusic();
      document.removeEventListener('click', autoStart);
    }, { once: true });

    btnMusic.addEventListener('click', (e) => {
      e.stopPropagation();           // ne pas re-trigger autoStart
      if (!bgMusic.paused) {
        bgMusic.pause();
        musicWanted = false;
        btnMusic.textContent = '♫ OFF';
        btnMusic.classList.remove('music-on');
      } else {
        musicWanted = true;
        bgMusic.play().then(() => {
          btnMusic.textContent = '♫ ON';
          btnMusic.classList.add('music-on');
        }).catch(() => {});
      }
    });
  }

  // ── Toggle SFX ──
  const btnSfx = document.getElementById('btn-sfx');
  if (btnSfx) {
    btnSfx.addEventListener('click', () => {
      const on = !SoundManager.isEnabled();
      SoundManager.setEnabled(on);
      btnSfx.textContent = on ? 'SFX ON' : 'SFX OFF';
      btnSfx.classList.toggle('music-on', on);
    });
  }
});
