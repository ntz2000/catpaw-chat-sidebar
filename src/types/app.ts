export type WorkspaceModule = 'dashboard' | 'inbox' | 'ai' | 'reader' | 'break' | 'web' | 'settings';

export interface WorkspaceSettings {
  privacyMode: boolean;
  animations: boolean;
  gameSound: boolean;
  readerFontSize: number;
  readerLineHeight: number;
  readerWidth: number;
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
  bookmarks: number[];
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
