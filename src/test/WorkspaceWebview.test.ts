import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

function openWebResultView(pageOverrides: Record<string, unknown> = {}) {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', {
    runScripts: 'outside-only',
    url: 'https://workspace.test/'
  });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  const preservedSource = readFileSync(resolve(__dirname, '../../media/web-preserved.js'), 'utf8');
  const fullSource = readFileSync(resolve(__dirname, '../../media/web-full.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}\n${preservedSource}\n${fullSource}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: {
      type: 'bootstrap',
      module: 'web',
      app: {
        settings: {},
        web: {
          current: { url: 'https://search.example/?q=workspace', title: 'workspace' },
          backStack: [], forwardStack: [], history: [], bookmarks: []
        }
      }
    }
  }));
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: {
      type: 'webPage',
      app: {
        settings: {},
        web: {
          current: { url: 'https://search.example/?q=workspace', title: 'workspace' },
          backStack: [], forwardStack: [], history: [], bookmarks: []
        }
      },
      page: {
        title: 'workspace results',
        finalUrl: 'https://search.example/?q=workspace',
        blocks: [{ type: 'heading', level: 1, text: 'Workspace documentation' }, { type: 'paragraph', text: 'A searchable, text-first page.' }],
        readerBlocks: [{ type: 'heading', level: 1, text: 'Workspace documentation' }, { type: 'paragraph', text: 'A searchable, text-first page.' }],
        sourceText: 'Workspace documentation A searchable, text-first page.', forms: [], limitedContent: false,
        content: [
          {
            tag: 'header', children: [{ tag: 'nav', children: [
              { tag: 'span', href: 'https://docs.example/home', linkId: 1, children: [{ tag: 'span', text: 'Home' }] }
            ] }]
          },
          {
            tag: 'main', children: [{ tag: 'article', children: [
              { tag: 'h1', children: [{ tag: 'span', text: 'Workspace documentation' }] },
              { tag: 'p', children: [{ tag: 'span', text: 'A searchable, text-first page.' }] }
            ] }]
          }
        ],
        links: [
          { id: 1, text: '[Image]', url: 'https://search.example/image.png' },
          { id: 2, text: 'Workspace documentation', url: 'https://docs.example/workspace' },
          { id: 3, text: '详情', url: 'https://search.example/detail' }
        ],
        ...pageOverrides
      }
    }
  }));
  return { dom, sent: dom.window.__workspaceSent as Array<Record<string, unknown>> };
}

test('renders normalized reader blocks instead of preserved page navigation', async () => {
  const { dom, sent } = openWebResultView();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const result = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('.web-link')).find((button) => button.textContent?.includes('Workspace documentation'));

  assert.equal(dom.window.document.querySelectorAll('.web-page header').length, 0);
  assert.equal(dom.window.document.querySelectorAll('.web-page img').length, 0);
  assert.match(dom.window.document.body.textContent ?? '', /Workspace documentation/);
  assert.match(dom.window.document.body.textContent ?? '', /Related links/);

  result?.click();
  assert.equal(sent.at(-1)?.type, 'webOpen');
  assert.equal(sent.at(-1)?.url, 'https://docs.example/workspace');
  dom.window.close();
});

test('keeps an explicit system-browser action without relabeling it as embedded browsing', async () => {
  const { dom, sent } = openWebResultView();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const button = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent === 'Open External');

  assert.equal(button?.textContent, 'Open External');
  button?.click();
  assert.equal(sent.at(-1)?.type, 'webOpenExternal');
  assert.equal(sent.at(-1)?.url, 'https://search.example/?q=workspace');
  dom.window.close();
});

test('offers an IDE browser action for a full page in the editor area', async () => {
  const { dom, sent } = openWebResultView();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const button = dom.window.document.querySelector<HTMLButtonElement>('[data-open-ide-browser]');

  assert.equal(button?.textContent, 'Interactive Browser');
  button?.click();
  assert.equal(sent.at(-1)?.type, 'webOpenIntegrated');
  assert.equal(sent.at(-1)?.url, 'https://search.example/?q=workspace');
  dom.window.close();
});

