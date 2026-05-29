const state = {
  filePath: null,
  fileName: '未命名.md',
  content: '',
  modified: false,
  viewMode: 'split',
};

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const resizer = document.getElementById('resizer');
const editorPane = document.getElementById('editor-pane');
const previewPane = document.getElementById('preview-pane');

let resizeStartX = 0;
let resizeStartLeft = 0;
let isResizing = false;
let autoSaveTimer = null;
let autoSaveEnabled = false;

function init() {
  bindEditorEvents();
  bindToolbar();
  bindResizer();
  bindIPC();
  bindDragDrop();
  bindPaste();
  bindKeyboard();
  insertWelcomeContent();
  updatePreview();
  updateStatus();
}

function insertWelcomeContent() {
  const welcome = `# 欢迎使用 WuMark (无码) 🎉

WuMark 是一款无干扰的极简 Markdown 编辑器，支持所见即所得的实时预览。

## 快速上手

在左侧编辑区输入 Markdown 语法，右侧即可实时查看渲染效果。

### 支持的语法

- **粗体** \`**粗体**\`
- *斜体* \`*斜体*\`
- ~~删除线~~ \`~~删除线~~\`
- \`行内代码\` \`\`行内代码\`\`

### 代码块

\`\`\`javascript
function hello() {
  console.log("Hello, WuMd!");
}
\`\`\`

### 表格

| 功能 | 快捷键 |
|------|--------|
| 保存 | Ctrl+S |
| 打开 | Ctrl+O |
| 新建 | Ctrl+N |

### 任务列表

- [x] 双栏编辑与实时预览
- [x] 文件打开/保存
- [ ] 更多高级功能

> 祝使用愉快！ — wushaozhi
`;
  editor.value = welcome;
  state.content = welcome;
}

function bindEditorEvents() {
  editor.addEventListener('input', () => {
    state.content = editor.value;
    state.modified = true;
    updatePreview();
    updateStatus();
  });

  editor.addEventListener('scroll', () => {
    syncScroll();
  });

  editor.addEventListener('click', () => updateStatus());
  editor.addEventListener('keyup', () => updateStatus());
}

function syncScroll() {
  if (state.viewMode !== 'split') return;
  const scrollPercent = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
  preview.scrollTop = scrollPercent * (preview.scrollHeight - preview.clientHeight);
}

function updatePreview() {
  preview.innerHTML = parseMarkdown(state.content);
}

function updateStatus() {
  const text = editor.value;
  const words = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  document.getElementById('status-file').textContent = state.fileName;
  document.getElementById('status-words').textContent = `单词: ${words}`;

  const cursorPos = editor.selectionStart;
  const textBefore = text.substring(0, cursorPos);
  const lineNum = textBefore.split('\n').length;
  const colNum = cursorPos - textBefore.lastIndexOf('\n');
  document.getElementById('status-lines').textContent = `行: ${lineNum}, 列: ${colNum}`;

  document.getElementById('status-autosave').textContent = autoSaveEnabled ? '[A]' : '';
  document.getElementById('status-modified').textContent = state.modified ? '● 已修改' : '';
}

function toggleAutoSave() {
  autoSaveEnabled = !autoSaveEnabled;
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('app:autoSaveToggled', autoSaveEnabled);
  if (autoSaveEnabled) {
    startAutoSave();
  } else {
    stopAutoSave();
  }
  updateStatus();
}

function showModal(text, buttons) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const textEl = document.getElementById('modal-text');
    const buttonsEl = document.getElementById('modal-buttons');
    textEl.textContent = text;
    buttonsEl.innerHTML = '';
    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = 'modal-btn' + (btn.primary ? ' modal-btn-primary' : '');
      el.textContent = btn.label;
      el.addEventListener('click', () => {
        overlay.style.display = 'none';
        resolve(btn.action);
      });
      buttonsEl.appendChild(el);
    }
    overlay.style.display = 'flex';
  });
}

function startAutoSave() {
  stopAutoSave();
  autoSaveTimer = setInterval(async () => {
    if (state.modified && state.filePath) {
      await saveCurrent();
    }
  }, 30000);
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

function bindToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      handleCommand(cmd);
    });
  });
}

