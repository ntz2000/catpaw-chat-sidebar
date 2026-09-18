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

  await store.updateSettings({ readerOpacity: 42, readerHeight: 480, readerMode: 'page', readerControlsHidden: true, readerShield: true, readerHoverBlur: true });
  await store.updateReader({
    chapterIndex: 2,
    chapterPosition: 34,
    bookmarks: [{ chapterIndex: 2, position: 34, label: '关键段落' }]
  });

  assert.equal(store.snapshot().settings.readerOpacity, 42);
  assert.equal(store.snapshot().settings.readerHeight, 480);
  assert.equal(store.snapshot().settings.readerMode, 'page');
  assert.equal(store.snapshot().settings.readerControlsHidden, true);
  assert.equal(store.snapshot().settings.readerShield, true);
  assert.equal(store.snapshot().settings.readerHoverBlur, true);
  assert.deepEqual(store.snapshot().reader.bookmarks, [{ chapterIndex: 2, position: 34, label: '关键段落' }]);
});

test('keeps named reading progress independently for each bookshelf entry', async () => {
  const store = new AppStateStore(new MemoryStore());

  await store.upsertReaderLibraryEntry({ uri: 'file:///book-a.txt', title: '自定义书名 A' });
  await store.updateReaderLibraryEntry('file:///book-a.txt', {
    progress: 38,
    chapterIndex: 2,
    chapterPosition: 120,
    bookmarks: [{ chapterIndex: 2, position: 120, label: '继续阅读' }]
  });
  await store.upsertReaderLibraryEntry({ uri: 'file:///book-b.txt', title: '自定义书名 B' });

  const [latest, earlier] = store.snapshot().reader.library;
  assert.equal(latest.title, '自定义书名 B');
  assert.equal(earlier.title, '自定义书名 A');
  assert.equal(earlier.chapterIndex, 2);
  assert.equal(earlier.chapterPosition, 120);
  assert.deepEqual(earlier.bookmarks, [{ chapterIndex: 2, position: 120, label: '继续阅读' }]);
});

test('removing a bookshelf entry clears only its local record', async () => {
  const store = new AppStateStore(new MemoryStore());
  await store.upsertReaderLibraryEntry({ uri: 'file:///book.txt', title: '保留原文件' });
  await store.updateReader({ uri: 'file:///book.txt', title: '保留原文件' });

  await store.removeReaderLibraryEntry('file:///book.txt');

  assert.equal(store.snapshot().reader.library.length, 0);
  assert.equal(store.snapshot().reader.uri, undefined);
});

test('records recent chapters for the active bookshelf entry in newest-first order', async () => {
  const store = new AppStateStore(new MemoryStore());
  await store.upsertReaderLibraryEntry({ uri: 'file:///book.txt', title: '章节记录' });
  await store.updateReader({ uri: 'file:///book.txt', title: '章节记录' });

  await store.recordReaderRecentChapter('file:///book.txt', { chapterIndex: 1, chapterPosition: 20, title: '第二章' });
  await store.recordReaderRecentChapter('file:///book.txt', { chapterIndex: 2, chapterPosition: 30, title: '第三章' });

  assert.deepEqual(store.snapshot().reader.library[0].recentChapters.map((item) => item.title), ['第三章', '第二章']);
});

test('adds local reading time to the matching bookshelf entry', async () => {
  const store = new AppStateStore(new MemoryStore());
  await store.upsertReaderLibraryEntry({ uri: 'file:///book.txt', title: '阅读统计' });

  await store.addReaderReadingSeconds('file:///book.txt', 95);

  assert.equal(store.snapshot().reader.library[0].totalReadingSeconds, 95);
  assert.equal(typeof store.snapshot().reader.library[0].lastReadAt, 'number');
});
