// ui-manager.js
// DOM rendering and user interaction for the game screen.
// Communicates with ChessEngine, FocusSystem, CareerManager, MaiaEngine
// and ReviewManager through their public APIs only.
//
// Phase A: game screen only. Dashboard/world/club code has been removed.
// Phase B will add career screens via a separate ui-career.js module.

const UIManager = {

  // ── INTERNAL STATE ───────────────────────────────────────────

  selectedSquare:   null,
  legalMoves:       [],
  lastMove:         null,
  pendingPromotion: null,

  // AI state
  _aiThinking:        false,
  _opponentName:      null,
  _opponentElo:       null,
  _opponentTitle:     null,
  _opponentId:        null,
  _opponentNationality: null,
  _opponentChampion:  null,

  // Stockfish visuals
  sfArrow: null, // N3 arrow { from, to }

  // Flow rewards
  flowThreats:         [],
  flowHighlights:      [],
  flowCorrectSquare:   null,
  _flowRewardsLoading: false,
  _intuitionActive:    false,

  // Move evaluations (from FocusSystem callback)
  _moveEvals:       {},
  _moveEvalSquares: {},

  // Move navigation: null = live mode, otherwise integer ply we're
  // previewing (0 = before any move, history.length = live).
  _viewPly: null,
  _pieceSource: 'live',
  _puzzleMode: false,
  _playbackInputLocked: false,
  _gameActive: false,
  _gameConcluded: false,
  _aiLostStreakCount: 0,
  _aiDrawEqualStreak: 0,
  _aiLastDrawOfferPly: -Infinity,
  _playerLastDrawOfferPly: -Infinity,

  // Callback fired when a game ends. External code (career flow) can
  // subscribe by setting UIManager.onGameEnd = (result) => {...}.
  // result: 'win' | 'loss' | 'draw'
  onGameEnd: null,

  PIECES: {
    wK: 'assets/pieces/wK.png', wQ: 'assets/pieces/wQ.png',
    wR: 'assets/pieces/wR.png', wB: 'assets/pieces/wB.png',
    wN: 'assets/pieces/wN.png', wP: 'assets/pieces/wP.png',
    bK: 'assets/pieces/bK.png', bQ: 'assets/pieces/bQ.png',
    bR: 'assets/pieces/bR.png', bB: 'assets/pieces/bB.png',
    bN: 'assets/pieces/bN.png', bP: 'assets/pieces/bP.png',
  },

  PIECES_UNICODE: {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  },

  // ── INIT ─────────────────────────────────────────────────────

  /**
   * Bind UI buttons and register callbacks. Does NOT show any screen
   * nor start a game. The caller is responsible for that.
   */
  init() {
    this._bindButtons();
    this.renderBoard();
    FocusSystem.render();

    FocusSystem.setMoveEvalCallback((evalInfo) => this._onMoveEvaluated(evalInfo));
  },

  // ── PUBLIC GAME CONTROL ──────────────────────────────────────

  /**
   * Set the AI opponent for the next game.
   * @param {{ name: string, elo: number, title?: string | null, id?: string, nationality?: string, champion?: object | null }} opponent
   */
  setOpponent(opponent) {
    this._opponentName        = opponent.name;
    this._opponentElo         = opponent.elo;
    this._opponentTitle       = opponent.title || null;
    this._opponentId          = opponent.id || null;
    this._opponentNationality = opponent.nationality || null;
    this._opponentTier        = Number.isFinite(opponent.tier) ? opponent.tier : null;
    this._opponentChampion    = opponent.champion || null;
  },

  _formatName(name, title) {
    if (typeof CareerManager !== 'undefined' && CareerManager.formatName) {
      return CareerManager.formatName(name, title);
    }
    return (name || '').trim();
  },

  _formatTitledName(name, title) {
    if (typeof CareerManager !== 'undefined' && CareerManager.formatTitledName) {
      return CareerManager.formatTitledName(name, title);
    }
    const safeName = this._formatName(name, title);
    return title ? `${title} ${safeName}` : safeName;
  },

  _formatTitleBadgeHTML(title) {
    if (typeof CareerManager !== 'undefined' && CareerManager.formatTitleBadgeHTML) {
      return CareerManager.formatTitleBadgeHTML(title);
    }
    return title ? `<span class="title-badge title-${String(title).toLowerCase()}">${title}</span>` : '';
  },

  _escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  _formatNameHTML(name, title) {
    const badgeHTML = this._formatTitleBadgeHTML(title);
    const safeName = this._escapeHTML(this._formatName(name, title));
    if (!safeName) return badgeHTML || '';
    return badgeHTML ? `${badgeHTML} ${safeName}` : safeName;
  },

  _formatFlaggedNameHTML(name, title, nationality) {
    const flag = this._flagFor(nationality);
    const label = this._formatNameHTML(name, title);
    return flag ? `${flag} ${label}` : label;
  },

  /** Show the game screen. */
  showGameScreen() {
    const el = document.getElementById('screen-game');
    if (el) el.classList.remove('hidden');
  },

  /** Hide the game screen. */
  hideGameScreen() {
    const el = document.getElementById('screen-game');
    if (el) el.classList.add('hidden');
  },

  // ── BOARD RENDERING ──────────────────────────────────────────

  /**
   * Returns a piece accessor function for the current render mode.
   * Live mode uses ChessEngine; preview mode builds a temporary
   * chess.js instance that has replayed the history up to _viewPly.
   */
  _getPieceAccessor() {
    if (this._pieceSource === 'puzzle' && typeof BonusSystem !== 'undefined') {
      const puzzleState = BonusSystem.getPuzzleState();
      if (puzzleState && puzzleState.fen) {
        const chess = new Chess(puzzleState.fen);
        return (sq) => chess.get(sq);
      }
    }

    if (this._pieceSource === 'live' || this._viewPly === null) {
      return (sq) => ChessEngine.getPiece(sq);
    }
    // Build a temporary Chess by replaying the SAN history
    const chess = new Chess();
    const history = ChessEngine.getHistory();
    const limit = Math.min(this._viewPly, history.length);
    for (let i = 0; i < limit; i++) {
      chess.move(history[i]);
    }
    return (sq) => chess.get(sq);
  },

  renderBoard() {
    const board = document.getElementById('board');
    if (!board) return;
    board.innerHTML = '';

    const isViewing = this._pieceSource === 'viewPly';
    const isPuzzle = this._pieceSource === 'puzzle';
    const getPiece  = this._getPieceAccessor();
    const puzzleState = isPuzzle && typeof BonusSystem !== 'undefined'
      ? BonusSystem.getPuzzleState()
      : null;

    const isFlipped = ChessEngine.getPlayerColor() === 'b';
    const files = isFlipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
    const ranks = isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

    let legalTargets = [];
    let captureTargets = [];
    let selectedSquare = null;

    if (isPuzzle && puzzleState) {
      legalTargets = puzzleState.legalTargets || [];
      captureTargets = puzzleState.captureTargets || [];
      selectedSquare = puzzleState.selectedSquare;
    } else if (!isViewing) {
      legalTargets = this.legalMoves.map(m => m.to);
      captureTargets = this.legalMoves
        .filter(m => m.flags.includes('c') || m.flags.includes('e'))
        .map(m => m.to);
      selectedSquare = this.selectedSquare;
    }

    const inCheck    = !isViewing && !isPuzzle && ChessEngine.isInCheck();
    const kingSquare = inCheck ? this._findKing(ChessEngine.getTurn()) : null;

    ranks.forEach((rank, ri) => {
      files.forEach((file, fi) => {
        const square  = file + rank;
        const piece   = getPiece(square);
        const isLight = (ri + fi) % 2 === 0;

        const el = document.createElement('div');
        el.className      = 'square ' + (isLight ? 'light' : 'dark');
        el.dataset.square = square;

        if (!isViewing && square === selectedSquare)                               el.classList.add('selected');
        if (!isViewing && !isPuzzle && (this.lastMove?.from === square || this.lastMove?.to === square)) el.classList.add('last-move');
        if (legalTargets.includes(square) && !captureTargets.includes(square))     el.classList.add('legal-move');
        if (captureTargets.includes(square))                                       el.classList.add('legal-capture');
        if (inCheck && square === kingSquare)                                      el.classList.add('in-check');
        if (!isViewing && !isPuzzle && this.flowHighlights.includes(square))       el.classList.add('flow-highlight');

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

    if (!isViewing && !isPuzzle) {
      this._renderArrow();
      this._renderThreatArrows();
      this._renderCapturedPieces();
    } else {
      // Clear live-only decorations in view mode
      const old = document.getElementById('sf-arrow-img');
      if (old) old.remove();
      document.querySelectorAll('.threat-arrow-img').forEach((e) => e.remove());
      this._clearCapturedPieces();
    }

    this._updateNavUI();
    if (typeof BonusSystem !== 'undefined' && BonusSystem.renderInventory) {
      BonusSystem.renderInventory();
    }
  },

  // ── MOVE NAVIGATION ─────────────────────────────────────────

  _updateNavUI() {
    const labelEl = document.getElementById('board-nav-label');
    const startBtn = document.getElementById('btn-nav-start');
    const prevBtn  = document.getElementById('btn-nav-prev');
    const nextBtn  = document.getElementById('btn-nav-next');
    const liveBtn  = document.getElementById('btn-nav-live');

    if (this._puzzleMode) {
      if (labelEl) {
        labelEl.textContent = 'Puzzle';
        labelEl.classList.add('viewing');
      }
      if (startBtn) startBtn.disabled = true;
      if (prevBtn)  prevBtn.disabled  = true;
      if (nextBtn)  nextBtn.disabled  = true;
      if (liveBtn)  liveBtn.disabled  = true;
      return;
    }

    const total = ChessEngine.getHistory().length;

    if (labelEl) {
      if (this._viewPly === null) {
        labelEl.textContent = 'Live';
        labelEl.classList.remove('viewing');
      } else {
        labelEl.textContent = `Move ${this._viewPly}/${total}`;
        labelEl.classList.add('viewing');
      }
    }

    const currentPly = this._viewPly === null ? total : this._viewPly;
    if (startBtn) startBtn.disabled = currentPly === 0;
    if (prevBtn)  prevBtn.disabled  = currentPly === 0;
    if (nextBtn)  nextBtn.disabled  = currentPly >= total;
    if (liveBtn)  liveBtn.disabled  = this._viewPly === null;
  },

  /** Jump to a specific ply (0 = initial position, total = live). */
  _goToPly(ply) {
    if (this._puzzleMode) return;
    const total = ChessEngine.getHistory().length;
    if (ply < 0) ply = 0;
    if (ply >= total) {
      this._viewPly = null;
      this._pieceSource = 'live';
    } else {
      this._viewPly = ply;
      this._pieceSource = 'viewPly';
    }
    this.renderBoard();
  },

  _navStart() { this._goToPly(0); },
  _navPrev() {
    const total = ChessEngine.getHistory().length;
    const cur = this._viewPly === null ? total : this._viewPly;
    this._goToPly(cur - 1);
  },
  _navNext() {
    const total = ChessEngine.getHistory().length;
    const cur = this._viewPly === null ? total : this._viewPly;
    this._goToPly(cur + 1);
  },
  _navLive() { this._goToPly(ChessEngine.getHistory().length); },

  // ── HIGHLIGHTS ───────────────────────────────────────────────

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

  // ── STATUS AND HISTORY ───────────────────────────────────────

  showStatus(msg) {
    const el = document.getElementById('game-status');
    if (el) {
      el.style.whiteSpace = 'pre-line';
      el.textContent = msg;
    }
  },

  _syncGameActionButtons() {
    const resignBtn = document.getElementById('btn-resign');
    const drawBtn = document.getElementById('btn-offer-draw');
    if (!resignBtn && !drawBtn) return;

    const playbackActive = typeof BonusSystem !== 'undefined'
      && BonusSystem.isPlaybackActive
      && BonusSystem.isPlaybackActive();
    const disabled = !this._gameActive
      || this._gameConcluded
      || this._puzzleMode
      || this._playbackInputLocked
      || playbackActive;

    const inTournament = typeof CareerFlow !== 'undefined'
      && CareerFlow.getMode
      && CareerFlow.getMode() === 'tournament';
    if (resignBtn) {
      resignBtn.disabled = Boolean(disabled);
      resignBtn.classList.toggle('hidden', inTournament && !this._gameActive);
    }
    if (drawBtn) {
      drawBtn.disabled = Boolean(disabled || this._aiThinking);
      drawBtn.classList.toggle('hidden', inTournament && !this._gameActive);
    }
  },

  _isResignAvailable() {
    const playbackActive = typeof BonusSystem !== 'undefined'
      && BonusSystem.isPlaybackActive
      && BonusSystem.isPlaybackActive();
    return this._gameActive
      && !this._gameConcluded
      && !this._puzzleMode
      && !this._playbackInputLocked
      && !playbackActive;
  },

  _isDrawOfferAvailable() {
    const playbackActive = typeof BonusSystem !== 'undefined'
      && BonusSystem.isPlaybackActive
      && BonusSystem.isPlaybackActive();
    return this._gameActive
      && !this._gameConcluded
      && !this._puzzleMode
      && !this._playbackInputLocked
      && !playbackActive
      && !this._aiThinking;
  },

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  _getBoardPieceCount() {
    const board = ChessEngine.getBoard ? ChessEngine.getBoard() : [];
    let count = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell) count += 1;
      }
    }
    return count;
  },

  _getOpponentEvalCp() {
    if (ChessEngine.getLastEvalCp) {
      return ChessEngine.getLastEvalCp();
    }
    return null;
  },

  _getPlayerDrawOfferDecision({ pieces, evalCp, playerElo, oppElo }) {
    if (pieces >= 24) {
      return {
        accepted: false,
        automatic: true,
        probability: 0,
        status: 'Too early to offer a draw.',
      };
    }

    const baseProbability = pieces <= 15 ? 0.40 : 0.15;

    let evalAdjust = 0;
    if (Number.isFinite(evalCp)) {
      if (evalCp > 100) evalAdjust = -0.40;
      else if (evalCp >= 50) evalAdjust = -0.10;
      else if (evalCp <= -100) evalAdjust = +0.30;
      else if (evalCp <= -50) evalAdjust = +0.10;
    }

    const eloAdjust = this._clamp(((playerElo || 0) - (oppElo || 0)) / 400, -0.3, 0.3);
    const probability = this._clamp(baseProbability + evalAdjust + eloAdjust, 0, 0.95);
    const accepted = Math.random() < probability;

    return {
      accepted,
      automatic: false,
      probability,
      status: accepted
        ? 'Draw agreed.'
        : 'Your opponent declines the draw offer.',
    };
  },

  _checkAIDrawOffer(evalCp) {
    if (!this._gameActive || this._gameConcluded) return false;
    if (typeof BonusSystem !== 'undefined' &&
        BonusSystem.isPlaybackActive &&
        BonusSystem.isPlaybackActive()) {
      return false;
    }

    const pieces = this._getBoardPieceCount();
    if (!Number.isFinite(evalCp) || pieces > 20 || evalCp < -80 || evalCp > 80) {
      this._aiDrawEqualStreak = 0;
      return false;
    }

    this._aiDrawEqualStreak += 1;
    if (this._aiDrawEqualStreak < 8) return false;

    const ply = ChessEngine.getHistory().length;
    if (ply - this._aiLastDrawOfferPly < 15) return false;

    const player = CareerManager.hasCharacter && CareerManager.hasCharacter()
      ? CareerManager.player.get()
      : null;
    const playerElo = player ? player.elo : 800;
    const oppElo = this._opponentElo || 800;
    const eloOfferBoost = this._clamp((playerElo - oppElo) / 400, 0, 0.15);
    const probability = 0.15 + eloOfferBoost;
    if (Math.random() >= probability) return false;

    this._aiLastDrawOfferPly = ply;
    const body = document.getElementById('draw-offer-body');
    if (body) body.textContent = 'Your opponent offers a draw.';
    const modal = document.getElementById('modal-draw-offer');
    if (modal && modal.showModal) modal.showModal();
    this.showStatus('Your opponent offers a draw.');
    return true;
  },

  updateMoveHistory() {
    const history     = ChessEngine.getHistory();
    const list        = document.getElementById('moves-list');
    if (!list) return;
    const playerColor = ChessEngine.getPlayerColor();
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

      // Evaluation annotation for the player's moves
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

  // ── CLICK HANDLING ───────────────────────────────────────────

  onSquareClick(square) {
    if (this._puzzleMode && typeof BonusSystem !== 'undefined') {
      const handled = BonusSystem.onPuzzleClick(square);
      this.renderBoard();
      return handled;
    }
    if (this._viewPly !== null) return;     // view mode: read-only
    if (this._playbackInputLocked) return;
    if (ChessEngine.isGameOver()) return;
    if (this._gameConcluded) return;
    if (this._aiThinking) return;
    if (ChessEngine.getTurn() !== ChessEngine.getPlayerColor()) return;

    const piece = ChessEngine.getPiece(square);
    const turn  = ChessEngine.getTurn();

    // Click on own piece → selection
    if (piece && piece.color === turn) {
      // Intuition: check if the player clicked a highlighted piece
      if (this._intuitionActive && this.flowHighlights.length > 0) {
        if (this.flowHighlights.includes(square)) {
          const correct = (square === this.flowCorrectSquare);
          FocusSystem.onIntuitionResult(correct);
          if (!correct) this._flashCorrectSquare();
        }
        this._intuitionActive = false;
        this.flowHighlights   = [];
        this.flowCorrectSquare = null;
      }

      this.selectedSquare = square;
      this.legalMoves     = ChessEngine.getLegalMoves(square);
      ChessEngine.prefetchEval();
      this.renderBoard();
      return;
    }

    // Click on a destination square
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

  // ── GAME LIFECYCLE ───────────────────────────────────────────

  /**
   * Start a new game. An opponent must have been set previously via
   * setOpponent(). If no opponent is set, a default placeholder is used.
   * @param {'w'|'b'} playerColor
   */
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
    this._viewPly         = null;
    this._pieceSource     = 'live';
    this._puzzleMode      = false;
    this._playbackInputLocked = false;
    this._gameActive      = true;
    this._gameConcluded   = false;
    this._aiLostStreakCount = 0;
    this._aiDrawEqualStreak = 0;
    this._aiLastDrawOfferPly = -Infinity;
    this._playerLastDrawOfferPly = -Infinity;

    FocusSystem.resetForGame();
    if (typeof PuzzleSystem !== 'undefined' && PuzzleSystem.resetTrainingBonusesForGame) {
      PuzzleSystem.resetTrainingBonusesForGame();
    }

    // Fallback placeholder opponent (Phase A — Phase C will always set one)
    if (!this._opponentName) {
      this._opponentName        = 'Test Opponent';
      this._opponentElo         = 800;
      this._opponentTitle       = null;
      this._opponentId          = null;
      this._opponentNationality = null;
      this._opponentTier        = null;
      this._opponentChampion    = null;
    }

    const player = CareerManager.hasCharacter() ? CareerManager.player.get() : null;

    const pNameEl = document.getElementById('player-name-label');
    if (pNameEl) {
      pNameEl.innerHTML = player
        ? this._formatNameHTML(player.playerName || 'You', player.title || null)
        : 'You';
    }
    document.getElementById('player-elo').textContent = player ? player.elo : 800;

    const pAvatar = document.getElementById('player-avatar-slot');
    if (pAvatar && player && typeof UICareer !== 'undefined') {
      UICareer.home._renderAvatarInto(pAvatar, player.avatar);
    }

    document.getElementById('opponent-elo').textContent = this._opponentElo;
    const oppNameEl = document.getElementById('opponent-name');
    if (oppNameEl) {
      oppNameEl.innerHTML = this._formatFlaggedNameHTML(
        this._opponentName,
        this._opponentTitle,
        this._opponentNationality,
      );
    }
    const oppTagEl = document.getElementById('opponent-tagline');
    if (oppTagEl) {
      const tagline = this._opponentChampion && this._opponentChampion.tagline
        ? this._opponentChampion.tagline
        : '';
      oppTagEl.textContent = tagline;
      oppTagEl.classList.toggle('hidden', !tagline);
    }

    const oAvatar = document.getElementById('opponent-avatar-slot');
    if (oAvatar) {
      oAvatar.innerHTML = '';
      const flag = document.createElement('span');
      flag.className   = 'game-id-avatar-flag';
      flag.textContent = this._flagFor(this._opponentNationality) || '♟';
      oAvatar.appendChild(flag);
    }
    document.getElementById('moves-list').innerHTML = '';
    document.getElementById('sf-feedback').textContent =
      'Activate Stockfish to analyze the position.';
    document.getElementById('flow-status').textContent = '';
    document.getElementById('flow-status').className   = 'flow-status';

    if (typeof BonusSystem !== 'undefined' && BonusSystem.renderInventory) {
      BonusSystem.renderInventory();
    }

    this._syncGameActionButtons();
    this.renderBoard();

    if (playerColor === 'b') {
      this.showStatus('Opponent begins…');
      this._triggerAIMove();
    } else {
      this.showStatus('Your move.');
    }
  },

  _executeMove(move) {
    if (move.flags.includes('p')) {
      this.pendingPromotion = move;
      this.openPromotionModal(move.color);
    } else {
      this._applyMove(move.from, move.to);
    }
  },

  /**
   * Apply a move via ChessEngine.makeMove (synchronous).
   * Focus evaluation runs in the background without blocking the UI.
   */
  _applyMove(from, to, promo = 'q') {
    const move = ChessEngine.makeMove(from, to, promo);
    if (!move) return;

    if (typeof SoundManager !== 'undefined') {
      if (move.captured) SoundManager.playCapture();
      else               SoundManager.playMove();
    }

    const ply = ChessEngine.getHistory().length;
    this._moveEvalSquares[ply] = to;

    // Any new move forces the view back to live mode
    this._viewPly       = null;
    this._pieceSource   = 'live';
    this.lastMove       = { from, to };
    this.selectedSquare = null;
    this.legalMoves     = [];
    this._clearStockfishVisuals();

    this.renderBoard();
    this.updateMoveHistory();

    if (this._checkGameEnd()) return;

    if (ChessEngine.getTurn() !== ChessEngine.getPlayerColor()) {
      this._triggerAIMove();
    } else {
      this.showStatus('Your move.');
    }
  },

  /**
   * Check if the game is over. If so, record the result, sync Focus,
   * fire the onGameEnd callback, and launch the post-game review.
   * @returns {boolean} true if the game is over
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
      const winner = loserColor === 'w' ? 'Black' : 'White';
      msg = `Checkmate — ${winner} wins!`;
    } else if (result === 'stalemate') {
      msg = 'Stalemate — draw.';
    } else if (result === 'draw') {
      msg = 'Draw.';
    }

    if (typeof SoundManager !== 'undefined') {
      if (won)                                SoundManager.playVictory();
      else if (!won && resultKey === 'loss')  SoundManager.playDefeat();
    }

    this._gameActive = false;
    this._gameConcluded = true;
    this._aiThinking = false;
    this._aiLostStreakCount = 0;
    this._aiDrawEqualStreak = 0;
    this._syncGameActionButtons();

    FocusSystem.onGameEnd(won);
    CareerManager.focus.sync();

    if (this._opponentName) {
      CareerManager.history.recordGame({
        opponentName: this._opponentName,
        opponentElo:  this._opponentElo,
        result:       resultKey,
        moves:        ChessEngine.getHistory().length,
      });
    }

    this.showStatus(msg);

    // Fire external callback (career flow will subscribe here)
    if (typeof this.onGameEnd === 'function') {
      try {
        this.onGameEnd(resultKey);
      } catch (e) {
        console.error('[UIManager] onGameEnd callback error:', e);
      }
    }

    // Automatic post-game review
    const history = ChessEngine.getHistory();
    if (history.length >= 4) {
      ReviewManager.startReview(history);
    }

    return true;
  },

  _endGameByResignation(resultKey, statusMessage) {
    if (!this._gameActive || this._gameConcluded) return false;

    const won = resultKey === 'win';
    const msg = statusMessage || (
      resultKey === 'loss'
        ? 'You resigned.'
        : resultKey === 'win'
          ? 'Your opponent resigns.'
          : 'Draw agreed.'
    );

    this._gameActive = false;
    this._gameConcluded = true;
    this._aiThinking = false;
    this._aiLostStreakCount = 0;
    this._aiDrawEqualStreak = 0;
    this.selectedSquare = null;
    this.legalMoves = [];
    this._syncGameActionButtons();
    this.renderBoard();

    if (typeof SoundManager !== 'undefined') {
      if (resultKey === 'win') SoundManager.playVictory();
      else if (resultKey === 'loss') SoundManager.playDefeat();
    }

    FocusSystem.onGameEnd(won);
    CareerManager.focus.sync();

    if (this._opponentName) {
      CareerManager.history.recordGame({
        opponentName: this._opponentName,
        opponentElo:  this._opponentElo,
        result:       resultKey,
        moves:        ChessEngine.getHistory().length,
      });
    }

    this.showStatus(msg);

    if (typeof this.onGameEnd === 'function') {
      try {
        this.onGameEnd(resultKey);
      } catch (e) {
        console.error('[UIManager] onGameEnd callback error:', e);
      }
    }

    return true;
  },

  _checkAIResignation(evalCp) {
    if (!Number.isFinite(evalCp)) {
      this._aiLostStreakCount = 0;
      return false;
    }
    if (typeof BonusSystem !== 'undefined' &&
        BonusSystem.isPlaybackActive &&
        BonusSystem.isPlaybackActive()) {
      return false;
    }

    if (evalCp <= -600) {
      this._aiLostStreakCount += 1;
    } else {
      this._aiLostStreakCount = 0;
      return false;
    }

    if (this._aiLostStreakCount < 5) return false;

    let probability = 0.30;
    if (evalCp <= -1000) probability = 0.90;
    else if (evalCp <= -800) probability = 0.60;

    if (Math.random() >= probability) return false;
    return this._endGameByResignation('win', 'Your opponent resigns.');
  },

  _onOfferDraw() {
    if (!this._isDrawOfferAvailable()) return false;

    const ply = ChessEngine.getHistory().length;
    if (ply - this._playerLastDrawOfferPly < 5) {
      this.showStatus('You cannot offer another draw yet.');
      return false;
    }
    this._playerLastDrawOfferPly = ply;

    const player = CareerManager.hasCharacter && CareerManager.hasCharacter()
      ? CareerManager.player.get()
      : null;
    const playerElo = player ? player.elo : 800;
    const decision = this._getPlayerDrawOfferDecision({
      pieces: this._getBoardPieceCount(),
      evalCp: this._getOpponentEvalCp(),
      playerElo,
      oppElo: this._opponentElo || 800,
    });

    if (decision.accepted) {
      this._endGameByResignation('draw', 'Draw agreed.');
    } else {
      this.showStatus(decision.status);
    }
    return decision.accepted;
  },

  // ── STOCKFISH VISUALS ────────────────────────────────────────

  /**
   * Convert an algebraic square to pixel coordinates (center) on the
   * 576×576 SVG board.
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

  /** Draw or clear the N3 arrow (pixel art sprite) on the board. */
  _renderArrow() {
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
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;

    const img = document.createElement('img');
    img.id        = 'sf-arrow-img';
    img.src       = 'assets/ui/arrow-best-move.png';
    img.draggable = false;
    img.className = 'sf-arrow-sprite';

    const h = 40;
    img.style.width     = dist + 'px';
    img.style.height    = h + 'px';
    img.style.left      = (cx - dist / 2) + 'px';
    img.style.top       = (cy - h / 2) + 'px';
    img.style.transform = `rotate(${angle}deg)`;

    container.appendChild(img);
  },

  /** Draw the red threat arrows (Flow I+). */
  _renderThreatArrows() {
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

  /** Display captured pieces on each side with the material difference. */
  _renderCapturedPieces() {
    const capWhiteEl = document.getElementById('captured-white');
    const capBlackEl = document.getElementById('captured-black');
    if (!capWhiteEl || !capBlackEl) return;

    const { byWhite, byBlack, diff } = ChessEngine.getCapturedPieces();
    const playerColor = ChessEngine.getPlayerColor();

    // The player is always at the bottom. captured-white = bottom, captured-black = top.
    const playerCaptures   = playerColor === 'w' ? byWhite : byBlack;
    const opponentCaptures = playerColor === 'w' ? byBlack : byWhite;
    const playerDiff       = playerColor === 'w' ? diff : -diff;

    capWhiteEl.innerHTML = '';
    capBlackEl.innerHTML = '';

    this._fillCapturedRow(capWhiteEl, playerCaptures, playerDiff > 0 ? playerDiff : 0);
    this._fillCapturedRow(capBlackEl, opponentCaptures, playerDiff < 0 ? -playerDiff : 0);
  },

  _clearCapturedPieces() {
    const capWhiteEl = document.getElementById('captured-white');
    const capBlackEl = document.getElementById('captured-black');
    if (capWhiteEl) capWhiteEl.innerHTML = '';
    if (capBlackEl) capBlackEl.innerHTML = '';
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

  // ── FLOW REWARDS (highlights) ───────────────────────────────

  /**
   * Pick pieces to highlight based on the Flow tier.
   * Flow II : 3 pieces (1 correct + 1 credible decoy + 1 attractive trap)
   * Flow III/MAX : 2 pieces (1 correct + 1 decoy/trap)
   */
  async _computeFlowHighlights(palier) {
    const pvLines = await ChessEngine.getMultiPV(8);
    if (pvLines.length === 0) { this.flowHighlights = []; return; }

    const bestMove = pvLines[0];
    const bestFrom = bestMove.move.substring(0, 2);
    this.flowCorrectSquare = bestFrom;

    // Group moves by source piece
    const byPiece = {};
    for (const pv of pvLines) {
      const from = pv.move.substring(0, 2);
      if (!byPiece[from]) byPiece[from] = [];
      byPiece[from].push(pv);
    }

    // Credible decoy candidates: pieces other than the best move whose
    // best move is within 120cp of the top
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

    // Trap candidates: pieces with a move that LOOKS good (capture or check)
    // but whose eval is > 100cp worse than the best move
    const traps = [];
    const allMoves = ChessEngine.getLegalMoves();

    for (const m of allMoves) {
      if (m.from === bestFrom) continue;
      const isCapture = m.flags.includes('c') || m.flags.includes('e');
      const isCheck   = m.san.includes('+');
      if (!isCapture && !isCheck) continue;

      const inPV = pvLines.some(pv => pv.move === m.from + m.to);
      if (inPV) continue;

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
      ? CareerManager.player.get().elo : 800;
    const trapChance = elo < 1200 ? 0.6 : elo < 1600 ? 0.5 : 0.35;

    const numPieces = palier >= 3 ? 2 : 3;
    const highlights = [bestFrom];

    if (numPieces === 3) {
      // Flow II: 1 correct + 1 credible + 1 trap (or 2 credibles if no trap)
      const useTraps = traps.length > 0 && Math.random() < trapChance;

      if (useTraps) {
        if (credible.length > 0) highlights.push(credible[0].square);
        highlights.push(traps[Math.floor(Math.random() * traps.length)].square);
      } else {
        for (let i = 0; i < 2 && i < credible.length; i++) {
          highlights.push(credible[i].square);
        }
      }

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
      // Flow III: 1 correct + 1 decoy/trap
      const useTraps = traps.length > 0 && Math.random() < trapChance;
      if (useTraps) {
        highlights.push(traps[Math.floor(Math.random() * traps.length)].square);
      } else if (credible.length > 0) {
        highlights.push(credible[0].square);
      } else if (traps.length > 0) {
        highlights.push(traps[0].square);
      } else {
        for (const m of allMoves) {
          if (!highlights.includes(m.from)) { highlights.push(m.from); break; }
        }
      }
    }

    // Shuffle so the correct piece isn't always first
    for (let i = highlights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [highlights[i], highlights[j]] = [highlights[j], highlights[i]];
    }

    this.flowHighlights = highlights;
  },

  /** Brief flash of the correct square when the player picks a decoy. */
  _flashCorrectSquare() {
    if (!this.flowCorrectSquare) return;
    const el = document.querySelector(`[data-square="${this.flowCorrectSquare}"]`);
    if (!el) return;
    el.classList.add('intuition-correct-flash');
    setTimeout(() => el.classList.remove('intuition-correct-flash'), 1200);
  },

  /**
   * Activate Intuition: spend Focus and compute highlights.
   * Called by the Intuition button in the sidebar.
   */
  async activateIntuition() {
    if (this._aiThinking) return;
    if (this._intuitionActive) return;

    const cost = FocusSystem.activateIntuition();
    if (cost === false) return;

    this._intuitionActive = true;

    await ChessEngine.waitForBgEval();
    const palier = FocusSystem.getFlowStateInfo().palier;
    await this._computeFlowHighlights(palier);

    this.renderBoard();
    FocusSystem.render();
  },

  /** Clear all Stockfish and Flow reward visuals. */
  _clearStockfishVisuals() {
    this.sfArrow           = null;
    this.flowThreats       = [];
    this.flowHighlights    = [];
    this.flowCorrectSquare = null;
    this._intuitionActive  = false;
  },

  // ── MOVE EVAL CALLBACK (from FocusSystem) ───────────────────

  _onMoveEvaluated(evalInfo) {
    if (!evalInfo || !evalInfo.ply) return;
    this._moveEvals[evalInfo.ply] = evalInfo;
    this.updateMoveHistory();
    if (typeof BonusSystem !== 'undefined' && BonusSystem.renderInventory) {
      BonusSystem.renderInventory();
    }

    const square = this._moveEvalSquares[evalInfo.ply];
    if (square && evalInfo.key !== 'neutral') {
      setTimeout(() => this._showFloatingEval(square, evalInfo), 0);
    }
  },

  _showFloatingEval(square, evalInfo) {
    if (this._pieceSource !== 'live') return;
    if (this._puzzleMode) return;
    if (this._playbackInputLocked) return;
    if (typeof BonusSystem !== 'undefined') {
      if (BonusSystem.isInPuzzleMode && BonusSystem.isInPuzzleMode()) return;
      if (BonusSystem.isPlaybackActive && BonusSystem.isPlaybackActive()) return;
    }
    const el = document.querySelector(`[data-square="${square}"]`);
    if (!el) return;

    const float = document.createElement('span');
    float.className   = 'floating-eval ' + evalInfo.cls;
    float.textContent = evalInfo.label;
    el.appendChild(float);

    setTimeout(() => float.remove(), 1600);
  },

  // ── MAIA LOADING BAR ────────────────────────────────────────

  _updateMaiaUI(status, progress) {
    const wrap = document.getElementById('maia-loading-bar');
    const bar  = document.getElementById('maia-loading-progress');
    const text = document.getElementById('maia-loading-text');
    if (!wrap) return;

    if (status === 'ready') {
      wrap.classList.add('hidden');
    } else if (status === 'downloading') {
      wrap.classList.remove('hidden');
      if (bar)  bar.value = progress;
      if (text) text.textContent = `Loading AI… ${progress}%`;
    } else if (status === 'loading') {
      wrap.classList.remove('hidden');
      if (text) text.textContent = 'Loading AI…';
    } else if (status === 'error') {
      wrap.classList.remove('hidden');
      if (text) text.textContent = 'AI loading error. Please reload the page.';
      if (bar)  bar.classList.add('hidden');
    }
  },

  // ── AI MOVE ─────────────────────────────────────────────────

  /**
   * Phase G.2 — route opponent move generation between Maia and the
   * shared humanized Stockfish wrapper.
   *
   * Rule:
   *   - targetElo <= 2000 → Maia (book in opening, then policy move)
   *   - targetElo > 2000  → StockfishOpponent
   *
   * @param {string} fen
   * @param {number} targetElo
   * @param {number} playerElo
   * @returns {Promise<string|null>} chosen UCI move
   */
  async _pickOpponentMove(fen, targetElo, playerElo) {
    const plyCount = ChessEngine.getHistory().length;
    const repMove = this._pickChampionOpeningMove(plyCount);
    if (repMove) return repMove;

    if (targetElo > 2000) {
      if (typeof StockfishOpponent === 'undefined' || !StockfishOpponent.getMove) {
        throw new Error('Stockfish opponent module unavailable');
      }
      const result = await StockfishOpponent.getMove(fen, targetElo);
      return result && result.move ? result.move : null;
    }

    let move = null;
    if (plyCount < 12) {
      const bookMove = await MaiaEngine.getOpeningMove(fen, targetElo);
      if (bookMove) move = bookMove;
    }
    if (!move) {
      const result = await MaiaEngine.getMove(fen, targetElo, playerElo);
      move = result && result.move ? result.move : null;
    }
    return move;
  },

  _pickChampionOpeningMove(plyCount) {
    const champion = this._opponentChampion;
    const rep = champion && champion.openingRepertoire;
    if (!rep) return null;

    const threshold = Number.isFinite(rep.prob) ? rep.prob : 0.70;
    if (Math.random() >= threshold) return null;

    let preferred = null;
    if (plyCount === 0 && Array.isArray(rep.asWhite) && rep.asWhite.length > 0) {
      preferred = rep.asWhite[0];
    } else if (plyCount === 1) {
      const firstMove = ChessEngine.getHistory()[0];
      if (firstMove === 'e4') preferred = rep.vsE4 || null;
      else if (firstMove === 'd4') preferred = rep.vsD4 || null;
    }

    if (!preferred) return null;

    const preferredMoves = Array.isArray(preferred) ? preferred : [preferred];
    const legalMoves = ChessEngine.getLegalMoves()
      .map((m) => `${m.from}${m.to}${m.promotion || ''}`);

    for (const move of preferredMoves) {
      if (legalMoves.includes(move)) return move;
    }
    return null;
  },

  async _triggerAIMove() {
    this._aiThinking = true;
    this._syncGameActionButtons();
    this.showStatus('Opponent thinking…');

    try {
      const fen       = ChessEngine.getFEN();
      const player    = CareerManager.hasCharacter() ? CareerManager.player.get() : null;
      const playerElo = player ? player.elo : 800;
      const targetElo = this._opponentElo;

      const move = await this._pickOpponentMove(fen, targetElo, playerElo);
      if (!move) {
        throw new Error('No opponent move produced');
      }

      if (ChessEngine.isGameOver() || ChessEngine.getFEN() !== fen) {
        this._aiThinking = false;
        return;
      }

      const from  = move.substring(0, 2);
      const to    = move.substring(2, 4);
      const promo = move.length > 4 ? move[4] : 'q';

      const moveResult = ChessEngine.makeMove(from, to, promo);
      if (!moveResult) {
        console.error('[AI] Illegal move from opponent engine:', move);
        this._aiThinking = false;
        return;
      }

      const minDelay = new Promise(r => setTimeout(r, 800 + Math.random() * 700));

      const flowRewardsPromise = (async () => {
        await ChessEngine.waitForBgEval();
        const flowInfo = FocusSystem.getFlowStateInfo();
        if (flowInfo.palier >= 1) {
          this.flowThreats = ChessEngine.getThreats();
        }
      })();

      await Promise.all([minDelay, flowRewardsPromise]);

      if (typeof SoundManager !== 'undefined') {
        if (moveResult.captured) SoundManager.playCapture();
        else                     SoundManager.playMove();
      }

      this._viewPly = null;
      this._pieceSource = 'live';
      this.lastMove = { from, to };
      this._aiThinking = false;
      this._syncGameActionButtons();
      this.renderBoard();
      this.updateMoveHistory();

      if (this._checkGameEnd()) return;
      const aiEvalCp = ChessEngine.getLastEvalCp ? ChessEngine.getLastEvalCp() : null;
      if (this._checkAIResignation(aiEvalCp)) return;
      if (this._checkAIDrawOffer(aiEvalCp)) return;
      this.showStatus('Your move.');
    } catch (e) {
      console.error('[AI] Error:', e);
      this._aiThinking = false;
      this._syncGameActionButtons();
      this.showStatus('AI error — start a new game.');
    }
  },

  /** Convert an ISO country code to a flag emoji. Returns '' on miss. */
  _flagFor(code) {
    const flags = {
      AR: '🇦🇷', AM: '🇦🇲', AU: '🇦🇺', AZ: '🇦🇿', AT: '🇦🇹', AD: '🇦🇩',
      BR: '🇧🇷', CA: '🇨🇦', CN: '🇨🇳', CU: '🇨🇺', CZ: '🇨🇿', DK: '🇩🇰',
      EG: '🇪🇬', EN: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', FR: '🇫🇷', DE: '🇩🇪', GE: '🇬🇪', HU: '🇭🇺',
      IN: '🇮🇳', IR: '🇮🇷', IL: '🇮🇱', IT: '🇮🇹', JP: '🇯🇵', KZ: '🇰🇿',
      MA: '🇲🇦', NL: '🇳🇱', NO: '🇳🇴', PE: '🇵🇪', PH: '🇵🇭', PL: '🇵🇱',
      RO: '🇷🇴', RU: '🇷🇺', RS: '🇷🇸', ES: '🇪🇸', SE: '🇸🇪', CH: '🇨🇭',
      TR: '🇹🇷', UA: '🇺🇦', GB: '🇬🇧', US: '🇺🇸', UZ: '🇺🇿', VN: '🇻🇳',
      IS: '🇮🇸', SG: '🇸🇬',
    };
    return flags[code] || '';
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

  // ── BUTTON BINDINGS ─────────────────────────────────────────

  _bindButtons() {
    // Color choice → start the game with the picked color
    const startWithColor = (color) => {
      document.getElementById('modal-color-choice').close();
      this.newGame(color);
    };
    const pickW = document.getElementById('pick-white');
    const pickB = document.getElementById('pick-black');
    const pickR = document.getElementById('pick-random');
    if (pickW) pickW.onclick = () => startWithColor('w');
    if (pickB) pickB.onclick = () => startWithColor('b');
    if (pickR) pickR.onclick = () => startWithColor(Math.random() < 0.5 ? 'w' : 'b');

    // New game button — opens the color choice modal
    const btnNewGame = document.getElementById('btn-new-game');
    if (btnNewGame) {
      btnNewGame.onclick = () => {
        if (!MaiaEngine.isReady()) return;
        document.getElementById('modal-color-choice').showModal();
      };
    }

    // N3 — Best move: source → destination arrow
    const btnSf3 = document.getElementById('btn-sf3');
    if (btnSf3) {
      btnSf3.onclick = async () => {
        if (this._aiThinking) return;

        const flowInfo = FocusSystem.getFlowStateInfo();
        const isFreeN3 = flowInfo.palier >= 3;

        if (isFreeN3) {
          FocusSystem.activateStockfish(3);
        } else {
          if (!FocusSystem.activateStockfish(3)) return;
        }
        document.getElementById('sf-feedback').textContent = 'N3 — Analyzing…';

        await ChessEngine.waitForBgEval();
        const best = await ChessEngine.getBestMove();
        if (best) {
          this.sfArrow = { from: best.from, to: best.to };
          document.getElementById('sf-feedback').textContent =
            'N3 active — arrow shows the best move.';
          this.renderBoard();
        } else {
          document.getElementById('sf-feedback').textContent = 'N3 — No move found.';
        }
      };
    }

    // Intuition (Flow II+ highlights)
    const btnIntuition = document.getElementById('btn-intuition');
    if (btnIntuition) {
      btnIntuition.onclick = () => this.activateIntuition();
    }

    // Takeback
    const btnTakeback = document.getElementById('btn-takeback');
    if (btnTakeback) {
      btnTakeback.onclick = () => {
        if (this._aiThinking) return;
        if (ChessEngine.getHistory().length === 0) return;
        if (!FocusSystem.activateTakeback()) return;

        if (!ChessEngine.takeback()) return;

        this.lastMove       = null;
        this.selectedSquare = null;
        this.legalMoves     = [];
        this._clearStockfishVisuals();
        this.renderBoard();
        this.updateMoveHistory();
        this.showStatus('Move taken back — your move.');
      };
    }

    const btnResign = document.getElementById('btn-resign');
    const btnOfferDraw = document.getElementById('btn-offer-draw');
    const resignModal = document.getElementById('modal-resign');
    const btnResignCancel = document.getElementById('btn-resign-cancel');
    const btnResignConfirm = document.getElementById('btn-resign-confirm');
    const drawOfferModal = document.getElementById('modal-draw-offer');
    const btnDrawOfferAccept = document.getElementById('btn-draw-offer-accept');
    const btnDrawOfferDecline = document.getElementById('btn-draw-offer-decline');
    if (btnOfferDraw) {
      btnOfferDraw.onclick = () => this._onOfferDraw();
    }
    if (btnResign) {
      btnResign.onclick = () => {
        if (!this._isResignAvailable()) return;
        if (resignModal && resignModal.showModal) resignModal.showModal();
      };
    }
    if (btnResignCancel) {
      btnResignCancel.onclick = () => {
        if (resignModal && resignModal.close) resignModal.close();
      };
    }
    if (btnResignConfirm) {
      btnResignConfirm.onclick = () => {
        if (resignModal && resignModal.close) resignModal.close();
        if (!this._isResignAvailable()) return;
        this._endGameByResignation('loss', 'You resigned.');
      };
    }
    if (btnDrawOfferAccept) {
      btnDrawOfferAccept.onclick = () => {
        if (drawOfferModal && drawOfferModal.close) drawOfferModal.close();
        if (!this._gameActive || this._gameConcluded) return;
        this._endGameByResignation('draw', 'Draw agreed.');
      };
    }
    if (btnDrawOfferDecline) {
      btnDrawOfferDecline.onclick = () => {
        if (drawOfferModal && drawOfferModal.close) drawOfferModal.close();
        this.showStatus('You decline the draw offer.');
      };
    }

    // Post-game review: close → sync focus
    const btnCloseReview = document.getElementById('btn-close-review');
    if (btnCloseReview) {
      btnCloseReview.onclick = () => {
        ReviewManager.stopReview();
        CareerManager.focus.sync();
      };
    }

    // Move navigation
    const navStart = document.getElementById('btn-nav-start');
    const navPrev  = document.getElementById('btn-nav-prev');
    const navNext  = document.getElementById('btn-nav-next');
    const navLive  = document.getElementById('btn-nav-live');
    if (navStart) navStart.onclick = () => this._navStart();
    if (navPrev)  navPrev.onclick  = () => this._navPrev();
    if (navNext)  navNext.onclick  = () => this._navNext();
    if (navLive)  navLive.onclick  = () => this._navLive();

    this._syncGameActionButtons();
  },

  enterPuzzleMode() {
    this._puzzleMode = true;
    this._pieceSource = 'puzzle';
    this.selectedSquare = null;
    this.legalMoves = [];
    this._clearStockfishVisuals();
    this._syncGameActionButtons();
    this.renderBoard();
  },

  exitPuzzleMode() {
    this._puzzleMode = false;
    this._pieceSource = this._viewPly === null ? 'live' : 'viewPly';
    this.selectedSquare = null;
    this.legalMoves = [];
    this._syncGameActionButtons();
    this.renderBoard();
  },

  lockInputForPlayback() {
    this._playbackInputLocked = true;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('playback-locked');
    }
    this._syncGameActionButtons();
  },

  unlockInputAfterPlayback() {
    this._playbackInputLocked = false;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('playback-locked');
    }
    this._syncGameActionButtons();
    this.renderBoard();
  },

  applyPlaybackMove(move) {
    if (!move || !move.from || !move.to) return false;
    const promo = move.promotion || (move.move && move.move[4]) || 'q';
    const applied = ChessEngine.makeMove(move.from, move.to, promo);
    if (!applied) return false;

    if (typeof SoundManager !== 'undefined') {
      if (applied.captured) SoundManager.playCapture();
      else                  SoundManager.playMove();
    }

    const ply = ChessEngine.getHistory().length;
    this._moveEvalSquares[ply] = move.to;
    this._viewPly = null;
    this._pieceSource = 'live';
    this.lastMove = { from: move.from, to: move.to };
    this.selectedSquare = null;
    this.legalMoves = [];
    this._clearStockfishVisuals();
    this.renderBoard();
    this.updateMoveHistory();

    return !this._checkGameEnd();
  },

  async triggerAIMoveAndWait() {
    await this._triggerAIMove();
  },

};

// ── BOOTSTRAP ───────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  ChessEngine.init();
  MaiaEngine.setStatusCallback((status, progress) => {
    UIManager._updateMaiaUI(status, progress);
  });
  MaiaEngine.init(); // async — runs in background
  CareerManager.init();
  CalendarSystem.init();
  CareerFlow.init();
  StaffSystem.init();
  RivalSystem.init();
  InboxSystem.init();
  PuzzleSystem.init();
  UIManager.init();
  BonusSystem.init();
  UIManager.onGameEnd = (result) => CareerFlow.onGameEnd(result);
  // Ordering matters: CareerFlow must observe TOURNAMENT_FINISHED
  // before UICareer so the mode flips back to 'free' before home
  // re-renders.
  UICareer.init();
  CharacterCreator.init();

  // Initial routing: if no character, show the creator. Otherwise
  // jump straight to the home screen. If a tournament was in progress
  // when the tab was closed, resume right into the tournament screen.
  if (!CareerManager.hasCharacter()) {
    CharacterCreator.show(() => {
      UICareer.showScreen('home');
      UICareer.home.render();
    });
  } else if (CalendarSystem.isInTournament && CalendarSystem.isInTournament()) {
    CareerFlow.enterTournamentMode();
    UICareer.showScreen('tournament');
    UICareer.tournament.render();
  } else {
    UICareer.showScreen('home');
    UICareer.home.render();
  }

  // Background music (ON by default)
  const bgMusic  = document.getElementById('bg-music');
  const btnMusic = document.getElementById('btn-music');
  if (bgMusic && btnMusic) {
    bgMusic.volume = 0.15;
    let musicWanted = true;

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
      e.stopPropagation();
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

  // SFX toggle
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
