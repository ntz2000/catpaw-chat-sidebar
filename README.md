# Workspace

Workspace 是一个可安装到 CatPaw 或 VS Code 的本地工作区扩展。它仅使用公开稳定的 VS Code Extension API，不修改 IDE，也不连接微信、QQ 或真实 AI 服务。

## 功能

- **Dashboard**：Inbox 未读、阅读进度、Mock AI、最近游戏、Quick Break 与 Privacy Mode。
- **Inbox**：四个 Mock 会话、搜索、未读、发送、Enter 发送与 Shift+Enter 换行。
- **AI**：本地 Mock AI，可创建、重命名、删除会话并保存状态。
- **Reader**：由 Extension Host 打开本地 TXT，支持 UTF-8、UTF-16、GB18030/GBK 解码、自动分章、本地书目、章节搜索、书签、进度和阅读样式。
- **Text Web**：提供安全的 **Reader / Document / Source Text** 三种文本视图。网页会在 Extension Host 中规范化后再显示，Reader 视图会移除导航、Cookie、登录提示、页脚与推荐等噪音。需要脚本、登录、验证码或二维码时，可明确打开 IDE 内的 **Interactive Browser**（Simple Browser）；**Open External** 仅在用户主动点击时打开系统浏览器。
- **Break**：Snake、Flappy、2048、Breakout、Tetris、Mines、Sudoku、Bubble 八个纯原生小游戏。
- **Privacy Mode**：Inbox 与 Dashboard 内的联系人和预览匿名/模糊；重新进入时显示 Dashboard。
- **Quick Hide**：`Workspace: Quick Hide`，默认 `Ctrl+Alt+H`，在 Dashboard 与之前模块间切换。
- **Settings**：Privacy Mode、动画、游戏声音、Reader/Text Web 字号、行距、宽度、阅读区高度、主题、透明度及默认页，均保存到 `globalState`。

Reader 的当前边界、后续本地 TXT 升级方案、透明度与键盘控制说明见 [docs/reader-guide.md](docs/reader-guide.md)。文档会明确区分已实现与规划中的功能。

## Text Web

Text Web 的文本模式不是完整浏览器：它不加载远程 JavaScript/CSS，也不会把下载到的 HTML 原样插入 Webview。网页会在扩展主机中经过 `jsdom` 和 `@mozilla/readability` 解析，再转换为安全的标题、段落、列表、引用、代码、表格和链接数据。

- 输入 URL 后按 Enter 或 **Go**；`example.com` 会自动补成 HTTPS；常见网页的安全 GET 搜索表单会显示为本地输入框和按钮。
- **Reader** 适合干净阅读正文；**Document** 保留更多正文结构与站内链接；**Source Text** 用于查看已提取的纯文本。三者都不会渲染站点原始 DOM，因此不会出现网页头尾、浮层和登录推广混在正文中的情况。
- 站点要求 JavaScript、登录、验证码或二维码时，可选择 **Interactive Browser**。它会优先使用 IDE 的 Simple Browser 并在编辑器区域打开；该浏览器有独立的 Cookie/登录会话，不能复用系统 Chrome 的登录状态。若 IDE 没有可用的 Simple Browser，会给出明确提示，不会静默跳到系统浏览器。
- Simple Browser 基于 iframe。若网站以 `X-Frame-Options` 或 CSP 的 `frame-ancestors` 禁止嵌入（知乎登录页等），Workspace 会在打开前识别并隐藏 Interactive Browser / Full Mode，避免出现空白页面；可继续使用文本视图，或显式使用 **Open External**。
- 支持 Back、Forward、Reload、Home、History、Bookmark、Copy URL、Open External 和页面内 Find。
- 历史最多保留 50 条，历史、收藏、导航栈、查找文字和滚动位置都保存在 `globalState`。
- 仅支持 `http:`、`https:` 和 HTML/XHTML/纯文本响应；PDF、图片、视频等会给出说明，并可使用 **Open External**。
- JavaScript-heavy 页面只能取得初始 HTML 时会显示 `Limited content available`；这时请使用 **Interactive Browser** 或显式选择 **Open External**。

## 本地 Reader

Reader 只读取用户主动选择的本地 TXT；文件由 Extension Host 读取，Webview 不接触文件系统。打开后会记录到本地书目，并只渲染当前章节，适合较大的 TXT。

