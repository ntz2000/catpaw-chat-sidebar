# Messages 侧边栏设计说明

## 目标

交付一个名为 **Messages** 的 VS Code 兼容扩展，可在 CatPaw 及其他兼容 IDE 中运行。扩展先在 Activity Bar 中注册聊天侧边栏，并以 Mock 数据驱动；用户可通过 IDE 的“移动视图”功能将其放置在右侧辅助侧边栏。当前阶段不集成微信，也不会默认访问 localhost 服务。

## 架构

扩展在 `catpawChat` Activity Bar 容器下，为 `catpawChat.sidebar` 注册 `WebviewViewProvider`。Provider 持有一个 `ChatService` 实例，默认使用 `MockChatService`。

Webview 是无业务权限的展示层。它通过 `vscode.postMessage` 发送带类型的命令；Extension Host 调用服务后，以 `webview.postMessage` 返回带类型的数据。Webview 不会直接访问 localhost 或服务层代码。

`ChatService` 负责会话列表、消息查询、发送消息及已读状态更新。`MockChatService` 在 Extension Host 内存中保存会话与消息；`HttpChatService` 完整实现约定的 HTTP Bridge 接口，但不会作为默认服务实例创建。

## 界面与状态

会话列表页包含 Messages 标题、刷新按钮、搜索框、头像占位、会话时间、最后一条消息和未读数。选择会话后会请求消息并标记已读。聊天页显示左右分布的消息气泡与输入区；Enter 发送，Shift+Enter 换行。

Webview 通过 `getState` / `setState` 保存当前页面与已选会话，并在重建后请求最新数据。发送消息会立即更新宿主端数据、当前消息列表及会话预览和时间，且不会增加未读数。

## 安全与兼容性

仅使用公开且稳定的 VS Code API。公开 API 不能令扩展默认直接注册到右侧辅助侧边栏，因此保留标准 Activity Bar 容器，依赖用户移动视图完成右侧布局。Webview 启用脚本，但本地资源范围只开放 `media` 目录。使用 nonce CSP 禁止外部连接与资源加载。所有动态聊天内容均经 DOM 的 `textContent` 渲染，不会拼接进 HTML。

## 打包与验证

项目使用 TypeScript、原生 HTML/CSS/JavaScript 和 `@vscode/vsce`，并提供 `compile`、`watch` 与 `package` 命令。完成标准为：`npm install`、`npm run compile`、`npm run package` 均成功，且生成 `.vsix` 成品。
