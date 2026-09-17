import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

import { WebBlock, WebContentNode, WebContentTag, WebForm, WebLink, WebPage } from '../types/web';

const MAX_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const REMOVED_ELEMENTS = 'script,style,noscript,svg,canvas,iframe,nav,footer,aside,form,dialog,[role="navigation"],[role="banner"],[role="complementary"],.advertisement,.ads,.ad,.cookie,.newsletter,.social,.share';
const OMITTED_CONTENT_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'embed', 'object', 'img', 'picture', 'source', 'video', 'audio', 'track', 'dialog']);
const CONTENT_TAGS = new Set<WebContentTag>(['article', 'aside', 'blockquote', 'div', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'span', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul']);
const MAX_CONTENT_NODES = 3_000;
const MAX_CONTENT_TEXT = 500_000;
const READER_NOISE_SELECTORS = 'header,nav,footer,aside,form,dialog,[role="navigation"],[role="banner"],[role="complementary"],.advertisement,.ads,.ad,.cookie,.cookies,.cookie-banner,.consent,.newsletter,.social,.share,.recommend,.related,.comments,.comment,.login,.signin,.sign-in';

export class WebServiceError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'WebServiceError';
  }
}

export function normalizeWebUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new WebServiceError('invalid_url', 'Enter a web address.');
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new WebServiceError('invalid_url', 'The address is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebServiceError('unsupported_protocol', 'Only HTTP and HTTPS addresses are supported.');
  }
  return url.toString();
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function safeLink(value: string | null, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function imageDescription(element: Element): string {
  const alt = cleanText(element.getAttribute('alt') || '');
  if (alt) return `[Image: ${alt}]`;
  const caption = cleanText(element.closest('figure')?.querySelector('figcaption')?.textContent || '');
  return caption ? `[Image: ${caption}]` : '[Image]';
}

function textFromNode(node: Node, links: WebLink[], baseUrl: string, preserveWhitespace = false): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== node.ELEMENT_NODE) return '';
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === 'img') return imageDescription(element);
  if (tag === 'video') return '[Video]';
  if (tag === 'audio') return '[Audio]';
  if (tag === 'iframe' || tag === 'embed' || tag === 'object') return '[Embedded content]';
  if (tag === 'br') return preserveWhitespace ? '\n' : ' ';
  const children = Array.from(element.childNodes).map((child) => textFromNode(child, links, baseUrl, preserveWhitespace)).join('');
  if (tag === 'a') {
    const url = safeLink(element.getAttribute('href'), baseUrl);
    const label = preserveWhitespace ? children.trim() : cleanText(children);
    if (!url || !label) return label;
    const existing = links.find((link) => link.url === url && link.text === label);
    const id = existing?.id ?? links.length + 1;
    if (!existing) links.push({ id, text: label, url });
    return `${label} [${id}]`;
  }
  return preserveWhitespace ? children : cleanText(children);
}

function tableText(table: HTMLTableElement, links: WebLink[], baseUrl: string): string {
  return Array.from(table.querySelectorAll('tr')).map((row) => Array.from(row.querySelectorAll('th,td'))
    .map((cell) => cleanText(textFromNode(cell, links, baseUrl)))
    .join(' | ')).filter(Boolean).join('\n');
}

function extractForms(document: Document, baseUrl: string): WebForm[] {
  return Array.from(document.querySelectorAll('form')).flatMap((form, index) => {
    const method = (form.getAttribute('method') || 'get').toLowerCase();
    const action = safeLink(form.getAttribute('action') || baseUrl, baseUrl);
    if (method !== 'get' || !action) return [];
    const fields = Array.from(form.querySelectorAll('input')).flatMap((input) => {
      const type = (input.getAttribute('type') || 'text').toLowerCase();
      const name = cleanText(input.getAttribute('name') || '');
      if (!name || ['hidden', 'submit', 'button', 'reset', 'password', 'file'].includes(type)) return [];
      const id = input.getAttribute('id');
      const linkedLabel = id ? Array.from(document.querySelectorAll('label')).find((label) => label.getAttribute('for') === id)?.textContent : undefined;
      const label = cleanText(linkedLabel || input.getAttribute('aria-label') || input.getAttribute('placeholder') || name);
      const placeholder = cleanText(input.getAttribute('placeholder') || '') || undefined;
      return [{ name, label, placeholder }];
    });
    return fields.length ? [{ id: `form-${index + 1}`, action, fields }] : [];
  });
}

