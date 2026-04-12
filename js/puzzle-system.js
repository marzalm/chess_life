// puzzle-system.js
//
// Phase E.1 scope: sessions accept boolean pass/fail from callers.
// This module does NOT validate chess moves in E.1 — tests, debug
// hooks, and later UI components decide whether a puzzle was solved
// and pass the result here. Move validation against the FEN solution
// ships in E.2.
//
// Pure logic, no DOM. Owns puzzle selection, seen-puzzle tracking,
// reinforcement queues, per-theme puzzle ratings, and tournament-
// scoped training-bonus preparation.

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

  const TRAINING_K_FACTOR_MULT = 0.25;
  const SESSION_STREAK_TARGET = 3;
  const SESSION_SOLVE_TARGET = 6;
  const SESSION_MAX_ATTEMPTS = 18;

  /** @type {Map<string, object>} */
  const _sessions = new Map();
  let _sessionSeq = 1;

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _ensureTheme(theme) {
    if (!THEMES.includes(theme)) {
      throw new Error(`[PuzzleSystem] Unknown theme: ${theme}`);
    }
  }

  function _getTrainingState() {
    if (typeof CareerManager === 'undefined') {
      throw new Error('[PuzzleSystem] CareerManager is required');
    }
    return CareerManager.training.get();
  }

  function _emptyThemeBonus() {
    return {
      prepared: false,
      usedThisGame: false,
      lockedUntilTournamentEnd: false,
    };
  }

  function _normalizeThemeBonusEntry(entry) {
    if (typeof entry === 'number') {
      return {
        prepared: entry > 0,
        usedThisGame: false,
        lockedUntilTournamentEnd: entry > 0,
      };
    }
    if (!entry || typeof entry !== 'object') return _emptyThemeBonus();
    return {
      prepared: Boolean(entry.prepared),
      usedThisGame: Boolean(entry.usedThisGame),
      lockedUntilTournamentEnd: Boolean(entry.lockedUntilTournamentEnd),
    };
  }

  function _normalizeTrainingState() {
    const training = _getTrainingState();
    if (!training.seenPuzzleIds) training.seenPuzzleIds = {};
    if (!training.reinforcementQueues) training.reinforcementQueues = {};
    if (!training.trainingBonuses) training.trainingBonuses = {};
    if (!training.flowBonus) {
      training.flowBonus = { earned: false, reservedPuzzleId: null };
    }
    if (!training.puzzleRatings) training.puzzleRatings = {};
    if (!training.puzzleRatingRds) training.puzzleRatingRds = {};

    const legacyRating = typeof training.puzzleRating === 'number' ? training.puzzleRating : 500;
    const legacyRd = typeof training.puzzleRatingRd === 'number' ? training.puzzleRatingRd : 300;

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
      if (!Array.isArray(training.reinforcementQueues[theme])) {
        training.reinforcementQueues[theme] = [];
      }
      training.trainingBonuses[theme] = _normalizeThemeBonusEntry(training.trainingBonuses[theme]);
      if (typeof training.puzzleRatings[theme] !== 'number') {
        training.puzzleRatings[theme] = legacyRating;
      }
      if (typeof training.puzzleRatingRds[theme] !== 'number') {
        training.puzzleRatingRds[theme] = legacyRd;
      }
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

    delete training.aptitudes;
    delete training.puzzleRating;
    delete training.puzzleRatingRd;
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

  function _puzzleTurnColor(puzzle) {
    // puzzle-data.js stores post-setup FENs normalized at extraction
    // time, so the side-to-move here is the player's color.
    const parts = String(puzzle.fen || '').split(' ');
    return parts[1] === 'b' ? 'b' : 'w';
  }

  function _hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function _sortKey(prefix, id) {
    return _hash(`${prefix}:${id}`);
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

  function _getPuzzleRatingWindow(training, theme) {
    const targetRating = training.puzzleRatings[theme];
    const rd = training.puzzleRatingRds[theme];
    const window = Math.max(150, Math.round(rd * 1.2));
    return { targetRating, rd, window };
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

  function _getDerivedAptitudeFromRating(rating) {
    return Math.max(0, Math.min(100, Math.round((rating - 500) / 7)));
  }

  function _pickNewThemePuzzles(theme, needed, training, options = {}) {
    const queuedIds = new Set(training.reinforcementQueues[theme].map((entry) => entry.puzzleId));
    const excludedIds = new Set(options.excludeIds || []);
    const basePool = _getThemePool(theme)
      .filter((p) => !queuedIds.has(p.id) && !excludedIds.has(p.id))
      .slice()
      .sort((a, b) => _sortKey(theme, a.id) - _sortKey(theme, b.id));
    const preferredColor = options.preferredColor || null;
    const colorMatchedPool = preferredColor
      ? basePool.filter((puzzle) => _puzzleTurnColor(puzzle) === preferredColor)
      : basePool;
    const pool = colorMatchedPool.length > 0 ? colorMatchedPool : basePool;
    const { targetRating, window } = _getPuzzleRatingWindow(training, theme);

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
      if (aDistance !== bDistance) return aDistance - bDistance;
      return _sortKey(theme, a.puzzle.id) - _sortKey(theme, b.puzzle.id);
    });

    return ranked.slice(0, needed).map((entry) => entry.puzzle);
  }

  function _pickReinforcementPuzzle(theme, training, excludeIds = []) {
    const exclude = new Set(excludeIds);
    const queue = training.reinforcementQueues[theme] || [];
    for (const entry of queue) {
      if (exclude.has(entry.puzzleId)) continue;
      const puzzle = _findPuzzleById(entry.puzzleId);
      if (puzzle) return puzzle;
    }
    return null;
  }

  function _pickSessionPuzzle(theme, training, session) {
    const usedIds = session ? session.usedPuzzleIds : [];
    let puzzle = _pickReinforcementPuzzle(theme, training, usedIds);
    if (puzzle) return puzzle;

    const fresh = _pickNewThemePuzzles(theme, 1, training, { excludeIds: usedIds });
    if (fresh.length > 0) return fresh[0];

    const fullPool = _getThemePool(theme)
      .slice()
      .sort((a, b) => _sortKey(`${theme}:fallback`, a.id) - _sortKey(`${theme}:fallback`, b.id));
    return fullPool[0] || null;
  }

  function _preparePuzzleForSession(training, puzzle) {
    if (!puzzle) return null;
    _markSeen(training, puzzle.id);
    CareerManager.save();
    return {
      id: puzzle.id,
      theme: puzzle.theme,
      difficulty: puzzle.difficulty,
      source: puzzle.source,
      fen: puzzle.fen,
      solution: [...puzzle.solution],
      reinforcement: false,
    };
  }

  function _sessionSnapshot(session) {
    return {
      id: session.id,
      theme: session.theme,
      status: session.status,
      attemptsUsed: session.attemptsUsed,
      attemptsRemaining: Math.max(0, SESSION_MAX_ATTEMPTS - session.attemptsUsed),
      solvedTotal: session.solvedTotal,
      streak: session.streak,
      currentPuzzle: session.currentPuzzle ? _clone(session.currentPuzzle) : null,
      resultPath: session.resultPath || null,
      bonusGranted: Boolean(session.bonusGranted),
      summary: session.summary ? _clone(session.summary) : null,
    };
  }

  function _finalizeSessionSuccess(session, training, path) {
    const themeBonus = training.trainingBonuses[session.theme];
    themeBonus.prepared = true;
    themeBonus.usedThisGame = false;
    themeBonus.lockedUntilTournamentEnd = true;

    training.stats.sessionsCompleted += 1;
    training.stats.sessionsPassed += 1;

    session.status = 'completed';
    session.bonusGranted = true;
    session.resultPath = path;
    session.currentPuzzle = null;
    session.summary = {
      sessionId: session.id,
      theme: session.theme,
      correct: session.solvedTotal,
      total: session.attemptsUsed,
      passed: true,
      bonusGranted: true,
      path,
      rating: training.puzzleRatings[session.theme],
      ratingRd: training.puzzleRatingRds[session.theme],
      aptitude: _getDerivedAptitudeFromRating(training.puzzleRatings[session.theme]),
      trainingBonus: _clone(themeBonus),
      reinforcementQueueSize: training.reinforcementQueues[session.theme].length,
    };
    CareerManager.save();
  }

  function _finalizeSessionFailure(session, training) {
    training.stats.sessionsCompleted += 1;
    session.status = 'completed';
    session.bonusGranted = false;
    session.resultPath = 'failure';
    session.currentPuzzle = null;
    session.summary = {
      sessionId: session.id,
      theme: session.theme,
      correct: session.solvedTotal,
      total: session.attemptsUsed,
      passed: false,
      bonusGranted: false,
      path: 'failure',
      rating: training.puzzleRatings[session.theme],
      ratingRd: training.puzzleRatingRds[session.theme],
      aptitude: _getDerivedAptitudeFromRating(training.puzzleRatings[session.theme]),
      trainingBonus: _clone(training.trainingBonuses[session.theme]),
      reinforcementQueueSize: training.reinforcementQueues[session.theme].length,
    };
    CareerManager.save();
  }

  return {
    TRAINING_K_FACTOR_MULT,
    SESSION_STREAK_TARGET,
    SESSION_SOLVE_TARGET,
    SESSION_MAX_ATTEMPTS,

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

    getPuzzleRating(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _getTrainingState().puzzleRatings[theme];
    },

    getPuzzleRatingRd(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _getTrainingState().puzzleRatingRds[theme];
    },

    getAptitude(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _getDerivedAptitudeFromRating(_getTrainingState().puzzleRatings[theme]);
    },

    getTrainingBonusStatus(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _clone(_getTrainingState().trainingBonuses[theme]);
    },

    getPreparedThemes() {
      _normalizeTrainingState();
      const training = _getTrainingState();
      return THEMES.filter((theme) => training.trainingBonuses[theme].prepared);
    },

    getTrainingBonusCount(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      const bonus = _getTrainingState().trainingBonuses[theme];
      return bonus.prepared && !bonus.usedThisGame ? 1 : 0;
    },

    consumeTrainingBonus(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      const training = _getTrainingState();
      const bonus = training.trainingBonuses[theme];
      if (!bonus.prepared || bonus.usedThisGame) return false;
      bonus.usedThisGame = true;
      training.stats.bonusesUsedTraining += 1;
      CareerManager.save();
      return true;
    },

    resetTrainingBonusesForGame() {
      _normalizeTrainingState();
      const training = _getTrainingState();
      THEMES.forEach((theme) => {
        if (training.trainingBonuses[theme].prepared) {
          training.trainingBonuses[theme].usedThisGame = false;
        }
      });
      CareerManager.save();
    },

    clearTrainingBonusesAfterTournament() {
      _normalizeTrainingState();
      const training = _getTrainingState();
      THEMES.forEach((theme) => {
        training.trainingBonuses[theme] = _emptyThemeBonus();
      });
      CareerManager.save();
    },

    hasFlowBonus() {
      _normalizeTrainingState();
      return Boolean(_getTrainingState().flowBonus.earned);
    },

    getFlowBonusState() {
      _normalizeTrainingState();
      return _clone(_getTrainingState().flowBonus);
    },

    earnFlowBonus() {
      _normalizeTrainingState();
      const training = _getTrainingState();
      if (training.flowBonus.earned) return false;
      training.flowBonus.earned = true;
      training.flowBonus.reservedPuzzleId = null;
      CareerManager.save();
      return true;
    },

    consumeFlowBonus() {
      _normalizeTrainingState();
      const training = _getTrainingState();
      if (!training.flowBonus.earned) return false;
      training.flowBonus.earned = false;
      training.stats.bonusesUsedFlow += 1;
      CareerManager.save();
      return true;
    },

    clearFlowBonus() {
      _normalizeTrainingState();
      const training = _getTrainingState();
      const changed = training.flowBonus.earned || Boolean(training.flowBonus.reservedPuzzleId);
      if (!changed) return false;
      training.flowBonus.earned = false;
      training.flowBonus.reservedPuzzleId = null;
      CareerManager.save();
      return true;
    },

    getReinforcementQueue(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      return _clone(_getTrainingState().reinforcementQueues[theme]);
    },

    updatePuzzleRatingAfterAttempt(theme, puzzleDifficulty, success, kFactorMult = 1) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      const training = _getTrainingState();
      const playerRating = training.puzzleRatings[theme];
      const rd = training.puzzleRatingRds[theme];
      const expected = 1 / (1 + Math.pow(10, (puzzleDifficulty - playerRating) / 400));
      const actual = success ? 1 : 0;
      const k = Math.max(10, Math.round((rd / 5) * (kFactorMult || 1)));
      let rawDelta = k * (actual - expected);
      if (!success) rawDelta *= 0.5;
      const delta = Math.round(rawDelta);

      training.puzzleRatings[theme] = Math.max(400, Math.min(2500, playerRating + delta));
      training.puzzleRatingRds[theme] = Math.max(50, rd - 5);

      CareerManager.save();
      return {
        delta,
        newRating: training.puzzleRatings[theme],
        newRd: training.puzzleRatingRds[theme],
      };
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

    pickFlowPuzzle(preferredColor = null) {
      _normalizeTrainingState();

      const training = _getTrainingState();
      if (training.flowBonus.reservedPuzzleId) {
        const reserved = _findPuzzleById(training.flowBonus.reservedPuzzleId);
        if (reserved) return _clone(reserved);
      }

      const ranked = PUZZLES
        .filter((puzzle) => !training.seenPuzzleIds[puzzle.id])
        .map((puzzle) => {
          const rating = training.puzzleRatings[puzzle.theme] ?? 500;
          const rd = training.puzzleRatingRds[puzzle.theme] ?? 300;
          const window = Math.max(150, Math.round(rd * 1.2));
          const inWindow = Math.abs(puzzle.difficulty - rating) <= window;
          return { puzzle, rating, inWindow };
        })
        .sort((a, b) => {
          if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1;
          const aDistance = Math.abs(a.puzzle.difficulty - a.rating);
          const bDistance = Math.abs(b.puzzle.difficulty - b.rating);
          if (aDistance !== bDistance) return aDistance - bDistance;
          return _sortKey('flow', a.puzzle.id) - _sortKey('flow', b.puzzle.id);
        });

      const preferredPool = preferredColor
        ? ranked.filter((entry) => _puzzleTurnColor(entry.puzzle) === preferredColor)
        : ranked;
      const pool = preferredPool.length > 0 ? preferredPool : ranked;
      const puzzle = pool.length > 0 ? pool[0].puzzle : null;
      if (!puzzle) return null;

      _markSeen(training, puzzle.id);
      training.flowBonus.reservedPuzzleId = puzzle.id;
      CareerManager.save();
      return _clone(puzzle);
    },

    pickRandomPractice() {
      if (!Array.isArray(PUZZLES) || PUZZLES.length === 0) return null;
      const index = Math.floor(Math.random() * PUZZLES.length);
      return _clone(PUZZLES[index]);
    },

    canStartTrainingSession(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();
      const training = _getTrainingState();
      const bonus = training.trainingBonuses[theme];
      const reasons = [];
      const active = [..._sessions.values()].find((session) => session.status === 'active');
      if (active) reasons.push('session_active');
      if (bonus.lockedUntilTournamentEnd) reasons.push('already_prepared');
      return { ok: reasons.length === 0, reasons };
    },

    startSelfTrainingSession(theme) {
      _ensureTheme(theme);
      _normalizeTrainingState();

      const verdict = this.canStartTrainingSession(theme);
      if (!verdict.ok) {
        throw new Error(`[PuzzleSystem] Cannot start session for ${theme}: ${verdict.reasons.join(', ')}`);
      }

      const training = _getTrainingState();
      const puzzle = _pickSessionPuzzle(theme, training, { usedPuzzleIds: [] });
      if (!puzzle) {
        throw new Error(`[PuzzleSystem] Not enough puzzles for theme: ${theme}`);
      }

      const session = {
        id: `puzzle_session_${_sessionSeq++}`,
        theme,
        status: 'active',
        attemptsUsed: 0,
        solvedTotal: 0,
        streak: 0,
        bonusGranted: false,
        resultPath: null,
        summary: null,
        usedPuzzleIds: [],
        currentPuzzle: _preparePuzzleForSession(training, puzzle),
      };

      if (_findQueueEntry(training, theme, puzzle.id)) {
        session.currentPuzzle.reinforcement = true;
      }

      session.usedPuzzleIds.push(puzzle.id);
      _sessions.set(session.id, session);
      return _sessionSnapshot(session);
    },

    submitSessionAnswer(sessionId, solved) {
      const session = _sessions.get(sessionId);
      if (!session) throw new Error(`[PuzzleSystem] Unknown session: ${sessionId}`);
      if (session.status !== 'active') {
        throw new Error(`[PuzzleSystem] Session is not active: ${sessionId}`);
      }
      if (!session.currentPuzzle) {
        throw new Error(`[PuzzleSystem] Session has no active puzzle: ${sessionId}`);
      }

      _normalizeTrainingState();
      const training = _getTrainingState();
      const puzzle = session.currentPuzzle;
      const answerSolved = Boolean(solved);

      session.attemptsUsed += 1;
      training.stats.puzzlesAttempted += 1;

      const rating = this.updatePuzzleRatingAfterAttempt(
        session.theme,
        puzzle.difficulty,
        answerSolved,
        TRAINING_K_FACTOR_MULT,
      );

      if (answerSolved) {
        session.solvedTotal += 1;
        session.streak += 1;
        training.stats.puzzlesSolvedAllTime += 1;
        _getThemeStats(training, session.theme).solvedThemePuzzles += 1;
        if (puzzle.reinforcement) _handleQueuedSolve(training, session.theme, puzzle.id);
      } else {
        session.streak = 0;
        _queuePuzzleFailure(training, session.theme, puzzle.id);
      }

      if (session.streak >= SESSION_STREAK_TARGET) {
        _finalizeSessionSuccess(session, training, 'streak');
      } else if (session.solvedTotal >= SESSION_SOLVE_TARGET) {
        _finalizeSessionSuccess(session, training, 'persistence');
      } else if (session.attemptsUsed >= SESSION_MAX_ATTEMPTS) {
        _finalizeSessionFailure(session, training);
      } else {
        const nextPuzzle = _pickSessionPuzzle(session.theme, training, session);
        if (!nextPuzzle) {
          _finalizeSessionFailure(session, training);
        } else {
          session.currentPuzzle = _preparePuzzleForSession(training, nextPuzzle);
          if (_findQueueEntry(training, session.theme, nextPuzzle.id)) {
            session.currentPuzzle.reinforcement = true;
          }
          session.usedPuzzleIds.push(nextPuzzle.id);
          CareerManager.save();
        }
      }

      return {
        puzzleId: puzzle.id,
        solved: answerSolved,
        ratingDelta: rating.delta,
        session: _sessionSnapshot(session),
      };
    },

    completeSession(sessionId) {
      const session = _sessions.get(sessionId);
      if (!session) throw new Error(`[PuzzleSystem] Unknown session: ${sessionId}`);
      if (session.status !== 'completed') {
        throw new Error('[PuzzleSystem] Session is incomplete');
      }
      return _clone(session.summary);
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
