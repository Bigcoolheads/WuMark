<p align="center">
  <img src="assets/wuma.svg" width="128" height="128" alt="WuMark logo">
</p>

<h1 align="center">WuMark · 无码</h1>

<p align="center">
  <strong>无干扰 · 极简 · Markdown 编辑器</strong>
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

- **双栏实时预览** — 左侧编辑，右侧 Typora 风格渲染，输入即所见
- **三种视图模式** — 编辑 / 预览 / 双栏，一键切换
- **标准 Markdown** — 标题、粗体、斜体、代码、表格、列表、任务列表、引用、代码块语法高亮
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
| [marked](https://marked.js.org/) | Markdown 解析渲染 |
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
│   │   └── parser.js    # Markdown 解析（marked + hljs）
│   └── styles/
│       ├── editor.css   # 编辑器样式
│       └── markdown.css # 预览样式
└── build/               # 打包输出(已忽略)
```

## License

[MIT License](LICENSE) © 2026 [wushaozhi](https://github.com/Bigcoolheads)
