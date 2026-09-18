# 本地 TXT Reader 升级设计

## 目标

将 Workspace 的 Reader 从单篇全文滚动器升级为本地 TXT 阅读器：可靠解码、自动分章、目录、章节阅读、搜索、书签和本地进度保存，同时保持 VS Code 风格的克制界面。

## 范围

- 只支持用户选择的本地 TXT 文件；不接入网络小说、在线书库、账号或远程服务。
- 通过 Extension Host 读取文件，Webview 只接收已解析的安全数据。
- 解码按 BOM、UTF-8、GB18030、GBK、UTF-16LE、UTF-16BE 顺序尝试；无法识别时以 UTF-8 容错读取。
- 用中文章节标题（`第…章/节/回/篇/话`）与序章、楔子、尾声等模式分章；若没有可信章节，按固定文本块生成章节。
- Reader 展示本地书架、目录抽屉、上一章/下一章、章节进度、书签、搜索和滚动/分页两种阅读模式。
- Reader 设置新增字体、字号、行距、正文最大宽度、正文最大高度、阅读主题和正文表层透明度，并保存在 `globalState`。
- 透明度范围限制在 70%–100%，只作用于 Reader 正文表层，不能改变 IDE 原生窗口，也不用于隐藏内容或规避审计。
- 保留既有 `Workspace: Quick Hide`（`Ctrl+Alt+H`）：切换至中性 Dashboard；不伪造 IDE 内容、不关闭窗口、不检测前台应用。

## 不在范围内

- 网络小说站点、在线书库、网页抓取、登录、同步、云端数据库、EPUB/PDF。
- 修改 CatPaw / VS Code 原生窗口尺寸或透明度。
- 绕过审计、监控、网站限制或登录机制。

## 架构

`ReaderService` 负责读取字节、解码和产生章节元数据；`WorkspaceViewProvider` 以现有 `postMessage` 协议把书籍、章节和阅读状态发送给 Webview。`AppStateStore` 持久化当前书、章节索引、章节内位置、书签和 Reader 设置。

Webview Reader 采用局部状态渲染当前章节，不创建整本小说的大 DOM。目录、搜索结果和书签仅使用文本节点渲染。阅读区以 CSS 变量控制字体、宽度、高度、主题和透明度，外层 Workspace 不透明且仍遵循 IDE Theme Variables。

## 数据模型

`ReaderChapter`：`index`、`title`、`start`、`end`。

`ReaderDocument`：`title`、`uri`、`text`、`encoding`、`chapters`。

`ReaderState` 新增 `chapterIndex`、`chapterPosition`、`bookmarks`（包含章节、位置、标签）和 `library`（最近本地书的元数据）。旧的数字书签会迁移为当前章节的无标签书签。

`WorkspaceSettings` 新增 `readerTheme`（`system`、`paper`、`dim`）、`readerOpacity`、`readerHeight`、`readerMode`（`scroll`、`page`）与 `readerFontFamily`。

## 错误处理与性能

- 无法读取文件时展示现有错误消息并保持已有 Reader 状态。
- 单章内容有上限，超大 TXT 只发送当前章节和必要章节目录；切章按需由 Extension Host 提供，避免一次建立巨大 DOM。
- 章节正则无法取得至少三个合理章节时使用固定长度兜底，确保导航始终可用。
- Webview 不直接访问文件系统，也不将文本拼接为 HTML。

## 验收与测试

- 单元测试：UTF-8/GBK 解码、中文章节识别和无标题文本兜底。
- 状态测试：Reader 设置、当前章节、进度和书签持久化；Quick Hide 行为不变。
- Webview 测试：没有 Online Library，目录切换章节、搜索命中、阅读高度/透明度 CSS 变量与设置消息正确发出。
- 手动测试：宽度 300px 至 500px 下布局可用；切换模块后不会重复注册键盘、滚动或分页监听器。
