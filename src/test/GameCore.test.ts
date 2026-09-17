import assert from 'node:assert/strict';
import test from 'node:test';

// This is intentionally a CommonJS boundary: the same small game core is
// loaded by the browser webview without a bundler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../../media/game-core.js') as {
  createBreakoutState(input?: unknown): unknown;
  advanceBreakout(state: unknown): unknown;
  mapBreakoutPointer(clientX: number, left: number, cssWidth: number, canvasWidth?: number): number;
  createTetrisState(input?: unknown): unknown;
  moveTetris(state: unknown, action: 'left' | 'right' | 'down' | 'rotate' | 'drop'): unknown;
  create2048State(input?: unknown): unknown;
  move2048(state: unknown, direction: 'left' | 'right' | 'up' | 'down'): { state: { board: number[]; score: number }; changed: boolean };
  has2048Moves(board: number[]): boolean;
  create2048History(state: unknown): unknown;
  commit2048History(history: unknown, state: unknown): unknown;
  undo2048History(history: unknown): unknown;
  redo2048History(history: unknown): unknown;
  createSnakeState(input?: unknown): unknown;
  advanceSnake(state: unknown, nextFood?: { x: number; y: number }): unknown;
  createFlappyState(input?: unknown): unknown;
  advanceFlappy(state: unknown, input?: { spawnGap?: number }): unknown;
  createMinesState(input?: unknown): unknown;
  openMineCell(state: unknown, index: number): unknown;
  toggleMineFlag(state: unknown, index: number): unknown;
  mineNeighbours(index: number, size?: number): number[];
  sudokuConflictIndexes(values: string[]): number[];
  createBubbleState(input?: unknown): unknown;
  popBubble(state: unknown, index: number): unknown;
};

test('breakout automatically starts the next level after a non-final board is cleared', () => {
  const state = core.createBreakoutState({
    ball: { x: 30, y: 20, dx: 0, dy: 1 },
    bricks: [{ x: 10, y: 20, width: 40, height: 14 }]
  });

  const next = core.advanceBreakout(state) as { bricks: unknown[]; score: number; status: string; level: number };

  assert.ok(next.bricks.length > 0);
  assert.equal(next.score, 10);
  assert.equal(next.level, 2);
  assert.equal(next.status, 'running');
});

test('breakout ends only after the final level is cleared', () => {
  const state = core.createBreakoutState({
    level: 3,
    maxLevel: 3,
    ball: { x: 30, y: 20, dx: 0, dy: 1 },
    bricks: [{ x: 10, y: 20, width: 40, height: 14 }]
  });
  const next = core.advanceBreakout(state) as { status: string; level: number };

  assert.equal(next.level, 3);
  assert.equal(next.status, 'won');
});

test('breakout drops and applies a wide-paddle power-up', () => {
  const hit = core.advanceBreakout(core.createBreakoutState({
    ball: { x: 30, y: 20, dx: 0, dy: 1 },
    bricks: [
      { x: 10, y: 20, width: 40, height: 14, power: 'wide' },
      { x: 250, y: 20, width: 40, height: 14 }
    ]
  })) as { powerUps: Array<{ type: string }> };
  assert.deepEqual(hit.powerUps.map((item) => item.type), ['wide']);

  const caught = core.advanceBreakout(core.createBreakoutState({
    bricks: [{ x: 10, y: 20, width: 40, height: 14 }],
    ball: { x: 150, y: 120, dx: 0, dy: -1 },
    powerUps: [{ type: 'wide', x: 150, y: 276 }]
  })) as { paddle: { width: number }; powerUps: unknown[] };
  assert.equal(caught.paddle.width, 72);
  assert.equal(caught.powerUps.length, 0);
});

test('breakout maps a pointer at the rendered right edge to the canvas right edge', () => {
  assert.equal(core.mapBreakoutPointer(460, 160, 300), 300);
  assert.equal(core.mapBreakoutPointer(10, 160, 300), 0);
});