function addLink(links: WebLink[], url: string, text: string): number {
  const existing = links.find((link) => link.url === url && link.text === text);
  if (existing) return existing.id;
  const id = links.length + 1;
  links.push({ id, text, url });
  return id;
}

function contentFromRoot(root: Element, baseUrl: string, formIds: Map<Element, string>): { content: WebContentNode[]; links: WebLink[] } {
  const links: WebLink[] = [];
  let nodeCount = 0;
  let textCount = 0;

  const visit = (node: Node): WebContentNode | undefined => {
    if (nodeCount >= MAX_CONTENT_NODES || textCount >= MAX_CONTENT_TEXT) return undefined;
    if (node.nodeType === node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\s+/g, ' ');
      if (!text.trim()) return undefined;
      nodeCount += 1;
      textCount += text.length;
      return { tag: 'span', text };
    }
    if (node.nodeType !== node.ELEMENT_NODE) return undefined;
    const element = node as Element;
    const originalTag = element.tagName.toLowerCase();
    if (OMITTED_CONTENT_TAGS.has(originalTag)) return undefined;
    if (originalTag === 'form') {
      const formId = formIds.get(element);
      if (!formId) return undefined;
      nodeCount += 1;
      return { tag: 'form', formId };
    }
    if (['input', 'textarea', 'select', 'option', 'button', 'label'].includes(originalTag)) return undefined;

    const tag: WebContentTag = originalTag === 'a' ? 'span' : CONTENT_TAGS.has(originalTag as WebContentTag) ? originalTag as WebContentTag : 'div';
    const children = Array.from(element.childNodes).map(visit).filter((child): child is WebContentNode => Boolean(child));
    if (!children.length && originalTag !== 'hr') return undefined;
    nodeCount += 1;
    const output: WebContentNode = { tag, children };
    if (originalTag === 'a') {
      const href = safeLink(element.getAttribute('href'), baseUrl);
      const text = cleanText(element.textContent || element.getAttribute('aria-label') || '');
      if (href && text) {
        output.href = href;
        output.linkId = addLink(links, href, text);
      }
    }
    return output;
  };

  return { content: Array.from(root.childNodes).map(visit).filter((node): node is WebContentNode => Boolean(node)), links };
}

function blocksFromRoot(root: Element, baseUrl: string): { blocks: WebBlock[]; links: WebLink[] } {
  root.querySelectorAll(REMOVED_ELEMENTS).forEach((node) => node.remove());
  const blocks: WebBlock[] = [];
  const links: WebLink[] = [];

  const visit = (node: Element): void => {
    const tag = node.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const text = cleanText(textFromNode(node, links, baseUrl));
      if (text) blocks.push({ type: 'heading', level: Number(tag[1]), text });
      return;
    }
    if (tag === 'p' || tag === 'figcaption') {
      const text = cleanText(textFromNode(node, links, baseUrl));
      if (text) blocks.push({ type: 'paragraph', text });
      return;
    }
    if (tag === 'pre') {
      const text = textFromNode(node, links, baseUrl, true).trim();
      if (text) blocks.push({ type: 'pre', text });
      return;
    }
    if (tag === 'code') {
      const text = textFromNode(node, links, baseUrl, true).trim();
      if (text) blocks.push({ type: 'code', text });
      return;
    }
    if (tag === 'blockquote') {
      const text = cleanText(textFromNode(node, links, baseUrl));
      if (text) blocks.push({ type: 'quote', text });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'li')
        .map((item) => cleanText(textFromNode(item, links, baseUrl))).filter(Boolean);
      if (items.length) blocks.push({ type: 'list', items });
      return;
    }
    if (tag === 'table') {
      const text = tableText(node as HTMLTableElement, links, baseUrl);
      if (text) blocks.push({ type: 'table', text });
      return;
    }
    if (tag === 'hr') {
      blocks.push({ type: 'separator' });
      return;
    }
    if (tag === 'img' || tag === 'video' || tag === 'audio' || tag === 'iframe' || tag === 'embed' || tag === 'object') {
      blocks.push({ type: 'paragraph', text: textFromNode(node, links, baseUrl) });
      return;
    }
    Array.from(node.children).forEach((child) => visit(child));
  };

  Array.from(root.children).forEach((child) => visit(child));
  return { blocks, links };
}

