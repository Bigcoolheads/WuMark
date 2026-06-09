const CodeMirror = require('codemirror');
require('codemirror/mode/markdown/markdown');
require('codemirror/addon/selection/active-line');
require('codemirror/addon/edit/continuelist');

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
const searchPanel = document.getElementById('search-panel');
const searchInput = document.getElementById('search-input');
const replaceInput = document.getElementById('replace-input');
const searchCaseSensitive = document.getElementById('search-case-sensitive');
const searchResult = document.getElementById('search-result');
const outlinePanel = document.getElementById('outline-panel');
const outlineList = document.getElementById('outline-list');
const tableToolbar = document.getElementById('table-toolbar');
const tableToolbarLocation = document.getElementById('table-toolbar-location');
const selectionStats = document.getElementById('selection-stats');

let resizeStartX = 0;
let resizeStartLeft = 0;
let isResizing = false;
let autoSaveDebounceTimer = null;
let autoSaveEnabled = false;
let markdownEditor = null;
let isSyncingEditor = false;
let searchMatches = [];
let searchMatchIndex = -1;
let searchMarks = [];
let currentHeadings = [];
let tableContext = null;
let tableToolbarHideTimer = null;
let highlightedTableCell = null;
const AUTO_SAVE_DEBOUNCE_MS = 1000;

function initMarkdownEditor() {
  markdownEditor = CodeMirror.fromTextArea(editor, {
    mode: {
      name: 'markdown',
      highlightFormatting: true,
      strikethrough: true,
      taskLists: true,
    },
    lineWrapping: true,
    styleActiveLine: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      Enter: 'newlineAndIndentContinueMarkdownList',
    },
  });
  markdownEditor.setSize('100%', '100%');
}

function getEditorValue() {
  return markdownEditor ? markdownEditor.getValue() : editor.value;
}

function setEditorValue(value) {
  if (!markdownEditor) {
    editor.value = value;
    return;
  }
  if (markdownEditor.getValue() === value) return;
  isSyncingEditor = true;
  markdownEditor.setValue(value);
  isSyncingEditor = false;
}

function getEditorSelection() {
  if (!markdownEditor) {
    return { start: editor.selectionStart, end: editor.selectionEnd };
  }
  const anchor = markdownEditor.indexFromPos(markdownEditor.getCursor('anchor'));
  const head = markdownEditor.indexFromPos(markdownEditor.getCursor('head'));
  return { start: Math.min(anchor, head), end: Math.max(anchor, head) };
}

function setEditorSelection(start, end = start) {
  if (!markdownEditor) {
    editor.setSelectionRange(start, end);
    return;
  }
  markdownEditor.setSelection(
    markdownEditor.posFromIndex(start),
    markdownEditor.posFromIndex(end),
  );
}

function getEditorCursorIndex() {
  return getEditorSelection().end;
}

function getEditorScrollTop() {
  return markdownEditor ? markdownEditor.getScrollInfo().top : editor.scrollTop;
}

function setEditorScrollTop(scrollTop) {
  if (markdownEditor) {
    markdownEditor.scrollTo(null, scrollTop);
  } else {
    editor.scrollTop = scrollTop;
  }
}

function focusEditor() {
  if (markdownEditor) {
    markdownEditor.focus();
  } else {
    editor.focus();
  }
}