- **编码与目录**：自动尝试 UTF-8、UTF-16、GB18030、GBK，并识别“第…章/节/回/篇/话”、序章、楔子和尾声等章节标题；没有标题时按文本块分章。
- **阅读控制**：只要当前显示 Reader，`Ctrl+;` 即可上一页，`Ctrl+'` 即可下一页，无需先点击正文；章节仅通过目录与上一章/下一章按钮选择。
- **样式**：Reader 工具栏内可直接调整 0–100% 透明度，工具栏会同步淡化；`Ctrl+↑ / Ctrl+↓` 可每次调节 5%。勾选 **Hide controls** 后会隐藏标题与左侧导航，仅保留正文和右下角固定的 **Controls** 恢复入口（也可按 `Ctrl+Alt+R`）。目录保持高对比、不透明，便于阅读。Settings 中可调字号、行距、宽度、高度和 System/Paper/Dim 主题。
- **Quick Hide**：默认仍为 `Ctrl+Alt+H`，只在 Dashboard 和之前模块间切换。Settings 的 **Configure Quick Hide Shortcut** 会打开 IDE 标准快捷键设置，便于自行修改。

## 游戏控制

- 所有有方向操作的游戏均只使用 **WASD**；方向键不会被捕获。
- Snake：可选择是否穿墙、Slow/Normal/Fast 速度和 1/3/5/7 的初始长度；撞墙或撞自身会结束，吃到食物增长。
- Flappy：W、Space 或点击跳跃；每根管道只计一次分数。
- 2048：WASD 移动；支持 **Undo** / **Redo**（最多保留 50 步）；达到 2048 后使用 **Continue** 继续本局。
- Tetris：W 旋转、A/D 平移、S 软降、Space 硬降。
- Breakout：A/D 移动挡板，也支持鼠标；鼠标坐标会随 Canvas 宽度换算，挡板可移动到两端。共有五个不同布局的关卡，清关后自动进入下一关。普通、耐久（2 次）和强化（3 次）砖块以明暗与耐久数字区分。
- Breakout 掉落物有明确字母和图例：W 加宽、S 减速、+ 生命、P 穿透、M 多球、F 加速、− 缩短、K 黏板；正面与负面道具使用不同边框与色调。黏板接球后按 W 或 Space 发射。
- Mines、Sudoku、Bubble 支持 WASD 移动选择；Mines 使用 Space 打开、F 标记，Bubble 使用 Space 按下气泡。
- Mines 首次打开一定安全；Sudoku 仅显示行、列、宫内的真实重复冲突。
- 离开游戏页面时会销毁键盘/鼠标监听器和计时器，防止重复循环；游戏核心规则和生命周期已有自动回归测试。

## 开发与打包

```bash
npm install
npm run compile
npm run watch
npm test
npm run package
```

`npm run package` 会在项目根目录生成 `catpaw-chat-sidebar-0.0.23.vsix`。

## 安装到 CatPaw / VS Code

1. 按 `Ctrl+Shift+P`。
2. 运行 **Extensions: Install from VSIX...**。
3. 选择生成的 VSIX。
4. 运行 **Developer: Reload Window**。
5. 在 Activity Bar 点击 **Workspace**。

如果快捷键冲突，可在 Keyboard Shortcuts 中搜索 `Workspace: Quick Hide` 修改。

## 结构

```text
src/app/                 Workspace Provider 与持久化状态
src/services/            Chat、AI、Reader、Text Web 服务
src/types/               应用、AI、Reader、Chat、Web 类型
src/webview/             CSP 与 Webview HTML 外壳
media/game-core.js       八个游戏的可测试核心规则
media/games.js           八个本地游戏及生命周期管理
media/workspace.js       原生 SPA UI
media/web-preserved.js   Browser v2 的兼容层（不再渲染原始网页 DOM）
media/web-full.js        Interactive Browser 与嵌入视图辅助控件
media/workspace.css      VS Code Theme Variable 样式
```

## Privacy Mode

Privacy Mode 仅影响本扩展的视觉呈现：联系人会替换为缩写，预览/内容以 CSS 模糊显示，悬停可临时查看。它不会影响 IDE 的其他区域，也不尝试规避审计。

## Future Modules

真实微信/QQ Bridge、真实 AI Provider、RSS、Music、Podcast、Audiobook、Comics、Notes、To-do、Telegram、Remote Bridge 与 Cloud Sync 仍为后续方向。