function textLength(element: Element): number {
  return cleanText(element.textContent || '').length;
}

function readerRoot(document: Document): Element {
  const candidates = [
    ...Array.from(document.querySelectorAll('article,main,[role="main"],.article,.post,.entry-content,.content')),
    document.body
  ].filter((candidate): candidate is Element => Boolean(candidate));
  return candidates.reduce((best, candidate) => {
    const score = textLength(candidate) - Array.from(candidate.querySelectorAll('a')).reduce((total, link) => total + textLength(link) * 1.5, 0)
      + (candidate.matches('article,main,[role="main"]') ? 600 : 0);
    const bestScore = textLength(best) - Array.from(best.querySelectorAll('a')).reduce((total, link) => total + textLength(link) * 1.5, 0)
      + (best.matches('article,main,[role="main"]') ? 600 : 0);
    return score > bestScore ? candidate : best;
  });
}

function cleanReaderRoot(document: Document): Element {
  const root = readerRoot(document).cloneNode(true) as Element;
  root.querySelectorAll(READER_NOISE_SELECTORS).forEach((node) => node.remove());
  root.querySelectorAll('[class],[id]').forEach((node) => {
    const marker = `${node.getAttribute('class') || ''} ${node.id}`.toLowerCase();
    if (/(cookie|consent|recommend|related|comment|share|social|login|signin|sign-in|footer|sidebar|advert)/.test(marker)) node.remove();
  });
  return root;
}

