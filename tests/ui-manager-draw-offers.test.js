// tests/ui-manager-draw-offers.test.js
//
// Focused tests for voluntary draw offers.

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

function buildBoard(pieceCount) {
  const board = [];
  let remaining = pieceCount;
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      if (remaining > 0) {
        row.push({ type: 'p', color: (remaining % 2 === 0) ? 'w' : 'b' });
        remaining -= 1;
      } else {
        row.push(null);
      }
    }
    board.push(row);
  }
  return board;
}

function makeUIManager({ pieceCount = 32, evalCp = 0, historyLength = 0 } = {}) {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };

  const calls = {
    endGame: [],
    status: [],
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
      _history: new Array(historyLength).fill('e4'),
      _board: buildBoard(pieceCount),
      getHistory() { return this._history.slice(); },
      getBoard() { return this._board; },
      getLastEvalCp() { return evalCp; },
      isGameOver: () => false,
      getTurn: () => 'w',
      getPlayerColor: () => 'w',
      getPiece: () => null,
      getLegalMoves: () => [],
      isInCheck: () => false,
      getCapturedPieces: () => ({ byWhite: [], byBlack: [], diff: 0 }),
    },
    CareerManager: {
      hasCharacter: () => true,
      player: {
        get: () => ({ playerName: 'Tester', elo: 1600, title: null }),
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
    },
    ReviewManager: {},
    SoundManager: {},
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

  UIManager.renderBoard = () => {};
  UIManager.showStatus = (msg) => { calls.status.push(msg); };
  UIManager._endGameByResignation = (result, msg) => {
    calls.endGame.push({ result, msg });
    return true;
  };

  return { UIManager, calls, getEl, mocks };
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
  console.log('\n── UIManager draw offers ──');

  await test('player draw offer is refused automatically in the opening', async () => {
    const { UIManager, calls, getEl } = makeUIManager({ pieceCount: 32, evalCp: 0, historyLength: 10 });
    getEl('btn-offer-draw');
    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    UIManager._aiThinking = false;

    const accepted = UIManager._onOfferDraw();
    assertEq(accepted, false);
    assertEq(calls.endGame.length, 0);
    assertEq(calls.status, ['Too early to offer a draw.']);
  });

  await test('player draw offer is accepted more easily in an equal endgame against a weaker opponent', async () => {
    const { UIManager, calls, mocks } = makeUIManager({ pieceCount: 10, evalCp: 0, historyLength: 20 });
    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    UIManager._aiThinking = false;
    UIManager._opponentElo = 1400;
    mocks.CareerManager.player.get = () => ({ playerName: 'Tester', elo: 1600, title: null });

    const originalRandom = Math.random;
    Math.random = () => 0.69;
    try {
      const accepted = UIManager._onOfferDraw();
      assertEq(accepted, true);
    } finally {
      Math.random = originalRandom;
    }

    assertEq(calls.endGame, [{ result: 'draw', msg: 'Draw agreed.' }]);
  });

  await test('player draw offer cooldown blocks immediate repeat offers', async () => {
    const { UIManager, calls } = makeUIManager({ pieceCount: 16, evalCp: 0, historyLength: 12 });
    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    UIManager._aiThinking = false;
    UIManager._opponentElo = 1600;
    UIManager._playerLastDrawOfferPly = 10;

    const accepted = UIManager._onOfferDraw();
    assertEq(accepted, false);
    assertEq(calls.status, ['You cannot offer another draw yet.']);
  });

  await test('AI can propose a draw after a long equal streak and opens the modal', async () => {
    const { UIManager, calls, getEl, mocks } = makeUIManager({ pieceCount: 18, evalCp: 0, historyLength: 24 });
    getEl('modal-draw-offer');
    getEl('draw-offer-body');
    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    UIManager._opponentElo = 1500;
    mocks.CareerManager.player.get = () => ({ playerName: 'Tester', elo: 1800, title: null });

    const originalRandom = Math.random;
    Math.random = () => 0.20;
    try {
      for (let i = 0; i < 7; i++) {
        assertEq(UIManager._checkAIDrawOffer(0), false);
      }
      assertEq(UIManager._checkAIDrawOffer(0), true);
    } finally {
      Math.random = originalRandom;
    }

    assertEq(getEl('modal-draw-offer').showCount, 1);
    assertEq(calls.status[calls.status.length - 1], 'Your opponent offers a draw.');
  });

  await test('AI draw offer modal accept and decline use the expected flows', async () => {
    const { UIManager, calls, getEl } = makeUIManager();
    getEl('btn-offer-draw');
    getEl('btn-resign');
    getEl('btn-draw-offer-accept');
    getEl('btn-draw-offer-decline');
    getEl('modal-draw-offer');
    UIManager._bindButtons();
    UIManager._gameActive = true;
    UIManager._gameConcluded = false;

    getEl('btn-draw-offer-accept').onclick();
    assertEq(calls.endGame[0], { result: 'draw', msg: 'Draw agreed.' });

    UIManager._gameActive = true;
    UIManager._gameConcluded = false;
    getEl('btn-draw-offer-decline').onclick();
    assertEq(calls.status[calls.status.length - 1], 'You decline the draw offer.');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
