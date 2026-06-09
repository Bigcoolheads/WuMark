const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(__dirname, '..', 'build', 'test-user-data', 'smoke'));
app.setPath('cache', path.join(__dirname, '..', 'build', 'test-cache', 'smoke'));

async function run() {
  ipcMain.handle('theme:getInitial', () => 'light');
  ipcMain.handle('export:document', (_, payload) => ({
    filePath: `mock-export.${payload.format}`,
    format: payload.format,
  }));

  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('landing-new').click();
      document.querySelector('[data-cmd="view-live"]').click();

      const wrapper = document.querySelector('.CodeMirror');
      const cm = wrapper.CodeMirror;
      cm.setValue('实时标题\\n\\n**粗体**、*斜体* 与 ~~删除线~~');
      cm.setSelection(
        { line: 0, ch: 0 },
        { line: 0, ch: cm.getLine(0).length },
      );
      document.querySelector('[data-cmd="h1"]').click();
      cm.setCursor({ line: 0, ch: 6 });

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const header = document.querySelector('.cm-header-1');
      const strong = document.querySelector('.cm-strong');
      const formatting = document.querySelector('.cm-formatting-header');
      const bodySize = parseFloat(getComputedStyle(wrapper).fontSize);
      const headerSize = header ? parseFloat(getComputedStyle(header).fontSize) : 0;
      const strongWeight = strong ? getComputedStyle(strong).fontWeight : '';
      const original = cm.getValue();

      document.querySelector('[data-cmd="view-split"]').click();
      document.querySelector('[data-cmd="view-live"]').click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const modeContentPreserved = cm.getValue() === original;
      const previewRendered = document.getElementById('preview').querySelector('h1')?.textContent === '实时标题';

      document.getElementById('tab-new').click();
      cm.setValue('# 第二页');
      await new Promise(resolve => requestAnimationFrame(resolve));
      document.querySelectorAll('.tab-item')[0].click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const firstTabPreserved = cm.getValue() === original;
      document.querySelectorAll('.tab-item')[1].click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const secondTabPreserved = cm.getValue() === '# 第二页';

      cm.setValue([
        '# 第一章',
        '',
        'emoji :smile:',
        '',
        '公式 $E = mc^2$',
        '',
        '## 第二节',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '查找词 查找词',
      ].join('\\n'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const emojiRendered = document.querySelector('#preview .emoji')?.textContent.includes('😄');
      const formulaRendered = Boolean(document.querySelector('#preview .katex'));

      document.querySelector('[data-cmd="syntax-help"]').click();
      const syntaxHelpVisible = getComputedStyle(document.getElementById('syntax-help-overlay')).display === 'flex'
        && document.querySelector('.syntax-help-content').textContent.includes('KaTeX');
      document.getElementById('syntax-help-close').click();

      document.querySelector('[data-cmd="outline"]').click();
      const outlineItems = document.querySelectorAll('.outline-item');
      const outlineRendered = outlineItems.length === 2;
      outlineItems[1].click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const outlineJumped = cm.getCursor().line === 6
        && outlineItems[1].classList.contains('active');

      openSearchPanel(true);
      document.getElementById('search-input').value = '查找词';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      const searchCounted = document.getElementById('search-result').textContent === '1/2';
      document.getElementById('replace-input').value = '已替换';
      document.getElementById('replace-all').click();
      const replaceAllWorked = !cm.getValue().includes('查找词')
        && cm.getValue().match(/已替换/g)?.length === 2;
      document.getElementById('search-close').click();

      let targetTableCell = document.querySelectorAll('#preview tbody td')[1];
      targetTableCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      const tableToolbarShown = !document.getElementById('table-toolbar').hidden;
      const tableTargetShown = targetTableCell.classList.contains('table-cell-active')
        && document.getElementById('table-toolbar-location').textContent.includes('第 2 列');
      document.querySelector('[data-table-action="column-before"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const headersAfterLeftInsert = Array.from(document.querySelectorAll('#preview thead th')).map(cell => cell.textContent);
      const tableColumnBeforeAdded = headersAfterLeftInsert.join('|') === 'A|新列|B';

      targetTableCell = document.querySelectorAll('#preview tbody td')[2];
      targetTableCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      document.querySelector('[data-table-action="column-after"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const headersAfterRightInsert = Array.from(document.querySelectorAll('#preview thead th')).map(cell => cell.textContent);
      const tableColumnAfterAdded = headersAfterRightInsert.join('|') === 'A|新列|B|新列';

      targetTableCell = document.querySelectorAll('#preview tbody td')[1];
      targetTableCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      document.querySelector('[data-table-action="delete-column"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const headersAfterDelete = Array.from(document.querySelectorAll('#preview thead th')).map(cell => cell.textContent);
      const tableColumnDeleted = headersAfterDelete.join('|') === 'A|B|新列';

      targetTableCell = document.querySelector('#preview tbody td');
      targetTableCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      document.querySelector('[data-table-action="row-after"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rowsAfterInsert = document.querySelectorAll('#preview tbody tr');
      const tableRowAfterAdded = rowsAfterInsert.length === 2
        && rowsAfterInsert[0].textContent.includes('1')
        && !rowsAfterInsert[1].textContent.trim();

      targetTableCell = document.querySelector('#preview tbody td');
      targetTableCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      document.querySelector('[data-table-action="row-before"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rowsAfterBeforeInsert = document.querySelectorAll('#preview tbody tr');
      const tableRowBeforeAdded = rowsAfterBeforeInsert.length === 3
        && !rowsAfterBeforeInsert[0].textContent.trim()
        && rowsAfterBeforeInsert[1].textContent.includes('1');

      targetTableCell = document.querySelectorAll('#preview tbody tr')[1].querySelector('td');
      targetTableCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      document.querySelector('[data-table-action="delete-row"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tableCurrentRowDeleted = document.querySelectorAll('#preview tbody tr').length === 2
        && !document.querySelector('#preview tbody').textContent.includes('1');

      const fullStats = countTextStats(cm.getValue());
      const fullStatsShown = document.getElementById('status-characters').textContent === \`字符: \${fullStats.characters}\`
        && document.getElementById('status-chinese').textContent === \`中文: \${fullStats.chinese}\`
        && document.getElementById('status-words').textContent === \`单词: \${fullStats.words}\`;

      cm.setSelection({ line: 0, ch: 0 }, { line: 2, ch: cm.getLine(2).length });
      await new Promise(resolve => requestAnimationFrame(resolve));
      const selectedStats = countTextStats(cm.getSelection());
      const selectionStatsShown = !document.getElementById('selection-stats').hidden
        && document.getElementById('selection-stat-lines').textContent === \`行 \${selectedStats.lines}\`
        && document.getElementById('selection-stat-characters').textContent === \`字符 \${selectedStats.characters}\`
        && document.getElementById('selection-stat-chinese').textContent === \`中文 \${selectedStats.chinese}\`
        && document.getElementById('selection-stat-words').textContent === \`单词 \${selectedStats.words}\`;

      applyTheme('light');
      const lightAccent = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
      const lightStatus = getComputedStyle(document.getElementById('statusbar')).backgroundColor;
      const lightEditor = getComputedStyle(document.querySelector('.CodeMirror')).backgroundColor;
      applyTheme('dark');
      const darkAccent = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
      const darkStatus = getComputedStyle(document.getElementById('statusbar')).backgroundColor;
      const darkEditor = getComputedStyle(document.querySelector('.CodeMirror')).backgroundColor;
      const logoThemeApplied = lightAccent === '#0788a8' && darkAccent === '#22b8cf';
      const themeSurfacesHarmonized = lightStatus !== lightEditor && darkStatus !== darkEditor;
      applyTheme('light');

      await exportDocument('html');
      const exportTriggered = document.getElementById('status-export').textContent === '已导出 HTML';

      return {
        liveMode: document.body.classList.contains('live-preview-mode'),
        headerRendered: Boolean(header) && headerSize > bodySize,
        strongRendered: Boolean(strong) && (strongWeight === 'bold' || parseInt(strongWeight, 10) >= 600),
        markerRendered: Boolean(formatting),
        toolbarApplied: original.startsWith('# '),
        contentPreserved: modeContentPreserved,
        previewRendered,
        modifiedMarked: Boolean(document.querySelector('.tab-modified')),
        tabStatePreserved: firstTabPreserved && secondTabPreserved,
        emojiRendered,
        formulaRendered,
        syntaxHelpVisible,
        outlineRendered,
        outlineJumped,
        searchCounted,
        replaceAllWorked,
        tableToolbarShown,
        tableTargetShown,
        tableColumnBeforeAdded,
        tableColumnAfterAdded,
        tableColumnDeleted,
        tableRowAfterAdded,
        tableRowBeforeAdded,
        tableCurrentRowDeleted,
        fullStatsShown,
        selectionStatsShown,
        logoThemeApplied,
        themeSurfacesHarmonized,
        exportTriggered,
      };
    })();
  `);

  const failed = Object.entries(result).filter(([, passed]) => !passed);
  if (failed.length > 0) {
    throw new Error(`Smoke checks failed: ${failed.map(([name]) => name).join(', ')}`);
  }

  console.log(JSON.stringify(result, null, 2));
  win.destroy();
}

app.whenReady()
  .then(run)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
