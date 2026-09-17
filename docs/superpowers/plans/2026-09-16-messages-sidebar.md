# Messages Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建、编译并打包一个名为 Messages 的 VS Code/CatPaw 聊天侧边栏扩展。

**Architecture:** Extension Host 通过 `ChatViewProvider` 承载一个 `ChatService` 实例，默认实现为内存中的 `MockChatService`。Webview 仅以 `postMessage` 协议请求和呈现数据，使用原生 DOM/CSS/JavaScript，并保存所选会话状态。

**Tech Stack:** TypeScript、公开 VS Code Extension API、原生 HTML/CSS/JavaScript、Node 内置测试运行器、`@vscode/vsce`。

**Spec:** `docs/superpowers/specs/2026-09-16-messages-sidebar-design.md`

## Global Constraints

- 仅使用公开、稳定的 VS Code API；不使用 proposed API 或 CatPaw 内部实现。
- 在 `catpawChat` Activity Bar 容器注册 `catpawChat.sidebar` Webview View；用户可将其移动到右侧辅助侧边栏。
- 默认运行 Mock 模式，不请求 `127.0.0.1`；HTTP Bridge 仅作为可替换实现保留。
- Webview 不得直接访问 ChatService 或 localhost；全部通信使用 `postMessage`。
- 使用原生 HTML/CSS/JavaScript 和 VS Code CSS variables；不引入前端框架、webpack、vite 或 UI 框架。
- Webview 动态内容必须用 `textContent` 渲染；CSP 使用 nonce，`localResourceRoots` 只开放 `media`。
- `npm run compile`、`npm run watch`、`npm run package` 必须可用；package 生成 `.vsix`。

---

### Task 1: 扩展清单、编译与打包基础

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `media/chat.svg`
- Create: `src/extension.ts`

**Interfaces:**
- Produces: `npm run compile`, `npm run watch`, `npm test`, `npm run package`；扩展激活点 `activate(context: vscode.ExtensionContext): void`。

- [ ] **Step 1: 创建扩展清单和 TypeScript 编译配置**

在 `package.json` 中声明 `name: "catpaw-chat-sidebar"`、`displayName: "Messages"`、版本 `0.0.1`、`main: "./out/extension.js"`、`engines.vscode: "^1.85.0"`。注册 `catpawChat` Activity Bar 容器和 `catpawChat.sidebar`（`type: "webview"`）视图；脚本使用 `tsc -p ./` 编译、`tsc -watch -p ./` 监听、`npm run compile && vsce package` 打包。`tsconfig.json` 输出 CommonJS ES2022 文件到 `out`，开启 `strict`、`sourceMap`、`rootDir: "src"`。

- [ ] **Step 2: 写入最小激活入口和单色聊天 SVG 图标**

`src/extension.ts` 先导出空的 `activate` 与 `deactivate`，使清单入口有效；`media/chat.svg` 使用 `currentColor` 绘制 24×24 单色对话气泡。`.vscodeignore` 排除 `src`、测试、文档和开发配置，同时保留 `out`、`media`、`README.md`、`package.json`。

- [ ] **Step 3: 安装规定开发依赖并验证基础编译**

Run: `npm install`

Run: `npm run compile`

Expected: TypeScript 成功生成 `out/extension.js`，无诊断错误。

- [ ] **Step 4: 提交此独立基础任务（若目录已初始化 Git）**

Run: `git add package.json tsconfig.json .gitignore .vscodeignore media/chat.svg src/extension.ts && git commit -m "chore: scaffold messages extension"`

Expected: 若项目尚未初始化 Git，则跳过提交且不影响实现。

### Task 2: 类型边界与 Mock 聊天服务

**Files:**
- Create: `src/types/chat.ts`
- Create: `src/services/ChatService.ts`
- Create: `src/services/MockChatService.ts`
- Create: `src/test/MockChatService.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Conversation`, `Message`, `ChatService`。
- Produces: `MockChatService.getConversations(): Promise<Conversation[]>`、`getMessages(conversationId: string): Promise<Message[]>`、`sendMessage(conversationId: string, text: string): Promise<Message>`、`markAsRead(conversationId: string): Promise<void>`。

- [ ] **Step 1: 写入服务行为的失败测试**

