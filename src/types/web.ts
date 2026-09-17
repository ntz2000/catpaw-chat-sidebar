export type WebBlockType = 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'pre' | 'separator' | 'table';

export interface WebBlock {
  type: WebBlockType;
  text?: string;
  level?: number;
  items?: string[];
}

export interface WebLink {
  id: number;
  text: string;
  url: string;
}

export interface WebFormField {
  name: string;
  label: string;
  placeholder?: string;
}

export interface WebForm {
  id: string;
  action: string;
  fields: WebFormField[];
}

export type WebContentTag = 'article' | 'aside' | 'blockquote' | 'div' | 'footer' | 'form' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'header' | 'li' | 'main' | 'nav' | 'ol' | 'p' | 'pre' | 'section' | 'span' | 'table' | 'tbody' | 'td' | 'th' | 'thead' | 'tr' | 'ul';

export interface WebContentNode {
  tag: WebContentTag;
  text?: string;
  href?: string;
  linkId?: number;
  formId?: string;
  children?: WebContentNode[];
}

export interface WebPage {
  url: string;
  finalUrl: string;
  title: string;
  siteName?: string;
  byline?: string;
  excerpt?: string;
  blocks: WebBlock[];
  readerBlocks: WebBlock[];
  sourceText: string;
  links: WebLink[];
  forms: WebForm[];
  content: WebContentNode[];
  limitedContent: boolean;
  /** The bundled Simple Browser is iframe-based; this page rejects that embedding. */
  frameEmbeddingBlocked?: boolean;
  frameEmbeddingReason?: string;
}

export interface WebNavigationEntry {
  url: string;
  title: string;
  timestamp: number;
}

export interface WebState {
  current?: WebNavigationEntry;
  backStack: WebNavigationEntry[];
  forwardStack: WebNavigationEntry[];
  history: WebNavigationEntry[];
  bookmarks: WebNavigationEntry[];
  scrollPosition: number;
  findQuery: string;
}