test('breakout levels use distinct layouts and introduce durable bricks', () => {
  const first = core.createBreakoutState({ level: 1 }) as { bricks: Array<{ x: number; y: number; hp: number }> };
  const fourth = core.createBreakoutState({ level: 4 }) as { bricks: Array<{ x: number; y: number; hp: number }> };

  assert.notDeepEqual(first.bricks.map((brick) => [brick.x, brick.y]), fourth.bricks.map((brick) => [brick.x, brick.y]));
  assert.ok(fourth.bricks.some((brick) => brick.hp >= 2));
});

test('breakout damages a durable brick before removing it', () => {
  const state = core.createBreakoutState({
    bricks: [{ x: 10, y: 20, width: 40, height: 14, hp: 2 }],
    ball: { x: 30, y: 20, dx: 0, dy: 1 }
  });
  const firstHit = core.advanceBreakout(state) as { bricks: Array<{ hp: number }>; score: number };

  assert.equal(firstHit.bricks.length, 1);
  assert.equal(firstHit.bricks[0].hp, 1);
  assert.equal(firstHit.score, 10);
});

test('breakout does not bounce a ball that has already passed below the paddle', () => {
  const state = core.createBreakoutState({
    paddle: { x: 125, y: 280, width: 50, height: 8 },
    ball: { x: 150, y: 289, dx: 0, dy: 3, radius: 5 },
    bricks: [{ x: 10, y: 20, width: 40, height: 14 }]
  });

  const next = core.advanceBreakout(state) as { ball: { dy: number } };

  assert.ok(next.ball.dy > 0);
});

test('breakout loses a life as soon as the ball crosses the bottom edge', () => {
  const state = core.createBreakoutState({
    lives: 3,
    ball: { x: 15, y: 296, dx: 0, dy: 3, radius: 5 },
    bricks: [{ x: 10, y: 20, width: 40, height: 14 }]
  });

  const next = core.advanceBreakout(state) as { lives: number; ball: { y: number; dy: number } };

  assert.equal(next.lives, 2);
  assert.equal(next.ball.y, 220);
  assert.equal(next.ball.dy, -3);
});

test('tetris locks a soft-dropped piece at its last valid position', () => {
  const state = core.createTetrisState({
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    piece: { x: 4, y: 18, shape: [[1], [1]] },
    nextShape: [[1, 1], [1, 1]]
  });

  const next = core.moveTetris(state, 'down') as { board: number[][]; piece: { y: number }; status: string };

  assert.equal(next.board[18][4], 1);
  assert.equal(next.board[19][4], 1);
  assert.equal(next.piece.y, 0);
  assert.equal(next.status, 'running');
});

test('tetris rejects a rotation that would leave the board', () => {
  const state = core.createTetrisState({
    piece: { x: 9, y: 0, shape: [[1], [1], [1]] }
  });
  const before = JSON.stringify(state);

  const next = core.moveTetris(state, 'rotate');

  assert.equal(JSON.stringify(next), before);
});

test('2048 merges each pair only once and returns a stable moved board', () => {
  const state = core.create2048State({ board: [2, 2, 2, 2, ...Array(12).fill(0)], score: 0 });

  const result = core.move2048(state, 'left');

  assert.deepEqual(result.state.board, [4, 4, 0, 0, ...Array(12).fill(0)]);
  assert.equal(result.state.score, 8);
  assert.equal(result.changed, true);
});

test('2048 detects a blocked board and does not report a move where no merge exists', () => {
  const board = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2
  ];
  const result = core.move2048(core.create2048State({ board }), 'left');

  assert.equal(result.changed, false);
  assert.equal(core.has2048Moves(board), false);
});

test('2048 history restores an earlier board and can redo it', () => {
  const first = { board: [2, ...Array(15).fill(0)], score: 0, status: 'running' };
  const second = { board: [4, ...Array(15).fill(0)], score: 4, status: 'running' };
  const committed = core.commit2048History(core.create2048History(first), second);
  const undone = core.undo2048History(committed) as { present: { board: number[] }; future: unknown[] };
  const redone = core.redo2048History(undone) as { present: { board: number[] }; future: unknown[] };

  assert.equal(undone.present.board[0], 2);
  assert.equal(undone.future.length, 1);
  assert.equal(redone.present.board[0], 4);
  assert.equal(redone.future.length, 0);
});

