import { GameSave, WorkspaceModule, WorkspaceSettings, WorkspaceSnapshot } from '../types/app';
import { ReaderLibraryEntry } from '../types/reader';
import { WebNavigationEntry, WebState } from '../types/web';

export interface StateStorage {
  get<T>(key: string): T | undefined;
  update<T>(key: string, value: T): Thenable<void> | Promise<void>;
}

const STATE_KEY = 'workspace.state';

function initialState(): WorkspaceSnapshot {
  return {
    currentModule: 'dashboard',
    previousModule: 'dashboard',
    settings: {
      privacyMode: false,
      animations: true,
      gameSound: false,
      readerFontSize: 15,
      readerLineHeight: 1.8,
      readerWidth: 720,
      readerHeight: 560,
      readerOpacity: 100,
      readerControlsHidden: false,
      readerShield: false,
      readerHoverBlur: false,
      readerTheme: 'system',
      readerMode: 'scroll',
      readerFontFamily: 'var(--vscode-editor-font-family)',
      defaultPage: 'dashboard'
    },
    recentChat: '张三',
    recentAi: '随便聊聊',
    recentGame: '2048',
    reader: { title: '《三体》', progress: 61, position: 0, chapterIndex: 0, chapterPosition: 0, bookmarks: [], library: [] },
    games: {},
    web: { backStack: [], forwardStack: [], history: [], bookmarks: [], scrollPosition: 0, findQuery: '' }
  };
}

export class AppStateStore {
  private state: WorkspaceSnapshot;
  private quickHidden = false;

  public constructor(private readonly storage: StateStorage) {
    const stored = storage.get<WorkspaceSnapshot>(STATE_KEY);
    const defaults = initialState();
    this.state = stored ? {
      ...defaults,
      ...stored,
      settings: { ...defaults.settings, ...stored.settings },
      reader: { ...defaults.reader, ...stored.reader, bookmarks: migrateBookmarks(stored.reader?.bookmarks, stored.reader?.chapterIndex ?? 0), library: migrateLibrary(stored.reader?.library, stored.reader) },
      games: stored.games ?? {},
      web: { ...defaults.web, ...stored.web, backStack: stored.web?.backStack ?? [], forwardStack: stored.web?.forwardStack ?? [], history: stored.web?.history ?? [], bookmarks: stored.web?.bookmarks ?? [] }
    } : defaults;
  }

  public snapshot(): WorkspaceSnapshot {
    return structuredClone(this.state);
  }

  public restoreModule(): WorkspaceModule {
    if (this.state.settings.privacyMode) {
      return 'dashboard';
    }

    return this.state.currentModule === 'dashboard'
      ? this.state.settings.defaultPage
      : this.state.currentModule;
  }

  public async navigate(module: WorkspaceModule): Promise<void> {
    if (module !== this.state.currentModule) {
      this.state.previousModule = this.state.currentModule;
      this.state.currentModule = module;
      await this.persist();
    }
  }

  public async quickHide(): Promise<WorkspaceModule> {
    if (!this.quickHidden) {
      this.state.previousModule = this.state.currentModule;
      this.state.currentModule = 'dashboard';
      this.quickHidden = true;
    } else {
      this.state.currentModule = this.state.previousModule;
      this.quickHidden = false;
    }
    await this.persist();
    return this.state.currentModule;
  }

  public async updateSettings(update: Partial<WorkspaceSettings>): Promise<void> {
    this.state.settings = { ...this.state.settings, ...update };
    await this.persist();
  }

  public async saveGame(name: string, save: GameSave): Promise<void> {
    const existing = this.state.games[name];
    this.state.games[name] = {
      ...save,
      best: Math.max(existing?.best ?? 0, save.best, save.score)
    };
    this.state.recentGame = name;
    await this.persist();
  }

  public async updateReader(update: Partial<WorkspaceSnapshot['reader']>): Promise<void> {
    this.state.reader = { ...this.state.reader, ...update };
    this.syncCurrentReaderToLibrary();
    await this.persist();
  }

