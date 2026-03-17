// ui-manager.js
// Rendu DOM et gestion des interactions utilisateur.
// Communique avec ChessEngine, FocusSystem et CareerManager via leurs API publiques.

const UIManager = {

  // ── ÉTAT INTERNE ─────────────────────────────────────────────

  selectedSquare:   null,
  legalMoves:       [],
  lastMove:         null,
  pendingPromotion: null,

  // ── ÉTAT STOCKFISH VISUEL ──────────────────────────────────
  sfEvalActive:     false,   // N1 : mode évaluateur actif
  sfEvalConsumed:   false,   // N1 : l'unique évaluation a été utilisée
  sfEvalPending:    null,    // N1 : { from, to } du coup en attente de confirmation
  sfGuideSquare:    null,    // N2 : case de la pièce à jouer
  sfArrow:          null,    // N3 : { from, to } de la flèche

  PIECES: {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  },

  // ── INITIALISATION ───────────────────────────────────────────

  init() {
    this._bindButtons();
    this.renderBoard();
    FocusSystem.render();

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

    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

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
        if (this.sfGuideSquare === square)                                     el.classList.add('sf-guide');

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
          const p = document.createElement('div');
          p.className   = 'piece piece-' + piece.color;
          p.textContent = this.PIECES[piece.color + piece.type.toUpperCase()];
          el.appendChild(p);
        }

        el.addEventListener('click', () => this.onSquareClick(square));
        board.appendChild(el);
      });
    });

    // Flèche SVG N3
    this._renderArrow();

    // N1 : réafficher le badge si un coup est en attente de confirmation
    if (this.sfEvalPending) {
      this._showPendingBadge();
    }
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

    // ── Clic sur une de ses propres pièces → sélection ──
    if (piece && piece.color === turn) {
      this.selectedSquare = square;
      this.legalMoves     = ChessEngine.getLegalMoves(square);
      // N2 : effacer la surbrillance guide quand le joueur sélectionne une pièce
      this.sfGuideSquare  = null;
      // N1 : effacer le badge en attente (changement de pièce)
      this.sfEvalPending  = null;
      // Lancer l'évaluation anticipée pendant que le joueur choisit sa case
      ChessEngine.prefetchEval();
      this.renderBoard();
      return;
    }

    // ── Clic sur une case destination ──
    if (this.selectedSquare) {
      const move = this.legalMoves.find(m => m.to === square);
      if (move) {
        // N1 : si évaluation active et pas encore consommée → évaluer au lieu de jouer
        if (this.sfEvalActive && !this.sfEvalConsumed) {
          this.sfEvalConsumed = true;
          this.sfEvalPending  = { from: move.from, to: move.to };
          this._evaluateSingleMove(move);
          return;
        }
        // N1 : si on reclique sur la case évaluée → jouer le coup
        // Sinon (eval consommée, autre case) → jouer normalement
        this._executeMove(move);
      } else {
        this.selectedSquare = null;
        this.legalMoves     = [];
        this.sfEvalPending  = null;
        this.renderBoard();
      }
    }
  },

  // ── PROMOTION ────────────────────────────────────────────────

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

  newGame() {
    ChessEngine.reset();

    this.selectedSquare   = null;
    this.legalMoves       = [];
    this.lastMove         = null;
    this.pendingPromotion = null;
    this._clearStockfishVisuals();

    FocusSystem.resetForGame();

    const stats = CareerManager.getPublicStats();
    document.getElementById('player-elo').textContent   = stats.elo;
    document.getElementById('opponent-name').textContent = '—';
    document.getElementById('opponent-elo').textContent  = '—';
    document.getElementById('moves-list').innerHTML = '';
    document.getElementById('sf-feedback').textContent =
      'Active Stockfish pour analyser la position.';

    this.renderBoard();
    this.showStatus('À Blancs de jouer.');
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
   */
  _applyMove(from, to, promo = 'q') {
    const move = ChessEngine.makeMove(from, to, promo);
    if (!move) return;

    this.lastMove       = { from, to };
    this.selectedSquare = null;
    this.legalMoves     = [];
    this._clearStockfishVisuals();

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
    CareerManager.syncFocus();
    this.showStatus(msg);
  },

  // ── STOCKFISH VISUEL ─────────────────────────────────────────

  /**
   * Convertit une case algébrique en coordonnées pixel (centre) sur le SVG 576×576.
   */
  _squareToXY(sq) {
    const files = 'abcdefgh';
    const col = files.indexOf(sq[0]);
    const row = 8 - parseInt(sq[1], 10);
    return { x: col * 72 + 36, y: row * 72 + 36 };
  },

  /** Dessine ou efface la flèche N3 sur le SVG overlay. */
  _renderArrow() {
    const svg = document.getElementById('board-svg');
    if (!svg) return;
    // Nettoyer les lignes existantes
    svg.querySelectorAll('line').forEach(l => l.remove());

    if (!this.sfArrow) return;

    const from = this._squareToXY(this.sfArrow.from);
    const to   = this._squareToXY(this.sfArrow.to);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('marker-end', 'url(#arrowhead)');
    svg.appendChild(line);
  },

  /**
   * N1 — Évalue UN SEUL coup et affiche le badge sur la case destination.
   * Le coup n'est PAS joué — le joueur doit recliquer pour confirmer.
   */
  async _evaluateSingleMove(move) {
    const sq = move.to;

    // Badge loading
    const el = document.querySelector(`[data-square="${sq}"]`);
    if (el) {
      const badge = document.createElement('span');
      badge.className = 'sf-eval-badge eval-loading';
      badge.textContent = '…';
      badge.dataset.evalBadge = sq;
      el.appendChild(badge);
    }

    document.getElementById('sf-feedback').textContent = 'N1 — Évaluation en cours…';

    const deltaCp = await ChessEngine.evaluateMoveQuality(move.from, move.to);
    const abs     = Math.abs(deltaCp);
    const { label, cls } = this._evalLabel(abs);

    // Vérifier que le badge est toujours pertinent (pas changé de pièce entre temps)
    if (!this.sfEvalPending || this.sfEvalPending.to !== sq) return;

    // Stocker le résultat pour _showPendingBadge (après re-render)
    this.sfEvalPending.label = label;
    this.sfEvalPending.cls   = cls;

    const badge = document.querySelector(`[data-eval-badge="${sq}"]`);
    if (badge) {
      badge.textContent = label;
      badge.className   = 'sf-eval-badge ' + cls;
    }

    document.getElementById('sf-feedback').textContent =
      `N1 — ${label}. Clique à nouveau pour jouer ce coup.`;
  },

  /**
   * Réaffiche le badge N1 après un re-render du plateau (si un coup est en attente).
   */
  _showPendingBadge() {
    if (!this.sfEvalPending || !this.sfEvalPending.label) return;
    const sq = this.sfEvalPending.to;
    const el = document.querySelector(`[data-square="${sq}"]`);
    if (!el) return;
    const badge = document.createElement('span');
    badge.className   = 'sf-eval-badge ' + this.sfEvalPending.cls;
    badge.textContent = this.sfEvalPending.label;
    badge.dataset.evalBadge = sq;
    el.appendChild(badge);
  },

  /**
   * Retourne le label et la classe CSS pour un delta cp donné.
   */
  _evalLabel(absCp) {
    if (absCp === 0)        return { label: 'Meilleur',     cls: 'eval-best' };
    if (absCp <= 30)        return { label: 'Très bon',     cls: 'eval-tres-bon' };
    if (absCp <= 80)        return { label: 'Bon',          cls: 'eval-bon' };
    if (absCp <= 150)       return { label: 'Correct',      cls: 'eval-correct' };
    if (absCp <= 250)       return { label: 'Imprécis',     cls: 'eval-imprecis' };
    if (absCp <= 400)       return { label: 'Mauvais',      cls: 'eval-mauvais' };
    return                           { label: 'Blunder',      cls: 'eval-blunder' };
  },

  /** Efface tous les visuels Stockfish (N1 badges, N2 highlight, N3 flèche). */
  _clearStockfishVisuals() {
    this.sfEvalActive   = false;
    this.sfEvalConsumed = false;
    this.sfEvalPending  = null;
    this.sfGuideSquare  = null;
    this.sfArrow        = null;
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

    // Dashboard
    document.getElementById('dash-btn-play').onclick = () => {
      this.showScreen('game');
      this.newGame();
    };

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

    // N1 — Évaluateur : active le mode (badge au prochain clic destination)
    document.getElementById('btn-sf1').onclick = () => {
      if (!FocusSystem.activateStockfish(1)) return;
      this.sfEvalActive   = true;
      this.sfEvalConsumed = false;
      this.sfEvalPending  = null;
      document.getElementById('sf-feedback').textContent =
        'N1 actif — joue un coup pour voir son évaluation avant de confirmer.';
    };

    // N2 — Guide pièce : met en surbrillance bleue la pièce à jouer
    document.getElementById('btn-sf2').onclick = async () => {
      if (!FocusSystem.activateStockfish(2)) return;
      document.getElementById('sf-feedback').textContent = 'N2 — Analyse en cours…';
      const best = await ChessEngine.getBestMove();
      if (best) {
        this.sfGuideSquare = best.from;
        document.getElementById('sf-feedback').textContent =
          'N2 actif — la pièce en surbrillance bleue devrait jouer.';
        this.renderBoard();
      } else {
        document.getElementById('sf-feedback').textContent = 'N2 — Aucun coup trouvé.';
      }
    };

    // N3 — Meilleur coup : flèche SVG source → destination
    document.getElementById('btn-sf3').onclick = async () => {
      if (!FocusSystem.activateStockfish(3)) return;
      document.getElementById('sf-feedback').textContent = 'N3 — Analyse en cours…';
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
  },

};

// ── LANCEMENT ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  ChessEngine.init();
  CareerManager.init();
  UIManager.init();
});
