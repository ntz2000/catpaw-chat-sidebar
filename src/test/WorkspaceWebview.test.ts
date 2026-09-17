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

test('Reader exposes legal online-library sources and opens the selected source in Text Web', () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only', url: 'https://workspace.test/' });
  const source = readFileSync(resolve(__dirname, '../../media/workspace.js'), 'utf8');
  dom.window.eval(`var __workspaceSent = []; var acquireVsCodeApi = () => ({ postMessage: message => __workspaceSent.push(message) });\n${source}`);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: { type: 'bootstrap', module: 'reader', app: { settings: {}, reader: { title: 'Local', progress: 0, position: 0, bookmarks: [] }, web: {} } }
  }));

  const sourceButton = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('.online-library .card')).find((button) => button.textContent?.includes('维基文库'));
  assert.equal(dom.window.document.querySelector('.online-library h3')?.textContent, 'Online Library');
  sourceButton?.click();
  const sent = dom.window.__workspaceSent as Array<Record<string, unknown>>;
  assert.equal(sent.at(-1)?.type, 'webOpen');
  assert.equal(sent.at(-1)?.url, 'https://zh.wikisource.org/zh-hans/Wikisource');
  dom.window.close();
});
