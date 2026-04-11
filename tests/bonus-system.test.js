// tests/bonus-system.test.js
//
// Standalone Node.js test harness for js/bonus-system.js.
// Loads the real PuzzleSystem with generated Lichess puzzle data,
// and mocks UIManager / ChessEngine / GameEvents around it.

const fs = require('fs');
const path = require('path');

const chessCode = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'chess.js'),
  'utf8',
);
const Chess = (new Function(`${chessCode}\nreturn Chess;`))();

const puzzleDataCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'puzzle-data.js'),
  'utf8',
);
const PUZZLES = (new Function(`${puzzleDataCode}\nreturn PUZZLES;`))();

const puzzleSystemCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'puzzle-system.js'),
  'utf8',
);

const bonusSystemCode = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'bonus-system.js'),
  'utf8',
);

let PuzzleSystem;
let BonusSystem;
let CareerManager;
let ChessEngine;
let UIManager;
let FocusSystem;
let GameEvents;
let SoundManager;
let document;
let windowObj;
let _player;
let _trainingState;
let _saveCount;
let _emittedEvents;
let _timers;
let _now;
let _nextTimerId;
let _bestMoves;
let _aiMoves;
let _statusLog;
let _aiReplyCalls;

function makeDefaultTrainingState() {
  return {
    aptitudes: {},
    seenPuzzleIds: {},
    reinforcementQueues: {},
    trainingBonuses: {},
    flowBonus: { earned: false, reservedPuzzleId: null },
    stats: {
      sessionsCompleted: 0,
      sessionsPassed: 0,
      puzzlesAttempted: 0,
      puzzlesSolvedAllTime: 0,
      reinforcementPuzzlesSolved: 0,
      bonusesUsedTraining: 0,
      bonusesUsedFlow: 0,
      byTheme: {},
    },
  };
}

function makeClassList() {
  const set = new Set();
  return {
    add(...names) {
      names.forEach((name) => set.add(name));
    },
    remove(...names) {
      names.forEach((name) => set.delete(name));
    },
    toggle(name, force) {
      if (force === undefined) {
        if (set.has(name)) {
          set.delete(name);
          return false;
        }
        set.add(name);
        return true;
      }
      if (force) set.add(name);
      else set.delete(name);
      return force;
    },
    contains(name) {
      return set.has(name);
    },
    toArray() {
      return [...set];
    },
  };
}

function makeElement(id = null) {
  const el = {
    id,
    textContent: '',
    disabled: false,
    value: '',
    type: 'div',
    style: {},
    dataset: {},
    children: [],
    _listeners: {},
    classList: makeClassList(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(name, handler) {
      this._listeners[name] = handler;
    },
    click() {
      if (this._listeners.click) this._listeners.click({ currentTarget: this });
      if (typeof this.onclick === 'function') this.onclick({ currentTarget: this });
    },
  };

  let innerHTMLValue = '';
  Object.defineProperty(el, 'innerHTML', {
    get() {
      return innerHTMLValue;
    },
    set(value) {
      innerHTMLValue = value;
      if (value === '') this.children = [];
    },
  });

  return el;
}

function makeDocument() {
  const elements = new Map();
  const ids = [
    'training-bonus-section',
    'training-bonus-buttons',
    'puzzle-mode-banner',
    'puzzle-outcome-card',
  ];
  ids.forEach((id) => elements.set(id, makeElement(id)));
  elements.get('training-bonus-section').classList.add('hidden');
  elements.get('puzzle-mode-banner').classList.add('hidden');
  elements.get('puzzle-outcome-card').classList.add('hidden');

  return {
    body: { classList: makeClassList() },
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tag) {
      const el = makeElement();
      el.tagName = tag.toUpperCase();
      return el;
    },
    _elements: elements,
  };
}

function makeGameEventsMock() {
  const listeners = new Map();
  return {
    EVENTS: {
      BONUS_INVOKED: 'bonus_invoked',
      BONUS_RESOLVED: 'bonus_resolved',
    },
    on(eventName, handler) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(handler);
      listeners.set(eventName, bucket);
      return () => this.off(eventName, handler);
    },
    off(eventName, handler) {
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      bucket.delete(handler);
      if (bucket.size === 0) listeners.delete(eventName);
    },
    emit(eventName, payload) {
      _emittedEvents.push({ eventName, payload });
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      for (const handler of bucket) handler(payload);
    },
  };
}

