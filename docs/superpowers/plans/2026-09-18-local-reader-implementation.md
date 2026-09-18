# Local TXT Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local TXT Reader with robust decoding, chapter navigation, local library state, configurable reading surface, and keyboard-first controls.

**Architecture:** `ReaderService` owns bytes, decoding, chapter detection and chunk retrieval in the Extension Host. `AppStateStore` persists the selected book and Reader preferences in `globalState`. The native Webview renders only the active chapter and sends typed messages for navigation, searches, book marks and preferences.

**Tech Stack:** TypeScript 5, stable VS Code Extension API, `globalState`, native Webview HTML/CSS/JavaScript, Node test runner and JSDOM.

**Spec:** `docs/superpowers/specs/2026-09-18-local-reader-design.md`

## Global Constraints

- Use only public stable VS Code Extension API; keep CatPaw and VS Code compatibility.
- Do not add a frontend framework, server, database, online reading source, browser automation or external network dependency.
- TXT files are read only by the Extension Host; the Webview cannot access local files or Node APIs.
- Render all book content with `textContent`; do not interpolate book text as HTML.
- Reader transparency applies only to the inner reading surface and ranges from 0 to 100.
- `Workspace: Quick Hide` remains a neutral Dashboard switch; it must not falsify or hide IDE content.
- All new UI fits 300–500px wide sidebars and must not retain duplicate keyboard listeners after rerender.

---

### Task 1: Reader data model and persisted preferences

**Files:**
- Modify: `src/types/reader.ts`
- Modify: `src/types/app.ts`
- Modify: `src/app/AppStateStore.ts`
- Modify: `src/test/AppStateStore.test.ts`

**Interfaces:**
- Produces `ReaderChapter`, `ReaderBookmark`, `ReaderLibraryEntry`, and expanded `ReaderState`.
- Produces settings: `readerHeight`, `readerOpacity`, `readerTheme`, `readerMode`, `readerFontFamily`.
- Consumed by `ReaderService`, `WorkspaceViewProvider`, and `media/workspace.js`.

- [ ] **Step 1: Write failing persistence tests**

```ts
test('keeps reader display preferences and chapter-aware bookmarks', async () => {
  const store = new AppStateStore(new MemoryStore());
  await store.updateSettings({ readerOpacity: 42, readerHeight: 480, readerMode: 'page' });
  await store.updateReader({ chapterIndex: 2, chapterPosition: 34, bookmarks: [{ chapterIndex: 2, position: 34, label: '关键段落' }] });
  assert.equal(store.snapshot().settings.readerOpacity, 42);
  assert.equal(store.snapshot().reader.bookmarks[0].label, '关键段落');
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test`

Expected: TypeScript reports missing Reader settings or bookmark fields.

- [ ] **Step 3: Add the model and default/migration-safe state**

```ts
export interface ReaderBookmark { chapterIndex: number; position: number; label?: string; }
export interface ReaderChapter { index: number; title: string; start: number; end: number; }
```

Initialize display defaults as `readerOpacity: 100`, `readerHeight: 560`, `readerTheme: 'system'`, `readerMode: 'scroll'`, and migrate old numeric bookmarks to the current chapter.

- [ ] **Step 4: Run the targeted test and full test suite**

Run: `npm test`

Expected: all existing tests plus the new persistence test pass.

- [ ] **Step 5: Commit the completed task**

```bash
git add src/types/reader.ts src/types/app.ts src/app/AppStateStore.ts src/test/AppStateStore.test.ts
git commit -m "feat: persist reader preferences and bookmarks"
```

### Task 2: Robust local decoding and chapter discovery

**Files:**
- Modify: `src/services/ReaderService.ts`
- Modify: `src/types/reader.ts`
- Create: `src/test/ReaderService.test.ts`

