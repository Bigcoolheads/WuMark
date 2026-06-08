let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let viewMode = 'split';

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const resizer = document.getElementById('resizer');
const editorPane = document.getElementById('editor-pane');
const previewPane = document.getElementById('preview-pane');
const tabList = document.getElementById('tab-list');
const tabNew = document.getElementById('tab-new');

let resizeStartX = 0;
let resizeStartLeft = 0;
let isResizing = false;
let autoSaveDebounceTimer = null;
let autoSaveEnabled = false;
const AUTO_SAVE_DEBOUNCE_MS = 1000;

function createTab(filePath, fileName, content) {
  const id = ++tabIdCounter;
  const tab = { id, filePath, fileName, content, modified: false, savedContent: content, scrollTop: 0, cursorPos: 0 };
  tabs.push(tab);
  renderTabs();
  switchTab(id);
  hideLandingPage();
  return tab;
}

function getTab(id) {
  return tabs.find(t => t.id === id);
}

function getActiveTab() {
  return getTab(activeTabId);
}

function setActiveTabField(key, value) {
  const tab = getActiveTab();
  if (tab) tab[key] = value;
}

function switchTab(id) {
  const prev = getActiveTab();
  if (prev) {
    prev.content = editor.value;
    prev.scrollTop = editor.scrollTop;
    prev.cursorPos = editor.selectionStart;
  }

  activeTabId = id;
  const tab = getActiveTab();
  if (!tab) return;

  editor.value = tab.content;
  updatePreview();
  updateStatus();
  renderTabs();

  requestAnimationFrame(() => {
    editor.scrollTop = tab.scrollTop || 0;
    try { editor.setSelectionRange(tab.cursorPos || 0, tab.cursorPos || 0); } catch {}
    editor.focus();
  });
}

function closeTab(id) {
  const tab = getTab(id);
  if (!tab) return;

  if (tab.modified) {
    switchTab(id);
    showModal('文档已修改，关闭前是否保存更改？', [
      { label: '保存', action: 'save', primary: true },
      { label: '不保存', action: 'close' },
      { label: '取消', action: 'cancel' },
    ]).then(async (action) => {
      if (action === 'save') {
        await saveTab(tab);
        doCloseTab(id);
      } else if (action === 'close') {
        doCloseTab(id);
      }
    });
    return;
  }

  doCloseTab(id);
}

function doCloseTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    showLandingPage();
    renderTabs();
    return;
  }

  const next = Math.min(idx, tabs.length - 1);
  switchTab(tabs[next].id);
}