  public async upsertReaderLibraryEntry(entry: Pick<ReaderLibraryEntry, 'uri' | 'title'>): Promise<ReaderLibraryEntry> {
    const existing = this.state.reader.library.find((item) => item.uri === entry.uri);
    const next: ReaderLibraryEntry = { ...newReaderLibraryEntry(entry), ...existing, title: existing?.title ?? entry.title, lastOpened: Date.now() };
    this.state.reader.library = [next, ...this.state.reader.library.filter((item) => item.uri !== entry.uri)];
    await this.persist();
    return structuredClone(next);
  }

  public async renameReaderLibraryEntry(uri: string, title: string): Promise<void> {
    this.state.reader.library = this.state.reader.library.map((item) => item.uri === uri ? { ...item, title } : item);
    if (this.state.reader.uri === uri) this.state.reader.title = title;
    await this.persist();
  }

  public async updateReaderLibraryEntry(uri: string, update: Partial<Omit<ReaderLibraryEntry, 'uri'>>): Promise<void> {
    this.state.reader.library = this.state.reader.library.map((item) => item.uri === uri ? { ...item, ...update } : item);
    if (this.state.reader.uri === uri) {
      const current = this.state.reader.library.find((item) => item.uri === uri);
      if (current) this.state.reader = { ...this.state.reader, title: current.title, progress: current.progress, chapterIndex: current.chapterIndex, chapterPosition: current.chapterPosition, position: current.chapterPosition, bookmarks: current.bookmarks };
    }
    await this.persist();
  }

  public async recordReaderRecentChapter(uri: string, chapter: Pick<ReaderLibraryEntry['recentChapters'][number], 'chapterIndex' | 'chapterPosition' | 'title'>): Promise<void> {
    const existing = this.state.reader.library.find((item) => item.uri === uri);
    if (!existing) return;
    const recent = { ...chapter, openedAt: Date.now() };
    const entry = { ...existing, lastOpened: recent.openedAt, recentChapters: [recent, ...existing.recentChapters.filter((item) => item.chapterIndex !== recent.chapterIndex || item.chapterPosition !== recent.chapterPosition)].slice(0, 10) };
    this.state.reader.library = [entry, ...this.state.reader.library.filter((item) => item.uri !== uri)];
    await this.persist();
  }

  public async addReaderReadingSeconds(uri: string, seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.state.reader.library = this.state.reader.library.map((item) => item.uri === uri ? { ...item, totalReadingSeconds: item.totalReadingSeconds + Math.min(3600, Math.floor(seconds)), lastReadAt: Date.now() } : item);
    await this.persist();
  }

  public async removeReaderLibraryEntry(uri: string): Promise<void> {
    this.state.reader.library = this.state.reader.library.filter((item) => item.uri !== uri);
    if (this.state.reader.uri === uri) this.state.reader = { ...this.state.reader, title: 'Local TXT Reader', uri: undefined, progress: 0, position: 0, chapterIndex: 0, chapterPosition: 0, bookmarks: [] };
    await this.persist();
  }

  public async openWeb(entry: WebNavigationEntry): Promise<void> {
    const current = this.state.web.current;
    if (current && current.url !== entry.url) this.state.web.backStack.push(current);
    this.state.web.current = entry;
    this.state.web.forwardStack = [];
    this.recordHistory(entry);
    await this.persist();
  }

  public async refreshWeb(entry: WebNavigationEntry): Promise<void> {
    this.state.web.current = entry;
    this.recordHistory(entry);
    await this.persist();
  }

  public async webBack(): Promise<WebNavigationEntry | undefined> {
    const target = this.state.web.backStack.pop();
    if (!target) return undefined;
    if (this.state.web.current) this.state.web.forwardStack.unshift(this.state.web.current);
    this.state.web.current = target;
    await this.persist();
    return target;
  }

  public async webForward(): Promise<WebNavigationEntry | undefined> {
    const target = this.state.web.forwardStack.shift();
    if (!target) return undefined;
    if (this.state.web.current) this.state.web.backStack.push(this.state.web.current);
    this.state.web.current = target;
    await this.persist();
    return target;
  }

  public async updateWebView(update: Pick<WebState, 'scrollPosition' | 'findQuery'>): Promise<void> {
    this.state.web = { ...this.state.web, ...update };
    await this.persist();
  }