test('does not offer the IDE iframe browser when the site forbids frame embedding', async () => {
  const { dom } = openWebResultView({
    limitedContent: true,
    frameEmbeddingBlocked: true,
    frameEmbeddingReason: 'This site sends X-Frame-Options: SAMEORIGIN.'
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(dom.window.document.querySelector('[data-open-ide-browser]'), null);
  assert.match(dom.window.document.body.textContent || '', /forbids embedded frames/i);
  assert.match(dom.window.document.body.textContent || '', /X-Frame-Options/i);
  dom.window.close();
});

test('switches from safe text to an in-Workspace full-page frame when a site permits embedding', async () => {
  const { dom } = openWebResultView();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const toggle = dom.window.document.querySelector<HTMLButtonElement>('[data-web-mode-toggle]');

  assert.equal(toggle?.textContent, 'Full Mode');
  toggle?.click();
  await new Promise<void>((resolve) => setImmediate(resolve));

  const frame = dom.window.document.querySelector<HTMLIFrameElement>('.web-full-frame');
  assert.equal(frame?.src, 'https://search.example/?q=workspace');
  assert.match(frame?.getAttribute('sandbox') || '', /allow-scripts/);
  assert.match(frame?.getAttribute('sandbox') || '', /allow-forms/);
  assert.equal(dom.window.document.querySelector<HTMLButtonElement>('[data-web-mode-toggle]')?.textContent, 'Text Mode');
  dom.window.close();
});

test('Reader is local-only and turns pages from global Ctrl shortcuts', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only', url: 'https://workspace.test/' });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: {
      type: 'bootstrap', module: 'reader',
      app: { settings: { readerOpacity: 42, readerHeight: 480 }, reader: { title: 'Local', progress: 0, position: 0, chapterIndex: 0, bookmarks: [], library: [] }, web: {} },
      readerDocument: { title: 'Local', uri: 'file:///local.txt', encoding: 'utf-8', chapters: [{ index: 0, title: '第一章', start: 0, end: 2 }, { index: 1, title: '第二章', start: 2, end: 4 }] },
      readerChapter: { chapter: { index: 0, title: '第一章', start: 0, end: 2 }, text: '正文' }
    }
  }));

  const surface = dom.window.document.querySelector<HTMLElement>('.reader-surface');
  let pageMovement = 0;
  Object.defineProperty(surface, 'clientHeight', { value: 240 });
  if (surface) surface.scrollBy = ((...args: unknown[]) => { pageMovement += Number(args[1] ?? 0); }) as typeof surface.scrollBy;
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ';', ctrlKey: true, bubbles: true }));
  const sent = dom.window.__workspaceSent as Array<Record<string, unknown>>;
  assert.equal(dom.window.document.querySelector('.online-library'), null);
  assert.equal(pageMovement, -240);
  assert.notEqual(sent.at(-1)?.type, 'readerOpenChapter');
  const display = Array.from(dom.window.document.querySelectorAll('button')).find((item) => item.textContent === '显示');
  display?.click();
  assert.match(dom.window.document.querySelector('.reader-opacity-control')?.textContent ?? '', /Opacity/);
  const size = dom.window.document.querySelector<HTMLInputElement>('.reader-size-control input');
  assert.equal(size?.value, '480');
  if (size) {
    size.value = '640';
    size.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal((sent.at(-1)?.data as { readerHeight?: number }).readerHeight, 640);
  const readerPage = dom.window.document.querySelector<HTMLElement>('.reader-page');
  assert.equal(readerPage?.style.getPropertyValue('--reader-opacity'), '0.42');
  assert.equal(readerPage?.style.getPropertyValue('--reader-height'), '640px');
  const hideControls = dom.window.document.querySelector<HTMLInputElement>('.reader-hide-control input');
  hideControls?.click();
  assert.equal(sent.at(-1)?.type, 'updateSettings');
  assert.equal((sent.at(-1)?.data as { readerControlsHidden?: boolean }).readerControlsHidden, true);
  dom.window.close();
});

