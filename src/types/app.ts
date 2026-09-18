export type WorkspaceModule = 'dashboard' | 'inbox' | 'ai' | 'reader' | 'break' | 'web' | 'settings';
import { ReaderBookmark, ReaderLibraryEntry, ReaderMode, ReaderTheme } from './reader';

export interface WorkspaceSettings {
  privacyMode: boolean;
  animations: boolean;
  gameSound: boolean;
  readerFontSize: number;
  readerLineHeight: number;
  readerWidth: number;
  readerHeight: number;
  readerOpacity: number;
  readerControlsHidden: boolean;
  readerShield: boolean;
  readerHoverBlur: boolean;
  readerTheme: ReaderTheme;
  readerMode: ReaderMode;
  readerFontFamily: string;
  defaultPage: WorkspaceModule;
}

export interface GameSave {
  score: number;
  best: number;
  snapshot?: unknown;
}

export interface ReaderState {
  title: string;
  uri?: string;
  onlineUrl?: string;
  progress: number;
  position: number;
  chapterIndex: number;
  chapterPosition: number;
  bookmarks: ReaderBookmark[];
  library: ReaderLibraryEntry[];
}

export interface WorkspaceSnapshot {
  currentModule: WorkspaceModule;
  previousModule: WorkspaceModule;
  settings: WorkspaceSettings;
  recentChat: string;
  recentAi: string;
  recentGame: string;
  reader: ReaderState;
  games: Record<string, GameSave>;
  web: WebState;
}
import { WebState } from './web';