  public async toggleWebBookmark(): Promise<boolean> {
    const current = this.state.web.current;
    if (!current) return false;
    const existing = this.state.web.bookmarks.findIndex((entry) => entry.url === current.url);
    if (existing >= 0) this.state.web.bookmarks.splice(existing, 1);
    else this.state.web.bookmarks.unshift({ ...current, timestamp: Date.now() });
    await this.persist();
    return existing < 0;
  }

  public async removeWebBookmark(url: string): Promise<void> {
    this.state.web.bookmarks = this.state.web.bookmarks.filter((entry) => entry.url !== url);
    await this.persist();
  }

  public async clearWebHistory(): Promise<void> {
    this.state.web.history = [];
    await this.persist();
  }

  private recordHistory(entry: WebNavigationEntry): void {
    this.state.web.history = [entry, ...this.state.web.history.filter((item) => item.url !== entry.url)].slice(0, 50);
  }

  private syncCurrentReaderToLibrary(): void {
    const reader = this.state.reader;
    if (!reader.uri) return;
    const existing = this.state.reader.library.find((item) => item.uri === reader.uri);
    if (!existing) return;
    this.state.reader.library = [{ ...existing, title: reader.title || existing.title, progress: reader.progress, chapterIndex: reader.chapterIndex, chapterPosition: reader.chapterPosition, bookmarks: reader.bookmarks }, ...this.state.reader.library.filter((item) => item.uri !== reader.uri)];
  }

  private async persist(): Promise<void> {
    await this.storage.update(STATE_KEY, this.state);
  }
}

function migrateBookmarks(value: unknown, chapterIndex: number): WorkspaceSnapshot['reader']['bookmarks'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((bookmark) => {
    if (typeof bookmark === 'number' && Number.isFinite(bookmark)) return [{ chapterIndex, position: bookmark }];
    if (!bookmark || typeof bookmark !== 'object') return [];
    const item = bookmark as { chapterIndex?: unknown; position?: unknown; label?: unknown };
    if (typeof item.chapterIndex !== 'number' || typeof item.position !== 'number') return [];
    return [{
      chapterIndex: item.chapterIndex,
      position: item.position,
      ...(typeof item.label === 'string' && item.label.trim() ? { label: item.label.trim().slice(0, 80) } : {})
    }];
  });
}

function newReaderLibraryEntry(entry: Pick<ReaderLibraryEntry, 'uri' | 'title'>): ReaderLibraryEntry {
  return { title: entry.title, uri: entry.uri, lastOpened: Date.now(), progress: 0, chapterIndex: 0, chapterPosition: 0, bookmarks: [], recentChapters: [], totalReadingSeconds: 0 };
}

function migrateLibrary(value: unknown, legacy?: Partial<WorkspaceSnapshot['reader']>): ReaderLibraryEntry[] {
  const items = Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<ReaderLibraryEntry>;
    if (typeof candidate.uri !== 'string' || typeof candidate.title !== 'string') return [];
    return [{
      ...newReaderLibraryEntry({ uri: candidate.uri, title: candidate.title }),
      ...candidate,
      bookmarks: migrateBookmarks(candidate.bookmarks, candidate.chapterIndex ?? 0),
      recentChapters: Array.isArray(candidate.recentChapters) ? candidate.recentChapters.filter((chapter): chapter is ReaderLibraryEntry['recentChapters'][number] => Boolean(chapter) && typeof chapter === 'object' && typeof (chapter as { chapterIndex?: unknown }).chapterIndex === 'number' && typeof (chapter as { chapterPosition?: unknown }).chapterPosition === 'number' && typeof (chapter as { title?: unknown }).title === 'string' && typeof (chapter as { openedAt?: unknown }).openedAt === 'number').slice(0, 10) : [],
      totalReadingSeconds: typeof candidate.totalReadingSeconds === 'number' && candidate.totalReadingSeconds >= 0 ? candidate.totalReadingSeconds : 0
    }];
  }) : [];
  if (items.length || !legacy?.uri) return items;
  return [{ ...newReaderLibraryEntry({ uri: legacy.uri, title: legacy.title || 'Local TXT Reader' }), progress: legacy.progress ?? 0, chapterIndex: legacy.chapterIndex ?? 0, chapterPosition: legacy.chapterPosition ?? 0, bookmarks: migrateBookmarks(legacy.bookmarks, legacy.chapterIndex ?? 0) }];
}

export class MemoryStore implements StateStorage {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  public async update<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}
