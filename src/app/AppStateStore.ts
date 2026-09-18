import { GameSave, WorkspaceModule, WorkspaceSettings, WorkspaceSnapshot } from '../types/app';
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
      reader: { ...defaults.reader, ...stored.reader, bookmarks: migrateBookmarks(stored.reader?.bookmarks, stored.reader?.chapterIndex ?? 0), library: stored.reader?.library ?? [] },
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

export class MemoryStore implements StateStorage {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  public async update<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}