test('snake ends at a wall instead of wrapping through it', () => {
  const state = core.createSnakeState({
    body: [{ x: 19, y: 3 }],
    direction: { x: 1, y: 0 }
  });
  const next = core.advanceSnake(state) as { status: string; body: Array<{ x: number; y: number }> };

  assert.equal(next.status, 'lost');
  assert.deepEqual(next.body, [{ x: 19, y: 3 }]);
});

test('snake can wrap at a wall when the option is enabled', () => {
  const state = core.createSnakeState({
    wrap: true,
    body: [{ x: 19, y: 3 }],
    direction: { x: 1, y: 0 }
  });
  const next = core.advanceSnake(state) as { status: string; body: Array<{ x: number; y: number }> };

  assert.equal(next.status, 'running');
  assert.deepEqual(next.body[0], { x: 0, y: 3 });
});

test('snake creates the requested initial length behind its starting head', () => {
  const state = core.createSnakeState({ initialLength: 5 }) as { body: Array<{ x: number; y: number }> };
  assert.equal(state.body.length, 5);
  assert.equal(state.body[0].x - state.body[4].x, 4);
});

test('snake grows only after eating food and chooses the supplied next food cell', () => {
  const state = core.createSnakeState({
    body: [{ x: 5, y: 5 }],
    direction: { x: 1, y: 0 },
    food: { x: 6, y: 5 }
  });
  const next = core.advanceSnake(state, { x: 2, y: 2 }) as {
    body: unknown[];
    score: number;
    food: { x: number; y: number };
  };

  assert.equal(next.body.length, 2);
  assert.equal(next.score, 1);
  assert.deepEqual(next.food, { x: 2, y: 2 });
});

test('flappy scores a pipe once and then ends on a pipe collision', () => {
  const scored = core.advanceFlappy(core.createFlappyState({
    y: 150,
    velocity: 0,
    pipes: [{ x: 109, gap: 150, counted: false }]
  })) as { score: number; pipes: Array<{ counted: boolean }>; status: string };
  assert.equal(scored.score, 1);
  assert.equal(scored.pipes[0].counted, true);
  assert.equal(scored.status, 'running');

  const crashed = core.advanceFlappy(core.createFlappyState({
    y: 30,
    velocity: 0,
    pipes: [{ x: 110, gap: 150, counted: false }]
  })) as { status: string };
  assert.equal(crashed.status, 'lost');
});

test('mines makes the first opened cell safe and expands empty cells', () => {
  const state = core.createMinesState({ mines: [0], firstMove: true });
  const next = core.openMineCell(state, 0) as { status: string; mines: number[]; revealed: number[]; firstMove: boolean };

  assert.equal(next.status, 'running');
  assert.equal(next.firstMove, false);
  assert.ok(!next.mines.includes(0));
  assert.ok(next.revealed.includes(0));
  assert.deepEqual(core.mineNeighbours(0).sort((a, b) => a - b), [1, 9, 10]);
});

test('mines does not flag a revealed cell', () => {
  const opened = core.openMineCell(core.createMinesState({ mines: [80], firstMove: false }), 0);
  const next = core.toggleMineFlag(opened, 0) as { flags: number[] };
  assert.equal(next.flags.includes(0), false);
});

test('sudoku highlights duplicate values only, not an otherwise valid incomplete entry', () => {
  const values = Array(81).fill('');
  values[0] = '4';
  assert.deepEqual(core.sudokuConflictIndexes(values), []);
  values[1] = '4';
  assert.deepEqual(core.sudokuConflictIndexes(values), [0, 1]);
});

test('bubble pop only increments once for the same bubble', () => {
  const once = core.popBubble(core.createBubbleState(), 12) as { popped: number[]; count: number };
  const twice = core.popBubble(once, 12) as { popped: number[]; count: number };
  assert.equal(twice.count, 1);
  assert.deepEqual(twice.popped, [12]);
});
