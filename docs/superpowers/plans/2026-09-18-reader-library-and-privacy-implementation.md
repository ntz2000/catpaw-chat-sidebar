# Reader 书架与屏幕隐私 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Workspace Reader 增加可命名本地书架、每本书独立状态、显示面板、阅读统计和屏幕隐私控制。

**Architecture:** `AppStateStore` 保存每本 TXT 的书架状态并将当前书映射回兼容的 `ReaderState`。`WorkspaceViewProvider` 负责所有原生对话框、文件读取和状态更新；Webview 只渲染数据、发送类型化消息和应用本地 CSS 状态。

**Tech Stack:** TypeScript、稳定 VS Code Extension API、原生 Webview JavaScript/CSS、Node test runner、jsdom。

**Spec:** `docs/superpowers/specs/2026-09-18-reader-library-and-privacy-design.md`

## Global Constraints

- 仅使用公开稳定的 VS Code Extension API，兼容 CatPaw / VS Code。
- TXT 读写与确认对话框只能在 Extension Host 中进行；Webview 不访问 Node 或文件系统。
- 所有新增按钮显示中文，并设置简短英文 `title` 悬停提示。
- 删除书架记录不得删除本地 TXT 文件。
- 不使用网络、第三方前端框架或 proposed API。

---

### Task 1: 书架状态和迁移

**Files:**
- Modify: `src/types/reader.ts`
- Modify: `src/types/app.ts`
- Modify: `src/app/AppStateStore.ts`
- Test: `src/test/AppStateStore.test.ts`

**Interfaces:**
- Produces: `ReaderLibraryEntry` 的独立阅读位置、书签、最近章节与统计字段。
- Consumes: 既有 `WorkspaceSnapshot.reader` 以兼容旧存档。

- [ ] **Step 1: 写入失败测试**

```ts
await store.upsertReaderLibraryEntry({ uri: 'file:///book.txt', title: '自定义书名' });
await store.updateReaderLibraryProgress('file:///book.txt', { chapterIndex: 2, chapterPosition: 120 });
assert.equal(store.snapshot().reader.library[0].title, '自定义书名');
assert.equal(store.snapshot().reader.library[0].chapterIndex, 2);
```

- [ ] **Step 2: 运行状态测试并确认失败**

Run: `npm run compile && node --test out/test/AppStateStore.test.js`

- [ ] **Step 3: 实现最小状态存储与旧状态迁移**

为 `ReaderLibraryEntry` 添加独立进度、书签、最近章节和统计字段；在 `AppStateStore` 添加更新、重命名和移除方法，并把当前书同步到旧 `ReaderState`。

- [ ] **Step 4: 运行状态测试并确认通过**

Run: `npm run compile && node --test out/test/AppStateStore.test.js`

- [ ] **Step 5: 提交**

```bash
git add src/types/reader.ts src/types/app.ts src/app/AppStateStore.ts src/test/AppStateStore.test.ts
git commit -m "feat: 增加阅读器书架状态"
```

### Task 2: Extension Host 书架操作

**Files:**
- Modify: `src/app/WorkspaceViewProvider.ts`
- Test: `src/test/AppStateStore.test.ts`

**Interfaces:**
- Consumes: Task 1 的书架状态方法。
- Produces: `readerRenameLibrary`、`readerRemoveLibrary`、`readerOpenRecentChapter` 处理器。

- [ ] **Step 1: 写入失败状态测试**

```ts
await store.removeReaderLibraryEntry('file:///book.txt');
assert.equal(store.snapshot().reader.library.length, 0);
assert.equal(store.snapshot().reader.uri, undefined);
```

- [ ] **Step 2: 运行状态测试并确认失败**

Run: `npm run compile && node --test out/test/AppStateStore.test.js`

- [ ] **Step 3: 实现命名、重命名、移除与最近章节处理**

导入时用 `vscode.window.showInputBox` 请求中文书名；移除时用 `showWarningMessage` 明确说明只移除书架记录；打开书或章节时恢复独立位置。

- [ ] **Step 4: 运行状态测试并确认通过**

Run: `npm run compile && node --test out/test/AppStateStore.test.js`

- [ ] **Step 5: 提交**