function fakeSetTimeout(fn, ms = 0) {
  const id = _nextTimerId++;
  _timers.push({ id, at: _now + ms, fn });
  _timers.sort((a, b) => (a.at - b.at) || (a.id - b.id));
  return id;
}

function fakeClearTimeout(id) {
  _timers = _timers.filter((timer) => timer.id !== id);
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

async function advanceTime(ms) {
  const target = _now + ms;
  while (true) {
    _timers.sort((a, b) => (a.at - b.at) || (a.id - b.id));
    if (_timers.length === 0 || _timers[0].at > target) break;
    const timer = _timers.shift();
    _now = timer.at;
    timer.fn();
    await flushMicrotasks();
  }
  _now = target;
  await flushMicrotasks();
}

function makeChessEngineMock() {
  let turn = 'w';
  let playerColor = 'w';
  let gameOver = false;
  const history = [];

  return {
    isGameOver() {
      return gameOver;
    },
    getTurn() {
      return turn;
    },
    getPlayerColor() {
      return playerColor;
    },
    setTurn(nextTurn) {
      turn = nextTurn;
    },
    setPlayerColor(color) {
      playerColor = color;
    },
    setGameOver(value) {
      gameOver = Boolean(value);
    },
    getHistory() {
      return [...history];
    },
    async getBestMove() {
      return _bestMoves.shift() || null;
    },
    makeMove(from, to, promo = 'q') {
      if (gameOver) return null;
      history.push(`${from}${to}${promo && promo !== 'q' ? promo : ''}`);
      turn = turn === 'w' ? 'b' : 'w';
      return { from, to, promo };
    },
  };
}

function loadModules() {
  PuzzleSystem = (new Function(
    'PUZZLES', 'CareerManager',
    `${puzzleSystemCode}\nreturn PuzzleSystem;`,
  ))(PUZZLES, CareerManager);

  BonusSystem = (new Function(
    'Chess', 'PuzzleSystem', 'ChessEngine', 'UIManager', 'FocusSystem', 'GameEvents', 'document', 'window', 'SoundManager', 'setTimeout', 'clearTimeout',
    `${bonusSystemCode}\nreturn BonusSystem;`,
  ))(
    Chess,
    PuzzleSystem,
    ChessEngine,
    UIManager,
    FocusSystem,
    GameEvents,
    document,
    windowObj,
    SoundManager,
    fakeSetTimeout,
    fakeClearTimeout,
  );
}

function findPuzzle(theme, predicate) {
  const found = PUZZLES.find((puzzle) => puzzle.theme === theme && predicate(puzzle));
  if (!found) throw new Error(`missing puzzle for theme ${theme}`);
  return found;
}

async function withInjectedPuzzle(puzzle, fn) {
  PUZZLES.push(puzzle);
  try {
    return await fn();
  } finally {
    const index = PUZZLES.findIndex((entry) => entry.id === puzzle.id);
    if (index >= 0) PUZZLES.splice(index, 1);
  }
}

function findWrongFirstMove(puzzle) {
  const chess = new Chess(puzzle.fen);
  const expected = puzzle.solution[0];
  const moves = chess.moves({ verbose: true });
  const wrong = moves.find((move) => {
    const promotion = move.promotion || '';
    return `${move.from}${move.to}${promotion}` !== expected;
  });
  if (!wrong) throw new Error(`no wrong move found for puzzle ${puzzle.id}`);
  return { from: wrong.from, to: wrong.to };
}

async function clickMove(uci) {
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  BonusSystem.onPuzzleClick(from);
  BonusSystem.onPuzzleClick(to);
  await flushMicrotasks();
}

function reset() {
  _player = { elo: 1500 };
  _trainingState = makeDefaultTrainingState();
  _saveCount = 0;
  _emittedEvents = [];
  _timers = [];
  _now = 0;
  _nextTimerId = 1;
  _bestMoves = [];
  _aiMoves = [];
  _statusLog = [];
  _aiReplyCalls = 0;

  CareerManager = {
    player: { get: () => _player },
    training: { get: () => _trainingState },
    save: () => { _saveCount += 1; },
  };

  document = makeDocument();
  windowObj = { cl: {} };
  GameEvents = makeGameEventsMock();
  SoundManager = {
    playSFActivate() {},
    playMove() {},
    playCapture() {},
  };

  FocusSystem = {
    _playbackPaused: false,
    current: 100,
    pauseCalls: 0,
    resumeCalls: 0,
    applyCalls: 0,
    pauseForPlayback() {
      this.pauseCalls += 1;
      this._playbackPaused = true;
    },
    resumeFromPlayback() {
      this.resumeCalls += 1;
      this._playbackPaused = false;
    },
    apply(delta) {
      this.applyCalls += 1;
      if (this._playbackPaused) return this.current;
      this.current += delta;
      return this.current;
    },
  };

  ChessEngine = makeChessEngineMock();
  UIManager = {
    _aiThinking: false,
    _viewPly: null,
    _puzzleMode: false,
    _pieceSource: 'live',
    enterPuzzleMode() {
      this._puzzleMode = true;
      this._pieceSource = 'puzzle';
    },
    exitPuzzleMode() {
      this._puzzleMode = false;
      this._pieceSource = 'live';
    },
    renderBoardCalls: 0,
    renderBoard() {
      this.renderBoardCalls += 1;
      if (BonusSystem && BonusSystem.renderInventory) {
        BonusSystem.renderInventory();
      }
    },
    lockCalls: 0,
    unlockCalls: 0,
    lockInputForPlayback() {
      this.lockCalls += 1;
    },
    unlockInputAfterPlayback() {
      this.unlockCalls += 1;
    },
    showStatus(msg) {
      _statusLog.push(msg);
    },
    applyPlaybackMove(move) {
      FocusSystem.apply(-5);
      return Boolean(ChessEngine.makeMove(move.from, move.to, move.promotion || 'q'));
    },
    async triggerAIMoveAndWait() {
      _aiReplyCalls += 1;
      const reply = _aiMoves.shift();
      if (!reply) return;
      FocusSystem.apply(-4);
      ChessEngine.makeMove(reply.from, reply.to, reply.promotion || 'q');
    },
  };

  loadModules();
  PuzzleSystem.clearForTests();
  PuzzleSystem.init();
  BonusSystem.init();
}

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  reset();
  try {
    await fn();
    console.log('  ✓', name);
    passed += 1;
  } catch (error) {
    console.log('  ✗', name);
    console.log('     →', error.message);
    failed += 1;
    failures.push({ name, message: error.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg || 'mismatch'}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

(async () => {
  console.log('\n── Inventory and gating ──');

  await test('init renders visible inventory from persisted training bonuses', async () => {
    _trainingState.trainingBonuses.fork = 2;
    _trainingState.trainingBonuses.pin = 1;
    loadModules();
    PuzzleSystem.clearForTests();
    PuzzleSystem.init();
    BonusSystem.init();
    const section = document.getElementById('training-bonus-section');
    const wrap = document.getElementById('training-bonus-buttons');
    assert(!section.classList.contains('hidden'), 'expected visible inventory section');
    assertEq(wrap.children.length, 1);
    assertEq(wrap.children[0].textContent, 'Training bonus (3)');
  });

  await test('invokeNextAvailableTrainingBonus picks the theme with the highest charge count', async () => {
    const forkPuzzle = findPuzzle('fork', (entry) => entry.solution.length >= 2);
    const pinPuzzle = findPuzzle('pin', (entry) => entry.solution.length >= 2);
    _trainingState.trainingBonuses.fork = 2;
    _trainingState.trainingBonuses.pin = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: forkPuzzle.id, state: 'active', confirmations: 0 },
    ];
    _trainingState.reinforcementQueues.pin = [
      { puzzleId: pinPuzzle.id, state: 'active', confirmations: 0 },
    ];

    assertEq(BonusSystem.invokeNextAvailableTrainingBonus(), true);
    assertEq(BonusSystem.getPuzzleState().theme, 'fork');
  });

  await test('invokeNextAvailableTrainingBonus breaks ties alphabetically by theme key', async () => {
    const forkPuzzle = findPuzzle('fork', (entry) => entry.solution.length >= 2);
    const pinPuzzle = findPuzzle('pin', (entry) => entry.solution.length >= 2);
    _trainingState.trainingBonuses.fork = 2;
    _trainingState.trainingBonuses.pin = 2;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: forkPuzzle.id, state: 'active', confirmations: 0 },
    ];
    _trainingState.reinforcementQueues.pin = [
      { puzzleId: pinPuzzle.id, state: 'active', confirmations: 0 },
    ];

    assertEq(BonusSystem.invokeNextAvailableTrainingBonus(), true);
    assertEq(BonusSystem.getPuzzleState().theme, 'fork');
  });

  await test('canInvokeBonus rejects when no charge exists', async () => {
    assertEq(BonusSystem.canInvokeBonus('fork'), false);
  });

  await test('canInvokeBonus rejects when it is not the player turn', async () => {
    _trainingState.trainingBonuses.fork = 1;
    ChessEngine.setTurn('b');
    assertEq(BonusSystem.canInvokeBonus('fork'), false);
  });

  await test('canInvokeBonus rejects during move navigation preview', async () => {
    _trainingState.trainingBonuses.fork = 1;
    UIManager._viewPly = 6;
    assertEq(BonusSystem.canInvokeBonus('fork'), false);
  });

  await test('training bonus button is enabled immediately when aiThinking is cleared before render', async () => {
    _trainingState.trainingBonuses.fork = 1;
    UIManager._aiThinking = true;

    const section = document.getElementById('training-bonus-section');
    BonusSystem.renderInventory();
    assert(!section.classList.contains('hidden'), 'expected visible section');
    assertEq(document.getElementById('training-bonus-buttons').children[0].disabled, true);

    UIManager._pieceSource = 'live';
    UIManager.lastMove = { from: 'e7', to: 'e5' };
    UIManager._aiThinking = false;
    UIManager.renderBoard();

    assertEq(document.getElementById('training-bonus-buttons').children[0].disabled, false);
    assertEq(BonusSystem.canInvokeBonus('fork'), true);
  });

  console.log('\n── Invocation and puzzle mode ──');

  await test('invokeBonus consumes a stored charge and enters puzzle mode', async () => {
    const puzzle = findPuzzle('fork', (entry) => entry.solution.length >= 3);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];

    assertEq(BonusSystem.invokeBonus('fork'), true);
    assertEq(PuzzleSystem.getTrainingBonusCount('fork'), 0);
    assertEq(UIManager._puzzleMode, true);
    assertEq(UIManager._pieceSource, 'puzzle');
    assertEq(BonusSystem.isInPuzzleMode(), true);
    assertEq(BonusSystem.getPuzzleState().theme, 'fork');
  });

  await test('invokeBonus returns false when no puzzle is available', async () => {
    _trainingState.trainingBonuses.fork = 1;
    const removed = [];
    for (let i = PUZZLES.length - 1; i >= 0; i--) {
      if (PUZZLES[i].theme === 'fork') removed.push(PUZZLES.splice(i, 1)[0]);
    }

    try {
      loadModules();
      PuzzleSystem.clearForTests();
      PuzzleSystem.init();
      BonusSystem.init();
      assertEq(BonusSystem.invokeBonus('fork'), false);
      assertEq(PuzzleSystem.getTrainingBonusCount('fork'), 1);
    } finally {
      PUZZLES.push(...removed);
    }
  });

  await test('getPuzzleState reflects selection and legal targets', async () => {
    const puzzle = findPuzzle('fork', (entry) => entry.solution.length >= 2);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];
    BonusSystem.invokeBonus('fork');
    const from = puzzle.solution[0].substring(0, 2);
    BonusSystem.onPuzzleClick(from);
    const state = BonusSystem.getPuzzleState();
    assertEq(state.selectedSquare, from);
    assert(state.legalTargets.length >= 1, 'expected legal targets for selected piece');
  });

  await test('onPuzzleClick rejects incorrect move and resolves failure', async () => {
    const puzzle = findPuzzle('fork', (entry) => {
      try {
        return entry.solution.length >= 2 && Boolean(findWrongFirstMove(entry));
      } catch {
        return false;
      }
    });
    const wrong = findWrongFirstMove(puzzle);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];

    BonusSystem.invokeBonus('fork');
    BonusSystem.onPuzzleClick(wrong.from);
    BonusSystem.onPuzzleClick(wrong.to);
    await advanceTime(1500);

    assertEq(BonusSystem.isInPuzzleMode(), false);
    assertEq(UIManager._puzzleMode, false);
    const resolved = _emittedEvents.find((event) => event.eventName === GameEvents.EVENTS.BONUS_RESOLVED);
    assertEq(resolved.payload.success, false);
    assertEq(document.getElementById('puzzle-outcome-card').classList.contains('hidden'), true);
  });

  await test('onPuzzleClick accepts the correct move and clears selection', async () => {
    const puzzle = findPuzzle('fork', (entry) => entry.solution.length >= 3);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];
    BonusSystem.invokeBonus('fork');
    await clickMove(puzzle.solution[0]);
    const state = BonusSystem.getPuzzleState();
    assertEq(state.selectedSquare, null);
    assertEq(state.solutionIndex >= 1, true);
  });

  await test('opponent reply auto-plays after a correct player move within the delay window', async () => {
    const puzzle = findPuzzle('fork', (entry) => entry.solution.length >= 3);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];
    BonusSystem.invokeBonus('fork');
    await clickMove(puzzle.solution[0]);

    const before = BonusSystem.getPuzzleState().fen;
    await advanceTime(499);
    assertEq(BonusSystem.getPuzzleState().fen, before);

    await advanceTime(1);
    const after = BonusSystem.getPuzzleState();
    assert(after.fen !== before, 'expected opponent reply to change puzzle position');
    assertEq(after.solutionIndex, 2);
    assertEq(after.status, 'awaiting-player');
  });

  await test('single-move solution terminates after the player click with no auto-play', async () => {
    const puzzle = {
      id: 'mateIn1_test_single',
      theme: 'mateIn1',
      difficulty: 1000,
      fen: '6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      solution: ['f7g7'],
      source: 'test-single-move',
    };

    await withInjectedPuzzle(puzzle, async () => {
      loadModules();
      PuzzleSystem.clearForTests();
      PuzzleSystem.init();
      BonusSystem.init();

      _trainingState.trainingBonuses.mateIn1 = 1;
      _trainingState.reinforcementQueues.mateIn1 = [
        { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
      ];
      _bestMoves = [{ from: 'e2', to: 'e4', move: 'e2e4' }, { from: 'g1', to: 'f3', move: 'g1f3' }];
      _aiMoves = [{ from: 'e7', to: 'e5' }];

      BonusSystem.invokeBonus('mateIn1');
      await clickMove(puzzle.solution[0]);
      assertEq(BonusSystem.isInPuzzleMode(), false);
      assertEq(_timers.some((timer) => timer.at === 500), false, 'expected no opponent auto-play timer');
      assertEq(_timers.some((timer) => timer.at === 1500), true, 'expected only the outcome-card timer');
    });
  });

  await test('full multi-step sequence resolves success only after the complete line is consumed', async () => {
    const puzzle = findPuzzle('fork', (entry) => entry.solution.length >= 3);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];
    _bestMoves = [{ from: 'e2', to: 'e4', move: 'e2e4' }, { from: 'g1', to: 'f3', move: 'g1f3' }];
    _aiMoves = [{ from: 'e7', to: 'e5' }];

    BonusSystem.invokeBonus('fork');
    await clickMove(puzzle.solution[0]);
    await advanceTime(500);
    assertEq(BonusSystem.isInPuzzleMode(), true);

    await clickMove(puzzle.solution[2]);
    await advanceTime(500 + 1500 + 1100 + 1100);

    assertEq(BonusSystem.isInPuzzleMode(), false);
    const resolved = _emittedEvents.find((event) => event.eventName === GameEvents.EVENTS.BONUS_RESOLVED);
    assertEq(resolved.payload.success, true);
  });

  console.log('\n── Rewards and events ──');

  await test('getRewardMoveCount uses base 2 plus aptitude thresholds', async () => {
    assertEq(BonusSystem.getRewardMoveCount('fork'), 2);
    _trainingState.aptitudes.fork = 55;
    assertEq(BonusSystem.getRewardMoveCount('fork'), 3);
    _trainingState.aptitudes.fork = 81;
    assertEq(BonusSystem.getRewardMoveCount('fork'), 4);
  });

  await test('bonus_invoked emits the locked payload', async () => {
    const puzzle = findPuzzle('fork', (entry) => entry.solution.length >= 2);
    _trainingState.trainingBonuses.fork = 1;
    _trainingState.reinforcementQueues.fork = [
      { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
    ];
    BonusSystem.invokeBonus('fork');
    const invoked = _emittedEvents.find((event) => event.eventName === GameEvents.EVENTS.BONUS_INVOKED);
    assertEq(invoked.payload, { source: 'training', theme: 'fork' });
  });

  await test('bonus_resolved success payload includes movesGranted and puzzleId', async () => {
    const puzzle = {
      id: 'mateIn1_test_payload',
      theme: 'mateIn1',
      difficulty: 980,
      fen: '6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      solution: ['f7g7'],
      source: 'test-single-move',
    };

    await withInjectedPuzzle(puzzle, async () => {
      loadModules();
      PuzzleSystem.clearForTests();
      PuzzleSystem.init();
      BonusSystem.init();

      _trainingState.trainingBonuses.mateIn1 = 1;
      _trainingState.reinforcementQueues.mateIn1 = [
        { puzzleId: puzzle.id, state: 'active', confirmations: 0 },
      ];
      _bestMoves = [{ from: 'e2', to: 'e4', move: 'e2e4' }, { from: 'g1', to: 'f3', move: 'g1f3' }];
      _aiMoves = [{ from: 'e7', to: 'e5' }];

      BonusSystem.invokeBonus('mateIn1');
      await clickMove(puzzle.solution[0]);
      await advanceTime(1500 + 1100 + 1100);

      const resolved = _emittedEvents.find((event) => event.eventName === GameEvents.EVENTS.BONUS_RESOLVED);
      assertEq(resolved.payload.source, 'training');
      assertEq(resolved.payload.theme, 'mateIn1');
      assertEq(resolved.payload.success, true);
      assertEq(resolved.payload.movesGranted, 2);
      assertEq(resolved.payload.puzzleId, puzzle.id);
    });
  });

  console.log('\n── Playback loop ──');

  await test('playback loop uses player budgeted moves and Maia replies separately', async () => {
    _bestMoves = [
      { from: 'e2', to: 'e4', move: 'e2e4' },
      { from: 'g1', to: 'f3', move: 'g1f3' },
    ];
    _aiMoves = [{ from: 'e7', to: 'e5' }, { from: 'b8', to: 'c6' }];

    const playback = BonusSystem._runPlayback(2);
    await advanceTime(1100 + 1100);
    await playback;
    assertEq(_aiReplyCalls, 2);
    assertEq(ChessEngine.getHistory(), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    assertEq(ChessEngine.getTurn(), ChessEngine.getPlayerColor());
  });

  await test('playback stops cleanly if the game ends mid-loop', async () => {
    UIManager.applyPlaybackMove = (move) => {
      ChessEngine.makeMove(move.from, move.to, move.promotion || 'q');
      ChessEngine.setGameOver(true);
      return false;
    };
    _bestMoves = [{ from: 'e2', to: 'e4', move: 'e2e4' }];

    const playback = BonusSystem._runPlayback(2);
    await advanceTime(1100);
    await playback;
    assertEq(ChessEngine.getHistory(), ['e2e4']);
    assertEq(UIManager.unlockCalls, 1);
  });

  await test('focus calls during playback are no-ops while pause is active', async () => {
    FocusSystem.current = 77;
    _bestMoves = [{ from: 'e2', to: 'e4', move: 'e2e4' }];
    _aiMoves = [{ from: 'e7', to: 'e5' }];

    const playback = BonusSystem._runPlayback(1);
    await advanceTime(1100);
    await playback;
    assertEq(FocusSystem.pauseCalls, 1);
    assertEq(FocusSystem.resumeCalls, 1);
    assertEq(FocusSystem.applyCalls >= 1, true);
    assertEq(FocusSystem.current, 77);
  });

  await test('no cancelPuzzle API is exposed in E.2', async () => {
    assertEq(typeof BonusSystem.cancelPuzzle, 'undefined');
  });

  console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) {
    process.exitCode = 1;
  }
})();