**Interfaces:**
- Consumes `ReaderChapter`.
- Produces `ReaderDocument` with `encoding`, `chapters`, and active-chapter text retrieval through `getChapter(uri, chapterIndex)`.
- `WorkspaceViewProvider` will call `readUri` and `getChapter`.

- [ ] **Step 1: Write failing decoding and chapter tests**

```ts
test('reads GB18030 text and finds Chinese chapter headings', () => {
  const document = decodeReaderBytes(encodeGb18030('第一章 开始\\n正文\\n第二章 继续'));
  assert.equal(document.encoding, 'gb18030');
  assert.deepEqual(document.chapters.map((chapter) => chapter.title), ['第一章 开始', '第二章 继续']);
});

test('uses fixed-size chapters when no headings are present', () => {
  assert.ok(splitReaderChapters('x'.repeat(20000)).length >= 2);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test`

Expected: missing decoder/splitter exports or incorrect UTF-8-only behavior.

- [ ] **Step 3: Implement deterministic reader parsing**

Implement BOM detection plus UTF-8, GB18030/GBK and UTF-16 candidates. Export pure `decodeReaderBytes` and `splitReaderChapters` helpers for tests. Use chapter patterns for `第…章/节/回/篇/话` and prologue/epilogue titles; accept a chapter list only when it has reasonable non-empty ranges, otherwise generate fixed-size chapter ranges.

- [ ] **Step 4: Connect `ReaderService` to VS Code file APIs**

Read bytes through `vscode.workspace.fs.readFile`, cache only the active document for the session, and return an explicit active chapter rather than inserting a whole large TXT into the Webview.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: decoder, splitter and existing Reader tests pass.

- [ ] **Step 6: Commit the completed task**

```bash
git add src/services/ReaderService.ts src/types/reader.ts src/test/ReaderService.test.ts
git commit -m "feat: add local TXT decoding and chapters"
```

### Task 3: Extension/Webview Reader message protocol

**Files:**
- Modify: `src/app/WorkspaceViewProvider.ts`
- Modify: `src/webview/workspaceHtml.ts` only if a new local asset is needed
- Modify: `src/test/WorkspaceWebview.test.ts`

**Interfaces:**
- Consumes `ReaderDocument`, `ReaderChapter`, and expanded `ReaderState`.
- Handles messages `readerOpenChapter`, `readerSearch`, `readerSaveProgress`, `readerAddBookmark`, `readerRemoveBookmark`, `readerConfigureQuickHide`.
- Produces `readerDocument`, `readerChapter`, `readerSearchResults`, and updated `app` messages.

- [ ] **Step 1: Write failing provider/UI message tests**

```ts
test('Reader opens a requested chapter without exposing the filesystem to Webview', async () => {
  // fixture sends { type: 'readerOpenChapter', chapterIndex: 1 }
  // assert readerChapter contains plain text and chapter metadata.
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test`

Expected: no `readerOpenChapter` response exists.

- [ ] **Step 3: Add validated host handlers**

Validate non-negative integer chapter indices and string search phrases. Persist chapter index/position through `AppStateStore`; use `vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'workspace.quickHide')` for the Settings shortcut configuration action.

- [ ] **Step 4: Run the full suite**

Run: `npm test`

Expected: reader protocol and all existing tests pass.

- [ ] **Step 5: Commit the completed task**

```bash
git add src/app/WorkspaceViewProvider.ts src/test/WorkspaceWebview.test.ts
git commit -m "feat: add reader chapter protocol"
```

### Task 4: Reader UI, local library, and keyboard controls

**Files:**
- Modify: `media/workspace.js`
- Modify: `media/workspace.css`
- Modify: `src/test/WorkspaceWebview.test.ts`

**Interfaces:**
- Consumes `readerDocument`, `readerChapter`, `readerSearchResults`, `WorkspaceSnapshot`.
- Sends the Task 3 Reader protocol messages.
- Produces responsive Reader library, directory drawer, chapter surface and controls.

- [ ] **Step 1: Write failing DOM tests**