function replaceEditorRange(text, start, end, cursorPos) {
  if (!markdownEditor) {
    editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
    editor.dispatchEvent(new Event('input'));
  } else {
    markdownEditor.replaceRange(
      text,
      markdownEditor.posFromIndex(start),
      markdownEditor.posFromIndex(end),
      '+input',
    );
  }
  setEditorSelection(cursorPos);
  focusEditor();
}

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
    prev.content = getEditorValue();
    prev.scrollTop = getEditorScrollTop();
    prev.cursorPos = getEditorCursorIndex();
  }

  activeTabId = id;
  const tab = getActiveTab();
  if (!tab) return;

  setEditorValue(tab.content);
  updatePreview();
  updateStatus();
  renderTabs();

  requestAnimationFrame(() => {
    setEditorScrollTop(tab.scrollTop || 0);
    try { setEditorSelection(tab.cursorPos || 0); } catch {}
    focusEditor();
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
  initMarkdownEditor();
  bindEditorEvents();
  bindToolbar();
  bindResizer();
  bindIPC();
  bindDragDrop();
  bindPaste();
  bindKeyboard();
  bindLandingButtons();
  bindSearchPanel();
  bindOutline();
  bindTableToolbar();
  bindSyntaxHelp();
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

async function exportDocument(format = null) {
  const tab = getActiveTab();
  if (!tab) return;
  let targetFormat = format;
  if (!targetFormat) {
    targetFormat = await showModal('选择导出格式', [
      { label: 'HTML', action: 'html' },
      { label: 'PDF', action: 'pdf', primary: true },
      { label: 'PNG 图片', action: 'png' },
      { label: '取消', action: 'cancel' },
    ]);
  }
  if (!['html', 'pdf', 'png'].includes(targetFormat)) return;

  const { ipcRenderer } = require('electron');
  const result = await ipcRenderer.invoke('export:document', {
    format: targetFormat,
    title: tab.fileName,
    contentHtml: preview.innerHTML,
    theme: document.body.classList.contains('dark-mode') ? 'dark' : 'light',
    sourcePath: tab.filePath,
  });
  if (result && result.filePath) {
    const status = document.getElementById('status-export');
    status.textContent = `已导出 ${targetFormat.toUpperCase()}`;
    setTimeout(() => { status.textContent = ''; }, 3500);
  }
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
  markdownEditor.on('change', () => {
    if (isSyncingEditor) return;
    const tab = getActiveTab();
    if (tab) {
      const wasModified = tab.modified;
      tab.content = getEditorValue();
      tab.modified = tab.content !== tab.savedContent;
      if (wasModified !== tab.modified) {
        renderTabs();
      }
      updatePreview();
      updateStatus();
      if (!searchPanel.hidden) refreshSearchMatches(searchMatchIndex);
      triggerAutoSave();
    }
  });

  markdownEditor.on('scroll', () => {
    const tab = getActiveTab();
    if (tab) tab.scrollTop = getEditorScrollTop();
    syncScroll();
  });

  markdownEditor.on('cursorActivity', () => {
    updateStatus();
    updateOutlineActive();
    updateSelectionStats();
  });
  markdownEditor.on('blur', () => {
    setTimeout(updateSelectionStats, 0);
  });
}

function syncScroll() {
  if (viewMode !== 'split') return;
  const scrollInfo = markdownEditor.getScrollInfo();
  const scrollRange = scrollInfo.height - scrollInfo.clientHeight;
  const scrollPercent = scrollRange > 0 ? scrollInfo.top / scrollRange : 0;
  preview.scrollTop = scrollPercent * (preview.scrollHeight - preview.clientHeight);
}

function updatePreview() {
  const tab = getActiveTab();
  preview.innerHTML = parseMarkdown(tab ? tab.content : '');
  currentHeadings = extractMarkdownHeadings(tab ? tab.content : '');
  renderOutline();
  hideTableToolbar();
}

function updateStatus() {
  const tab = getActiveTab();
  const text = getEditorValue();
  const stats = countTextStats(text);
  document.getElementById('status-file').textContent = tab ? tab.fileName : '未命名.md';
  document.getElementById('status-characters').textContent = `字符: ${stats.characters}`;
  document.getElementById('status-chinese').textContent = `中文: ${stats.chinese}`;
  document.getElementById('status-words').textContent = `单词: ${stats.words}`;

  const cursorPos = getEditorCursorIndex();
  const textBefore = text.substring(0, cursorPos);
  const lineNum = textBefore.split('\n').length;
  const colNum = cursorPos - textBefore.lastIndexOf('\n');
  document.getElementById('status-lines').textContent = `行: ${lineNum}, 列: ${colNum}`;
  document.getElementById('status-autosave').textContent = autoSaveEnabled ? '[A]' : '';
  document.getElementById('status-modified').textContent = (tab && tab.modified) ? '● 已修改' : '';
}

function countTextStats(text) {
  const normalized = text || '';
  const characters = Array.from(normalized).length;
  const chinese = (normalized.match(/\p{Script=Han}/gu) || []).length;
  const words = (normalized.match(/\p{Script=Latin}[\p{Script=Latin}\p{M}\p{N}]*(?:['’-][\p{Script=Latin}\p{M}\p{N}]+)*/gu) || []).length;
  const lines = normalized ? normalized.split(/\r?\n/).length : 0;
  return { characters, chinese, words, lines };
}

function updateSelectionStats() {
  if (!markdownEditor || !markdownEditor.somethingSelected()) {
    selectionStats.hidden = true;
    return;
  }

  const selected = markdownEditor.getSelection();
  if (!selected.includes('\n')) {
    selectionStats.hidden = true;
    return;
  }

  const stats = countTextStats(selected);
  document.getElementById('selection-stat-lines').textContent = `行 ${stats.lines}`;
  document.getElementById('selection-stat-characters').textContent = `字符 ${stats.characters}`;
  document.getElementById('selection-stat-chinese').textContent = `中文 ${stats.chinese}`;
  document.getElementById('selection-stat-words').textContent = `单词 ${stats.words}`;

  const head = markdownEditor.getCursor('head');
  const coords = markdownEditor.cursorCoords(head, 'window');
  selectionStats.hidden = false;
  const width = selectionStats.offsetWidth;
  const height = selectionStats.offsetHeight;
  const left = Math.min(
    Math.max(12, coords.left),
    Math.max(12, window.innerWidth - width - 12),
  );
  let top = coords.bottom + 10;
  if (top + height > window.innerHeight - 12) {
    top = Math.max(12, coords.top - height - 10);
  }
  selectionStats.style.left = `${left}px`;
  selectionStats.style.top = `${top}px`;
}

// ─── Find and replace ──────────────────────────────
function bindSearchPanel() {
  searchInput.addEventListener('input', () => refreshSearchMatches(0));
  searchCaseSensitive.addEventListener('change', () => refreshSearchMatches(0));
  document.getElementById('search-prev').addEventListener('click', () => findNextMatch(-1));
  document.getElementById('search-next').addEventListener('click', () => findNextMatch(1));
  document.getElementById('replace-one').addEventListener('click', replaceCurrentMatch);
  document.getElementById('replace-all').addEventListener('click', replaceAllMatches);
  document.getElementById('search-close').addEventListener('click', closeSearchPanel);

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findNextMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      closeSearchPanel();
    }
  });
  replaceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceCurrentMatch();
    } else if (event.key === 'Escape') {
      closeSearchPanel();
    }
  });
}

