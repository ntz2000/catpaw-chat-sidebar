import assert from 'node:assert/strict';
import test from 'node:test';

import { AppStateStore, MemoryStore } from '../app/AppStateStore';

test('privacy mode restores Dashboard instead of the private Inbox module', async () => {
  const store = new AppStateStore(new MemoryStore());

  await store.updateSettings({ privacyMode: true });
  await store.navigate('inbox');

  assert.equal(store.restoreModule(), 'dashboard');
});

test('quick hide switches to dashboard and restores the previous module', async () => {
  const store = new AppStateStore(new MemoryStore());
  await store.navigate('reader');

  assert.equal(await store.quickHide(), 'dashboard');
  assert.equal(await store.quickHide(), 'reader');
});

test('stores game best scores and the most recent game', async () => {
  const store = new AppStateStore(new MemoryStore());

  await store.saveGame('tetris', { score: 240, best: 240, snapshot: { board: [] } });

  assert.equal(store.snapshot().recentGame, 'tetris');
  assert.equal(store.snapshot().games.tetris.best, 240);
});

test('keeps Text Web navigation history, forward state, and bookmarks', async () => {
  const store = new AppStateStore(new MemoryStore());
  await store.openWeb({ url: 'https://example.com/one', title: 'One', timestamp: 1 });
  await store.openWeb({ url: 'https://example.com/two', title: 'Two', timestamp: 2 });

  assert.equal((await store.webBack())?.url, 'https://example.com/one');
  assert.equal((await store.webForward())?.url, 'https://example.com/two');
  assert.equal(await store.toggleWebBookmark(), true);
  assert.equal(store.snapshot().web.bookmarks[0].url, 'https://example.com/two');
  assert.equal(store.snapshot().web.history.length, 2);
});

test('keeps reader display preferences and chapter-aware bookmarks', async () => {
  const store = new AppStateStore(new MemoryStore());

  await store.updateSettings({ readerOpacity: 42, readerHeight: 480, readerMode: 'page', readerControlsHidden: true });
  await store.updateReader({
    chapterIndex: 2,
    chapterPosition: 34,
    bookmarks: [{ chapterIndex: 2, position: 34, label: '关键段落' }]
  });

  assert.equal(store.snapshot().settings.readerOpacity, 42);
  assert.equal(store.snapshot().settings.readerHeight, 480);
  assert.equal(store.snapshot().settings.readerMode, 'page');
  assert.equal(store.snapshot().settings.readerControlsHidden, true);
  assert.deepEqual(store.snapshot().reader.bookmarks, [{ chapterIndex: 2, position: 34, label: '关键段落' }]);
});