test('Reader batches frequent scroll progress saves', async () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only', url: 'https://workspace.test/' });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: { type: 'bootstrap', module: 'reader', app: { settings: {}, reader: { chapterIndex: 0, bookmarks: [], library: [] }, web: {} }, readerDocument: { title: 'Local', chapters: [{ index: 0, title: '第一章', start: 0, end: 10 }] }, readerChapter: { chapter: { index: 0, title: '第一章', start: 0, end: 10 }, text: '正文' } }
  }));
  const surface = dom.window.document.querySelector<HTMLElement>('.reader-surface');
  Object.defineProperty(surface, 'scrollHeight', { value: 1000 });
  Object.defineProperty(surface, 'clientHeight', { value: 200 });
  if (surface) surface.scrollTop = 100;
  surface?.dispatchEvent(new dom.window.Event('scroll'));
  surface?.dispatchEvent(new dom.window.Event('scroll'));
  const sent = dom.window.__workspaceSent as Array<Record<string, unknown>>;
  assert.equal(sent.filter((item) => item.type === 'saveReader').length, 0);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(sent.filter((item) => item.type === 'saveReader').length, 1);
  dom.window.close();
});

test('Reader shows Chinese bookshelf and display entries with hover hints', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only', url: 'https://workspace.test/' });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: { type: 'bootstrap', module: 'reader', app: { settings: {}, reader: { uri: 'file:///book.txt', title: '自定义书名', chapterIndex: 0, chapterPosition: 0, bookmarks: [], library: [{ uri: 'file:///book.txt', title: '自定义书名', lastOpened: 1, progress: 22, chapterIndex: 0, chapterPosition: 0, bookmarks: [], recentChapters: [], totalReadingSeconds: 0 }] }, web: {} }, readerDocument: { title: 'book.txt', chapters: [{ index: 0, title: '第一章', start: 0, end: 2 }] }, readerChapter: { chapter: { index: 0, title: '第一章', start: 0, end: 2 }, text: '正文' } }
  }));

  const libraryButton = Array.from(dom.window.document.querySelectorAll('button')).find((item) => item.textContent === '书架');
  const displayButton = Array.from(dom.window.document.querySelectorAll('button')).find((item) => item.textContent === '显示');
  assert.equal(libraryButton?.getAttribute('title'), 'Open library');
  assert.equal(displayButton?.getAttribute('title'), 'Display options');
  libraryButton?.click();
  assert.match(dom.window.document.body.textContent ?? '', /自定义书名/);
  dom.window.close();
});

test('Hidden Reader controls keep a fixed restore control and support opacity shortcuts', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only', url: 'https://workspace.test/' });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: { type: 'bootstrap', module: 'reader', app: { settings: { readerControlsHidden: true, readerOpacity: 40 }, reader: { chapterIndex: 0, bookmarks: [], library: [] }, web: {} }, readerDocument: { title: 'Local', chapters: [{ index: 0, title: '第一章', start: 0, end: 2 }] }, readerChapter: { chapter: { index: 0, title: '第一章', start: 0, end: 2 }, text: '正文' } }
  }));
  assert.equal(dom.window.document.querySelector('.reader-page')?.classList.contains('reader-controls-hidden'), true);
  assert.equal(dom.window.document.querySelector('.shell')?.classList.contains('reader-focus-shell'), true);
  assert.equal(dom.window.document.querySelector('.reader-focus-restore')?.textContent, '恢复');
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true }));
  const sent = dom.window.__workspaceSent as Array<Record<string, unknown>>;
  assert.equal((sent.at(-1)?.data as { readerOpacity?: number }).readerOpacity, 45);
  dom.window.document.querySelector<HTMLButtonElement>('.reader-focus-restore')?.click();
  assert.equal((sent.at(-1)?.data as { readerControlsHidden?: boolean }).readerControlsHidden, false);
  dom.window.close();
});

test('Settings exposes Reader height and Quick Hide shortcut configuration', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only', url: 'https://workspace.test/' });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'bootstrap', module: 'settings', app: { settings: {}, reader: {}, web: {} } } }));
  assert.match(dom.window.document.body.textContent ?? '', /Reader Height/);
  const configure = Array.from(dom.window.document.querySelectorAll('button')).find((item) => item.textContent === 'Configure Quick Hide Shortcut');
  configure?.click();
  assert.equal((dom.window.__workspaceSent as Array<Record<string, unknown>>).at(-1)?.type, 'readerConfigureQuickHide');
  dom.window.close();
});
