// tests/ui-manager-resign.test.js
//
// Focused tests for player resignation and AI resignation logic.

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'ui-manager.js'),
  'utf8',
);

let passed = 0;
let failed = 0;

function createElement() {
  return {
    textContent: '',
    innerHTML: '',
    disabled: false,
    onclick: null,
    style: {},
    dataset: {},
    className: '',
    children: [],
    showCount: 0,
    closeCount: 0,
    appendChild(child) { this.children.push(child); },
    addEventListener() {},
    remove() {},
    showModal() { this.showCount += 1; this.open = true; },
    close() { this.closeCount += 1; this.open = false; },
    classList: {
      _set: new Set(),
      add(cls) { this._set.add(cls); },
      remove(cls) { this._set.delete(cls); },
      toggle(cls, force) {
        if (force === undefined) {
          if (this._set.has(cls)) this._set.delete(cls);
          else this._set.add(cls);
          return;
        }
        if (force) this._set.add(cls);
        else this._set.delete(cls);
      },
      contains(cls) { return this._set.has(cls); },
    },
  };
}

function makeUIManager() {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };

  const calls = {
    focusGameEnd: [],
    focusSync: 0,
    recordGame: [],
    review: 0,
    onGameEnd: [],
    soundVictory: 0,
    soundDefeat: 0,
    renderBoard: 0,
  };

  const mocks = {
    document: {
      body: {
        classList: {
          add() {},
          remove() {},
          toggle() {},
        },
      },
      getElementById: (id) => elements.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
      createElement: () => createElement(),
    },
    Chess: function MockChess() {
      this.get = () => null;
      this.move = () => null;
    },
    ChessEngine: {
      _history: [],
      getHistory() { return this._history.slice(); },
      isGameOver: () => false,
      getTurn: () => 'w',
      getPlayerColor: () => 'w',
      getPiece: () => null,
      getLegalMoves: () => [],
      getBoard: () => [],
      getCapturedPieces: () => ({ byWhite: [], byBlack: [], diff: 0 }),
    },
    CareerManager: {
      focus: {
        sync() { calls.focusSync += 1; },
      },
      history: {
        recordGame(entry) { calls.recordGame.push(entry); return 0; },
      },
      formatName(name, title) {
        return title ? `${title} ${name}` : name;
      },
    },
    MaiaEngine: {},
    StockfishOpponent: {},
    FocusSystem: {
      render() {},
      setMoveEvalCallback() {},
      onGameEnd(won) { calls.focusGameEnd.push(won); },
    },
    ReviewManager: {
      startReview() { calls.review += 1; },
    },
    SoundManager: {
      playVictory() { calls.soundVictory += 1; },
      playDefeat() { calls.soundDefeat += 1; },
    },
    BonusSystem: {
      isPlaybackActive: () => false,
    },
    window: {
      addEventListener() {},
    },
  };

  const UIManager = (new Function(
    'document',
    'Chess',
    'ChessEngine',
    'CareerManager',
    'MaiaEngine',
    'StockfishOpponent',
    'FocusSystem',
    'ReviewManager',
    'SoundManager',
    'BonusSystem',
    'window',
    `${code}\nreturn UIManager;`,
  ))(
    mocks.document,
    mocks.Chess,
    mocks.ChessEngine,
    mocks.CareerManager,
    mocks.MaiaEngine,
    mocks.StockfishOpponent,
    mocks.FocusSystem,
    mocks.ReviewManager,
    mocks.SoundManager,
    mocks.BonusSystem,
    mocks.window,
  );

  UIManager.renderBoard = () => { calls.renderBoard += 1; };
  UIManager.onGameEnd = (result) => { calls.onGameEnd.push(result); };

  return { UIManager, calls, elements, getEl, mocks };
}

async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.log('  ✗', name);
    console.log('     →', e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  const aj = JSON.stringify(a);
  const bj = JSON.stringify(b);
  if (aj !== bj) {
    throw new Error(`${msg || 'mismatch'}\n        expected: ${bj}\n        actual:   ${aj}`);
  }
}