在 `src/test/MockChatService.test.ts` 使用 `node:test` 与 `node:assert/strict` 测试：张三初始至少有 8 条消息；发送 `晚上再说` 后返回 `isSelf: true`、消息列表增加一项、会话的 `lastMessage` 更新为该文本且 `unread` 仍为 0；`markAsRead("zhangsan")` 将未读设为 0。为测试脚本增加 `"test": "npm run compile && node --test out/test/*.test.js"`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: FAIL，原因是 `MockChatService` 和类型模块尚未实现。

- [ ] **Step 3: 实现类型、接口和最小内存服务**

在 `chat.ts` 定义：

```ts
export interface Conversation { id: string; name: string; unread: number; lastMessage: string; timestamp: string; }
export interface Message { id: string; conversationId: string; sender: string; text: string; timestamp: string; isSelf: boolean; }
```

`ChatService` 使用上述四个 Promise 方法。`MockChatService` 用私有数组保存四个指定会话与各自消息；深拷贝返回数组，验证会话存在且忽略全空白发送文本，使用当前 `HH:mm` 更新时间。

- [ ] **Step 4: 运行服务测试确认通过**

Run: `npm test`

Expected: PASS，三个服务行为断言均成立。

- [ ] **Step 5: 提交服务任务（若目录已初始化 Git）**

Run: `git add src/types/chat.ts src/services/ChatService.ts src/services/MockChatService.ts src/test/MockChatService.test.ts package.json && git commit -m "feat: add mock chat service"`

Expected: 若没有 Git 仓库，跳过提交。

### Task 3: 可替换的 HTTP Bridge 服务

**Files:**
- Create: `src/services/HttpChatService.ts`
- Create: `src/test/HttpChatService.test.ts`

**Interfaces:**
- Consumes: `ChatService`, `Conversation`, `Message`。
- Produces: `HttpChatService(baseUrl = "http://127.0.0.1:17321")`，实现与 `ChatService` 相同的四个方法。

- [ ] **Step 1: 写入 HTTP 请求契约的失败测试**

为 `HttpChatService` 构造接受可注入 `fetch` 函数的构造器。测试伪造 fetch，断言：会话请求为 `GET /api/conversations`；消息请求 URL 带有 `conversationId=zhangsan`；发送请求为 `POST /api/send`、JSON body 为 `{ conversationId, text }`；已读请求为 `POST /api/read`。

- [ ] **Step 2: 运行 HTTP 服务测试确认失败**

Run: `npm test`

Expected: FAIL，原因是 `HttpChatService` 尚未存在。

- [ ] **Step 3: 实现 HTTP 服务**

使用 Node 18+ 的 `fetch`（可注入用于测试），每个非成功响应抛出包含状态码的 `Error`。请求设置 `content-type: application/json`；查询参数通过 `URLSearchParams` 编码。`sendMessage` 返回 API JSON 中的 `Message`；`markAsRead` 只在成功后完成。

- [ ] **Step 4: 运行全部服务测试确认通过**

Run: `npm test`

Expected: PASS，Mock 与 HTTP 服务测试均通过。

- [ ] **Step 5: 提交 HTTP 服务任务（若目录已初始化 Git）**

Run: `git add src/services/HttpChatService.ts src/test/HttpChatService.test.ts && git commit -m "feat: reserve HTTP chat bridge"`

Expected: 若没有 Git 仓库，跳过提交。

### Task 4: Extension Host 与安全 Webview 通信

