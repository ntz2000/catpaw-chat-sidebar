import type * as vscode from 'vscode';
import { ReaderChapter, ReaderDocument } from '../types/reader';

const CHAPTER_LINE = /^\s*((?:第\s*[零一二三四五六七八九十百千两〇0-9]+\s*(?:章|节|回|篇|话)\s*.*)|(?:(?:楔子|序章|序言|序|引子|前言|后记|番外|尾声)\s*.*))\s*$/i;
const FIXED_CHAPTER_LENGTH = 8_000;

export interface DecodedReaderText {
  encoding: string;
  text: string;
}

export interface ReaderChapterContent {
  chapter: ReaderChapter;
  text: string;
}

export function decodeReaderBytes(bytes: Uint8Array): DecodedReaderText {
  const bom = bytes.length >= 2
    ? bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be'
        : bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
          : undefined
    : undefined;
  const candidates = bom ? [bom] : ['utf-8', 'gb18030', 'gbk', 'utf-16le', 'utf-16be'];

  for (const encoding of candidates) {
    try {
      const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: false }).decode(bytes);
      if (text || !bytes.length) return { encoding, text };
    } catch {
      // Try the next user-facing text encoding.
    }
  }
  return { encoding: 'utf-8', text: new TextDecoder('utf-8').decode(bytes) };
}

export function splitReaderChapters(text: string): ReaderChapter[] {
  const markers: Array<{ start: number; title: string }> = [];
  let offset = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const title = line.replace(/[\r\n]+$/, '').trim();
    if (title && CHAPTER_LINE.test(title)) markers.push({ start: offset, title: title.slice(0, 120) });
    offset += line.length;
  }

  if (markers.length >= 2) {
    return markers.map((marker, index) => ({
      index,
      title: marker.title,
      start: marker.start,
      end: markers[index + 1]?.start ?? text.length
    })).filter((chapter) => chapter.end > chapter.start);
  }

  const chapters: ReaderChapter[] = [];
  for (let start = 0, index = 0; start < text.length || (!text.length && index === 0); start += FIXED_CHAPTER_LENGTH, index += 1) {
    const end = Math.min(start + FIXED_CHAPTER_LENGTH, text.length);
    chapters.push({ index, title: `第${index + 1}节`, start, end });
    if (!text.length) break;
  }
  return chapters;
}

export class ReaderService {
  private cached?: ReaderDocument;

  public async openFile(): Promise<ReaderDocument | undefined> {
    const api = getVscodeApi();
    const selected = await api.window.showOpenDialog({ canSelectMany: false, filters: { 'Text files': ['txt'] }, openLabel: 'Open TXT' });
    if (!selected?.[0]) return undefined;
    return this.readUri(selected[0].toString());
  }

  public async readUri(uri: string): Promise<ReaderDocument> {
    if (this.cached?.uri === uri) return this.cached;
    const api = getVscodeApi();
    const target = api.Uri.parse(uri);
    const decoded = decodeReaderBytes(await api.workspace.fs.readFile(target));
    const document: ReaderDocument = {
      title: decodeURIComponent(target.path.split('/').pop() ?? 'Untitled.txt'),
      uri,
      text: decoded.text,
      encoding: decoded.encoding,
      chapters: splitReaderChapters(decoded.text)
    };
    this.cached = document;
    return document;
  }

  public async getChapter(uri: string, chapterIndex: number): Promise<ReaderChapterContent> {
    const document = await this.readUri(uri);
    const chapter = document.chapters[Math.max(0, Math.min(chapterIndex, document.chapters.length - 1))];
    return { chapter, text: document.text.slice(chapter.start, chapter.end) };
  }
}

function getVscodeApi(): typeof vscode {
  // Loading this lazily lets decoding and chapter splitting be tested in Node.
  // The extension host always provides the actual VS Code module at file-open time.
  return require('vscode') as typeof vscode;
}
