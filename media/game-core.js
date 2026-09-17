(function exposeGameCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WorkspaceGameCore = api;
  }
})(typeof globalThis === 'undefined' ? window : globalThis, () => {
  const TETRIS_WIDTH = 10;
  const TETRIS_HEIGHT = 20;
  const SHAPES = [
    [[1, 1, 1, 1]],
    [[1, 1], [1, 1]],
    [[1, 1, 1], [0, 1, 0]],
    [[1, 1, 0], [0, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 0, 0], [1, 1, 1]],
    [[0, 0, 1], [1, 1, 1]]
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function breakoutBrick(x, y, hp, index, level) {
    const powers = ['wide', 'slow', 'life', 'pierce', 'fast', 'shrink', 'sticky', 'multi'];
    return {
      x,
      y,
      width: 40,
      height: 14,
      hp: hp || 1,
      power: (index * 3 + level) % 8 === 0 ? powers[(index + level) % powers.length] : undefined
    };
  }

  function defaultBricks(level) {
    const bricks = [];
    const add = (x, y, hp) => bricks.push(breakoutBrick(x, y, hp, bricks.length, level));
    if (level === 1) {
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 6; column += 1) add(column * 48 + 8, row * 20 + 20, 1);
    } else if (level === 2) {
      for (let row = 0; row < 5; row += 1) for (let column = 0; column < 5; column += 1) add(column * 48 + 30 + (row % 2) * 18, row * 20 + 20, row === 2 ? 2 : 1);
    } else if (level === 3) {
      for (let row = 0; row < 5; row += 1) for (let column = row; column < 6 - row; column += 1) add(column * 48 + 8, row * 20 + 20, row >= 2 ? 2 : 1);
      for (let row = 1; row < 4; row += 1) for (let column = row; column < 6 - row; column += 1) add(column * 48 + 8, (5 + row) * 20 + 20, 2);
    } else if (level === 4) {
      for (let row = 0; row < 5; row += 1) for (let column = 0; column < 6; column += 1) if (column < 2 || column > 3 || row === 0 || row === 4) add(column * 48 + 8, row * 20 + 20, (row === 0 || row === 4) ? 2 : 1);
      add(128, 60, 3); add(128, 80, 3);
    } else {
      for (let row = 0; row < 6; row += 1) for (let column = 0; column < 6; column += 1) if (row === 0 || row === 5 || column === 0 || column === 5 || (row + column) % 2 === 0) add(column * 48 + 8, row * 20 + 20, row === 0 || row === 5 ? 3 : 2);
    }
    return bricks;
  }

  function createBreakoutState(input) {
    const data = input || {};
    const level = data.level || 1;
    const ball = { x: 150, y: 220, dx: 3, dy: -3, radius: 5, ...(data.ball || {}) };
    const balls = clone(data.balls || [ball]);
    return {
      width: 300,
      height: 300,
      paddle: { x: 125, y: 280, width: 50, height: 8, ...(data.paddle || {}) },
      ball: balls[0],
      balls,
      bricks: clone(data.bricks || defaultBricks(level)),
      powerUps: clone(data.powerUps || []),
      pierceHits: data.pierceHits || 0,
      sticky: data.sticky || 0,
      stuck: Boolean(data.stuck),
      score: data.score || 0,
      lives: data.lives === undefined ? 3 : data.lives,
      level,
      maxLevel: data.maxLevel || 5,
      status: data.status || 'running'
    };
  }

  function resetBreakoutBall(state) {
    const speed = 3 + (state.level - 1) * 0.35;
    state.balls = [{ x: state.width / 2, y: 220, dx: speed, dy: -speed, radius: 5 }];
    state.ball = state.balls[0];
  }

  function ballHitsRectangle(ball, rectangle) {
    return ball.x + ball.radius >= rectangle.x
      && ball.x - ball.radius <= rectangle.x + rectangle.width
      && ball.y + ball.radius >= rectangle.y
      && ball.y - ball.radius <= rectangle.y + rectangle.height;
  }

  function applyBreakoutPowerUp(state, item) {
    if (item.type === 'wide') state.paddle.width = Math.min(96, state.paddle.width + 22);
    if (item.type === 'slow') {
      state.balls.forEach((ball) => { ball.dx = Math.sign(ball.dx || 1) * Math.max(2, Math.abs(ball.dx) * 0.75); ball.dy = Math.sign(ball.dy || -1) * Math.max(2, Math.abs(ball.dy) * 0.75); });
    }
    if (item.type === 'life') state.lives = Math.min(5, state.lives + 1);
    if (item.type === 'pierce') state.pierceHits = Math.max(state.pierceHits, 6);
    if (item.type === 'fast') state.balls.forEach((ball) => { ball.dx = Math.sign(ball.dx || 1) * Math.min(6.5, Math.abs(ball.dx) * 1.3); ball.dy = Math.sign(ball.dy || -1) * Math.min(6.5, Math.abs(ball.dy) * 1.3); });
    if (item.type === 'shrink') state.paddle.width = Math.max(28, state.paddle.width - 16);
    if (item.type === 'sticky') state.sticky = Math.max(state.sticky, 3);
    if (item.type === 'multi' && state.balls.length < 3) {
      const source = state.balls[0];
      state.balls.push({ ...source, dx: Math.max(-6, source.dx - 1.6), dy: source.dy }, { ...source, dx: Math.min(6, source.dx + 1.6), dy: source.dy });
      state.balls = state.balls.slice(0, 3);
    }
    state.paddle.x = Math.max(0, Math.min(state.width - state.paddle.width, state.paddle.x));
  }

  function mapBreakoutPointer(clientX, left, cssWidth, canvasWidth) {
    const width = canvasWidth || 300;
    if (!cssWidth) return 0;
    return Math.max(0, Math.min(width, (clientX - left) / cssWidth * width));
  }

  function releaseBreakoutBall(state) {
    const next = clone(state);
    if (next.stuck && next.status === 'running') {
      next.stuck = false;
      next.balls.forEach((ball, index) => { ball.dx = index ? (index === 1 ? -3 : 3) : 3; ball.dy = -Math.max(2.2, Math.abs(ball.dy || 3)); });
      next.ball = next.balls[0];
    }
    return next;
  }

  function advanceBreakoutPowerUps(state) {
    state.powerUps = state.powerUps.filter((item) => {
      item.y += 2.4;
      const caught = item.x >= state.paddle.x - 8
        && item.x <= state.paddle.x + state.paddle.width + 8
        && item.y >= state.paddle.y - 8
        && item.y <= state.paddle.y + state.paddle.height + 8;
      if (caught) applyBreakoutPowerUp(state, item);
      return !caught && item.y <= state.height + 12;
    });
  }

  function advanceBreakout(state) {
    const next = clone(state);
    if (next.status !== 'running') {
      return next;
    }

    advanceBreakoutPowerUps(next);
    const { paddle } = next;
    if (next.stuck) {
      next.balls.forEach((ball, index) => { ball.x = paddle.x + paddle.width / 2 + index * 7; ball.y = paddle.y - ball.radius; });
      next.ball = next.balls[0];
      return next;
    }
    const activeBalls = [];
    next.balls.forEach((ball) => {
      ball.x += ball.dx;
      ball.y += ball.dy;
      if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= next.width) {
        ball.dx *= -1;
        ball.x = Math.max(ball.radius, Math.min(next.width - ball.radius, ball.x));
      }
      if (ball.y - ball.radius <= 0) { ball.dy = Math.abs(ball.dy); ball.y = ball.radius; }
      const hitsPaddleTop = ball.dy > 0 && ball.x + ball.radius >= paddle.x && ball.x - ball.radius <= paddle.x + paddle.width && ball.y - ball.radius <= paddle.y && ball.y + ball.radius >= paddle.y;
      if (hitsPaddleTop) {
        const centre = paddle.x + paddle.width / 2;
        ball.dx = Math.max(-5, Math.min(5, (ball.x - centre) / (paddle.width / 2) * 4));
        ball.dy = -Math.max(2.2, Math.abs(ball.dy));
        ball.y = paddle.y - ball.radius;
        if (next.sticky > 0) { next.sticky -= 1; next.stuck = true; }
      }
      const hitIndex = next.bricks.findIndex((brick) => ballHitsRectangle(ball, brick));
      if (hitIndex >= 0) {
        const brick = next.bricks[hitIndex];
        brick.hp = (brick.hp || 1) - 1;
        next.score += 10;
        if (brick.hp <= 0) {
          next.bricks.splice(hitIndex, 1);
          if (brick.power) next.powerUps.push({ type: brick.power, x: brick.x + brick.width / 2, y: brick.y + brick.height });
        }
        if (next.pierceHits > 0) next.pierceHits -= 1;
        else ball.dy *= -1;
      }
      if (ball.y + ball.radius <= next.height) activeBalls.push(ball);
    });
    next.balls = activeBalls;
    next.ball = next.balls[0] || next.ball;

    if (next.bricks.length === 0) {
      if (next.level >= next.maxLevel) {
        next.status = 'won';
      } else {
        next.level += 1;
        next.bricks = defaultBricks(next.level);
        next.powerUps = [];
        next.pierceHits = 0;
        resetBreakoutBall(next);
      }
      return next;
    }

    if (!next.balls.length) {
      next.lives -= 1;
      if (next.lives <= 0) {
        next.status = 'lost';
      } else {
        resetBreakoutBall(next);
      }
    }
    return next;
  }

  function emptyBoard() {
    return Array.from({ length: TETRIS_HEIGHT }, () => Array(TETRIS_WIDTH).fill(0));
  }

  function create2048State(input) {
    const data = input || {};
    const board = Array.isArray(data.board) && data.board.length === 16 ? data.board.slice() : Array(16).fill(0);
    return { board, score: data.score || 0 };
  }

  function move2048(state, direction) {
    const next = create2048State(state);
    let changed = false;
    const directionId = { left: 0, right: 1, up: 2, down: 3 }[direction];
    if (directionId === undefined) return { state: next, changed };
    for (let line = 0; line < 4; line += 1) {
      const indexes = [];
      for (let step = 0; step < 4; step += 1) indexes.push(directionId < 2 ? line * 4 + step : step * 4 + line);
      if (directionId === 1 || directionId === 3) indexes.reverse();
      const values = indexes.map((index) => next.board[index]).filter(Boolean);
      const merged = [];
      for (let index = 0; index < values.length; index += 1) {
        if (values[index] === values[index + 1]) {
          const value = values[index] * 2;
          merged.push(value);
          next.score += value;
          index += 1;
        } else merged.push(values[index]);
      }
      indexes.forEach((index, offset) => {
        const value = merged[offset] || 0;
        if (next.board[index] !== value) changed = true;
        next.board[index] = value;
      });
    }
    return { state: next, changed };
  }

  function has2048Moves(board) {
    return board.some((value) => !value) || board.some((value, index) => (
      (index % 4 < 3 && value === board[index + 1])
      || (index < 12 && value === board[index + 4])
    ));
  }

  function create2048History(state) {
    return { past: [], present: clone(state), future: [] };
  }

  function commit2048History(history, state) {
    const next = clone(history);
    next.past = [...next.past, clone(next.present)].slice(-50);
    next.present = clone(state);
    next.future = [];
    return next;
  }

  function undo2048History(history) {
    const next = clone(history);
    if (!next.past.length) return next;
    next.future.unshift(clone(next.present));
    next.present = next.past.pop();
    return next;
  }

  function redo2048History(history) {
    const next = clone(history);
    if (!next.future.length) return next;
    next.past.push(clone(next.present));
    next.present = next.future.shift();
    return next;
  }

  function createSnakeState(input) {
    const data = input || {};
    const width = data.width || 20;
    const height = data.height || 20;
    const initialLength = Math.max(1, Math.min(data.initialLength || 1, width));
    const startX = Math.max(initialLength - 1, Math.floor(width / 2));
    const startY = Math.floor(height / 2);
    return {
      width,
      height,
      body: clone(data.body || Array.from({ length: initialLength }, (_, index) => ({ x: startX - index, y: startY }))),
      direction: clone(data.direction || { x: 1, y: 0 }),
      food: clone(data.food || { x: 4, y: 4 }),
      wrap: Boolean(data.wrap),
      score: data.score || 0,
      status: data.status || 'running'
    };
  }

  function advanceSnake(state, nextFood) {
    const next = createSnakeState(state);
    if (next.status !== 'running') return next;
    const head = {
      x: next.body[0].x + next.direction.x,
      y: next.body[0].y + next.direction.y
    };
    if (next.wrap) {
      head.x = (head.x + next.width) % next.width;
      head.y = (head.y + next.height) % next.height;
    } else if (head.x < 0 || head.x >= next.width || head.y < 0 || head.y >= next.height) {
      next.status = 'lost';
      return next;
    }
    const ate = head.x === next.food.x && head.y === next.food.y;
    const collisionBody = ate ? next.body : next.body.slice(0, -1);
    if (collisionBody.some((part) => part.x === head.x && part.y === head.y)) {
      next.status = 'lost';
      return next;
    }
    next.body.unshift(head);
    if (ate) {
      next.score += 1;
      if (nextFood && !next.body.some((part) => part.x === nextFood.x && part.y === nextFood.y)) {
        next.food = clone(nextFood);
      }
    } else {
      next.body.pop();
    }
    if (next.body.length >= next.width * next.height) next.status = 'won';
    return next;
  }

  function createFlappyState(input) {
    const data = input || {};
    return {
      width: data.width || 300,
      height: data.height || 300,
      birdX: data.birdX || 120,
      birdRadius: data.birdRadius || 10,
      y: data.y === undefined ? 150 : data.y,
      velocity: data.velocity || 0,
      pipes: clone(data.pipes || []),
      tick: data.tick || 0,
      score: data.score || 0,
      status: data.status || 'running'
    };
  }

  function advanceFlappy(state, input) {
    const next = createFlappyState(state);
    if (next.status !== 'running') return next;
    const data = input || {};
    next.tick += 1;
    next.velocity += 0.45;
    next.y += next.velocity;
    if (next.tick % 85 === 0) {
      next.pipes.push({ x: next.width, gap: data.spawnGap === undefined ? 150 : data.spawnGap, counted: false });
    }
    next.pipes.forEach((pipe) => {
      pipe.x -= 3;
      if (!pipe.counted && pipe.x < next.birdX - next.birdRadius) {
        pipe.counted = true;
        next.score += 1;
      }
    });
    next.pipes = next.pipes.filter((pipe) => pipe.x > -35);
    const hitPipe = next.pipes.some((pipe) => (
      pipe.x < next.birdX + next.birdRadius
      && pipe.x + 30 > next.birdX - next.birdRadius
      && (next.y - next.birdRadius < pipe.gap - 42 || next.y + next.birdRadius > pipe.gap + 42)
    ));
    if (next.y - next.birdRadius < 0 || next.y + next.birdRadius > next.height || hitPipe) {
      next.status = 'lost';
    }
    return next;
  }

  function mineNeighbours(index, size) {
    const boardSize = size || 9;
    const row = Math.floor(index / boardSize);
    const column = index % boardSize;
    const result = [];
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        if ((!x && !y) || row + y < 0 || row + y >= boardSize || column + x < 0 || column + x >= boardSize) continue;
        result.push((row + y) * boardSize + column + x);
      }
    }
    return result;
  }

  function createMinesState(input) {
    const data = input || {};
    const size = data.size || 9;
    const mineCount = data.mineCount === undefined ? 10 : data.mineCount;
    return {
      size,
      mineCount,
      mines: [...new Set(data.mines || [])],
      revealed: [...new Set(data.revealed || [])],
      flags: [...new Set(data.flags || [])],
      firstMove: data.firstMove === undefined ? true : data.firstMove,
      status: data.status || 'running'
    };
  }

  function relocateMine(mines, from, size) {
    const result = mines.slice();
    const mineIndex = result.indexOf(from);
    if (mineIndex < 0) return result;
    const occupied = new Set(result);
    for (let candidate = 0; candidate < size * size; candidate += 1) {
      if (!occupied.has(candidate) && candidate !== from) {
        result[mineIndex] = candidate;
        return result;
      }
    }
    return result;
  }

  function openMineCell(state, index) {
    const next = createMinesState(state);
    if (next.status !== 'running' || next.flags.includes(index) || next.revealed.includes(index)) return next;
    if (next.firstMove) {
      next.mines = relocateMine(next.mines, index, next.size);
      next.firstMove = false;
    }
    const mineSet = new Set(next.mines);
    const revealed = new Set(next.revealed);
    if (mineSet.has(index)) {
      next.status = 'lost';
      for (let cell = 0; cell < next.size * next.size; cell += 1) revealed.add(cell);
      next.revealed = [...revealed];
      return next;
    }
    const count = (cell) => mineNeighbours(cell, next.size).filter((near) => mineSet.has(near)).length;
    const queue = [index];
    while (queue.length) {
      const current = queue.pop();
      if (current === undefined || revealed.has(current) || mineSet.has(current)) continue;
      revealed.add(current);
      if (!count(current)) mineNeighbours(current, next.size).forEach((near) => {
        if (!revealed.has(near) && !mineSet.has(near)) queue.push(near);
      });
    }
    next.revealed = [...revealed];
    if (revealed.size >= next.size * next.size - mineSet.size) next.status = 'won';
    return next;
  }

  function toggleMineFlag(state, index) {
    const next = createMinesState(state);
    if (next.status !== 'running' || next.revealed.includes(index)) return next;
    const flags = new Set(next.flags);
    if (flags.has(index)) flags.delete(index);
    else if (flags.size < next.mineCount) flags.add(index);
    next.flags = [...flags];
    return next;
  }

  function sudokuConflictIndexes(values) {
    const conflicts = new Set();
    const groups = [];
    for (let index = 0; index < 9; index += 1) {
      groups.push(Array.from({ length: 9 }, (_, column) => index * 9 + column));
      groups.push(Array.from({ length: 9 }, (_, row) => row * 9 + index));
    }
    for (let top = 0; top < 9; top += 3) for (let left = 0; left < 9; left += 3) {
      groups.push(Array.from({ length: 9 }, (_, offset) => (top + Math.floor(offset / 3)) * 9 + left + (offset % 3)));
    }
    groups.forEach((group) => {
      const seen = new Map();
      group.forEach((index) => {
        const value = values[index];
        if (!value) return;
        const matches = seen.get(value) || [];
        matches.push(index);
        seen.set(value, matches);
      });
      seen.forEach((indexes) => { if (indexes.length > 1) indexes.forEach((index) => conflicts.add(index)); });
    });
    return [...conflicts].sort((a, b) => a - b);
  }

  function createBubbleState(input) {
    const data = input || {};
    return { popped: [...new Set(data.popped || [])], count: data.count || 0 };
  }

  function popBubble(state, index) {
    const next = createBubbleState(state);
    if (!next.popped.includes(index)) {
      next.popped.push(index);
      next.count += 1;
    }
    return next;
  }

  function chooseShape(index) {
    return clone(SHAPES[(index || 0) % SHAPES.length]);
  }

  function createTetrisState(input) {
    const data = input || {};
    return {
      board: clone(data.board || emptyBoard()),
      piece: clone(data.piece || { x: 3, y: 0, shape: chooseShape(2) }),
      nextShape: clone(data.nextShape || chooseShape(0)),
      score: data.score || 0,
      lines: data.lines || 0,
      level: data.level || 1,
      status: data.status || 'running'
    };
  }

  function isTetrisPieceValid(board, piece) {
    return piece.shape.every((row, rowIndex) => row.every((cell, columnIndex) => {
      if (!cell) {
        return true;
      }
      const x = piece.x + columnIndex;
      const y = piece.y + rowIndex;
      return x >= 0 && x < TETRIS_WIDTH && y < TETRIS_HEIGHT && (y < 0 || !board[y][x]);
    }));
  }

  function rotate(shape) {
    return shape[0].map((_, index) => shape.map((row) => row[index]).reverse());
  }

  function clearLines(state) {
    const remaining = state.board.filter((row) => row.some((cell) => !cell));
    const cleared = TETRIS_HEIGHT - remaining.length;
    while (remaining.length < TETRIS_HEIGHT) {
      remaining.unshift(Array(TETRIS_WIDTH).fill(0));
    }
    state.board = remaining;
    if (cleared > 0) {
      state.lines += cleared;
      state.score += [0, 100, 300, 500, 800][cleared] * state.level;
      state.level = 1 + Math.floor(state.lines / 10);
    }
  }

  function spawnTetrisPiece(state) {
    state.piece = { x: 3, y: 0, shape: clone(state.nextShape) };
    const index = Math.floor(Math.random() * SHAPES.length);
    state.nextShape = chooseShape(index);
    if (!isTetrisPieceValid(state.board, state.piece)) {
      state.status = 'lost';
    }
  }

  function lockTetrisPiece(state) {
    state.piece.shape.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
      if (!cell) {
        return;
      }
      const x = state.piece.x + columnIndex;
      const y = state.piece.y + rowIndex;
      if (y >= 0 && y < TETRIS_HEIGHT && x >= 0 && x < TETRIS_WIDTH) {
        state.board[y][x] = 1;
      }
    }));
    clearLines(state);
    spawnTetrisPiece(state);
  }

  function moveTetris(state, action) {
    const next = clone(state);
    if (next.status !== 'running') {
      return next;
    }

    if (action === 'left' || action === 'right') {
      const candidate = clone(next.piece);
      candidate.x += action === 'left' ? -1 : 1;
      if (!isTetrisPieceValid(next.board, candidate)) {
        return clone(state);
      }
      next.piece = candidate;
      return next;
    }

    if (action === 'rotate') {
      const candidate = clone(next.piece);
      candidate.shape = rotate(candidate.shape);
      if (!isTetrisPieceValid(next.board, candidate)) {
        return clone(state);
      }
      next.piece = candidate;
      return next;
    }

    if (action === 'drop') {
      while (isTetrisPieceValid(next.board, { ...next.piece, y: next.piece.y + 1 })) {
        next.piece.y += 1;
      }
      lockTetrisPiece(next);
      return next;
    }

    const candidate = clone(next.piece);
    candidate.y += 1;
    if (isTetrisPieceValid(next.board, candidate)) {
      next.piece = candidate;
      return next;
    }
    lockTetrisPiece(next);
    return next;
  }

  return {
    createBreakoutState,
    advanceBreakout,
    mapBreakoutPointer,
    releaseBreakoutBall,
    create2048State,
    move2048,
    has2048Moves,
    create2048History,
    commit2048History,
    undo2048History,
    redo2048History,
    createSnakeState,
    advanceSnake,
    createFlappyState,
    advanceFlappy,
    createMinesState,
    openMineCell,
    toggleMineFlag,
    mineNeighbours,
    sudokuConflictIndexes,
    createBubbleState,
    popBubble,
    createTetrisState,
    isTetrisPieceValid,
    moveTetris
  };
});