function openSearchPanel(showReplace = false) {
  if (!getActiveTab()) return;
  searchPanel.hidden = false;
  replaceInput.hidden = !showReplace;
  document.getElementById('replace-one').hidden = !showReplace;
  document.getElementById('replace-all').hidden = !showReplace;
  if (viewMode === 'preview') setViewMode('live');

  const selected = markdownEditor.getSelection();
  if (selected && !selected.includes('\n')) searchInput.value = selected;
  refreshSearchMatches(0);
  searchInput.focus();
  searchInput.select();
}

function closeSearchPanel() {
  searchPanel.hidden = true;
  clearSearchMarks();
  searchMatches = [];
  searchMatchIndex = -1;
  searchResult.textContent = '0/0';
  focusEditor();
}

function clearSearchMarks() {
  for (const mark of searchMarks) mark.clear();
  searchMarks = [];
}

function refreshSearchMatches(preferredIndex = 0) {
  clearSearchMarks();
  searchMatches = [];
  const query = searchInput.value;
  if (!query) {
    searchMatchIndex = -1;
    searchResult.textContent = '0/0';
    return;
  }

  const source = getEditorValue();
  const haystack = searchCaseSensitive.checked ? source : source.toLocaleLowerCase();
  const needle = searchCaseSensitive.checked ? query : query.toLocaleLowerCase();
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    searchMatches.push({ start: found, end: found + query.length });
    index = found + Math.max(query.length, 1);
  }

  if (searchMatches.length === 0) {
    searchMatchIndex = -1;
    searchResult.textContent = '0/0';
    return;
  }

  searchMatchIndex = Math.max(0, Math.min(preferredIndex, searchMatches.length - 1));
  renderSearchMarks();
  selectSearchMatch(searchMatchIndex);
}

function renderSearchMarks() {
  clearSearchMarks();
  searchMarks = searchMatches.map((match, index) => markdownEditor.markText(
    markdownEditor.posFromIndex(match.start),
    markdownEditor.posFromIndex(match.end),
    { className: index === searchMatchIndex ? 'search-match search-match-active' : 'search-match' },
  ));
}

function selectSearchMatch(index) {
  if (searchMatches.length === 0) return;
  searchMatchIndex = (index + searchMatches.length) % searchMatches.length;
  renderSearchMarks();
  const match = searchMatches[searchMatchIndex];
  const from = markdownEditor.posFromIndex(match.start);
  const to = markdownEditor.posFromIndex(match.end);
  markdownEditor.setSelection(from, to);
  markdownEditor.scrollIntoView({ from, to }, 100);
  searchResult.textContent = `${searchMatchIndex + 1}/${searchMatches.length}`;
}

