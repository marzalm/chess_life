// tests/ui-manager-ai-routing.test.js
//
// Focused Phase G regression tests for UIManager opponent routing.
// We do not exercise DOM rendering here — only the Maia vs Stockfish
// decision seam introduced in `_pickOpponentMove()`.

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'ui-manager.js'),
  'utf8',
);

let passed = 0;
let failed = 0;

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
  if (aj !== bj) throw new Error(`${msg || 'mismatch'}\n        expected: ${bj}\n        actual:   ${aj}`);
}

function makeUIManager({
  plyCount = 0,
  history = null,
  legalMoves = [],
  bookMove = null,
  maiaMove = 'g8f6',
  sfMove = 'e7e5',
} = {}) {
  const calls = {
    maiaBook: [],
    maia: [],
    sf: [],
  };

  const moveHistory = history || new Array(plyCount).fill('e4');

  const mocks = {
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
      createElement: () => ({
        className: '',
        dataset: {},
        style: {},
        appendChild() {},
        addEventListener() {},
        remove() {},
      }),
    },
    Chess: function MockChess() {
      this.get = () => null;
      this.move = () => null;
    },
    ChessEngine: {
      getHistory: () => moveHistory.slice(),
      getLegalMoves: () => legalMoves.slice(),
    },
    CareerManager: {},
    MaiaEngine: {
      getOpeningMove: async (fen, targetElo) => {
        calls.maiaBook.push({ fen, targetElo });
        return bookMove;
      },
      getMove: async (fen, targetElo, playerElo) => {
        calls.maia.push({ fen, targetElo, playerElo });
        return { move: maiaMove };
      },
    },
    StockfishOpponent: {
      getMove: async (fen, targetElo) => {
        calls.sf.push({ fen, targetElo });
        return { move: sfMove };
      },
    },
    FocusSystem: { render() {}, setMoveEvalCallback() {} },
    ReviewManager: {},
    SoundManager: {},
    BonusSystem: undefined,
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

  return { UIManager, calls };
}

(async () => {
  console.log('\n── UIManager AI routing ──');

  await test('targetElo > 2000 routes to StockfishOpponent', async () => {
    const { UIManager, calls } = makeUIManager();
    const move = await UIManager._pickOpponentMove('fen_a', 2200, 800);
    assertEq(move, 'e7e5');
    assertEq(calls.sf.length, 1, 'stockfish should be called once');
    assertEq(calls.maia.length, 0, 'maia move should not be called');
    assertEq(calls.maiaBook.length, 0, 'maia opening book should not be called');
  });

  await test('targetElo <= 2000 routes to Maia book in opening', async () => {
    const { UIManager, calls } = makeUIManager({ plyCount: 4, bookMove: 'd7d5' });
    const move = await UIManager._pickOpponentMove('fen_b', 1950, 800);
    assertEq(move, 'd7d5');
    assertEq(calls.maiaBook.length, 1);
    assertEq(calls.maia.length, 0, 'book hit should skip Maia policy');
    assertEq(calls.sf.length, 0);
  });

  await test('targetElo <= 2000 falls through to Maia move when no book move exists', async () => {
    const { UIManager, calls } = makeUIManager({ plyCount: 20, bookMove: null, maiaMove: 'c7c5' });
    const move = await UIManager._pickOpponentMove('fen_c', 1800, 800);
    assertEq(move, 'c7c5');
    assertEq(calls.maiaBook.length, 0, 'no opening-book query after ply 12');
    assertEq(calls.maia.length, 1);
    assertEq(calls.sf.length, 0);
  });

  await test('sub-2000 target still routes to Maia', async () => {
    const { UIManager, calls } = makeUIManager({ plyCount: 14, maiaMove: 'b8c6' });
    const move = await UIManager._pickOpponentMove('fen_d', 1999, 600);
    assertEq(move, 'b8c6');
    assertEq(calls.maia.length, 1);
    assertEq(calls.sf.length, 0);
  });

  await test('champion repertoire can override engine routing on move one', async () => {
    const { UIManager, calls } = makeUIManager({
      plyCount: 0,
      legalMoves: [{ from: 'd2', to: 'd4' }],
    });
    const originalRandom = Math.random;
    Math.random = () => 0.1;
    try {
      UIManager.setOpponent({
        name: 'Viktor Holm',
        elo: 2814,
        champion: {
          openingRepertoire: {
            asWhite: ['d2d4'],
            vsE4: 'c7c5',
            vsD4: 'g8f6',
            prob: 0.70,
          },
        },
      });
      const move = await UIManager._pickOpponentMove('fen_e', 2400, 800);
      assertEq(move, 'd2d4');
      assertEq(calls.sf.length, 0, 'engine should not be called when signature move triggers');
      assertEq(calls.maia.length, 0);
    } finally {
      Math.random = originalRandom;
    }
  });

  await test('champion repertoire returns the preferred reply about 70% of the time on controlled draws', async () => {
    const { UIManager } = makeUIManager({
      plyCount: 1,
      history: ['e4'],
      legalMoves: [{ from: 'c7', to: 'c5' }],
    });
    UIManager.setOpponent({
      name: 'Mateo Kovac',
      elo: 2850,
      champion: {
        openingRepertoire: {
          asWhite: ['e2e4'],
          vsE4: 'c7c5',
          vsD4: 'g8f6',
          prob: 0.70,
        },
      },
    });

    const originalRandom = Math.random;
    const draws = [
      0.01, 0.11, 0.21, 0.31, 0.41, 0.51, 0.61,
      0.71, 0.81, 0.91,
    ];
    let idx = 0;
    Math.random = () => draws[idx++];

    try {
      let preferredHits = 0;
      for (let i = 0; i < draws.length; i++) {
        const move = UIManager._pickChampionOpeningMove(1);
        if (move === 'c7c5') preferredHits++;
      }
      assertEq(preferredHits, 7);
    } finally {
      Math.random = originalRandom;
    }
  });

  await test('champion repertoire converges near the configured 70% rate over many seeded draws', async () => {
    const { UIManager } = makeUIManager({
      plyCount: 1,
      history: ['e4'],
      legalMoves: [{ from: 'c7', to: 'c5' }],
    });
    UIManager.setOpponent({
      name: 'Mateo Kovac',
      elo: 2850,
      champion: {
        openingRepertoire: {
          asWhite: ['e2e4'],
          vsE4: 'c7c5',
          vsD4: 'g8f6',
          prob: 0.70,
        },
      },
    });

    const originalRandom = Math.random;
    let state = 123456789;
    Math.random = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };

    try {
      let preferredHits = 0;
      const samples = 1000;
      for (let i = 0; i < samples; i++) {
        const move = UIManager._pickChampionOpeningMove(1);
        if (move === 'c7c5') preferredHits++;
      }
      const rate = preferredHits / samples;
      assert(rate >= 0.66 && rate <= 0.74, `expected seeded rate near 0.70, got ${rate}`);
    } finally {
      Math.random = originalRandom;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
