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
let autoSaveDebounceTimer = null;
let autoSaveEnabled = false;
const AUTO_SAVE_DEBOUNCE_MS = 1000;

function init() {
  loadThemePreference();
  bindEditorEvents();
  bindToolbar();
  bindResizer();
  bindIPC();
  bindDragDrop();
  bindPaste();
  bindKeyboard();
  bindLandingButtons();
  showLandingPage();
  updateStatus();
  // Sync localStorage recent files to main process for menu
  syncRecentMenu(getRecentFiles());
}

// ─── Theme ──────────────────────────────────────────
function loadThemePreference() {
  const { ipcRenderer } = require('electron');
  ipcRenderer.invoke('theme:getInitial').then(theme => {
    applyTheme(theme);
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const theme = isDark ? 'dark' : 'light';
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('theme:save', theme);
}

// ─── Landing Page ──────────────────────────────────
function showLandingPage() {
  const app = document.getElementById('app');
  const landing = document.getElementById('landing');
  app.style.display = 'none';
  landing.style.display = 'flex';
  loadRecentFilesUI();
}

function hideLandingPage() {
  const app = document.getElementById('app');
  const landing = document.getElementById('landing');
  app.style.display = 'flex';
  landing.style.display = 'none';
}

function bindLandingButtons() {
  document.getElementById('landing-open').addEventListener('click', async () => {
    const { ipcRenderer } = require('electron');
    const result = await ipcRenderer.invoke('dialog:openFile');
    if (result) {
      editor.value = result.content;
      state.content = result.content;
      state.filePath = result.filePath;
      state.fileName = result.fileName;
      state.modified = false;
      hideLandingPage();
      updatePreview();
      updateStatus();
    }
  });
  document.getElementById('landing-new').addEventListener('click', () => {
    editor.value = '';
    state.content = '';
    state.filePath = null;
    state.fileName = '未命名.md';
    state.modified = false;
    hideLandingPage();
    updatePreview();
    updateStatus();
  });
}

// ─── Recent Files ──────────────────────────────────
const RECENT_MAX = 10;

function addToRecentFiles(filePath, fileName) {
  let recent = getRecentFiles();
  recent = recent.filter(f => f.path !== filePath);
  recent.unshift({ path: filePath, name: fileName, time: Date.now() });
  if (recent.length > RECENT_MAX) recent = recent.slice(0, RECENT_MAX);
  localStorage.setItem('wumark-recent', JSON.stringify(recent));
  loadRecentFilesUI();
  syncRecentMenu(recent);
}

function getRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem('wumark-recent')) || [];
  } catch { return []; }
}

function loadRecentFilesUI() {
  const recent = getRecentFiles();
  const container = document.getElementById('landing-recent');
  const list = document.getElementById('landing-recent-list');
  if (recent.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  list.innerHTML = '';
  const maxShow = 5;
  recent.slice(0, maxShow).forEach(f => {
    const item = document.createElement('div');
    item.className = 'landing-recent-item';
    item.innerHTML = `
      <span class="landing-recent-item-icon">📄</span>
      <div class="landing-recent-item-info">
        <div class="landing-recent-item-name">${escapeHtml(f.name)}</div>
        <div class="landing-recent-item-path">${escapeHtml(f.path)}</div>
      </div>
    `;
    item.addEventListener('click', async () => {
      const { ipcRenderer } = require('electron');
      const fs = require('fs');
      if (fs.existsSync(f.path)) {
        const content = fs.readFileSync(f.path, 'utf-8');
        editor.value = content;
        state.content = content;
        state.filePath = f.path;
        state.fileName = f.name;
        state.modified = false;
        hideLandingPage();
        updatePreview();
        updateStatus();
        addToRecentFiles(f.path, f.name);
      } else {
        removeRecentFile(f.path);
      }
    });
    list.appendChild(item);
  });
}

function removeRecentFile(filePath) {
  let recent = getRecentFiles();
  recent = recent.filter(f => f.path !== filePath);
  localStorage.setItem('wumark-recent', JSON.stringify(recent));
  loadRecentFilesUI();
  syncRecentMenu(recent);
}

function syncRecentMenu(recent) {
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('recent:update', recent);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function triggerAutoSave() {
  if (autoSaveDebounceTimer) {
    clearTimeout(autoSaveDebounceTimer);
    autoSaveDebounceTimer = null;
  }
  if (!autoSaveEnabled || !state.filePath) return;
  autoSaveDebounceTimer = setTimeout(async () => {
    autoSaveDebounceTimer = null;
    await saveCurrent();
  }, AUTO_SAVE_DEBOUNCE_MS);
}

function bindEditorEvents() {
  editor.addEventListener('input', () => {
    state.content = editor.value;
    state.modified = true;
    updatePreview();
    updateStatus();
    triggerAutoSave();
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

function showAboutDialog() {
  const overlay = document.getElementById('about-overlay');
  overlay.style.display = 'flex';

  const closeBtn = document.getElementById('about-close-btn');
  const close = () => { overlay.style.display = 'none'; };
  closeBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
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
  // Auto-save is now trigger-based (debounced on input), no interval needed
  // Force an immediate save when enabling to capture current state
  if (state.modified && state.filePath) {
    saveCurrent();
  }
}

function stopAutoSave() {
  if (autoSaveDebounceTimer) {
    clearTimeout(autoSaveDebounceTimer);
    autoSaveDebounceTimer = null;
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
    hideLandingPage();
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
    hideLandingPage();
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

  ipcRenderer.on('menu:toggleTheme', () => {
    toggleTheme();
  });

  ipcRenderer.on('recent:files', (_, files) => {
    localStorage.setItem('wumark-recent', JSON.stringify(files));
    loadRecentFilesUI();
  });

  ipcRenderer.on('recent:remove', (_, filePath) => {
    removeRecentFile(filePath);
  });

  ipcRenderer.on('menu:about', () => {
    showAboutDialog();
  });

  ipcRenderer.on('menu:closeFile', async () => {
    if (state.modified) {
      const action = await showModal('文档已修改，关闭前是否保存更改？', [
        { label: '保存', action: 'save', primary: true },
        { label: '不保存', action: 'close' },
        { label: '取消', action: 'cancel' },
      ]);
      if (action === 'save') {
        await saveCurrent();
      } else if (action === 'cancel') {
        return;
      }
    }
    editor.value = '';
    state.content = '';
    state.filePath = null;
    state.fileName = '未命名.md';
    state.modified = false;
    showLandingPage();
    updatePreview();
    updateStatus();
    ipcRenderer.send('window:resetTitle');
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
        hideLandingPage();
        updatePreview();
        updateStatus();
        addToRecentFiles(file.path, file.name);
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