(async () => {
  console.log('\n── UIManager resign flow ──');

  await test('resign button opens the confirmation modal only during an active game', async () => {
    const { UIManager, getEl } = makeUIManager();
    getEl('btn-resign');
    getEl('btn-resign-cancel');
    getEl('btn-resign-confirm');
    const modal = getEl('modal-resign');

    UIManager._bindButtons();
    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    UIManager._syncGameActionButtons();

    getEl('btn-resign').onclick();
    assertEq(modal.showCount, 1);

    UIManager._gameActive = false;
    UIManager._syncGameActionButtons();
    getEl('btn-resign').onclick();
    assertEq(modal.showCount, 1, 'inactive game should not reopen modal');
  });

  await test('player resignation records a loss and does not launch review', async () => {
    const { UIManager, calls, getEl, mocks } = makeUIManager();
    getEl('game-status');
    mocks.ChessEngine._history = ['e4', 'e5', 'Nf3', 'Nc6'];

    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    UIManager._opponentName = 'GM Viktor Holm';
    UIManager._opponentElo = 2780;

    const ok = UIManager._endGameByResignation('loss', 'You resigned.');
    assertEq(ok, true);
    assertEq(calls.focusGameEnd, [false]);
    assertEq(calls.focusSync, 1);
    assertEq(calls.recordGame.length, 1);
    assertEq(calls.recordGame[0].result, 'loss');
    assertEq(calls.recordGame[0].moves, 4);
    assertEq(calls.review, 0, 'resignation must skip review');
    assertEq(calls.onGameEnd, ['loss']);
    assertEq(calls.soundDefeat, 1);
    assertEq(getEl('game-status').textContent, 'You resigned.');
    assertEq(UIManager._gameActive, false);
    assertEq(UIManager._gameConcluded, true);
  });

  await test('AI resignation triggers only on the 5th consecutive losing eval in the 30% band', async () => {
    const { UIManager } = makeUIManager();
    const seen = [];
    UIManager._gameActive = true;
    UIManager._endGameByResignation = (result, msg) => {
      seen.push({ result, msg });
      return true;
    };

    const originalRandom = Math.random;
    Math.random = () => 0.29;
    try {
      for (let i = 0; i < 4; i++) {
        assertEq(UIManager._checkAIResignation(-650), false, 'should not resign before streak 5');
      }
      assertEq(UIManager._checkAIResignation(-650), true);
    } finally {
      Math.random = originalRandom;
    }

    assertEq(UIManager._aiLostStreakCount, 5);
    assertEq(seen, [{ result: 'win', msg: 'Your opponent resigns.' }]);
  });

  await test('AI resignation streak resets when the eval improves', async () => {
    const { UIManager } = makeUIManager();
    UIManager._gameActive = true;
    UIManager._endGameByResignation = () => true;

    UIManager._checkAIResignation(-650);
    UIManager._checkAIResignation(-650);
    UIManager._checkAIResignation(-200);
    assertEq(UIManager._aiLostStreakCount, 0);
    assertEq(UIManager._checkAIResignation(-650), false);
    assertEq(UIManager._aiLostStreakCount, 1);
  });

  await test('AI resignation uses the higher probability bands at -800 and -1000', async () => {
    const { UIManager } = makeUIManager();
    const seen = [];
    UIManager._gameActive = true;
    UIManager._endGameByResignation = (result) => {
      seen.push(result);
      return true;
    };

    const originalRandom = Math.random;
    try {
      Math.random = () => 0.59;
      UIManager._aiLostStreakCount = 4;
      assertEq(UIManager._checkAIResignation(-820), true, '60% band should trigger');

      Math.random = () => 0.89;
      UIManager._aiLostStreakCount = 4;
      assertEq(UIManager._checkAIResignation(-1020), true, '90% band should trigger');
    } finally {
      Math.random = originalRandom;
    }

    assertEq(seen, ['win', 'win']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
