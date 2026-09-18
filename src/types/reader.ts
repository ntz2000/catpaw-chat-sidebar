export type ReaderMode = 'scroll' | 'page';
export type ReaderTheme = 'system' | 'paper' | 'dim';

export interface ReaderChapter {
  index: number;
  title: string;
  start: number;
  end: number;
}

export interface ReaderBookmark {
  chapterIndex: number;
  position: number;
  label?: string;
}

export interface ReaderRecentChapter {
  chapterIndex: number;
  chapterPosition: number;
  title: string;
  openedAt: number;
}

export interface ReaderLibraryEntry {
  title: string;
  uri: string;
  lastOpened: number;
  progress: number;
  chapterIndex: number;
  chapterPosition: number;
  bookmarks: ReaderBookmark[];
  recentChapters: ReaderRecentChapter[];
  totalReadingSeconds: number;
  lastReadAt?: number;
}

export interface ReaderDocument {
  title: string;
  uri: string;
  text: string;
  encoding: string;
  chapters: ReaderChapter[];
}
