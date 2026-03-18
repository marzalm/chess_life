// review-manager.js
// Revue post-partie : analyse chaque position avec Stockfish,
// identifie les 3 moments clés, affiche les résultats dans un modal.
// Utilise le même Web Worker Stockfish — évaluations séquentielles.

const ReviewManager = {

  _analyzing: false,
  _evalData:  [],       // { fen, moveSan, playerEvalBefore, playerEvalAfter, loss, bestMove, isPlayerMove }

  // ── API PUBLIQUE ──────────────────────────────────────────

  /**
   * Lance la revue post-partie.
   * @param {string[]} history - tableau de coups SAN (ex: ['e4','e5','Nf3',...])
   */
  async startReview(history) {
    if (this._analyzing || !history || history.length < 4) return;
    this._analyzing = true;
    this._evalData  = [];

    const modal = document.getElementById('modal-review');
    if (!modal) { this._analyzing = false; return; }
    modal.showModal();

    const progressWrap = document.getElementById('review-progress-wrap');
    const results      = document.getElementById('review-results');
    if (progressWrap) progressWrap.classList.remove('hidden');
    if (results)      results.classList.add('hidden');

    // ── Rejouer la partie et collecter les FEN ──
    const game = new Chess();
    const fens = [game.fen()];

    for (const san of history) {
      const m = game.move(san);
      if (!m) break;
      fens.push(game.fen());
    }

    // ── Évaluer chaque position séquentiellement ──
    const rawEvals = [];
    for (let i = 0; i < fens.length; i++) {
      if (!this._analyzing) return;

      const result = await ChessEngine.evaluateForReview(fens[i]);
      rawEvals.push({ cp: result.cp, bestMove: result.bestMove });

      const pct = Math.round(((i + 1) / fens.length) * 100);
      const bar  = document.getElementById('review-progress');
      const text = document.getElementById('review-progress-text');
      if (bar)  bar.value = pct;
      if (text) text.textContent = `Analyse en cours… ${i + 1}/${fens.length}`;
    }

    if (!this._analyzing) return;

    // ── Normaliser les évaluations du point de vue du joueur ──
    const playerColor = ChessEngine.getPlayerColor();
    const playerEvals = rawEvals.map((e, i) => {
      // Position i : si i pair → blancs jouent, sinon noirs
      const sideToMove = (i % 2 === 0) ? 'w' : 'b';
      return (sideToMove === playerColor) ? e.cp : -e.cp;
    });

    // ── Construire evalData pour chaque coup ──
    for (let i = 0; i < history.length; i++) {
      const isPlayerMove = (i % 2 === 0 && playerColor === 'w') ||
                           (i % 2 === 1 && playerColor === 'b');
      this._evalData.push({
        moveIndex:        i,
        fen:              fens[i],
        moveSan:          history[i],
        playerEvalBefore: playerEvals[i],
        playerEvalAfter:  playerEvals[i + 1],
        loss:             playerEvals[i] - playerEvals[i + 1],
        bestMove:         rawEvals[i].bestMove,
        isPlayerMove,
      });
    }

    // ── Identifier les 3 moments clés ──
    const moments = this._findKeyMoments();

    // ── Afficher les résultats ──
    this._renderResults(moments, playerEvals);

    if (progressWrap) progressWrap.classList.add('hidden');
    if (results)      results.classList.remove('hidden');
    this._analyzing = false;
  },

  /**
   * Arrête la revue en cours et ferme le modal.
   */
  stopReview() {
    this._analyzing = false;
    const modal = document.getElementById('modal-review');
    if (modal) modal.close();
  },

  // ── IDENTIFICATION DES MOMENTS CLÉS ──────────────────────

  _findKeyMoments() {
    const allSorted    = [...this._evalData].filter(m => m.loss > 10).sort((a, b) => b.loss - a.loss);
    const playerSorted = allSorted.filter(m => m.isPlayerMove);

    const used    = new Set();
    const moments = [];

    // 1. Le tournant : plus grand basculement (n'importe quel coup)
    for (const m of allSorted) {
      if (!used.has(m.moveIndex)) {
        moments.push({ ...m, label: 'Le tournant', desc: 'Le coup qui a fait basculer la partie' });
        used.add(m.moveIndex);
        break;
      }
    }

    // 2. La gaffe fatale : plus grande perte sur un coup du joueur
    for (const m of playerSorted) {
      if (!used.has(m.moveIndex)) {
        moments.push({ ...m, label: 'La gaffe fatale', desc: 'Le blunder le plus coûteux' });
        used.add(m.moveIndex);
        break;
      }
    }

    // 3. La meilleure défense ratée : perte du joueur dans une position équilibrée
    for (const m of playerSorted) {
      if (!used.has(m.moveIndex)) {
        moments.push({ ...m, label: 'Défense ratée', desc: 'La meilleure option non jouée' });
        used.add(m.moveIndex);
        break;
      }
    }

    return moments;
  },

  // ── RENDU DES RÉSULTATS ──────────────────────────────────

  _renderResults(moments, playerEvals) {
    this._renderEvalChart(playerEvals, moments);

    const container = document.getElementById('review-moments');
    if (!container) return;
    container.innerHTML = '';

    if (moments.length === 0) {
      container.innerHTML =
        '<p class="text-center text-gray-400 col-span-3">Aucune erreur significative détectée. Bien joué !</p>';
      return;
    }

    moments.forEach(m => {
      const card = document.createElement('div');
      card.className = 'review-moment-card';

      const moveNum = Math.floor(m.moveIndex / 2) + 1;
      const dot     = m.moveIndex % 2 === 0 ? `${moveNum}.` : `${moveNum}…`;

      // Convertir le meilleur coup UCI → SAN + extraire from/to
      let bestSan = '?';
      let bestFrom = null, bestTo = null;
      if (m.bestMove && m.bestMove.length >= 4) {
        bestFrom = m.bestMove.substring(0, 2);
        bestTo   = m.bestMove.substring(2, 4);
        try {
          const temp  = new Chess(m.fen);
          const promo = m.bestMove.length > 4 ? m.bestMove[4] : undefined;
          const obj   = temp.move({ from: bestFrom, to: bestTo, promotion: promo });
          if (obj) bestSan = obj.san;
        } catch (_) { bestSan = m.bestMove; }
      }

      // Extraire from/to du coup joué
      let playedFrom = null, playedTo = null;
      try {
        const temp = new Chess(m.fen);
        const obj  = temp.move(m.moveSan);
        if (obj) { playedFrom = obj.from; playedTo = obj.to; }
      } catch (_) {}

      const evBefore = (m.playerEvalBefore / 100).toFixed(1);
      const evAfter  = (m.playerEvalAfter  / 100).toFixed(1);

      card.innerHTML = `
        <h3 class="text-sm font-bold text-white">${m.label}</h3>
        <p class="text-xs text-gray-400">${m.desc}</p>
        <div id="mini-board-${m.moveIndex}" class="mini-board"></div>
        <div class="flex gap-4 text-xs mt-1">
          <span class="text-red-400 font-bold">Joué : ${dot} ${m.moveSan}</span>
          <span class="text-green-400 font-bold">Meilleur : ${bestSan}</span>
        </div>
        <div class="text-xs text-gray-300 mt-1">
          Eval : ${m.playerEvalBefore >= 0 ? '+' : ''}${evBefore}
          → ${m.playerEvalAfter >= 0 ? '+' : ''}${evAfter}
        </div>
      `;

      container.appendChild(card);
      this._renderMiniBoard(
        m.fen,
        document.getElementById(`mini-board-${m.moveIndex}`),
        playedFrom && playedTo ? { from: playedFrom, to: playedTo } : null,
        bestFrom && bestTo ? { from: bestFrom, to: bestTo } : null
      );
    });
  },

  // ── GRAPHIQUE D'ÉVALUATION (aires empilées style Chess.com) ──

  _renderEvalChart(playerEvals, moments) {
    const chart = document.getElementById('review-chart');
    if (!chart) return;
    chart.innerHTML = '';
    chart.style.maxHeight = 'none';
    chart.style.overflowY = 'visible';

    const playerColor = ChessEngine.getPlayerColor();
    const whiteEvals = playerEvals.map(ev => playerColor === 'w' ? ev : -ev);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;';
    chart.appendChild(wrapper);

    const W = 560, H = 180;
    const pad = { t: 5, b: 5 };
    const plotH = H - pad.t - pad.b;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'width:100%;height:auto;border-radius:8px;display:block;';
    wrapper.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const n = whiteEvals.length;
    if (n < 2) return;

    const evalToY = (cp) => {
      const pct = Math.max(5, Math.min(95, 50 + cp / 12));
      return pad.t + plotH * (1 - pct / 100);
    };
    const iToX = (i) => (i / (n - 1)) * W;

    // Aire blanche (avantage Blancs — haut)
    ctx.beginPath();
    ctx.moveTo(iToX(0), pad.t);
    for (let i = 0; i < n; i++) ctx.lineTo(iToX(i), evalToY(whiteEvals[i]));
    ctx.lineTo(iToX(n - 1), pad.t);
    ctx.closePath();
    ctx.fillStyle = '#f0d9b5';
    ctx.fill();

    // Aire noire (avantage Noirs — bas)
    ctx.beginPath();
    ctx.moveTo(iToX(0), pad.t + plotH);
    for (let i = 0; i < n; i++) ctx.lineTo(iToX(i), evalToY(whiteEvals[i]));
    ctx.lineTo(iToX(n - 1), pad.t + plotH);
    ctx.closePath();
    ctx.fillStyle = '#b58863';
    ctx.fill();

    // Ligne de séparation
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(iToX(i), evalToY(whiteEvals[i]));
      else ctx.lineTo(iToX(i), evalToY(whiteEvals[i]));
    }
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Points cliquables pour les moments clés
    if (moments && moments.length > 0) {
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      wrapper.appendChild(layer);

      const colors = ['#ef4444', '#f59e0b', '#3b82f6'];
      moments.forEach((m, idx) => {
        const evalIdx = m.moveIndex + 1;
        if (evalIdx >= n) return;
        const xPct = (iToX(evalIdx) / W) * 100;
        const yPct = (evalToY(whiteEvals[evalIdx]) / H) * 100;
        const dot  = document.createElement('div');
        dot.className = 'review-chart-dot';
        dot.style.cssText = `left:calc(${xPct}% - 7px);top:calc(${yPct}% - 7px);background:${colors[idx] || '#ef4444'};`;
        dot.title = m.label;
        dot.addEventListener('click', () => {
          const el = document.getElementById(`mini-board-${m.moveIndex}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        layer.appendChild(dot);
      });
    }
  },

  // ── MINI ÉCHIQUIER (avec flèches SVG animées) ─────────────

  /**
   * Rend un mini-échiquier avec flèches SVG optionnelles.
   * @param {string} fen
   * @param {HTMLElement} container
   * @param {{ from: string, to: string }|null} playedMove - flèche rouge
   * @param {{ from: string, to: string }|null} bestMove   - flèche verte
   */
  _renderMiniBoard(fen, container, playedMove, bestMove) {
    if (!container) return;
    const game  = new Chess(fen);
    const board = game.board();
    container.innerHTML = '';
    container.style.position = 'relative';

    const PIECES = {
      wK: '\u2654', wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658', wP: '\u2659',
      bK: '\u265A', bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E', bP: '\u265F',
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq    = document.createElement('div');
        sq.className = 'mini-sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        const piece = board[r][c];
        if (piece) {
          sq.textContent = PIECES[piece.color + piece.type.toUpperCase()] || '';
        }
        container.appendChild(sq);
      }
    }

    // Flèches SVG animées (rouge = coup joué, verte = meilleur coup)
    if (playedMove || bestMove) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 224 224');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';

      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      [['arrow-red', '#ef4444'], ['arrow-green', '#22c55e']].forEach(([id, fill]) => {
        const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        mk.setAttribute('id', id);
        mk.setAttribute('markerWidth', '8');
        mk.setAttribute('markerHeight', '6');
        mk.setAttribute('refX', '7');
        mk.setAttribute('refY', '3');
        mk.setAttribute('orient', 'auto');
        mk.setAttribute('fill', fill);
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        p.setAttribute('points', '0 0, 8 3, 0 6');
        mk.appendChild(p);
        defs.appendChild(mk);
      });
      svg.appendChild(defs);

      const toXY = (sq) => {
        const col = 'abcdefgh'.indexOf(sq[0]);
        const row = 8 - parseInt(sq[1], 10);
        return { x: col * 28 + 14, y: row * 28 + 14 };
      };

      const drawArrow = (from, to, color, markerId) => {
        const f = toXY(from), t = toXY(to);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', f.x); line.setAttribute('y1', f.y);
        line.setAttribute('x2', t.x); line.setAttribute('y2', t.y);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '4');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0.85');
        line.setAttribute('marker-end', `url(#${markerId})`);
        line.classList.add('mini-arrow-anim');
        svg.appendChild(line);
      };

      // Verte (meilleur coup) en premier, rouge (coup joué) par-dessus
      if (bestMove) drawArrow(bestMove.from, bestMove.to, '#22c55e', 'arrow-green');
      if (playedMove) drawArrow(playedMove.from, playedMove.to, '#ef4444', 'arrow-red');

      container.appendChild(svg);
    }
  },

};
