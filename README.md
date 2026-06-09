<p align="center">
  <img src="assets/wuma.svg" width="128" height="128" alt="WuMark logo">
</p>

<h1 align="center">WuMark · 无码</h1>

<p align="center">
  <strong>所见即所得 · 极简 · Markdown 编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-blue?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Node-24-green?logo=nodedotjs" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Windows">
</p>

<p align="center">
  <a href="#features">功能</a> ·
  <a href="#screenshots">截图</a> ·
  <a href="#install">安装</a> ·
  <a href="#usage">使用</a> ·
  <a href="#build">构建</a> ·
  <a href="#license">许可</a>
</p>

---

## Features

- **所见即所得实时预览** — 在同一编辑区内直接渲染标题、强调、引用、列表、链接和代码，Markdown 原文保持不变
- **双栏实时预览** — 左侧源码编辑，右侧 Typora 风格完整渲染
- **四种视图模式** — 实时预览 / 编辑 / 预览 / 双栏，一键切换
- **CommonMark + GFM** — 标题、强调、代码、表格、列表、任务、引用、自动链接、HTML 和代码高亮
- **Emoji 与数学公式** — 支持 Unicode emoji、`:smile:` 短码、`$...$` 行内公式和 `$$...$$` 块级 KaTeX
- **查找与替换** — 全文搜索、匹配计数、大小写敏感、逐项替换和全部替换
- **文档大纲** — 标题树导航、点击跳转、编辑与预览活跃标题高亮
- **精确表格操作** — 悬停单元格显示坐标，可在当前行前后、当前列左右插入并精准删除
- **文档与选区统计** — 底部显示总字符、中文、单词数，多行选区显示局部统计卡片
- **Logo 主题配色** — 浅色与深色模式统一采用深空蓝、青色和白色视觉体系
- **多格式导出** — 将渲染结果导出为独立 HTML、PDF 或完整 PNG 长图
- **内置语法帮助** — `F1` 查看完整支持矩阵、示例和兼容边界
- **表格内联格式** — 表格内也支持 **粗体**、`代码`、*斜体*
- **文件管理** — 新建、打开、保存、另存为，Ctrl+S / Ctrl+O
- **拖拽打开** — 拖拽 .md 文件到窗口即可打开
- **工具栏** — 一键插入常用 Markdown 语法
- **滚动同步** — 编辑与预览区滚动联动
- **图片拖拽 / 粘贴插入** — 从 Explorer 拖拽图片或截图粘贴，自动保存并插入 `![](image-001.png)`
- **关闭提示** — 未保存时弹出自定义确认对话框（保存 / 丢弃 / 取消）
- **自动保存** — 文件菜单中勾选开启，每 30 秒自动保存
- **多标签页支持** — 同时打开多个文件，标签栏切换，重复文件自动定位
- **便携免安装** — 单 exe 文件，开箱即用

## Screenshots

> TODO: 添加截图

## Install

### 直接下载

从 [Releases](../../releases) 下载 `WuMark.exe`，双击运行。

### 设置为 .md 默认打开方式

1. 右键 `.md` 文件 → **打开方式** → **选择其他应用**
2. 点击 **"在这台电脑上选择其他应用"**
3. 选择 `WuMark.exe` → 勾选 **"始终使用此应用打开 .md 文件"**
4. 点击 **确定**

## Usage

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` | 保存文件 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+Shift+E` | 导出为 PDF |
| `Ctrl+Shift+L` | 切换到实时预览模式 |
| `Ctrl+F` | 查找 |
| `Ctrl+H` | 查找与替换 |
| `Ctrl+Shift+O` | 显示/隐藏文档大纲 |
| `F1` | Markdown 语法帮助 |
| `Ctrl+B` | 加粗 |
| `Ctrl+I` | 斜体 |
| 工具栏按钮 | 插入标题/列表/代码块/表格等 |

## Build

```powershell
# 安装依赖
npm install

# 开发模式启动
npm start

# 打包为便携版 exe
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npx electron-builder --win portable
```

打包后在 `build/WuMark.exe`。

## Tech Stack

| 技术 | 用途 |
|------|------|
| [Electron](https://www.electronjs.org/) | 跨平台桌面框架 |
| [CodeMirror](https://codemirror.net/5/) | Markdown 编辑与实时视觉渲染 |
| [marked](https://marked.js.org/) | Markdown 解析渲染 |
| [KaTeX](https://katex.org/) | 数学公式渲染 |
| [node-emoji](https://github.com/omnidan/node-emoji) | Emoji 短码转换 |
| [highlight.js](https://highlightjs.org/) | 代码语法高亮 |
| [electron-builder](https://www.electron.build/) | 打包分发 |

## Project Structure

```
WuMark/
├── main.js              # 主进程（窗口、菜单、文件IO、IPC）
├── preload.js           # 预加载脚本（contextBridge）
├── package.json
├── assets/
│   ├── wuma.svg         # 图标源文件
│   └── wuma.png         # 应用图标
├── src/
│   ├── index.html       # 主界面
│   ├── renderer/
│   │   ├── app.js       # 应用逻辑
│   │   └── parser.js    # Markdown、emoji、KaTeX、标题与表格解析
│   └── styles/
│       ├── editor.css   # 编辑器样式
│       └── markdown.css # 预览样式
├── test/
│   └── smoke.js         # Electron 实际渲染冒烟测试
└── build/               # 打包输出(已忽略)
```

## License

[MIT License](LICENSE) © 2026 [wushaozhi](https://github.com/Bigcoolheads)
