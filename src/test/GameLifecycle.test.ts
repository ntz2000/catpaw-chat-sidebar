import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

type TimerCallback = () => void;

test('starting another game destroys the previous game timer and keyboard listener', () => {
  const dom = new JSDOM('<div id="mount"></div>', { runScripts: 'outside-only' });
  const { window } = dom;
  const callbacks = new Map<number, TimerCallback>();
  let nextTimer = 1;

  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({
      fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
      set fillStyle(_value: string) {}
    })
  });
  window.setInterval = ((callback: TimerCallback) => {
    const id = nextTimer++;
    callbacks.set(id, callback);
    return id as unknown as number;
  }) as typeof window.setInterval;
  window.clearInterval = ((id: number) => { callbacks.delete(Number(id)); }) as typeof window.clearInterval;
  (window as unknown as { WorkspaceGameCore: unknown }).WorkspaceGameCore = require('../../media/game-core.js');
  window.eval(readFileSync('media/games.js', 'utf8'));

  const games = (window as unknown as { WorkspaceGames: { start(name: string, mount: Element, save: (data: unknown) => void, old?: unknown): { destroy(): void } } }).WorkspaceGames;
  const mount = window.document.getElementById('mount')!;
  games.start('snake', mount, () => undefined);
  assert.equal(callbacks.size, 1);

  const arrow = new window.KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
  assert.equal(window.dispatchEvent(arrow), true, 'arrow keys are not captured by the games');
  const wasd = new window.KeyboardEvent('keydown', { key: 'a', cancelable: true });
  assert.equal(window.dispatchEvent(wasd), false, 'A is captured for game movement');

  games.start('breakout', mount, () => undefined);
  assert.equal(callbacks.size, 1, 'the previous game timer was cleared before starting the next game');
});