function findNextMatch(direction) {
  if (searchMatches.length === 0) {
    refreshSearchMatches(direction < 0 ? Number.MAX_SAFE_INTEGER : 0);
    return;
  }
  selectSearchMatch(searchMatchIndex + direction);
}

function replaceCurrentMatch() {
  if (searchMatches.length === 0 || searchMatchIndex < 0) return;
  const match = searchMatches[searchMatchIndex];
  markdownEditor.replaceRange(
    replaceInput.value,
    markdownEditor.posFromIndex(match.start),
    markdownEditor.posFromIndex(match.end),
    '+input',
  );
  refreshSearchMatches(Math.min(searchMatchIndex, Math.max(searchMatches.length - 1, 0)));
}

function replaceAllMatches() {
  if (searchMatches.length === 0) return;
  const source = getEditorValue();
  const query = searchInput.value;
  const flags = searchCaseSensitive.checked ? 'g' : 'gi';
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  const replaced = source.replace(regex, () => replaceInput.value);
  markdownEditor.operation(() => {
    markdownEditor.replaceRange(
      replaced,
      { line: 0, ch: 0 },
      { line: markdownEditor.lastLine(), ch: markdownEditor.getLine(markdownEditor.lastLine()).length },
      '+input',
    );
  });
  refreshSearchMatches(0);
}

// ─── Outline ───────────────────────────────────────
function bindOutline() {
  document.getElementById('outline-close').addEventListener('click', () => toggleOutline(false));
  outlineList.addEventListener('click', (event) => {
    const item = event.target.closest('.outline-item');
    if (!item) return;
    jumpToHeading(Number(item.dataset.line), item.dataset.headingId);
  });
  preview.addEventListener('scroll', updateOutlineFromPreview);
}

function toggleOutline(force) {
  const shouldShow = typeof force === 'boolean' ? force : outlinePanel.hidden;
  outlinePanel.hidden = !shouldShow;
  document.body.classList.toggle('outline-visible', shouldShow);
  if (shouldShow) {
    renderOutline();
    updateOutlineActive();
  }
  requestAnimationFrame(() => {
    if (markdownEditor) markdownEditor.refresh();
  });
}

function renderOutline() {
  outlineList.innerHTML = '';
  if (currentHeadings.length === 0) {
    outlineList.innerHTML = '<div class="outline-empty">当前文档没有标题</div>';
    return;
  }

  for (const heading of currentHeadings) {
    const item = document.createElement('button');
    item.className = 'outline-item';
    item.dataset.line = String(heading.line);
    item.dataset.headingId = heading.id;
    item.style.setProperty('--outline-level', heading.level);
    item.textContent = heading.text || '未命名标题';
    item.title = heading.text;
    outlineList.appendChild(item);
  }
  updateOutlineActive();
}

function jumpToHeading(line, id) {
  if (viewMode !== 'preview') {
    markdownEditor.setCursor({ line, ch: 0 });
    markdownEditor.scrollIntoView({ line, ch: 0 }, 120);
    focusEditor();
  }
  if (viewMode === 'preview' || viewMode === 'split') {
    const heading = document.getElementById(id);
    if (heading) heading.scrollIntoView({ block: 'start' });
  }
  setOutlineActive(id);
}

function updateOutlineActive() {
  if (outlinePanel.hidden || currentHeadings.length === 0 || !markdownEditor) return;
  const line = markdownEditor.getCursor().line;
  let active = currentHeadings[0];
  for (const heading of currentHeadings) {
    if (heading.line > line) break;
    active = heading;
  }
  setOutlineActive(active.id);
}

function updateOutlineFromPreview() {
  if (outlinePanel.hidden || (viewMode !== 'preview' && viewMode !== 'split')) return;
  const headings = Array.from(preview.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let active = headings[0];
  for (const heading of headings) {
    if (heading.offsetTop - preview.scrollTop > 60) break;
    active = heading;
  }
  if (active) setOutlineActive(active.id);
}

function setOutlineActive(id) {
  outlineList.querySelectorAll('.outline-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.headingId === id);
  });
  const active = outlineList.querySelector('.outline-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// ─── Table operations ──────────────────────────────
function bindTableToolbar() {
  preview.addEventListener('mousemove', (event) => {
    const cell = event.target.closest('th, td');
    const wrapper = event.target.closest('.table-wrapper');
    if (!cell || !wrapper) return;
    const row = cell.parentElement;
    tableContext = {
      tableIndex: Number(wrapper.dataset.tableIndex),
      rowIndex: row.rowIndex,
      columnIndex: cell.cellIndex,
    };
    highlightTableCell(cell);
    showTableToolbar(cell);
  });
  preview.addEventListener('mouseleave', scheduleHideTableToolbar);
  tableToolbar.addEventListener('mouseenter', cancelHideTableToolbar);
  tableToolbar.addEventListener('mouseleave', scheduleHideTableToolbar);
  tableToolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-table-action]');
    if (button) applyTableAction(button.dataset.tableAction);
  });
}