export function extractWebPage(html: string, url: string): WebPage {
  const normalizedUrl = normalizeWebUrl(url);
  const dom = new JSDOM(html, { url: normalizedUrl });
  const sourceDocument = dom.window.document;
  const forms = extractForms(sourceDocument, normalizedUrl);
  const formIds = new Map(Array.from(sourceDocument.querySelectorAll('form')).map((form, index) => [form, `form-${index + 1}`]));
  const preserved = contentFromRoot(sourceDocument.body, normalizedUrl, formIds);
  const originalRoot = sourceDocument.querySelector('article,main') || sourceDocument.body;
  const heading = cleanText(originalRoot?.querySelector('h1')?.textContent || '');
  let article: ReturnType<Readability['parse']> | null = null;
  try {
    article = new Readability(sourceDocument.cloneNode(true) as Document).parse();
  } catch {
    article = null;
  }

  const contentDom = article?.content ? new JSDOM(article.content, { url: normalizedUrl }) : undefined;
  const root = contentDom?.window.document.body || originalRoot;
  const blockResult: { blocks: WebBlock[]; links: WebLink[] } = root
    ? blocksFromRoot(root, normalizedUrl)
    : { blocks: [], links: [] };
  const { blocks } = blockResult;
  const cleanRoot = cleanReaderRoot(sourceDocument);
  const readerResult = blocksFromRoot(cleanRoot, normalizedUrl);
  const sourceText = cleanText(cleanRoot.textContent || '');
  // Readability deliberately drops some visual nodes. They are never rendered
  // as HTML, but their textual alternatives still belong in a text browser.
  if (contentDom && originalRoot) {
    const original = blocksFromRoot(originalRoot.cloneNode(true) as Element, normalizedUrl);
    original.blocks.filter((block) => block.type === 'table' || /^\[(Image|Video|Audio|Embedded content)/.test(block.text || ''))
      .forEach((block) => {
        if (!blocks.some((existing) => existing.type === block.type && existing.text === block.text)) blocks.push(block);
      });
  }
  const title = heading || cleanText(article?.title || '') || cleanText(sourceDocument.title) || new URL(normalizedUrl).hostname;
  const textLength = blocks.map((block) => block.text || block.items?.join(' ') || '').join(' ').length;
  return {
    url: normalizedUrl,
    finalUrl: normalizedUrl,
    title,
    siteName: cleanText(article?.siteName || '') || undefined,
    byline: cleanText(article?.byline || '') || undefined,
    excerpt: cleanText(article?.excerpt || '') || undefined,
    blocks,
    readerBlocks: readerResult.blocks,
    sourceText,
    links: preserved.links,
    forms,
    content: preserved.content,
    limitedContent: textLength < 150
  };
}

function plainTextPage(text: string, url: string): WebPage {
  const normalizedUrl = normalizeWebUrl(url);
  return {
    url: normalizedUrl,
    finalUrl: normalizedUrl,
    title: new URL(normalizedUrl).hostname,
    blocks: [{ type: 'pre', text }],
    readerBlocks: [{ type: 'pre', text }],
    sourceText: text,
    links: [],
    forms: [],
    content: [{ tag: 'pre', text }],
    limitedContent: text.trim().length < 150
  };
}

function protocolHandoffUrl(html: string, currentUrl: string): string | undefined {
  const asksForHttp = /location\.replace\s*\(\s*location\.href\.replace\s*\(\s*["']https:\/\/["']\s*,\s*["']http:\/\/["']\s*\)\s*\)/i.test(html);
  return asksForHttp && currentUrl.startsWith('https://') ? currentUrl.replace(/^https:/, 'http:') : undefined;
}

function frameEmbeddingReason(headers: Headers): string | undefined {
  const xFrameOptions = (headers.get('x-frame-options') || '').trim();
  if (/\b(?:deny|sameorigin)\b/i.test(xFrameOptions)) {
    return `This site sends X-Frame-Options: ${xFrameOptions}.`;
  }
  const policy = headers.get('content-security-policy') || '';
  const frameAncestors = policy.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
  if (frameAncestors && !frameAncestors.includes('*')) {
    return `This site restricts embedded frames with Content-Security-Policy: frame-ancestors ${frameAncestors}.`;
  }
  return undefined;
}

export class WebService {
  public constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  public async fetchPage(input: string, handoffCount = 0): Promise<WebPage> {
    const url = normalizeWebUrl(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'User-Agent': 'Workspace-Text-Web/0.0.3 (+VSCode Extension)' }
        });
      } catch (error) {
        if (controller.signal.aborted) throw new WebServiceError('timeout', 'Request timed out after 15 seconds.');
        throw new WebServiceError('network_error', error instanceof Error ? error.message : 'Network request failed.');
      }
      if (!response.ok) throw new WebServiceError(`http_${response.status}`, `The server returned HTTP ${response.status}.`);
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (!(type.includes('text/html') || type.includes('application/xhtml+xml') || type.includes('text/plain'))) {
        if (type.includes('pdf')) throw new WebServiceError('pdf_not_supported', 'PDF content is not supported in Text Web yet.');
        if (type.startsWith('image/')) throw new WebServiceError('image_not_supported', 'Image content is not displayed in Text Web.');
        if (type.startsWith('video/')) throw new WebServiceError('video_not_supported', 'Video content is not supported in Text Web.');
        throw new WebServiceError('unsupported_content_type', `Unsupported content type: ${type || 'unknown'}.`);
      }
      const text = await this.readText(response);
      const finalUrl = normalizeWebUrl(response.url || url);
      const handoff = protocolHandoffUrl(text, finalUrl);
      if (handoff) {
        if (handoffCount >= 3) throw new WebServiceError('redirect_loop', 'Too many protocol handoffs were requested.');
        return this.fetchPage(handoff, handoffCount + 1);
      }
      const page = type.includes('text/plain') ? plainTextPage(text, finalUrl) : extractWebPage(text, finalUrl);
      const embeddingReason = frameEmbeddingReason(response.headers);
      if (embeddingReason) {
        page.frameEmbeddingBlocked = true;
        page.frameEmbeddingReason = embeddingReason;
      }
      if (!page.blocks.length && !page.forms.length) throw new WebServiceError('no_readable_content', 'No readable text or safe form was found on this page.');
      return page;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readText(response: Response): Promise<string> {
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_BYTES) throw new WebServiceError('content_too_large', 'The page is larger than the 5 MB Text Web limit.');
    if (!response.body) return response.text();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        throw new WebServiceError('content_too_large', 'The page is larger than the 5 MB Text Web limit.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    return new TextDecoder().decode(bytes);
  }
}
