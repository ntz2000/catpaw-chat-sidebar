import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { AppStateStore } from './AppStateStore';
import { selectBrowserOpenCommand } from './browserCommand';
import { AIService } from '../services/AIService';
import { ChatService } from '../services/ChatService';
import { ReaderDocument, ReaderLibraryEntry } from '../types/reader';
import { ReaderService } from '../services/ReaderService';
import { WebService, WebServiceError, normalizeWebUrl } from '../services/WebService';
import { WorkspaceModule, WorkspaceSettings, WorkspaceSnapshot } from '../types/app';
import { WebNavigationEntry, WebPage } from '../types/web';
import { getWorkspaceHtml } from '../webview/workspaceHtml';

type Request = { type: string; [key: string]: unknown };
const modules: WorkspaceModule[] = ['dashboard', 'inbox', 'ai', 'reader', 'break', 'web', 'settings'];

export class WorkspaceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'catpawWorkspace.sidebar';
  private view?: vscode.WebviewView;
  public constructor(private readonly extensionUri: vscode.Uri, private readonly state: AppStateStore, private readonly chat: ChatService, private readonly ai: AIService, private readonly reader: ReaderService, private readonly web: WebService) {}
  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view; const { webview } = view;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
    webview.html = getWorkspaceHtml(webview, this.extensionUri, randomBytes(16).toString('base64'));
    webview.onDidReceiveMessage((message: unknown) => { if (isRequest(message)) void this.handle(webview, message); });
    view.onDidChangeVisibility(() => { if (view.visible && this.state.snapshot().settings.privacyMode) void this.post(webview, { type: 'forceModule', module: 'dashboard' }); });
  }
  public async quickHide(): Promise<void> { const module = await this.state.quickHide(); if (this.view) await this.post(this.view.webview, { type: 'forceModule', module, app: this.state.snapshot() }); }
  private async handle(webview: vscode.Webview, request: Request): Promise<void> {
    try {
      switch (request.type) {
        case 'bootstrap': await this.bootstrap(webview); break;
        case 'navigate': if (isModule(request.module)) { await this.state.navigate(request.module); await this.post(webview, { type: 'app', data: this.state.snapshot() }); } break;
        case 'getConversations': await this.post(webview, { type: 'conversations', data: await this.chat.getConversations() }); break;
        case 'openConversation': if (isString(request.conversationId)) { await this.chat.markAsRead(request.conversationId); await this.post(webview, { type: 'messages', conversationId: request.conversationId, data: await this.chat.getMessages(request.conversationId) }); await this.post(webview, { type: 'conversations', data: await this.chat.getConversations() }); } break;
        case 'sendMessage': if (isString(request.conversationId) && isString(request.text)) { await this.chat.sendMessage(request.conversationId, request.text); await this.post(webview, { type: 'messages', conversationId: request.conversationId, data: await this.chat.getMessages(request.conversationId) }); await this.post(webview, { type: 'conversations', data: await this.chat.getConversations() }); } break;
        case 'aiNew': await this.ai.createConversation(); await this.post(webview, { type: 'aiConversations', data: await this.ai.getConversations() }); break;
        case 'aiMessages': if (isString(request.conversationId)) await this.post(webview, { type: 'aiMessages', conversationId: request.conversationId, data: await this.ai.getMessages(request.conversationId) }); break;
        case 'aiSend': if (isString(request.conversationId) && isString(request.text)) { await this.post(webview, { type: 'aiMessages', conversationId: request.conversationId, data: await this.ai.sendMessage(request.conversationId, request.text) }); await this.post(webview, { type: 'aiConversations', data: await this.ai.getConversations() }); } break;
        case 'aiRename': if (isString(request.conversationId) && isString(request.title)) { await this.ai.renameConversation(request.conversationId, request.title); await this.post(webview, { type: 'aiConversations', data: await this.ai.getConversations() }); } break;
        case 'aiDelete': if (isString(request.conversationId)) { await this.ai.deleteConversation(request.conversationId); await this.post(webview, { type: 'aiConversations', data: await this.ai.getConversations() }); } break;
        case 'openReaderFile': {
          const document = await this.reader.openFile();
          if (document) {
            const library = updateReaderLibrary(this.state.snapshot().reader.library, document);
            await this.state.updateReader({ title: document.title, uri: document.uri, progress: 0, position: 0, chapterIndex: 0, chapterPosition: 0, bookmarks: [], library });
            await this.postReaderDocument(webview, document, 0);
          }
          break;
        }
        case 'readerOpenChapter': if (isNonNegativeInteger(request.chapterIndex)) await this.openReaderChapter(webview, request.chapterIndex); break;
        case 'readerOpenRecent': if (isString(request.uri)) await this.openRecentReader(webview, request.uri); break;
        case 'readerSearch': if (isString(request.query)) await this.searchReader(webview, request.query); break;
        case 'readerAddBookmark': await this.addReaderBookmark(webview, isString(request.label) ? request.label : undefined); break;
        case 'readerRemoveBookmark': if (isNonNegativeInteger(request.index)) { const bookmarks = this.state.snapshot().reader.bookmarks.filter((_, index) => index !== request.index); await this.state.updateReader({ bookmarks }); await this.post(webview, { type: 'app', data: this.state.snapshot() }); } break;
        case 'readerConfigureQuickHide': await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'workspace.quickHide'); break;
        case 'saveReader': if (isRecord(request.data)) { await this.state.updateReader(filterReaderUpdate(request.data)); } break;
        case 'updateSettings': if (isRecord(request.data)) { await this.state.updateSettings(request.data as Partial<WorkspaceSettings>); await this.post(webview, { type: 'app', data: this.state.snapshot() }); } break;
        case 'saveGame': if (isString(request.game) && isRecord(request.data) && typeof request.data.score === 'number' && typeof request.data.best === 'number') { await this.state.saveGame(request.game, { score: request.data.score, best: request.data.best, snapshot: request.data.snapshot }); } break;
        case 'quickBreak': { const names = ['snake', 'flappy', '2048', 'breakout', 'tetris', 'mines', 'sudoku', 'bubble']; await this.post(webview, { type: 'quickBreak', game: names[Math.floor(Math.random() * names.length)] }); break; }
        case 'webOpen': if (isString(request.url)) await this.loadWeb(webview, request.url, 'new'); break;
        case 'webBack': { const entry = await this.state.webBack(); if (entry) await this.loadWeb(webview, entry.url, 'restore'); break; }
        case 'webForward': { const entry = await this.state.webForward(); if (entry) await this.loadWeb(webview, entry.url, 'restore'); break; }
        case 'webReload': { const url = this.state.snapshot().web.current?.url; if (url) await this.loadWeb(webview, url, 'restore'); break; }
        case 'webBookmark': await this.state.toggleWebBookmark(); await this.post(webview, { type: 'app', data: this.state.snapshot() }); break;
        case 'webClearHistory': await this.state.clearWebHistory(); await this.post(webview, { type: 'app', data: this.state.snapshot() }); break;
        case 'webRemoveBookmark': if (isString(request.url)) { await this.state.removeWebBookmark(request.url); await this.post(webview, { type: 'app', data: this.state.snapshot() }); } break;
        case 'webUpdateView': if (isRecord(request.data) && typeof request.data.scrollPosition === 'number' && isString(request.data.findQuery)) await this.state.updateWebView({ scrollPosition: request.data.scrollPosition, findQuery: request.data.findQuery }); break;
        case 'webOpenIntegrated': if (isString(request.url)) await this.openIntegratedBrowser(request.url); break;
        case 'webOpenExternal': if (isString(request.url)) await vscode.env.openExternal(vscode.Uri.parse(normalizeWebUrl(request.url))); break;
        case 'webCopyURL': if (isString(request.url)) await vscode.env.clipboard.writeText(normalizeWebUrl(request.url)); break;
      }
    } catch (error: unknown) { await this.post(webview, { type: 'error', message: error instanceof Error ? error.message : 'Workspace operation failed.' }); }
  }
  private async bootstrap(webview: vscode.Webview): Promise<void> {
    const app = this.state.snapshot();
    let readerDocument: unknown;
    let readerChapter: unknown;
    if (app.reader.uri) {
      try {
        const document = await this.reader.readUri(app.reader.uri);
        readerDocument = toReaderDocumentPayload(document);
        readerChapter = await this.reader.getChapter(document.uri, app.reader.chapterIndex);
      } catch { readerDocument = undefined; }
    }
    await this.post(webview, { type: 'bootstrap', app, conversations: await this.chat.getConversations(), aiConversations: await this.ai.getConversations(), readerDocument, readerChapter, module: this.state.restoreModule() });
  }
  private async postReaderDocument(webview: vscode.Webview, document: ReaderDocument, chapterIndex: number): Promise<void> {
    await this.post(webview, { type: 'readerDocument', data: toReaderDocumentPayload(document), reader: this.state.snapshot().reader });
    await this.post(webview, { type: 'readerChapter', data: await this.reader.getChapter(document.uri, chapterIndex), reader: this.state.snapshot().reader });
  }
  private async openReaderChapter(webview: vscode.Webview, requestedIndex: number): Promise<void> {
    const reader = this.state.snapshot().reader;
    if (!reader.uri) return;
    const document = await this.reader.readUri(reader.uri);
    const chapter = document.chapters[Math.max(0, Math.min(requestedIndex, document.chapters.length - 1))];
    const content = { chapter, text: document.text.slice(chapter.start, chapter.end) };
    const persist = this.state.updateReader({ chapterIndex: chapter.index, chapterPosition: 0, position: 0, progress: Math.round(((chapter.index + 1) / Math.max(1, document.chapters.length)) * 100) });
    await this.post(webview, { type: 'readerChapter', data: content, reader: this.state.snapshot().reader });
    await persist;
  }
  private async openRecentReader(webview: vscode.Webview, uri: string): Promise<void> {
    const document = await this.reader.readUri(uri);
    const library = updateReaderLibrary(this.state.snapshot().reader.library, document);
    await this.state.updateReader({ title: document.title, uri: document.uri, progress: 0, position: 0, chapterIndex: 0, chapterPosition: 0, bookmarks: [], library });
    await this.postReaderDocument(webview, document, 0);
  }
  private async searchReader(webview: vscode.Webview, query: string): Promise<void> {
    const reader = this.state.snapshot().reader;
    if (!reader.uri || !query.trim()) { await this.post(webview, { type: 'readerSearchResults', data: [] }); return; }
    const document = await this.reader.readUri(reader.uri);
    const needle = query.trim().toLocaleLowerCase();
    const results: Array<{ chapterIndex: number; position: number; snippet: string }> = [];
    let position = 0;
    while (results.length < 30) {
      const found = document.text.toLocaleLowerCase().indexOf(needle, position);
      if (found < 0) break;
      const chapter = document.chapters.find((item) => found >= item.start && found < item.end) ?? document.chapters[0];
      results.push({ chapterIndex: chapter.index, position: found - chapter.start, snippet: document.text.slice(Math.max(0, found - 30), Math.min(document.text.length, found + query.length + 45)).replace(/\s+/g, ' ') });
      position = found + needle.length;
    }
    await this.post(webview, { type: 'readerSearchResults', data: results, query });
  }
  private async addReaderBookmark(webview: vscode.Webview, label?: string): Promise<void> {
    const reader = this.state.snapshot().reader;
    const bookmark = { chapterIndex: reader.chapterIndex, position: reader.chapterPosition, ...(label?.trim() ? { label: label.trim().slice(0, 80) } : {}) };
    const duplicate = reader.bookmarks.some((item) => item.chapterIndex === bookmark.chapterIndex && item.position === bookmark.position);
    if (!duplicate) await this.state.updateReader({ bookmarks: [...reader.bookmarks, bookmark] });
    await this.post(webview, { type: 'app', data: this.state.snapshot() });
  }
  private async loadWeb(webview: vscode.Webview, url: string, mode: 'new' | 'restore'): Promise<void> {
    await this.post(webview, { type: 'webLoading', url });
    try {
      const page = await this.web.fetchPage(url);
      const entry: WebNavigationEntry = { url: page.finalUrl, title: page.title, timestamp: Date.now() };
      if (mode === 'new') await this.state.openWeb(entry); else await this.state.refreshWeb(entry);
      await this.post(webview, { type: 'webPage', page: page as WebPage, app: this.state.snapshot() });
    } catch (error: unknown) {
      const message = error instanceof WebServiceError || error instanceof Error ? error.message : 'Could not load page.';
      await this.post(webview, { type: 'webError', url, message });
    }
  }
  private async openIntegratedBrowser(url: string): Promise<void> {
    const normalized = normalizeWebUrl(url);
    const commands = await vscode.commands.getCommands(true);
    const simpleBrowser = vscode.extensions.getExtension('vscode.simple-browser');
    const command = selectBrowserOpenCommand(commands, Boolean(simpleBrowser));
    if (!command) {
      throw new WebServiceError('integrated_browser_unavailable', 'This IDE does not provide the bundled Simple Browser. Use Open External only if you want to leave the IDE.');
    }
    try {
      if (command === 'simpleBrowser.api.open') {
        await simpleBrowser?.activate();
        await vscode.commands.executeCommand(command, vscode.Uri.parse(normalized), { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
      } else {
        await vscode.commands.executeCommand(command, normalized);
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      throw new WebServiceError('integrated_browser_unavailable', `The IDE browser could not be opened${detail}. Try updating or enabling the bundled Simple Browser.`);
    }
  }
  private async post(webview: vscode.Webview, data: object): Promise<void> { await webview.postMessage(data); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isRequest(value: unknown): value is Request { return isRecord(value) && typeof value.type === 'string'; }
function isString(value: unknown): value is string { return typeof value === 'string'; }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function isModule(value: unknown): value is WorkspaceModule { return typeof value === 'string' && modules.includes(value as WorkspaceModule); }
function toReaderDocumentPayload(document: ReaderDocument): Omit<ReaderDocument, 'text'> { const { text: _text, ...payload } = document; return payload; }
function updateReaderLibrary(library: ReaderLibraryEntry[], document: ReaderDocument): ReaderLibraryEntry[] {
  const existing = library.find((item) => item.uri === document.uri);
  const entry: ReaderLibraryEntry = { title: document.title, uri: document.uri, lastOpened: Date.now(), progress: 0, chapterIndex: 0, chapterPosition: 0, bookmarks: [], recentChapters: [], totalReadingSeconds: 0, ...existing };
  return [entry, ...library.filter((item) => item.uri !== document.uri)].slice(0, 12);
}
function filterReaderUpdate(update: Record<string, unknown>): Partial<Pick<WorkspaceSnapshot['reader'], 'progress' | 'position' | 'chapterPosition'>> {
  const reader: Partial<Pick<WorkspaceSnapshot['reader'], 'progress' | 'position' | 'chapterPosition'>> = {};
  for (const key of ['progress', 'position', 'chapterPosition']) {
    const value = update[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      if (key === 'progress' || key === 'position' || key === 'chapterPosition') reader[key] = value;
    }
  }
  return reader;
}