```ts
test('Reader has no online library and sends chapter navigation from a focused reading surface', () => {
  // bootstrap a local Reader document, dispatch KeyW, and assert readerOpenChapter.
  assert.equal(dom.window.document.querySelector('.online-library'), null);
});

test('Reader passes an exact opacity value and constrained height to CSS variables', () => {
  // update settings fixture and assert --reader-opacity and --reader-height.
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test`

Expected: online-library markup remains and reader controls are absent.

- [ ] **Step 3: Replace the old single-text Reader view**

Build a local library list from persisted recent local entries. Render only active chapter text with `textContent`, a collapsible text-only contents drawer, bookmark list, search result list and previous/next controls. Remove Online Library and all `webOpen` transitions from Reader.

- [ ] **Step 4: Implement safe keyboard lifecycle**

Attach one key handler to the focusable Reader surface. Ignore keys when `event.target` is an input, textarea, select or button. Implement W/S, A/D, Space/Shift+Space, B, T, `/`, and Escape exactly as defined in the spec. Ensure rerender/dispose removes the old listener.

- [ ] **Step 5: Add restrained reading styles**

Use VS Code theme variables, CSS variables `--reader-width`, `--reader-height`, and `--reader-opacity`. Clamp display height to a usable sidebar range. Provide `system`, `paper`, and `dim` themes without gradients, network assets, or non-IDE branding.

- [ ] **Step 6: Run the full suite**

Run: `npm test`

Expected: all UI, game, chat, web and Reader tests pass.

- [ ] **Step 7: Commit the completed task**

```bash
git add media/workspace.js media/workspace.css src/test/WorkspaceWebview.test.ts
git commit -m "feat: redesign local reader UI"
```

### Task 5: Settings, command contribution, documentation and package verification

**Files:**
- Modify: `package.json`
- Modify: `media/workspace.js`
- Modify: `README.md`
- Modify: `src/test/WorkspaceWebview.test.ts`

**Interfaces:**
- Contributes `workspace.quickHide` with a context-safe default keybinding.
- Settings UI posts `readerOpacity`, `readerHeight`, theme, mode, font and `readerConfigureQuickHide`.

- [ ] **Step 1: Write failing Settings and contribution tests**

```ts
test('Settings exposes Reader opacity, text height, and Quick Hide shortcut configuration', () => {
  assert.match(settingsText, /Reader Opacity/);
  assert.match(settingsText, /Configure Quick Hide Shortcut/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test`

Expected: existing settings omit the required controls.

- [ ] **Step 3: Implement Settings controls and keybinding context**

Add range controls with visible numeric values, a Reader mode select, and a shortcut-configuration button. Keep `Ctrl+Alt+H` as the default Quick Hide keybinding and scope any Reader-only keybinding with the view-focus context so normal editor shortcuts remain unchanged.

- [ ] **Step 4: Update README**

Document local-only TXT support, supported encodings, Reader controls, 0–100% reading-surface transparency, display width/height, Quick Hide customization through Keyboard Shortcuts, and removal of Online Library.

- [ ] **Step 5: Run full verification and package**

Run: `npm test`

Expected: all tests pass.

Run: `npm run package`

Expected: a new `catpaw-chat-sidebar-<version>.vsix` is generated without missing assets.

- [ ] **Step 6: Commit the completed task**

```bash
git add package.json media/workspace.js README.md src/test/WorkspaceWebview.test.ts
git commit -m "feat: configure local reader controls"
```

## Plan Self-Review

- All spec requirements map to Tasks 1–5: no online content, decode/split, local library and chapter reader, Reader-only visual controls, shortcut configuration and Quick Hide boundary.
- The plan contains concrete helper names, message names, files, test cases and commands; no unassigned implementation placeholders remain.
- `ReaderChapter`, `ReaderBookmark`, `ReaderDocument`, `readerOpenChapter` and Reader settings are defined before consumer tasks.