function highlightTableCell(cell) {
  if (highlightedTableCell === cell) return;
  if (highlightedTableCell) highlightedTableCell.classList.remove('table-cell-active');
  highlightedTableCell = cell;
  highlightedTableCell.classList.add('table-cell-active');
}

function showTableToolbar(cell) {
  cancelHideTableToolbar();
  const paneRect = previewPane.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  tableToolbar.hidden = false;
  tableToolbarLocation.textContent = tableContext.rowIndex === 0
    ? `表头 · 第 ${tableContext.columnIndex + 1} 列`
    : `第 ${tableContext.rowIndex} 数据行 · 第 ${tableContext.columnIndex + 1} 列`;
  const rowBeforeButton = tableToolbar.querySelector('[data-table-action="row-before"]');
  const deleteRowButton = tableToolbar.querySelector('[data-table-action="delete-row"]');
  rowBeforeButton.disabled = tableContext.rowIndex === 0;
  rowBeforeButton.title = tableContext.rowIndex === 0 ? '不能在表头前插入数据行' : '在当前行前插入';
  deleteRowButton.disabled = tableContext.rowIndex === 0;
  deleteRowButton.title = tableContext.rowIndex === 0 ? '表头行不能删除' : '删除当前行';

  const toolbarWidth = tableToolbar.offsetWidth;
  const toolbarHeight = tableToolbar.offsetHeight;
  let left = cellRect.left - paneRect.left;
  let top = cellRect.bottom - paneRect.top + 7;
  left = Math.min(Math.max(8, left), Math.max(8, paneRect.width - toolbarWidth - 8));
  if (top + toolbarHeight > paneRect.height - 8) {
    top = Math.max(8, cellRect.top - paneRect.top - toolbarHeight - 7);
  }
  tableToolbar.style.left = `${left}px`;
  tableToolbar.style.top = `${top}px`;
  tableToolbar.style.right = 'auto';
}

function scheduleHideTableToolbar() {
  cancelHideTableToolbar();
  tableToolbarHideTimer = setTimeout(hideTableToolbar, 180);
}

function cancelHideTableToolbar() {
  if (tableToolbarHideTimer) {
    clearTimeout(tableToolbarHideTimer);
    tableToolbarHideTimer = null;
  }
}

function hideTableToolbar() {
  cancelHideTableToolbar();
  tableToolbar.hidden = true;
  tableContext = null;
  if (highlightedTableCell) {
    highlightedTableCell.classList.remove('table-cell-active');
    highlightedTableCell = null;
  }
}

function normalizeTableRows(table) {
  const columnCount = Math.max(
    table.header.length,
    table.delimiter.length,
    ...table.body.map(row => row.length),
  );
  const fill = (row, value = '') => Array.from({ length: columnCount }, (_, index) => row[index] ?? value);
  return {
    header: fill(table.header, '标题'),
    delimiter: fill(table.delimiter, '---'),
    body: table.body.map(row => fill(row)),
  };
}

function serializeTable(table) {
  const row = cells => `| ${cells.join(' | ')} |`;
  return [row(table.header), row(table.delimiter), ...table.body.map(row)].join('\n');
}