function handleCommand(cmd) {
  const textarea = editor;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  let replacement = '';
  let cursorOffset = 0;

  const insert = (before, after = '', cursorInner = 0) => {
    const beforeLen = before.length;
    replacement = before + selected + after;
    cursorOffset = selected ? beforeLen + selected.length + after.length : beforeLen + cursorInner;
  };

  switch (cmd) {
    case 'bold': insert('**', '**', 2); break;
    case 'italic': insert('*', '*', 1); break;
    case 'strikethrough': insert('~~', '~~', 2); break;
    case 'code': insert('`', '`', 1); break;
    case 'h1': insert('# ', '', 2); break;
    case 'h2': insert('## ', '', 3); break;
    case 'h3': insert('### ', '', 4); break;
    case 'ul': insert('- ', '', 2); break;
    case 'ol': insert('1. ', '', 3); break;
    case 'task': insert('- [ ] ', '', 6); break;
    case 'quote': insert('> ', '', 2); break;
    case 'codeblock': insert('```\n', '\n```', 4); break;
    case 'link': insert('[', '](url)', 1); break;
    case 'image': insert('![', '](url)', 2); break;
    case 'hr': insert('\n---\n', '', 5); break;
    case 'table': insert('| 标题1 | 标题2 |\n|------|------|\n| 内容1 | 内容2 |\n', '', 0); break;
    case 'view-split': setViewMode('split'); return;
    case 'view-edit': setViewMode('edit'); return;
    case 'view-preview': setViewMode('preview'); return;
    default: return;
  }

  const newText = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.value = newText;
  const newCursor = start + cursorOffset;
  textarea.setSelectionRange(newCursor, newCursor);
  textarea.focus();
  textarea.dispatchEvent(new Event('input'));
}

function setViewMode(mode) {
  state.viewMode = mode;
  editorPane.classList.remove('active');
  previewPane.classList.remove('active');
  document.querySelectorAll('.view-toggle .tool-btn').forEach(b => b.classList.remove('active'));

  switch (mode) {
    case 'edit':
      editorPane.style.flex = '1';
      previewPane.style.display = 'none';
      resizer.style.display = 'none';
      editorPane.classList.add('active');
      document.querySelector('[data-cmd="view-edit"]').classList.add('active');
      break;
    case 'preview':
      editorPane.style.display = 'none';
      resizer.style.display = 'none';
      previewPane.style.flex = '1';
      previewPane.style.display = 'flex';
      previewPane.classList.add('active');
      document.querySelector('[data-cmd="view-preview"]').classList.add('active');
      break;
    case 'split':
      editorPane.style.display = 'flex';
      previewPane.style.display = 'flex';
      resizer.style.display = 'block';
      editorPane.style.flex = '1';
      previewPane.style.flex = '1';
      editorPane.classList.add('active');
      previewPane.classList.add('active');
      document.querySelector('[data-cmd="view-split"]').classList.add('active');
      break;
  }
}

function bindResizer() {
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartLeft = editorPane.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const container = document.getElementById('main-content');
    const containerWidth = container.getBoundingClientRect().width;
    const delta = e.clientX - resizeStartX;
    let newLeftWidth = resizeStartLeft + delta;
    const minWidth = 200;
    newLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, containerWidth - minWidth - 6));
    const percent = (newLeftWidth / containerWidth) * 100;
    editorPane.style.flex = `0 0 ${percent}%`;
    previewPane.style.flex = `1 1 ${100 - percent}%`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

