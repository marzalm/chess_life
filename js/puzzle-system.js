// puzzle-system.js
//
// Phase E.1 scope: sessions accept boolean pass/fail from callers.
// This module does NOT validate chess moves in E.1 — tests, debug
// hooks, and later UI components decide whether a puzzle was solved
// and pass the result here. Move validation against the FEN solution
// ships in E.2.
//
// Pure logic, no DOM. Owns puzzle selection, seen-puzzle tracking,
// reinforcement queues, aptitude growth, and training bonus charges.

const PuzzleSystem = (() => {

  const THEMES = [
    'fork',
    'pin',
    'skewer',
    'discoveredAttack',
    'hangingPiece',
    'sacrifice',
    'trappedPiece',
    'attackingF2F7',
    'mateIn1',
    'mateIn2',
    'backRankMate',
    'opening',
    'middlegame',
    'endgame',
    'deflection',
    'attraction',
    'ruyLopez',
    'sicilianDefense',
    'frenchDefense',
    'caroKannDefense',
    'italianGame',
    'queensPawnGame',
  ];

  const THEME_LABELS = {
    fork: 'Fork',
    pin: 'Pin',
    skewer: 'Skewer',
    discoveredAttack: 'Discovered attack',
    hangingPiece: 'Hanging piece',
    sacrifice: 'Sacrifice',
    trappedPiece: 'Trapped piece',
    attackingF2F7: 'Attacking f2/f7',
    mateIn1: 'Mate in 1',
    mateIn2: 'Mate in 2',
    backRankMate: 'Back-rank mate',
    opening: 'Opening',
    middlegame: 'Middlegame',
    endgame: 'Endgame',
    deflection: 'Deflection',
    attraction: 'Attraction',
    ruyLopez: 'Ruy Lopez',
    sicilianDefense: 'Sicilian Defense',
    frenchDefense: 'French Defense',
    caroKannDefense: 'Caro-Kann Defense',
    italianGame: 'Italian Game',
    queensPawnGame: "Queen's Pawn Game",
  };

  const DEFAULT_SESSION_SIZE = 5;
  const DEFAULT_PASS_THRESHOLD = 3;

  /** @type {Map<string, object>} */
  const _sessions = new Map();
  let _sessionSeq = 1;

  function _ensureTheme(theme) {
    if (!THEMES.includes(theme)) {
      throw new Error(`[PuzzleSystem] Unknown theme: ${theme}`);
    }
  }

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _getTrainingState() {
    if (typeof CareerManager === 'undefined') {
      throw new Error('[PuzzleSystem] CareerManager is required');
    }
    return CareerManager.training.get();
  }

  function _normalizeTrainingState() {
    const training = _getTrainingState();
    if (!training.aptitudes) training.aptitudes = {};
    if (!training.seenPuzzleIds) training.seenPuzzleIds = {};
    if (!training.reinforcementQueues) training.reinforcementQueues = {};
    if (!training.trainingBonuses) training.trainingBonuses = {};
    if (!training.flowBonus) {
      training.flowBonus = { earned: false, reservedPuzzleId: null };
    }
    if (typeof training.puzzleRating !== 'number') training.puzzleRating = 500;
    if (typeof training.puzzleRatingRd !== 'number') training.puzzleRatingRd = 300;
    if (!training.stats) {
      training.stats = {
        sessionsCompleted: 0,
        sessionsPassed: 0,
        puzzlesAttempted: 0,
        puzzlesSolvedAllTime: 0,
        reinforcementPuzzlesSolved: 0,
        bonusesUsedTraining: 0,
        bonusesUsedFlow: 0,
        byTheme: {},
      };
    }
    if (!training.stats.byTheme) training.stats.byTheme = {};

    THEMES.forEach((theme) => {
      if (training.aptitudes[theme] == null) training.aptitudes[theme] = 0;
      if (!Array.isArray(training.reinforcementQueues[theme])) {
        training.reinforcementQueues[theme] = [];
      }
      if (training.trainingBonuses[theme] == null) training.trainingBonuses[theme] = 0;
      if (!training.stats.byTheme[theme]) {
        training.stats.byTheme[theme] = {
          solvedThemePuzzles: 0,
          reinforcedResolves: 0,
        };
      } else {
        if (training.stats.byTheme[theme].solvedThemePuzzles == null) {
          training.stats.byTheme[theme].solvedThemePuzzles = 0;
        }
        if (training.stats.byTheme[theme].reinforcedResolves == null) {
          training.stats.byTheme[theme].reinforcedResolves = 0;
        }
      }
    });
  }

  function _getThemeStats(training, theme) {
    if (!training.stats.byTheme[theme]) {
      training.stats.byTheme[theme] = {
        solvedThemePuzzles: 0,
        reinforcedResolves: 0,
      };
    }
    return training.stats.byTheme[theme];
  }

  function _getPlayerElo() {
    if (typeof CareerManager !== 'undefined' &&
        CareerManager.player &&
        typeof CareerManager.player.get === 'function') {
      return CareerManager.player.get().elo;
    }
    return 800;
  }

  function _puzzleTurnColor(puzzle) {
    // puzzle-data.js stores post-setup FENs normalized at extraction
    // time, so the side-to-move here is the player's color, not the
    // opponent's setup color from the raw Lichess CSV row.
    const parts = String(puzzle.fen || '').split(' ');
    return parts[1] === 'b' ? 'b' : 'w';
  }

  function _getPuzzleRatingWindow(training) {
    const targetRating = training.puzzleRating;
    const rd = training.puzzleRatingRd;
    const window = Math.max(150, Math.round(rd * 1.2));
    return { targetRating, rd, window };
  }

  function _hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function _sortKey(theme, puzzleId) {
    return _hash(`${theme}:${puzzleId}`);
  }

  function _getThemePool(theme) {
    if (typeof PUZZLES === 'undefined' || !Array.isArray(PUZZLES)) {
      throw new Error('[PuzzleSystem] PUZZLES data is not loaded');
    }
    return PUZZLES.filter((p) => p.theme === theme);
  }

  function _findPuzzleById(puzzleId) {
    return PUZZLES.find((p) => p.id === puzzleId) || null;
  }

  function _findQueueEntry(training, theme, puzzleId) {
    return training.reinforcementQueues[theme].find((entry) => entry.puzzleId === puzzleId) || null;
  }

  function _markSeen(training, puzzleId) {
    training.seenPuzzleIds[puzzleId] = 1;
  }

  function _recalculateAptitude(training, theme) {
    const stats = _getThemeStats(training, theme);
    training.aptitudes[theme] = Math.min(
      100,
      Math.floor(stats.solvedThemePuzzles * 1.5 + stats.reinforcedResolves * 2),
    );
  }

  function _queuePuzzleFailure(training, theme, puzzleId) {
    const existing = _findQueueEntry(training, theme, puzzleId);
    if (existing) {
      existing.state = 'active';
      existing.confirmations = 0;
      return;
    }
    training.reinforcementQueues[theme].push({
      puzzleId,
      state: 'active',
      confirmations: 0,
    });
  }

  function _handleQueuedSolve(training, theme, puzzleId) {
    const entry = _findQueueEntry(training, theme, puzzleId);
    if (!entry) return false;

    training.stats.reinforcementPuzzlesSolved += 1;
    const stats = _getThemeStats(training, theme);
    stats.reinforcedResolves += 1;

    if (entry.state === 'active') {
      entry.state = 'pending-confirmation';
      entry.confirmations = 1;
      return true;
    }

    entry.confirmations += 1;
    if (entry.confirmations >= 2) {
      training.reinforcementQueues[theme] =
        training.reinforcementQueues[theme].filter((item) => item.puzzleId !== puzzleId);
    }
    return true;
  }

  function _pickNewThemePuzzles(theme, needed, training, options = {}) {
    const queuedIds = new Set(training.reinforcementQueues[theme].map((entry) => entry.puzzleId));
    const basePool = _getThemePool(theme)
      .filter((p) => !queuedIds.has(p.id))
      .slice()
      .sort((a, b) => _sortKey(theme, a.id) - _sortKey(theme, b.id));
    const preferredColor = options.preferredColor || null;
    const colorMatchedPool = preferredColor
      ? basePool.filter((puzzle) => _puzzleTurnColor(puzzle) === preferredColor)
      : basePool;
    const pool = colorMatchedPool.length > 0 ? colorMatchedPool : basePool;
    const { targetRating, window } = _getPuzzleRatingWindow(training);

    const ranked = pool.map((puzzle) => {
      const seen = Boolean(training.seenPuzzleIds[puzzle.id]);
      const inWindow = Math.abs(puzzle.difficulty - targetRating) <= window;
      let bucket = 3;
      if (!seen && inWindow) bucket = 0;
      else if (!seen) bucket = 1;
      else if (inWindow) bucket = 2;

      return { puzzle, bucket };
    });

    ranked.sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      const aDistance = Math.abs(a.puzzle.difficulty - targetRating);
      const bDistance = Math.abs(b.puzzle.difficulty - targetRating);
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }
      return _sortKey(theme, a.puzzle.id) - _sortKey(theme, b.puzzle.id);
    });

    return ranked.slice(0, needed).map((entry) => entry.puzzle);
  }

  function _pickReinforcementPuzzle(theme, training) {
    const queue = training.reinforcementQueues[theme] || [];
    for (const entry of queue) {
      const puzzle = _findPuzzleById(entry.puzzleId);
      if (puzzle) return puzzle;
    }
    return null;
  }

  function _buildSession(theme, puzzles, options) {
    const id = `puzzle_session_${_sessionSeq++}`;
    const session = {
      id,
      theme,
      size: puzzles.length,
      passThreshold: options.passThreshold ?? DEFAULT_PASS_THRESHOLD,
      currentIndex: 0,
      status: 'active',
      puzzles: puzzles.map((puzzle) => ({
        id: puzzle.id,
        theme: puzzle.theme,
        difficulty: puzzle.difficulty,
        source: puzzle.source,
        fen: puzzle.fen,
        solution: [...puzzle.solution],
        reinforcement: Boolean(options.reinforcementIds && options.reinforcementIds.has(puzzle.id)),
      })),
      answers: [],
    };
    _sessions.set(id, session);
    return session;
  }

  return {
    init() {
      _normalizeTrainingState();
      CareerManager.save();
    },

    getThemes() {
      return [...THEMES];
    },

    getThemeLabel(theme) {
      _ensureTheme(theme);
      return THEME_LABELS[theme];
    },

    getAptitude(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _getTrainingState().aptitudes[theme];
    },

    getTrainingBonusCount(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _getTrainingState().trainingBonuses[theme];
    },

    getPuzzleRating() {
      _normalizeTrainingState();
      return _getTrainingState().puzzleRating;
    },

    getPuzzleRatingRd() {
      _normalizeTrainingState();
      return _getTrainingState().puzzleRatingRd;
    },

    getReinforcementQueue(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _clone(_getTrainingState().reinforcementQueues[theme]);
    },

    pickInGamePuzzle(theme, preferredColor = null) {
      _ensureTheme(theme);
      _normalizeTrainingState();

      const training = _getTrainingState();
      let puzzle = _pickReinforcementPuzzle(theme, training);

      if (!puzzle) {
        const fresh = _pickNewThemePuzzles(theme, 1, training, { preferredColor });
        puzzle = fresh.length > 0 ? fresh[0] : null;
      }

      if (!puzzle) return null;

      _markSeen(training, puzzle.id);
      CareerManager.save();
      return _clone(puzzle);
    },

    consumeTrainingBonus(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();

      const training = _getTrainingState();
      if ((training.trainingBonuses[theme] || 0) < 1) {
        return false;
      }

      training.trainingBonuses[theme] -= 1;
      CareerManager.save();
      return true;
    },

    updatePuzzleRatingAfterAttempt(puzzleDifficulty, success) {
      _normalizeTrainingState();
      const training = _getTrainingState();
      const playerRating = training.puzzleRating;
      const rd = training.puzzleRatingRd;
      const expected = 1 / (1 + Math.pow(10, (puzzleDifficulty - playerRating) / 400));
      const actual = success ? 1 : 0;
      const k = Math.max(10, Math.round(rd / 5));
      let rawDelta = k * (actual - expected);
      if (!success) rawDelta *= 0.5;
      const delta = Math.round(rawDelta);

      training.puzzleRating = Math.max(400, Math.min(2500, playerRating + delta));
      training.puzzleRatingRd = Math.max(50, rd - 5);

      CareerManager.save();
      return {
        delta,
        newRating: training.puzzleRating,
        newRd: training.puzzleRatingRd,
      };
    },

    startSelfTrainingSession(theme, options = {}) {
      _ensureTheme(theme);
      _normalizeTrainingState();

      const training = _getTrainingState();
      const size = options.size || DEFAULT_SESSION_SIZE;
      const queue = training.reinforcementQueues[theme];
      const reinforcementIds = new Set(queue.map((entry) => entry.puzzleId));

      const reinforcementPuzzles = queue
        .map((entry) => _findPuzzleById(entry.puzzleId))
        .filter(Boolean)
        .slice(0, size);

      const freshPuzzles = _pickNewThemePuzzles(theme, size - reinforcementPuzzles.length, training);
      const puzzles = [...reinforcementPuzzles, ...freshPuzzles].slice(0, size);
      if (puzzles.length < size) {
        throw new Error(`[PuzzleSystem] Not enough puzzles for theme: ${theme}`);
      }

      puzzles.forEach((puzzle) => _markSeen(training, puzzle.id));
      CareerManager.save();

      return _clone(_buildSession(theme, puzzles, {
        passThreshold: options.passThreshold,
        reinforcementIds,
      }));
    },

    /**
     * Record the next pass/fail answer in an active session.
     * In E.1 the caller is trusted: tests, debug hooks, or later UI
     * layers decide whether the puzzle was solved and pass the boolean
     * here. E.2 will add move-level validation via a separate method
     * that consumes this one internally.
     *
     * @param {string} sessionId
     * @param {boolean} solved
     * @returns {{ puzzleId: string, solved: boolean, remaining: number, index: number }}
     */
    submitSessionAnswer(sessionId, solved) {
      const session = _sessions.get(sessionId);
      if (!session) throw new Error(`[PuzzleSystem] Unknown session: ${sessionId}`);
      if (session.status !== 'active') {
        throw new Error(`[PuzzleSystem] Session is not active: ${sessionId}`);
      }
      if (session.currentIndex >= session.puzzles.length) {
        throw new Error(`[PuzzleSystem] Session already answered: ${sessionId}`);
      }

      const puzzle = session.puzzles[session.currentIndex];
      session.answers.push({
        puzzleId: puzzle.id,
        solved: Boolean(solved),
        reinforcement: puzzle.reinforcement,
      });
      session.currentIndex += 1;

      return {
        puzzleId: puzzle.id,
        solved: Boolean(solved),
        remaining: session.puzzles.length - session.currentIndex,
        index: session.currentIndex,
      };
    },

    completeSession(sessionId) {
      const session = _sessions.get(sessionId);
      if (!session) throw new Error(`[PuzzleSystem] Unknown session: ${sessionId}`);
      if (session.status !== 'active') {
        throw new Error(`[PuzzleSystem] Session already completed: ${sessionId}`);
      }
      if (session.answers.length !== session.puzzles.length) {
        throw new Error('[PuzzleSystem] Session is incomplete');
      }

      _normalizeTrainingState();
      const training = _getTrainingState();
      let correct = 0;

      for (const answer of session.answers) {
        const puzzle = session.puzzles.find((entry) => entry.id === answer.puzzleId);
        if (answer.solved) {
          correct += 1;
          training.stats.puzzlesSolvedAllTime += 1;
          _getThemeStats(training, session.theme).solvedThemePuzzles += 1;
          if (answer.reinforcement) {
            _handleQueuedSolve(training, session.theme, answer.puzzleId);
          }
        } else {
          _queuePuzzleFailure(training, session.theme, answer.puzzleId);
        }
        if (puzzle) {
          this.updatePuzzleRatingAfterAttempt(puzzle.difficulty, answer.solved);
        }
      }

      _recalculateAptitude(training, session.theme);

      const passed = correct >= session.passThreshold;
      training.stats.sessionsCompleted += 1;
      training.stats.puzzlesAttempted += session.answers.length;
      if (passed) {
        training.stats.sessionsPassed += 1;
        training.trainingBonuses[session.theme] += 1;
      }

      CareerManager.save();
      session.status = 'completed';

      return {
        sessionId: session.id,
        theme: session.theme,
        correct,
        total: session.answers.length,
        passed,
        bonusGranted: passed,
        aptitude: training.aptitudes[session.theme],
        trainingBonusCount: training.trainingBonuses[session.theme],
        reinforcementQueueSize: training.reinforcementQueues[session.theme].length,
      };
    },

    getSeenCount() {
      _normalizeTrainingState();
      return Object.keys(_getTrainingState().seenPuzzleIds).length;
    },

    clearForTests() {
      _sessions.clear();
      _sessionSeq = 1;
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.puzzleSystem = PuzzleSystem;
}