**Files:**
- Create: `src/ChatViewProvider.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `ChatService`, `MockChatService`, `Conversation`, `Message`。
- Produces: `ChatViewProvider.resolveWebviewView(webviewView, context, token)`，接受 `getConversations`、`openConversation`、`sendMessage`、`markAsRead`、`refreshConversations` 五种 Webview 命令。

- [ ] **Step 1: 先定义双向消息联合类型**

在 `ChatViewProvider.ts` 定义仅含允许字段的 `WebviewRequest` 联合类型和 `ExtensionMessage` 联合类型。使用运行时 `switch` 与字段检查丢弃未知输入；不使用 `any`。响应包括 `conversations`、`messages` 和 `messageSent`，消息发送后同时推送更新的会话数据。

- [ ] **Step 2: 实现 Provider 生命周期和数据流**

`resolveWebviewView` 设置 `enableScripts: true`，`localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]`，并注册 `onDidReceiveMessage`。打开会话时先 `markAsRead`，再返回消息及刷新会话；刷新时调用 `getConversations`；发送时调用 `sendMessage` 后返回消息、完整消息列表和会话列表。

- [ ] **Step 3: 实现 CSP 和无注入 HTML 壳**

生成随机 nonce，HTML 的 CSP 仅允许 `${webview.cspSource}` 的样式与图片、nonce 脚本，`connect-src 'none'`。HTML 不内嵌聊天文本或 Mock 数据；页面初始化只向宿主发送 `getConversations`，所有动态节点交由脚本使用 `textContent` 创建。

- [ ] **Step 4: 注册默认 Mock 服务**

在 `activate` 中实例化 `new ChatViewProvider(context.extensionUri, new MockChatService())`，并用 `vscode.window.registerWebviewViewProvider("catpawChat.sidebar", provider)` 注册，同时把 Disposable 放进 `context.subscriptions`。

- [ ] **Step 5: 编译验证宿主代码**

Run: `npm run compile`

Expected: PASS，且 `out/ChatViewProvider.js` 和 `out/extension.js` 存在。

### Task 5: 原生聊天界面与状态恢复

**Files:**
- Modify: `src/ChatViewProvider.ts`

**Interfaces:**
- Consumes: Extension Message 联合类型。
- Produces: 会话列表页、聊天页、搜索、刷新、输入与恢复行为。

- [ ] **Step 1: 添加主题自适应 CSS**

在 Provider 返回的 HTML 内嵌原生 CSS：颜色使用 `--vscode-foreground`、`--vscode-sideBar-background`、`--vscode-input-background`、`--vscode-button-background`、`--vscode-panel-border`；会话项提供 hover；消息气泡区分自己与他人；布局在窄侧栏保持可读。禁止使用品牌绿、微信名称或微信标识。

- [ ] **Step 2: 编写 DOM 渲染和会话列表交互**

脚本获取 `acquireVsCodeApi()`；用 `document.createElement` 与 `textContent` 渲染头像首字、名称、预览、时间和未读徽标。搜索框按名称或最后消息（均小写比较）过滤。刷新按钮发送 `refreshConversations`。点击会话保存 `{ page: "conversation", conversationId }` 并发送 `openConversation`。

- [ ] **Step 3: 编写聊天页、发送和恢复交互**

顶部返回按钮清除选中状态并重新渲染列表。消息按 `isSelf` 决定左/右气泡，显示发送者和时间。textarea 的 Enter（无 Shift）阻止默认行为并发送；Shift+Enter 允许换行；Send 点击同样发送。每次状态改变调用 `vscode.setState`，启动时读取状态并在拿到会话后恢复会话页。

- [ ] **Step 4: 手动安全检查**

Run: `rg -n "innerHTML|fetch\(|localhost|ChatService" src/ChatViewProvider.ts`

Expected: 不出现 `innerHTML`、`fetch(`、`localhost` 或直接服务访问；仅出现 CSP 与消息协议相关代码。

- [ ] **Step 5: 编译与服务测试**

Run: `npm run compile && npm test`

Expected: PASS，且 Webview 模板通过 TypeScript 严格检查。

### Task 6: README、打包和最终验收

**Files:**
- Create: `README.md`
- Modify: `.vscodeignore`（如打包检查发现遗漏）

**Interfaces:**
- Consumes: 已编译 `out`、`media`、`package.json`。
- Produces: 面向 CatPaw/VS Code 用户的安装与桥接说明及 `.vsix` 成品。

- [ ] **Step 1: 写中文 README**

说明项目用途、Mock 默认模式、目录概览、安装依赖、编译、监听、打包、通过命令面板执行 `Extensions: Install from VSIX...` 的安装步骤，以及首次通过“移动视图”将 Messages 放到右侧辅助侧边栏的方式。列出四个未来 Bridge API 及请求/响应示例，并说明将 `MockChatService` 替换为 `HttpChatService` 的单一构造位置。

- [ ] **Step 2: 从干净依赖状态验证安装与编译**

Run: `npm install && npm run compile && npm test`

Expected: 三项命令全部成功，无 TypeScript 错误。

- [ ] **Step 3: 打包 VSIX 并核验内容**

Run: `npm run package`

Run: `rg --files -g '*.vsix' && npx @vscode/vsce ls`

Expected: 生成 `catpaw-chat-sidebar-0.0.1.vsix`，列表包含 `out/`、`media/chat.svg`、`README.md` 和 `package.json`，不含 `src/` 与 `node_modules/`。

- [ ] **Step 4: 最终提交（若目录已初始化 Git）**

Run: `git add . && git commit -m "feat: add messages chat sidebar"`

Expected: 若没有 Git 仓库，跳过提交。