function applyTableAction(action) {
  if (!tableContext) return;
  const tables = findMarkdownTables(getEditorValue());
  const sourceTable = tables[tableContext.tableIndex];
  if (!sourceTable) return;
  const table = normalizeTableRows(sourceTable);
  const column = Math.min(tableContext.columnIndex, table.header.length - 1);

  if (action === 'row-before' || action === 'row-after') {
    const currentBodyIndex = Math.max(0, tableContext.rowIndex - 1);
    const insertAt = tableContext.rowIndex === 0
      ? 0
      : Math.min(
        currentBodyIndex + (action === 'row-after' ? 1 : 0),
        table.body.length,
      );
    table.body.splice(insertAt, 0, Array(table.header.length).fill(''));
  } else if (action === 'delete-row') {
    if (tableContext.rowIndex === 0 || table.body.length === 0) return;
    const bodyIndex = Math.min(tableContext.rowIndex - 1, table.body.length - 1);
    table.body.splice(bodyIndex, 1);
  } else if (action === 'column-before' || action === 'column-after') {
    const insertAt = column + (action === 'column-after' ? 1 : 0);
    table.header.splice(insertAt, 0, '新列');
    table.delimiter.splice(insertAt, 0, '---');
    table.body.forEach(row => row.splice(insertAt, 0, ''));
  } else if (action === 'delete-column') {
    if (table.header.length <= 1) return;
    table.header.splice(column, 1);
    table.delimiter.splice(column, 1);
    table.body.forEach(row => row.splice(column, 1));
  }

  markdownEditor.replaceRange(
    serializeTable(table),
    { line: sourceTable.startLine, ch: 0 },
    { line: sourceTable.endLine, ch: markdownEditor.getLine(sourceTable.endLine).length },
    '+input',
  );
  markdownEditor.setCursor({ line: sourceTable.startLine, ch: 0 });
  hideTableToolbar();
}

// ─── Syntax help ───────────────────────────────────
function bindSyntaxHelp() {
  const overlay = document.getElementById('syntax-help-overlay');
  const close = () => { overlay.style.display = 'none'; };
  document.getElementById('syntax-help-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
}

function showSyntaxHelp() {
  document.getElementById('syntax-help-overlay').style.display = 'flex';
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
  const { start, end } = getEditorSelection();
  const value = getEditorValue();
  const selected = value.substring(start, end);
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
    case 'find': openSearchPanel(false); return;
    case 'outline': toggleOutline(); return;
    case 'syntax-help': showSyntaxHelp(); return;
    case 'export': exportDocument(); return;
    case 'view-split': setViewMode('split'); return;
    case 'view-live': setViewMode('live'); return;
    case 'view-edit': setViewMode('edit'); return;
    case 'view-preview': setViewMode('preview'); return;
    default: return;
  }

  const newCursor = start + cursorOffset;
  replaceEditorRange(replacement, start, end, newCursor);
}

function setViewMode(mode) {
  viewMode = mode;
  document.body.classList.toggle('live-preview-mode', mode === 'live');
  editorPane.classList.remove('active');
  previewPane.classList.remove('active');
  document.querySelectorAll('.view-toggle .tool-btn').forEach(b => b.classList.remove('active'));

  switch (mode) {
    case 'live':
      editorPane.style.display = 'flex';
      editorPane.style.flex = '1';
      previewPane.style.display = 'none';
      resizer.style.display = 'none';
      editorPane.classList.add('active');
      document.querySelector('[data-cmd="view-live"]').classList.add('active');
      break;
    case 'edit':
      editorPane.style.display = 'flex';
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

  requestAnimationFrame(() => {
    if (markdownEditor && mode !== 'preview') {
      markdownEditor.refresh();
      focusEditor();
    }
  });
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

  ipcRenderer.on('menu:export', (_, format) => {
    exportDocument(format);
  });

  ipcRenderer.on('menu:selectAll', () => {
    focusEditor();
    markdownEditor.execCommand('selectAll');
  });

  ipcRenderer.on('edit:find', () => openSearchPanel(false));
  ipcRenderer.on('edit:replace', () => openSearchPanel(true));
  ipcRenderer.on('view:edit', () => setViewMode('edit'));
  ipcRenderer.on('view:preview', () => setViewMode('preview'));
  ipcRenderer.on('view:split', () => setViewMode('split'));
  ipcRenderer.on('view:live', () => setViewMode('live'));
  ipcRenderer.on('view:outline', () => toggleOutline());

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
  ipcRenderer.on('menu:syntaxHelp', () => {
    showSyntaxHelp();
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
  markdownEditor.getWrapperElement().addEventListener('paste', async (e) => {
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
  const { start, end } = getEditorSelection();
  const pos = start + text.length;
  replaceEditorRange(text, start, end, pos);
}

function bindKeyboard() {
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      showSyntaxHelp();
      return;
    }
    if (e.key === 'Escape' && !searchPanel.hidden) {
      closeSearchPanel();
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setViewMode('live');
    } else if (e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      toggleOutline();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearchPanel(false);
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      openSearchPanel(true);
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      await saveCurrent();
    } else if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      handleCommand('bold');
    } else if (e.key.toLowerCase() === 'i') {
      e.preventDefault();
      handleCommand('italic');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
