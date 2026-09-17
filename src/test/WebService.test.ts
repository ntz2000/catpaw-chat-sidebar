import assert from 'node:assert/strict';
import test from 'node:test';

// The WebService is intentionally tested against an in-memory HTML fixture;
// no test needs a real network connection.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const web = require('../services/WebService') as {
  normalizeWebUrl(value: string): string;
  WebServiceError: new (code: string, message: string) => Error & { code: string };
  extractWebPage(html: string, url: string): {
    title: string;
    blocks: Array<{ type: string; text?: string }>;
    readerBlocks: Array<{ type: string; text?: string }>;
    sourceText: string;
    links: Array<{ text: string; url: string }>;
    forms: Array<{ action: string; fields: Array<{ name: string; label: string }> }>;
    content: Array<{ tag: string; text?: string; href?: string; linkId?: number; formId?: string; children?: unknown[] }>;
  };
  WebService: new (fetchImpl: typeof fetch) => { fetchPage(url: string): Promise<{ forms: Array<{ action: string }>; frameEmbeddingBlocked?: boolean; frameEmbeddingReason?: string }> };
};

test('builds a clean reader view without navigation, cookies, login prompts or repeated footer text', () => {
  const page = web.extractWebPage(`<!doctype html><html><body>
    <header><nav>Home · Topics · Sign in</nav></header>
    <div class="cookie-banner">Accept cookies to continue</div>
    <main><article><h1>Clean chapter</h1><p>The chapter begins here.</p><p>It contains the complete reading text.</p></article></main>
    <aside>Recommended articles</aside><footer>Privacy · Terms · Sign in</footer>
  </body></html>`, 'https://example.com/chapter');

  const readerText = page.readerBlocks.map((block) => block.text || '').join(' ');
  assert.match(readerText, /The chapter begins here/);
  assert.doesNotMatch(readerText, /Accept cookies|Recommended|Privacy|Sign in/);
  assert.doesNotMatch(page.sourceText, /Accept cookies|Recommended/);
});

test('marks a page that forbids cross-origin frames so it is not opened in the IDE iframe browser', async () => {
  const service = new web.WebService(async () => new Response('<main><h1>Sign in</h1><p>Protected content</p></main>', {
    headers: {
      'content-type': 'text/html',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "default-src 'self'; frame-ancestors *.example.com"
    }
  }));

  const page = await service.fetchPage('https://secure.example.com/signin');

  assert.equal(page.frameEmbeddingBlocked, true);
  assert.match(page.frameEmbeddingReason || '', /X-Frame-Options/i);
});

test('normalizes a host name to HTTPS and rejects non-web protocols', () => {
  assert.equal(web.normalizeWebUrl('example.com/docs'), 'https://example.com/docs');
  assert.equal(web.normalizeWebUrl('http://example.com'), 'http://example.com/');
  assert.throws(
    () => web.normalizeWebUrl('javascript:alert(1)'),
    (error: unknown) => error instanceof web.WebServiceError && error.code === 'unsupported_protocol'
  );
});

test('extracts safe document blocks, links, image text and a text table', () => {
  const page = web.extractWebPage(`<!doctype html><html><head><title>Ignored title</title></head><body><article>
    <h1>Safe Web Article</h1><p>Read <a href="/guide">the guide</a> first.</p>
    <figure><img alt="Architecture overview"><figcaption>System diagram</figcaption></figure>
    <table><tr><th>Model</th><th>Score</th></tr><tr><td>A</td><td>92</td></tr></table>
    <script>window.executed = true</script>
  </article></body></html>`, 'https://example.com/article');

  assert.equal(page.title, 'Safe Web Article');
  assert.ok(page.blocks.some((block) => block.type === 'paragraph' && block.text?.includes('the guide [1]')));
  assert.ok(page.blocks.some((block) => block.text?.includes('[Image: Architecture overview]')));
  assert.ok(page.blocks.some((block) => block.type === 'table' && block.text?.includes('Model | Score')));
  assert.deepEqual(page.links, [{ id: 1, text: 'the guide', url: 'https://example.com/guide' }]);
});

test('falls back to the body when an article parser cannot identify a document', () => {
  const page = web.extractWebPage('<body><h2>Status</h2><p>Plain fallback content.</p></body>', 'https://example.com/status');

  assert.ok(page.blocks.some((block) => block.type === 'heading' && block.text === 'Status'));
  assert.ok(page.blocks.some((block) => block.type === 'paragraph' && block.text === 'Plain fallback content.'));
});

test('extracts a safe GET search form without retaining remote HTML', () => {
  const page = web.extractWebPage(`<!doctype html><form action="/s" method="get">
    <label for="query">Search</label><input id="query" name="wd" type="search" placeholder="Search the web">
    <button type="submit">Search</button></form>`, 'https://www.baidu.com/');

  assert.deepEqual(page.forms, [{
    id: 'form-1',
    action: 'https://www.baidu.com/s',
    fields: [{ name: 'wd', label: 'Search', placeholder: 'Search the web' }]
  }]);
});

test('preserves safe page structure, navigation, links and forms while removing images and scripts', () => {
  const page = web.extractWebPage(`<!doctype html><html><head><title>Project docs</title><style>.hidden { display: none }</style></head><body>
    <header><nav><a href="/home">Home</a><a href="/guide">Guide</a></nav></header>
    <main><article><h1>Project docs</h1><p>Read the <a href="/guide">guide</a> before deployment.</p>
      <img src="logo.png" alt="Company logo"><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Free</td><td>0</td></tr></table>
      <form action="/search" method="get"><input name="q" placeholder="Search docs"><button type="submit">Search</button></form>
    </article></main><script>window.secret = true</script></body></html>`, 'https://docs.example/');

  const serialized = JSON.stringify(page.content);
  assert.ok(page.content.some((node) => node.tag === 'header'));
  assert.match(serialized, /Home/);
  assert.match(serialized, /Project docs/);
  assert.match(serialized, /Plan/);
  assert.match(serialized, /form-1/);
  assert.doesNotMatch(serialized, /Company logo|window\.secret|hidden/);
  assert.ok(page.links.some((link) => link.text === 'Home' && link.url === 'https://docs.example/home'));
});

test('opens a form-only search page instead of rejecting it as empty content', async () => {
  const service = new web.WebService(async () => new Response('<form action="/s"><input name="wd" placeholder="Search"></form>', {
    status: 200,
    headers: { 'content-type': 'text/html' }
  }));

  const page = await service.fetchPage('https://www.baidu.com');

  assert.equal(page.forms[0].action, 'https://www.baidu.com/s');
});

test('follows a safe HTTPS-to-HTTP protocol handoff without executing page JavaScript', async () => {
  let calls = 0;
  const service = new web.WebService(async () => {
    calls += 1;
    return calls === 1
      ? new Response('<script>location.replace(location.href.replace("https://", "http://"));</script>', { headers: { 'content-type': 'text/html' } })
      : new Response('<form action="/s"><input name="wd"></form>', { headers: { 'content-type': 'text/html' } });
  });

  const page = await service.fetchPage('https://www.baidu.com/');

  assert.equal(calls, 2);
  assert.equal(page.forms[0].action, 'http://www.baidu.com/s');
});
