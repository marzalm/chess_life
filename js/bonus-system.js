// bonus-system.js
//
// Phase E.2 — in-game training bonus invocation.
// Owns puzzle-mode runtime state, delegates training-domain writes to
// PuzzleSystem, and coordinates the post-success Stockfish playback loop.
// No direct writes to CareerManager.training are allowed here.
//
// Puzzle sub-states:
// - awaiting-player: the board accepts player clicks toward the next
//   expected solution move.
// - awaiting-opponent: the next solution move is a forced opponent
//   reply that will auto-play after a short delay.
// - resolved: puzzle mode is closing or has already finished.

const BonusSystem = (() => {

  const OUTCOME_CARD_MS = 1500;
  const PLAYER_AUTO_MOVE_DELAY_MS = 1100;
  const PUZZLE_OPPONENT_DELAY_MS = 500;

  const _state = {
    puzzleMode: false,
    playbackActive: false,
    selectedSquare: null,
    activeTheme: null,
    activePuzzle: null,
    puzzleChess: null,
    solutionIndex: 0,
    pendingMoveBudget: 0,
    lastOutcome: null,
    puzzlePhase: 'resolved',
  };

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function _setPuzzleModeActive(active) {
    _state.puzzleMode = active;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('puzzle-mode', active);
    }
  }

  function _clearPuzzleState() {
    _state.selectedSquare = null;
    _state.activeTheme = null;
    _state.activePuzzle = null;
    _state.puzzleChess = null;
    _state.solutionIndex = 0;
    _state.pendingMoveBudget = 0;
  }

  function _uciFromSelection(from, to, puzzleChess) {
    const piece = puzzleChess ? puzzleChess.get(from) : null;
    const promotion = piece && piece.type === 'p' && (to[1] === '1' || to[1] === '8') ? 'q' : '';
    return `${from}${to}${promotion}`;
  }

  async function _showOutcomeCard(text) {
    const card = _getOutcomeCard();
    if (!card) {
      await _delay(OUTCOME_CARD_MS);
      return;
    }

    card.textContent = text;
    card.classList.remove('hidden');
    await _delay(OUTCOME_CARD_MS);
    card.classList.add('hidden');
  }

  function _showPuzzleBanner(theme) {
    const banner = _getPuzzleBanner();
    if (!banner) return;
    banner.textContent = `PUZZLE — ${PuzzleSystem.getThemeLabel(theme)} — Solve to activate`;
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

  return {
    init() {
      _clearPuzzleState();
      _state.playbackActive = false;
      _state.lastOutcome = null;
      _state.puzzlePhase = 'resolved';
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
      if (_state.puzzleMode || _state.playbackActive) return false;
      if (PuzzleSystem.getTrainingBonusCount(theme) < 1) return false;
      if (typeof ChessEngine === 'undefined') return false;
      if (ChessEngine.isGameOver()) return false;
      if (ChessEngine.getTurn() !== ChessEngine.getPlayerColor()) return false;
      if (typeof UIManager !== 'undefined') {
        if (UIManager._aiThinking) return false;
        if (UIManager._viewPly !== null) return false;
      }
      return true;
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

      _state.activeTheme = theme;
      _state.activePuzzle = puzzle;
      _state.puzzleChess = new Chess(puzzle.fen);
      _state.solutionIndex = 0;
      _state.selectedSquare = null;
      _state.pendingMoveBudget = this.getRewardMoveCount(theme);
      _state.puzzlePhase = 'awaiting-player';
      _setPuzzleModeActive(true);
      _showPuzzleBanner(theme);
      this.renderInventory();

      if (typeof UIManager !== 'undefined' && UIManager.enterPuzzleMode) {
        UIManager.enterPuzzleMode();
        UIManager.showStatus('Puzzle mode — solve to activate.');
      }

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_INVOKED, {
          source: 'training',
          theme,
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
        theme: _state.activeTheme,
        fen: _state.puzzleChess ? _state.puzzleChess.fen() : _state.activePuzzle.fen,
        solutionIndex: _state.solutionIndex,
        selectedSquare: _state.selectedSquare,
        legalTargets,
        captureTargets,
        status: _state.puzzlePhase,
        puzzleId: _state.activePuzzle.id,
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
      const theme = _state.activeTheme;
      const puzzleId = _state.activePuzzle ? _state.activePuzzle.id : null;
      const puzzleDifficulty = _state.activePuzzle ? _state.activePuzzle.difficulty : null;
      const themeLabel = theme ? PuzzleSystem.getThemeLabel(theme) : 'Puzzle';
      _setPuzzleModeActive(false);
      _hidePuzzleBanner();
      if (typeof UIManager !== 'undefined' && UIManager.exitPuzzleMode) {
        UIManager.exitPuzzleMode();
      }
      _state.lastOutcome = {
        source: 'training',
        theme,
        success: false,
        movesGranted: 0,
        puzzleId,
      };
      _clearPuzzleState();

      await _showOutcomeCard(`${themeLabel} failed. No reward.`);
      if (typeof UIManager !== 'undefined' && UIManager.showStatus && !ChessEngine.isGameOver()) {
        UIManager.showStatus('Your move.');
      }
      if (puzzleDifficulty != null) {
        PuzzleSystem.updatePuzzleRatingAfterAttempt(puzzleDifficulty, false);
      }

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_RESOLVED, {
          source: 'training',
          theme,
          success: false,
          movesGranted: 0,
          puzzleId,
        });
      }
      return false;
    },

    async resolvePuzzleSuccess() {
      _state.puzzlePhase = 'resolved';
      const theme = _state.activeTheme;
      const puzzleId = _state.activePuzzle ? _state.activePuzzle.id : null;
      const puzzleDifficulty = _state.activePuzzle ? _state.activePuzzle.difficulty : null;
      const themeLabel = theme ? PuzzleSystem.getThemeLabel(theme) : 'Puzzle';
      const movesGranted = _state.pendingMoveBudget;
      _setPuzzleModeActive(false);
      _hidePuzzleBanner();
      if (typeof UIManager !== 'undefined' && UIManager.exitPuzzleMode) {
        UIManager.exitPuzzleMode();
        UIManager.showStatus('Bonus active — Stockfish playing…');
      }
      _state.lastOutcome = {
        source: 'training',
        theme,
        success: true,
        movesGranted,
        puzzleId,
      };
      _clearPuzzleState();

      await _showOutcomeCard(`${themeLabel} solved! +${movesGranted} Stockfish moves`);
      await this._runPlayback(movesGranted);
      if (puzzleDifficulty != null) {
        PuzzleSystem.updatePuzzleRatingAfterAttempt(puzzleDifficulty, true);
      }

      if (typeof GameEvents !== 'undefined') {
        GameEvents.emit(GameEvents.EVENTS.BONUS_RESOLVED, {
          source: 'training',
          theme,
          success: true,
          movesGranted,
          puzzleId,
        });
      }
      return true;
    },

    getRewardMoveCount(theme) {
      const aptitude = PuzzleSystem.getAptitude(theme);
      let bonus = 0;
      if (aptitude > 80) bonus = 2;
      else if (aptitude > 50) bonus = 1;
      return 2 + bonus;
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
      const section = _getInventorySection();
      const wrap = _getInventoryButtonsWrap();
      if (!section || !wrap) return;

      const totalCount = _getTotalTrainingBonusCount();
      const chosenTheme = _pickNextTrainingBonusTheme();

      wrap.innerHTML = '';
      if (totalCount === 0) {
        section.classList.add('hidden');
        return;
      }

      section.classList.remove('hidden');
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
      wrap.appendChild(btn);
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
            const move = ChessEngine.makeMove(best.from, best.to, best.move && best.move.length > 4 ? best.move[4] : 'q');
            if (!move) break;
          }

          movesLeft -= 1;
          if (ChessEngine.isGameOver()) break;

          // Maia always replies after a player auto-move, even on the
          // last budgeted move. The budget counts player moves only.
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
