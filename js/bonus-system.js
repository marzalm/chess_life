// bonus-system.js
//
// Phase E.4 — in-game training + Flow bonus invocation.
// Owns puzzle-mode runtime state, Blitz Decay timing, Flow reveal cards,
// and the post-success Stockfish playback loop.
// No direct writes to CareerManager.training are allowed here.
//
// Puzzle sub-states:
// - awaiting-player: board accepts player clicks toward the next solution move
// - awaiting-opponent: forced opponent reply auto-plays after a short delay
// - resolved: puzzle mode is closing or has already finished

const BonusSystem = (() => {

  const OUTCOME_CARD_MS = 1500;
  const FLOW_REVEAL_CARD_MS = 500;
  const PLAYER_AUTO_MOVE_DELAY_MS = 1100;
  const PUZZLE_OPPONENT_DELAY_MS = 500;

  const BLITZ_DRAIN_BASE_MS = 27000;
  const BLITZ_DRAIN_EXPONENT = 1.25;
  const BLITZ_FAST_CUTOFF = 2 / 3;
  const BLITZ_MEDIUM_CUTOFF = 1 / 3;
  const BLITZ_FAST_BASE_MOVES = 3;
  const BLITZ_MEDIUM_BASE_MOVES = 2;
  const BLITZ_SLOW_BASE_MOVES = 1;

  const _state = {
    puzzleMode: false,
    playbackActive: false,
    selectedSquare: null,
    activeSource: null,
    activeTheme: null,
    themeHidden: false,
    activePuzzle: null,
    puzzleChess: null,
    solutionIndex: 0,
    pendingMoveBudget: 0,
    lastOutcome: null,
    puzzlePhase: 'resolved',
    puzzleStartTime: null,
    puzzleDrainMs: 0,
    fuseFill: 1,
    fuseTier: 'fast',
    fuseHandle: null,
    eventUnsubs: [],
  };

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function _nowMs() {
    return Date.now();
  }

  function _requestFrame(cb) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(_nowMs()), 16);
  }

  function _cancelFrame(handle) {
    if (!handle) return;
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
      return;
    }
    clearTimeout(handle);
  }

  function _getPuzzleBanner() {
    return document.getElementById('puzzle-mode-banner');
  }

  function _getOutcomeCard() {
    return document.getElementById('puzzle-outcome-card');
  }

  function _getInventorySection() {
    return document.getElementById('training-bonus-section');
  }

  function _getInventoryButtonsWrap() {
    return document.getElementById('training-bonus-buttons');
  }

  function _getFlowSection() {
    return document.getElementById('flow-bonus-section');
  }

  function _getFlowButtonsWrap() {
    return document.getElementById('flow-bonus-buttons');
  }

  function _getFuseBar() {
    return document.getElementById('puzzle-fuse-bar');
  }

  function _getFuseFill() {
    return document.getElementById('puzzle-fuse-fill');
  }

  function _setPuzzleModeActive(active) {
    _state.puzzleMode = active;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('puzzle-mode', active);
    }
  }

  function _clearPuzzleState() {
    _state.selectedSquare = null;
    _state.activeSource = null;
    _state.activeTheme = null;
    _state.themeHidden = false;
    _state.activePuzzle = null;
    _state.puzzleChess = null;
    _state.solutionIndex = 0;
    _state.pendingMoveBudget = 0;
    _state.puzzleStartTime = null;
    _state.puzzleDrainMs = 0;
    _state.fuseFill = 1;
    _state.fuseTier = 'fast';
    _stopFuseBar();
  }

  function _uciFromSelection(from, to, puzzleChess) {
    const piece = puzzleChess ? puzzleChess.get(from) : null;
    const promotion = piece && piece.type === 'p' && (to[1] === '1' || to[1] === '8') ? 'q' : '';
    return `${from}${to}${promotion}`;
  }

  function _playerSolutionLength(puzzle) {
    if (!puzzle || !Array.isArray(puzzle.solution) || puzzle.solution.length === 0) return 1;
    return Math.max(1, Math.ceil(puzzle.solution.length / 2));
  }

  function _getDrainMsForPuzzle(puzzle) {
    return Math.round(BLITZ_DRAIN_BASE_MS * Math.pow(_playerSolutionLength(puzzle), BLITZ_DRAIN_EXPONENT));
  }

  function _getTierFromFill(fill) {
    if (fill > BLITZ_FAST_CUTOFF) return 'fast';
    if (fill > BLITZ_MEDIUM_CUTOFF) return 'medium';
    return 'slow';
  }

  function _getBaseMovesForTier(tier) {
    if (tier === 'fast') return BLITZ_FAST_BASE_MOVES;
    if (tier === 'medium') return BLITZ_MEDIUM_BASE_MOVES;
    return BLITZ_SLOW_BASE_MOVES;
  }

  function _getBlitzSnapshot(nowMs = _nowMs()) {
    if (_state.puzzleStartTime == null || _state.puzzleDrainMs <= 0) {
      return {
        elapsedMs: 0,
        drainMs: 0,
        fill: 1,
        tier: 'fast',
        baseMoves: BLITZ_FAST_BASE_MOVES,
      };
    }

    const elapsedMs = Math.max(0, nowMs - _state.puzzleStartTime);
    const fill = Math.max(0, 1 - (elapsedMs / _state.puzzleDrainMs));
    const tier = _getTierFromFill(fill);
    return {
      elapsedMs,
      drainMs: _state.puzzleDrainMs,
      fill,
      tier,
      baseMoves: _getBaseMovesForTier(tier),
    };
  }

  function _renderFuseBar(snapshot = _getBlitzSnapshot()) {
    const bar = _getFuseBar();
    const fillEl = _getFuseFill();
    if (!bar || !fillEl) return;

    const pct = Math.max(0, Math.min(100, Math.round(snapshot.fill * 100)));
    fillEl.style.height = `${pct}%`;
    fillEl.style.background = 'linear-gradient(to top, var(--px-red) 0%, #facc15 50%, var(--px-green) 100%)';
    bar.classList.toggle('hidden', !_state.puzzleMode);
    bar.classList.toggle('empty', pct <= 0);
    bar.dataset.tier = snapshot.tier;
    fillEl.dataset.tier = snapshot.tier;
  }

  function _tickFuseBar() {
    if (!_state.puzzleMode) return;
    const snapshot = _getBlitzSnapshot();
    _state.fuseFill = snapshot.fill;
    _state.fuseTier = snapshot.tier;
    _renderFuseBar(snapshot);

    if (snapshot.fill <= 0) {
      _state.fuseHandle = null;
      return;
    }

    _state.fuseHandle = _requestFrame(() => _tickFuseBar());
  }

  function _startFuseBar(puzzle) {
    _stopFuseBar();
    _state.puzzleStartTime = _nowMs();
    _state.puzzleDrainMs = _getDrainMsForPuzzle(puzzle);
    _state.fuseFill = 1;
    _state.fuseTier = 'fast';
    _renderFuseBar({
      elapsedMs: 0,
      drainMs: _state.puzzleDrainMs,
      fill: 1,
      tier: 'fast',
      baseMoves: BLITZ_FAST_BASE_MOVES,
    });
    _state.fuseHandle = _requestFrame(() => _tickFuseBar());
  }

  function _stopFuseBar() {
    _cancelFrame(_state.fuseHandle);
    _state.fuseHandle = null;
    const bar = _getFuseBar();
    const fillEl = _getFuseFill();
    if (bar) {
      bar.classList.add('hidden');
      bar.classList.remove('empty');
      delete bar.dataset.tier;
    }
    if (fillEl) {
      fillEl.style.height = '0%';
      delete fillEl.dataset.tier;
    }
  }

  async function _showOutcomeCardText(text, ms = OUTCOME_CARD_MS) {
    const card = _getOutcomeCard();
    if (!card) {
      await _delay(ms);
      return;
    }

    card.textContent = text;
    card.classList.remove('hidden');
    await _delay(ms);
    card.classList.add('hidden');
  }

  async function _showFlowOutcomeSequence(revealText, breakdownText) {
    const card = _getOutcomeCard();
    if (!card) {
      await _delay(FLOW_REVEAL_CARD_MS + OUTCOME_CARD_MS);
      return;
    }

    card.textContent = revealText;
    card.classList.remove('hidden');
    await _delay(FLOW_REVEAL_CARD_MS);
    card.textContent = breakdownText;
    await _delay(OUTCOME_CARD_MS);
    card.classList.add('hidden');
  }

  function _showPuzzleBanner(text) {
    const banner = _getPuzzleBanner();
    if (!banner) return;
    banner.innerHTML = text;
    banner.classList.remove('hidden');
  }

  function _hidePuzzleBanner() {
    const banner = _getPuzzleBanner();
    if (!banner) return;
    banner.classList.add('hidden');
  }

  function _getTotalTrainingBonusCount() {
    return PuzzleSystem.getThemes().reduce(
      (sum, theme) => sum + PuzzleSystem.getTrainingBonusCount(theme),
      0,
    );
  }

  function _getTurnLabelFromFen(fen) {
    const parts = String(fen || '').split(' ');
    return parts[1] === 'b' ? 'Black to move' : 'White to move';
  }

  function _pickNextTrainingBonusTheme() {
    const ranked = PuzzleSystem.getThemes()
      .map((theme) => ({
        theme,
        count: PuzzleSystem.getTrainingBonusCount(theme),
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.theme.localeCompare(b.theme);
      });

    return ranked.length > 0 ? ranked[0].theme : null;
  }

  function _applySolutionMove(uci) {
    if (!_state.puzzleChess || !uci) return false;
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length > 4 ? uci[4] : 'q';
    const move = _state.puzzleChess.move({ from, to, promotion });
    return Boolean(move);
  }

  function _getCoachBonus(theme) {
    if (typeof StaffSystem !== 'undefined' &&
        StaffSystem.getCurrentCoachBonusMoves) {
      return StaffSystem.getCurrentCoachBonusMoves(theme) || 0;
    }
    return 0;
  }

  function _getAptitudeBonus(theme) {
    const aptitude = PuzzleSystem.getAptitude(theme);
    if (aptitude > 80) return 2;
    if (aptitude > 50) return 1;
    return 0;
  }

  function _formatOutcomeBreakdown({
    source,
    theme,
    success,
    tier,
    baseMoves,
    coachBonus,
    aptitudeBonus,
    totalMoves,
    puzzleDifficulty,
  }) {
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const lines = [];
    if (source === 'flow') {
      lines.push(`Result: ${success ? 'Success' : 'Failed'}`);
      lines.push(`Tier: ${tierLabel}`);
      if (success) {
        lines.push(`Base: ${baseMoves}`);
        lines.push(`Coach: +${coachBonus}`);
        lines.push(`Aptitude: +${aptitudeBonus}`);
        lines.push(`Total: ${totalMoves} Stockfish moves`);
      } else {
        lines.push('Reward: 0');
      }
      if (typeof puzzleDifficulty === 'number') {
        lines.push(`Puzzle rating: ${puzzleDifficulty}`);
      }
      return lines.join('\n');
    }

    if (success) {
      return `Puzzle solved! ${tierLabel} tier\nBase ${baseMoves} + Coach ${coachBonus} + Aptitude ${aptitudeBonus} = ${totalMoves} Stockfish moves`;
    }
    return `Puzzle failed. No reward.\nTier at failure: ${tierLabel}`;
  }

  async function _advancePuzzleSequenceFromCurrentIndex() {
    if (!_state.puzzleMode || !_state.activePuzzle) return;

    if (_state.solutionIndex >= _state.activePuzzle.solution.length) {
      _state.puzzlePhase = 'resolved';
      await BonusSystem.resolvePuzzleSuccess();
      return;
    }

    if (_state.solutionIndex % 2 === 1) {
      _state.puzzlePhase = 'awaiting-opponent';
      if (typeof UIManager !== 'undefined' && UIManager.renderBoard) {
        UIManager.renderBoard();
      }
      await _delay(PUZZLE_OPPONENT_DELAY_MS);
      if (!_state.puzzleMode || _state.puzzlePhase !== 'awaiting-opponent') return;

      const reply = _state.activePuzzle.solution[_state.solutionIndex];
      if (!_applySolutionMove(reply)) {
        await BonusSystem.resolvePuzzleFailure();
        return;
      }

      _state.solutionIndex += 1;
      _state.selectedSquare = null;
      if (typeof UIManager !== 'undefined' && UIManager.renderBoard) {
        UIManager.renderBoard();
      }

      if (_state.solutionIndex >= _state.activePuzzle.solution.length) {
        _state.puzzlePhase = 'resolved';
        await BonusSystem.resolvePuzzleSuccess();
        return;
      }
    }

    _state.puzzlePhase = 'awaiting-player';
    if (typeof UIManager !== 'undefined' && UIManager.renderBoard) {
      UIManager.renderBoard();
    }
  }

  function _commonInvokeGuards() {
    if (_state.puzzleMode || _state.playbackActive) return false;
    if (typeof ChessEngine === 'undefined') return false;
    if (ChessEngine.isGameOver()) return false;
    if (ChessEngine.getTurn() !== ChessEngine.getPlayerColor()) return false;
    if (typeof UIManager !== 'undefined') {
      if (UIManager._aiThinking) return false;
      if (UIManager._viewPly !== null) return false;
    }
    return true;
  }

  function _enterPuzzleMode({ source, theme, themeHidden, puzzle }) {
    _state.activeSource = source;
    _state.activeTheme = theme;
    _state.themeHidden = Boolean(themeHidden);
    _state.activePuzzle = puzzle;
    _state.puzzleChess = new Chess(puzzle.fen);
    _state.solutionIndex = 0;
    _state.selectedSquare = null;
    _state.pendingMoveBudget = 0;
    _state.puzzlePhase = 'awaiting-player';
    _setPuzzleModeActive(true);
    const turnLabel = _getTurnLabelFromFen(puzzle.fen);
    _showPuzzleBanner(
      themeHidden
        ? `<span class="puzzle-banner-main">PUZZLE — Unknown theme</span><span class="puzzle-banner-turn">${turnLabel}</span>`
        : `<span class="puzzle-banner-main">PUZZLE — ${PuzzleSystem.getThemeLabel(theme)}</span><span class="puzzle-banner-turn">${turnLabel}</span>`,
    );
    _startFuseBar(puzzle);
    this.renderInventory();

    if (typeof UIManager !== 'undefined' && UIManager.enterPuzzleMode) {
      UIManager.enterPuzzleMode();
      UIManager.showStatus('Puzzle mode — solve to activate.');
    }
  }

  return {
    init() {
      _clearPuzzleState();
      _state.playbackActive = false;
      _state.lastOutcome = null;
      _state.puzzlePhase = 'resolved';
      _state.eventUnsubs.forEach((off) => off());
      _state.eventUnsubs = [];

      if (typeof GameEvents !== 'undefined' && GameEvents.on && GameEvents.EVENTS) {
        _state.eventUnsubs.push(
          GameEvents.on(GameEvents.EVENTS.FLOW_BONUS_EARNED, () => {
            if (PuzzleSystem.earnFlowBonus && PuzzleSystem.earnFlowBonus()) {
              this.renderInventory();
            } else {
              this.renderInventory();
            }
          }),
        );
      }

      this.renderInventory();
    },

    getInventory() {
      const inventory = {};
      for (const theme of PuzzleSystem.getThemes()) {
        const count = PuzzleSystem.getTrainingBonusCount(theme);
        if (count > 0) inventory[theme] = count;
      }
      return inventory;
    },

    canInvokeBonus(theme) {
      if (!_commonInvokeGuards()) return false;
      return PuzzleSystem.getTrainingBonusCount(theme) >= 1;
    },

    canInvokeFlowBonus() {
      if (!_commonInvokeGuards()) return false;
      return typeof PuzzleSystem.hasFlowBonus === 'function'
        ? PuzzleSystem.hasFlowBonus()
        : false;
    },

    invokeNextAvailableTrainingBonus() {
      const theme = _pickNextTrainingBonusTheme();
      if (!theme) return false;
      return this.invokeBonus(theme);
    },

    invokeBonus(theme) {
      if (!this.canInvokeBonus(theme)) return false;

      const preferredColor = typeof ChessEngine !== 'undefined' && ChessEngine.getPlayerColor
        ? ChessEngine.getPlayerColor()
        : null;
      const puzzle = PuzzleSystem.pickInGamePuzzle(theme, preferredColor);
      if (!puzzle) return false;
      if (!PuzzleSystem.consumeTrainingBonus(theme)) return false;

      _enterPuzzleMode.call(this, {
        source: 'training',
        theme,
        themeHidden: false,
        puzzle,
      });

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_INVOKED, {
          source: 'training',
          theme,
        });
      }

      return true;
    },

    invokeFlowBonus() {
      if (!this.canInvokeFlowBonus()) return false;
      const preferredColor = typeof ChessEngine !== 'undefined' && ChessEngine.getPlayerColor
        ? ChessEngine.getPlayerColor()
        : null;
      const puzzle = PuzzleSystem.pickFlowPuzzle
        ? PuzzleSystem.pickFlowPuzzle(preferredColor)
        : null;
      if (!puzzle) return false;
      if (!PuzzleSystem.consumeFlowBonus || !PuzzleSystem.consumeFlowBonus()) return false;

      _enterPuzzleMode.call(this, {
        source: 'flow',
        theme: puzzle.theme,
        themeHidden: true,
        puzzle,
      });

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_INVOKED, {
          source: 'flow',
        });
      }

      return true;
    },

    isInPuzzleMode() {
      return _state.puzzleMode;
    },

    isPlaybackActive() {
      return _state.playbackActive;
    },

    getPuzzleState() {
      if (!_state.puzzleMode || !_state.activePuzzle) return null;
      let legalTargets = [];
      let captureTargets = [];
      if (_state.puzzleChess && _state.selectedSquare) {
        const moves = _state.puzzleChess.moves({ square: _state.selectedSquare, verbose: true });
        legalTargets = moves.map((move) => move.to);
        captureTargets = moves
          .filter((move) => move.flags.includes('c') || move.flags.includes('e'))
          .map((move) => move.to);
      }
      return {
        source: _state.activeSource,
        theme: _state.themeHidden ? null : _state.activeTheme,
        hiddenTheme: _state.themeHidden,
        fen: _state.puzzleChess ? _state.puzzleChess.fen() : _state.activePuzzle.fen,
        solutionIndex: _state.solutionIndex,
        selectedSquare: _state.selectedSquare,
        legalTargets,
        captureTargets,
        status: _state.puzzlePhase,
        puzzleId: _state.activePuzzle.id,
        fuseFill: _state.fuseFill,
        fuseTier: _state.fuseTier,
        drainMs: _state.puzzleDrainMs,
      };
    },

    onPuzzleClick(square) {
      if (!_state.puzzleMode || !_state.puzzleChess) return false;
      if (_state.puzzlePhase !== 'awaiting-player') return false;

      const piece = _state.puzzleChess.get(square);
      const turn = _state.puzzleChess.turn();

      if (piece && piece.color === turn) {
        _state.selectedSquare = square;
        return true;
      }

      if (!_state.selectedSquare) return false;

      const from = _state.selectedSquare;
      const uci = _uciFromSelection(from, square, _state.puzzleChess);
      const expected = _state.activePuzzle.solution[_state.solutionIndex];
      _state.selectedSquare = null;

      if (uci !== expected) {
        void this.resolvePuzzleFailure();
        return false;
      }

      const promotion = uci.length > 4 ? uci[4] : 'q';
      const move = _state.puzzleChess.move({ from, to: square, promotion });
      if (!move) {
        void this.resolvePuzzleFailure();
        return false;
      }

      _state.solutionIndex += 1;
      void _advancePuzzleSequenceFromCurrentIndex();
      return true;
    },

    async resolvePuzzleFailure() {
      _state.puzzlePhase = 'resolved';
      const source = _state.activeSource;
      const theme = _state.activeTheme;
      const puzzleId = _state.activePuzzle ? _state.activePuzzle.id : null;
      const puzzleDifficulty = _state.activePuzzle ? _state.activePuzzle.difficulty : null;
      const themeLabel = theme ? PuzzleSystem.getThemeLabel(theme) : 'Puzzle';
      const blitz = _getBlitzSnapshot();

      _setPuzzleModeActive(false);
      _hidePuzzleBanner();
      if (typeof UIManager !== 'undefined' && UIManager.exitPuzzleMode) {
        UIManager.exitPuzzleMode();
      }
      _state.lastOutcome = {
        source,
        theme,
        success: false,
        movesGranted: 0,
        puzzleId,
        tier: blitz.tier,
      };
      _clearPuzzleState();
      if (source === 'flow' && PuzzleSystem.clearFlowBonus) {
        PuzzleSystem.clearFlowBonus();
      }

      const breakdown = _formatOutcomeBreakdown({
        source,
        theme,
        success: false,
        tier: blitz.tier,
        baseMoves: 0,
        coachBonus: 0,
        aptitudeBonus: 0,
        totalMoves: 0,
        puzzleDifficulty,
      });

      if (source === 'flow') {
        await _showFlowOutcomeSequence(`Theme revealed: ${String(themeLabel).toUpperCase()}`, breakdown);
      } else {
        await _showOutcomeCardText(breakdown);
      }

      if (typeof UIManager !== 'undefined' && UIManager.showStatus && !ChessEngine.isGameOver()) {
        UIManager.showStatus('Your move.');
      }
      if (theme && puzzleDifficulty != null) {
        PuzzleSystem.updatePuzzleRatingAfterAttempt(theme, puzzleDifficulty, false);
      }

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_RESOLVED, {
          source,
          theme,
          success: false,
          movesGranted: 0,
          puzzleId,
        });
      }
      this.renderInventory();
      return false;
    },

    async resolvePuzzleSuccess() {
      _state.puzzlePhase = 'resolved';
      const source = _state.activeSource;
      const theme = _state.activeTheme;
      const puzzleId = _state.activePuzzle ? _state.activePuzzle.id : null;
      const puzzleDifficulty = _state.activePuzzle ? _state.activePuzzle.difficulty : null;
      const themeLabel = theme ? PuzzleSystem.getThemeLabel(theme) : 'Puzzle';
      const blitz = _getBlitzSnapshot();
      const coachBonus = _getCoachBonus(theme);
      const aptitudeBonus = _getAptitudeBonus(theme);
      const movesGranted = this.getRewardMoveCount(theme, blitz.baseMoves);

      _setPuzzleModeActive(false);
      _hidePuzzleBanner();
      if (typeof UIManager !== 'undefined' && UIManager.exitPuzzleMode) {
        UIManager.exitPuzzleMode();
        UIManager.showStatus('Bonus active — Stockfish playing…');
      }
      _state.lastOutcome = {
        source,
        theme,
        success: true,
        movesGranted,
        puzzleId,
        tier: blitz.tier,
      };
      _clearPuzzleState();
      if (source === 'flow' && PuzzleSystem.clearFlowBonus) {
        PuzzleSystem.clearFlowBonus();
      }

      const breakdown = _formatOutcomeBreakdown({
        source,
        theme,
        success: true,
        tier: blitz.tier,
        baseMoves: blitz.baseMoves,
        coachBonus,
        aptitudeBonus,
        totalMoves: movesGranted,
        puzzleDifficulty,
      });

      if (source === 'flow') {
        await _showFlowOutcomeSequence(`Theme revealed: ${String(themeLabel).toUpperCase()}`, breakdown);
      } else {
        await _showOutcomeCardText(breakdown);
      }

      await this._runPlayback(movesGranted);
      if (theme && puzzleDifficulty != null) {
        PuzzleSystem.updatePuzzleRatingAfterAttempt(theme, puzzleDifficulty, true);
      }

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_RESOLVED, {
          source,
          theme,
          success: true,
          movesGranted,
          puzzleId,
        });
      }
      this.renderInventory();
      return true;
    },

    getRewardMoveCount(theme, tierBaseMoves = BLITZ_MEDIUM_BASE_MOVES) {
      return tierBaseMoves + _getAptitudeBonus(theme) + _getCoachBonus(theme);
    },

    // Debug-only helpers. Call from cl.bonus in the devtools console
    // to validate resolution flows without solving puzzles manually.
    debugForcePuzzleSuccess() {
      if (!_state.puzzleMode || !_state.activePuzzle) return false;
      console.warn('[BonusSystem] Debug forcing puzzle success');
      _state.solutionIndex = _state.activePuzzle.solution.length;
      void this.resolvePuzzleSuccess();
      return true;
    },

    debugForcePuzzleFailure() {
      if (!_state.puzzleMode || !_state.activePuzzle) return false;
      console.warn('[BonusSystem] Debug forcing puzzle failure');
      void this.resolvePuzzleFailure();
      return true;
    },

    renderInventory() {
      const trainingSection = _getInventorySection();
      const trainingWrap = _getInventoryButtonsWrap();
      const flowSection = _getFlowSection();
      const flowWrap = _getFlowButtonsWrap();
      if (!trainingSection || !trainingWrap || !flowSection || !flowWrap) return;

      const totalCount = _getTotalTrainingBonusCount();
      const chosenTheme = _pickNextTrainingBonusTheme();
      const hasFlowBonus = PuzzleSystem.hasFlowBonus ? PuzzleSystem.hasFlowBonus() : false;

      trainingWrap.innerHTML = '';
      if (totalCount === 0) {
        trainingSection.classList.add('hidden');
      } else {
        trainingSection.classList.remove('hidden');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'training-bonus-btn';
        btn.textContent = `Training bonus (${totalCount})`;
        btn.disabled = !chosenTheme || !this.canInvokeBonus(chosenTheme);
        btn.addEventListener('click', () => {
          if (this.invokeNextAvailableTrainingBonus() && typeof SoundManager !== 'undefined' && SoundManager.playSFActivate) {
            SoundManager.playSFActivate();
          }
        });
        trainingWrap.appendChild(btn);
      }

      flowWrap.innerHTML = '';
      if (!hasFlowBonus) {
        flowSection.classList.add('hidden');
      } else {
        flowSection.classList.remove('hidden');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'training-bonus-btn flow-bonus-btn';
        btn.textContent = 'Flow bonus (1)';
        btn.disabled = !this.canInvokeFlowBonus();
        btn.addEventListener('click', () => {
          if (this.invokeFlowBonus() && typeof SoundManager !== 'undefined' && SoundManager.playSFActivate) {
            SoundManager.playSFActivate();
          }
        });
        flowWrap.appendChild(btn);
      }
    },

    async _runPlayback(moveBudget) {
      _state.playbackActive = true;
      try {
        if (typeof FocusSystem !== 'undefined' && FocusSystem.pauseForPlayback) {
          FocusSystem.pauseForPlayback();
        }
        if (typeof UIManager !== 'undefined' && UIManager.lockInputForPlayback) {
          UIManager.lockInputForPlayback();
        }

        let movesLeft = moveBudget;
        while (movesLeft > 0 && !ChessEngine.isGameOver()) {
          await _delay(PLAYER_AUTO_MOVE_DELAY_MS);
          const best = await ChessEngine.getBestMove();
          if (!best) break;

          if (typeof UIManager !== 'undefined' && UIManager.applyPlaybackMove) {
            const ok = UIManager.applyPlaybackMove(best);
            if (!ok) break;
          } else {
            const move = ChessEngine.makeMove(
              best.from,
              best.to,
              best.move && best.move.length > 4 ? best.move[4] : 'q',
            );
            if (!move) break;
          }

          movesLeft -= 1;
          if (ChessEngine.isGameOver()) break;

          if (typeof UIManager !== 'undefined' && UIManager.triggerAIMoveAndWait) {
            await UIManager.triggerAIMoveAndWait();
          }
          if (ChessEngine.isGameOver()) break;
        }
      } finally {
        if (typeof UIManager !== 'undefined' && UIManager.unlockInputAfterPlayback) {
          UIManager.unlockInputAfterPlayback();
        }
        if (typeof FocusSystem !== 'undefined' && FocusSystem.resumeFromPlayback) {
          FocusSystem.resumeFromPlayback();
        }
        _state.playbackActive = false;
        this.renderInventory();
        if (typeof UIManager !== 'undefined' && UIManager.showStatus && !ChessEngine.isGameOver()) {
          UIManager.showStatus('Your move.');
        }
      }
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.bonus = BonusSystem;
}