function bindIPC() {
  const { ipcRenderer } = require('electron');

  ipcRenderer.on('file:opened', (event, data) => {
    editor.value = data.content;
    state.content = data.content;
    state.filePath = data.filePath;
    state.fileName = data.fileName;
    state.modified = false;
    updatePreview();
    updateStatus();
  });

  ipcRenderer.on('menu:new', async () => {
    if (state.modified) {
      const confirmed = confirm('当前文档未保存，确定新建吗？');
      if (!confirmed) return;
    }
    editor.value = '';
    state.content = '';
    state.filePath = null;
    state.fileName = '未命名.md';
    state.modified = false;
    updatePreview();
    updateStatus();
  });

  ipcRenderer.on('menu:save', async () => {
    await saveCurrent();
  });

  ipcRenderer.on('menu:saveAs', async () => {
    await saveCurrentAs();
  });

  ipcRenderer.on('menu:selectAll', () => {
    editor.focus();
    editor.select();
  });

  ipcRenderer.on('view:edit', () => setViewMode('edit'));
  ipcRenderer.on('view:preview', () => setViewMode('preview'));
  ipcRenderer.on('view:split', () => setViewMode('split'));

  ipcRenderer.on('menu:toggleAutoSave', (_, checked) => {
    if (checked !== autoSaveEnabled) toggleAutoSave();
  });

  ipcRenderer.on('app:beforeClose', async () => {
    if (!state.modified) {
      ipcRenderer.send('app:closeConfirmed');
      return;
    }
    const action = await showModal('文档已修改，关闭前是否保存更改？', [
      { label: '保存', action: 'save', primary: true },
      { label: '不保存', action: 'close' },
      { label: '取消', action: 'cancel' },
    ]);
    if (action === 'save') {
      await saveCurrent();
      ipcRenderer.send('app:closeConfirmed');
    } else if (action === 'close') {
      ipcRenderer.send('app:closeConfirmed');
    }
  });
}

async function saveCurrent() {
  const { ipcRenderer } = require('electron');
  const content = editor.value;
  if (state.filePath) {
    const result = await ipcRenderer.invoke('dialog:saveFile', { content, filePath: state.filePath });
    if (result) {
      state.modified = false;
      updateStatus();
    }
  } else {
    await saveCurrentAs();
  }
}

async function saveCurrentAs() {
  const { ipcRenderer } = require('electron');
  const content = editor.value;
  const result = await ipcRenderer.invoke('dialog:saveAs', { content });
  if (result) {
    state.filePath = result.filePath;
    state.fileName = result.filePath.split(/[/\\]/).pop();
    state.modified = false;
    updateStatus();
  }
}

function bindDragDrop() {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      const file = files[0];
      const isMd = file.name.endsWith('.md') || file.name.endsWith('.markdown');
      const isImage = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(file.name);

      if (isMd) {
        const text = await file.text();
        editor.value = text;
        state.content = text;
        state.filePath = file.path;
        state.fileName = file.name;
        state.modified = false;
        updatePreview();
        updateStatus();
      } else if (isImage) {
        const { ipcRenderer, webUtils } = require('electron');
        const srcPath = webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path;
        if (srcPath) {
          insertImageLink(toFileUrl(srcPath));
        } else {
          const buffer = await file.arrayBuffer();
          const result = await ipcRenderer.invoke('file:saveImageBuffer', {
            buffer,
            mdPath: state.filePath,
          });
          if (result) insertImageLink(toFileUrl(result.filePath));
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  });
}

function bindPaste() {
  editor.addEventListener('paste', async (e) => {
    try {
      const { clipboard, ipcRenderer } = require('electron');

      // 1. Direct image data (screenshots, browser "copy image")
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        e.preventDefault();
        const result = await ipcRenderer.invoke('file:saveClipboardImage', {
          mdPath: state.filePath,
        });
        if (result) insertImageLink(toFileUrl(result.filePath));
        return;
      }

      // 2. File path from clipboard text (Explorer copy)
      const text = clipboard.readText();
      if (text) {
        const fs = require('fs');
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        for (const line of lines) {
          if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(line) && fs.existsSync(line)) {
            e.preventDefault();
            insertImageLink(toFileUrl(line));
            return;
          }
        }
      }
    } catch (err) {
      console.error('Paste image error:', err);
    }
  });
}

function toFileUrl(filePath) {
  return 'file:///' + encodeURI(filePath.replace(/\\/g, '/'));
}

function insertImageLink(url) {
  const name = url.split('/').pop();
  const text = `![${name}](${url})`;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
  const pos = start + text.length;
  editor.setSelectionRange(pos, pos);
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

function bindKeyboard() {
  document.addEventListener('keydown', async (e) => {
    const { ipcRenderer } = require('electron');
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      await saveCurrent();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