function renderTabs() {
  tabList.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab-item' + (tab.id === activeTabId ? ' active' : '');
    el.innerHTML = `
      <span class="tab-name">${escapeHtml(tab.fileName)}</span>
      ${tab.modified ? '<span class="tab-modified">●</span>' : ''}
      <button class="tab-close" title="关闭">×</button>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) return;
      switchTab(tab.id);
    });
    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    tabList.appendChild(el);
  }

  const { ipcRenderer } = require('electron');
  if (tabs.length === 0) {
    ipcRenderer.send('window:resetTitle');
  }
}

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

  tabNew.addEventListener('click', () => {
    newFile();
  });

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
  document.body.classList.toggle('dark-mode', theme === 'dark');
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('theme:save', isDark ? 'dark' : 'light');
}

// ─── Landing Page ──────────────────────────────────
function showLandingPage() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('landing').style.display = 'flex';
  loadRecentFilesUI();
}

function hideLandingPage() {
  document.getElementById('app').style.display = 'flex';
  document.getElementById('landing').style.display = 'none';
}

function bindLandingButtons() {
  document.getElementById('landing-open').addEventListener('click', async () => {
    const { ipcRenderer } = require('electron');
    const result = await ipcRenderer.invoke('dialog:openFile');
    if (result) {
      openFileInTab(result.filePath, result.fileName, result.content);
    }
  });
  document.getElementById('landing-new').addEventListener('click', () => {
    newFile();
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
        openFileInTab(f.path, f.name, content);
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
  if (!autoSaveEnabled) return;
  autoSaveDebounceTimer = setTimeout(async () => {
    autoSaveDebounceTimer = null;
    await saveCurrent();
  }, AUTO_SAVE_DEBOUNCE_MS);
}

// ─── Tab helpers ───────────────────────────────────
function newFile() {
  createTab(null, '未命名.md', '');
}

function openFileInTab(filePath, fileName, content) {
  const existing = tabs.find(t => t.filePath && t.filePath === filePath);
  if (existing) {
    switchTab(existing.id);
    return;
  }
  createTab(filePath, fileName, content);
  addToRecentFiles(filePath, fileName);
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('window:setTitle', fileName);
}

// ─── Editor events ─────────────────────────────────
function bindEditorEvents() {
  editor.addEventListener('input', () => {
    const tab = getActiveTab();
    if (tab) {
      tab.content = editor.value;
      if (!tab.modified && tab.content !== tab.savedContent) {
        tab.modified = true;
        renderTabs();
      }
      updatePreview();
      updateStatus();
      triggerAutoSave();
    }
  });

  editor.addEventListener('scroll', () => {
    const tab = getActiveTab();
    if (tab) tab.scrollTop = editor.scrollTop;
    syncScroll();
  });

  editor.addEventListener('click', () => updateStatus());
  editor.addEventListener('keyup', () => updateStatus());
}

function syncScroll() {
  if (viewMode !== 'split') return;
  const scrollPercent = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
  preview.scrollTop = scrollPercent * (preview.scrollHeight - preview.clientHeight);
}

function updatePreview() {
  const tab = getActiveTab();
  preview.innerHTML = parseMarkdown(tab ? tab.content : '');
}

function updateStatus() {
  const tab = getActiveTab();
  const text = editor.value;
  const words = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  document.getElementById('status-file').textContent = tab ? tab.fileName : '未命名.md';
  document.getElementById('status-words').textContent = `单词: ${words}`;

  const cursorPos = editor.selectionStart;
  const textBefore = text.substring(0, cursorPos);
  const lineNum = textBefore.split('\n').length;
  const colNum = cursorPos - textBefore.lastIndexOf('\n');
  document.getElementById('status-lines').textContent = `行: ${lineNum}, 列: ${colNum}`;
  document.getElementById('status-autosave').textContent = autoSaveEnabled ? '[A]' : '';
  document.getElementById('status-modified').textContent = (tab && tab.modified) ? '● 已修改' : '';
}

function showAboutDialog() {
  const overlay = document.getElementById('about-overlay');
  overlay.style.display = 'flex';
  const close = () => { overlay.style.display = 'none'; };
  document.getElementById('about-close-btn').onclick = close;
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
  const tab = getActiveTab();
  if (tab && tab.modified && tab.filePath) {
    saveCurrent();
  }
}

function stopAutoSave() {
  if (autoSaveDebounceTimer) {
    clearTimeout(autoSaveDebounceTimer);
    autoSaveDebounceTimer = null;
  }
}

// ─── Toolbar ───────────────────────────────────────
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
  viewMode = mode;
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

// ─── IPC ───────────────────────────────────────────
function bindIPC() {
  const { ipcRenderer } = require('electron');

  ipcRenderer.on('file:opened', (event, data) => {
    openFileInTab(data.filePath, data.fileName, data.content);
  });

  ipcRenderer.on('menu:new', async () => {
    newFile();
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
    const tab = getActiveTab();
    if (tab) {
      closeTab(tab.id);
    }
  });

  ipcRenderer.on('app:beforeClose', async () => {
    const unsaved = tabs.filter(t => t.modified);
    if (unsaved.length === 0) {
      ipcRenderer.send('app:closeConfirmed');
      return;
    }

    if (unsaved.length === 1) {
      const tab = unsaved[0];
      switchTab(tab.id);
      const action = await showModal(`"${tab.fileName}" 已修改，关闭前是否保存更改？`, [
        { label: '保存', action: 'save', primary: true },
        { label: '不保存', action: 'close' },
        { label: '取消', action: 'cancel' },
      ]);
      if (action === 'save') {
        await saveTab(tab);
        ipcRenderer.send('app:closeConfirmed');
      } else if (action === 'close') {
        ipcRenderer.send('app:closeConfirmed');
      }
      return;
    }

    const names = unsaved.map(t => t.fileName).join('、');
    const action = await showModal(`以下 ${unsaved.length} 个文档已修改：\n${names}\n关闭前是否保存所有更改？`, [
      { label: '全部保存', action: 'save', primary: true },
      { label: '全部丢弃', action: 'close' },
      { label: '取消', action: 'cancel' },
    ]);
    if (action === 'save') {
      for (const t of unsaved) {
        switchTab(t.id);
        await saveTab(t);
      }
      ipcRenderer.send('app:closeConfirmed');
    } else if (action === 'close') {
      ipcRenderer.send('app:closeConfirmed');
    }
  });
}

async function saveTab(tab) {
  const { ipcRenderer } = require('electron');
  const content = tab.content;
  if (tab.filePath) {
    const result = await ipcRenderer.invoke('dialog:saveFile', { content, filePath: tab.filePath });
    if (result) {
      tab.modified = false;
      tab.savedContent = content;
      if (tab.id === activeTabId) {
        updateStatus();
        renderTabs();
      }
    }
  } else {
    const result = await ipcRenderer.invoke('dialog:saveAs', { content });
    if (result) {
      tab.filePath = result.filePath;
      tab.fileName = result.filePath.split(/[/\\]/).pop();
      tab.modified = false;
      tab.savedContent = content;
      if (tab.id === activeTabId) {
        updateStatus();
        renderTabs();
      }
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('window:setTitle', tab.fileName);
    }
  }
}

async function saveCurrent() {
  const tab = getActiveTab();
  if (tab) await saveTab(tab);
}

async function saveCurrentAs() {
  const tab = getActiveTab();
  if (!tab) return;
  const { ipcRenderer } = require('electron');
  const content = tab.content;
  const result = await ipcRenderer.invoke('dialog:saveAs', { content });
  if (result) {
    tab.filePath = result.filePath;
    tab.fileName = result.filePath.split(/[/\\]/).pop();
    tab.modified = false;
    tab.savedContent = content;
    updateStatus();
    renderTabs();
    ipcRenderer.send('window:setTitle', tab.fileName);
  }
}

// ─── Drag & Drop ───────────────────────────────────
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
        createTab(file.path, file.name, text);
        addToRecentFiles(file.path, file.name);
      } else if (isImage) {
        const { ipcRenderer, webUtils } = require('electron');
        const srcPath = webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path;
        if (srcPath) {
          insertImageLink(toFileUrl(srcPath));
        } else {
          const buffer = await file.arrayBuffer();
          const tab = getActiveTab();
          const result = await ipcRenderer.invoke('file:saveImageBuffer', {
            buffer,
            mdPath: tab ? tab.filePath : null,
          });
          if (result) insertImageLink(toFileUrl(result.filePath));
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  });
}

// ─── Paste ─────────────────────────────────────────
function bindPaste() {
  editor.addEventListener('paste', async (e) => {
    try {
      const { clipboard, ipcRenderer } = require('electron');

      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        e.preventDefault();
        const tab = getActiveTab();
        const result = await ipcRenderer.invoke('file:saveClipboardImage', {
          mdPath: tab ? tab.filePath : null,
        });
        if (result) insertImageLink(toFileUrl(result.filePath));
        return;
      }

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