```bash
git add src/app/WorkspaceViewProvider.ts src/test/AppStateStore.test.ts
git commit -m "feat: 支持书架命名与管理"
```

### Task 3: Reader 书架与显示面板界面

**Files:**
- Modify: `media/workspace.js`
- Modify: `media/workspace.css`
- Test: `src/test/WorkspaceWebview.test.ts`

**Interfaces:**
- Consumes: 书架列表和现有 Reader `app` 快照。
- Produces: 中文书架按钮、显示抽屉、最近章节和实时样式更新消息。

- [ ] **Step 1: 写入失败 DOM 测试**

```ts
assert.match(document.body.textContent ?? '', /书架/);
assert.match(document.body.textContent ?? '', /显示/);
assert.equal(document.querySelector('[data-reader-library-open]')?.getAttribute('title'), 'Open library');
```

- [ ] **Step 2: 运行 Webview 测试并确认失败**

Run: `npm run compile && node --test out/test/WorkspaceWebview.test.js`

- [ ] **Step 3: 实现紧凑中文 Reader UI**

将显示范围控件放进显示抽屉；渲染书架、重命名与移除入口、最近章节以及阅读统计。所有文本通过 `textContent` 写入。

- [ ] **Step 4: 运行 Webview 测试并确认通过**

Run: `npm run compile && node --test out/test/WorkspaceWebview.test.js`

- [ ] **Step 5: 提交**

```bash
git add media/workspace.js media/workspace.css src/test/WorkspaceWebview.test.ts
git commit -m "feat: 增加阅读器书架界面"
```

### Task 4: 屏幕隐私与阅读统计

**Files:**
- Modify: `src/types/app.ts`
- Modify: `src/app/AppStateStore.ts`
- Modify: `src/app/WorkspaceViewProvider.ts`
- Modify: `media/workspace.js`
- Modify: `media/workspace.css`
- Test: `src/test/AppStateStore.test.ts`
- Test: `src/test/WorkspaceWebview.test.ts`

**Interfaces:**
- Produces: `readerShield`、`readerHoverBlur` 设置、统计更新和中性遮罩界面。

- [ ] **Step 1: 写入失败测试**

```ts
document.querySelector<HTMLButtonElement>('[data-reader-shield]')?.click();
assert.equal(sent.at(-1)?.type, 'updateSettings');
assert.equal((sent.at(-1)?.data as { readerShield?: boolean }).readerShield, true);
```

- [ ] **Step 2: 运行 Webview 测试并确认失败**

Run: `npm run compile && node --test out/test/WorkspaceWebview.test.js`

- [ ] **Step 3: 实现最小屏幕遮罩和统计状态**

添加中性 `屏幕遮罩` 与 `显示文本` 恢复按钮；鼠标离开正文时可选轻度模糊。只在显示 Reader 且打开本地文本时节流累计阅读时间。

- [ ] **Step 4: 运行相关测试并确认通过**

Run: `npm run compile && node --test out/test/AppStateStore.test.js out/test/WorkspaceWebview.test.js`

- [ ] **Step 5: 提交**

```bash
git add src/types/app.ts src/app/AppStateStore.ts src/app/WorkspaceViewProvider.ts media/workspace.js media/workspace.css src/test/AppStateStore.test.ts src/test/WorkspaceWebview.test.ts
git commit -m "feat: 增加阅读器屏幕隐私"
```

### Task 5: 文档、全量验证与 VSIX

**Files:**
- Modify: `README.md`
- Modify: `docs/reader-guide.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `releases/catpaw-chat-sidebar-<version>.vsix`

- [ ] **Step 1: 更新中文 Reader 使用说明与版本号**

说明书架命名、删除范围、显示面板、统计、屏幕遮罩与离开模糊。

- [ ] **Step 2: 执行完整验证**

Run: `npm test && npm run package`

- [ ] **Step 3: 检查安装包内容**

Run: `unzip -l releases/catpaw-chat-sidebar-<version>.vsix | rg 'extension/(package.json|media/workspace.js|media/workspace.css)'`

- [ ] **Step 4: 提交**

```bash
git add README.md docs/reader-guide.md package.json package-lock.json releases/
git commit -m "release: 打包阅读器书架升级"
```
