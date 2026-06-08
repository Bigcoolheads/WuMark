const { app, BrowserWindow, dialog, ipcMain, Menu, shell, clipboard, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let recentFiles = loadRecentFiles();

let mainWindow;
let forceClose = false;

function createWindow() {
  const bounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width || 1200,
    height: bounds.height || 760,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 500,
    title: 'WuMark - 无码Markdown编辑器',
    icon: path.join(__dirname, 'assets', 'wuma.png'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  buildMenu();

  mainWindow.on('close', (e) => {
    if (!forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('app:beforeClose');
    }
  });

  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
    forceClose = false;
  });
}

function loadWindowBounds() {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveBounds() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(bounds), 'utf-8');
  } catch {}
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

function getRecentPath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

function loadRecentFiles() {
  try {
    return JSON.parse(fs.readFileSync(getRecentPath(), 'utf-8'));
  } catch { return []; }
}

function saveRecentFiles() {
  try {
    fs.writeFileSync(getRecentPath(), JSON.stringify(recentFiles), 'utf-8');
  } catch {}
}

function getThemeConfigPath() {
  return path.join(app.getPath('userData'), 'theme.json');
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:new'),
        },
        {
          label: '打开...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              openFile(result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:save'),
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu:saveAs'),
        },
        {
          label: '关闭文件',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow.webContents.send('menu:closeFile'),
        },
        { type: 'separator' },
        {
          label: '自动保存',
          type: 'checkbox',
          checked: false,
          click: (menuItem) => {
            mainWindow.webContents.send('menu:toggleAutoSave', menuItem.checked);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        {
          label: '全选',
          accelerator: 'CmdOrCtrl+A',
          click: () => mainWindow.webContents.send('menu:selectAll'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '编辑模式',
          click: () => mainWindow.webContents.send('view:edit'),
        },
        {
          label: '预览模式',
          click: () => mainWindow.webContents.send('view:preview'),
        },
        {
          label: '双栏模式',
          click: () => mainWindow.webContents.send('view:split'),
        },
        { type: 'separator' },
        {
          label: '切换浅色/深色模式',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => mainWindow.webContents.send('menu:toggleTheme'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 WuMark',
          click: () => mainWindow.webContents.send('menu:about'),
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file:opened', {
      content,
      filePath,
      fileName: path.basename(filePath),
    });
    addToRecent(filePath);
  } catch (err) {
    dialog.showErrorBox('打开失败', `无法读取文件: ${err.message}`);
  }
}

function addToRecent(filePath) {
  recentFiles = recentFiles.filter(f => f.path !== filePath);
  recentFiles.unshift({ path: filePath, name: path.basename(filePath), time: Date.now() });
  if (recentFiles.length > 10) recentFiles = recentFiles.slice(0, 10);
  saveRecentFiles();
  if (mainWindow) {
    mainWindow.webContents.send('recent:files', recentFiles);
  }
}

function handleIPC() {
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    addToRecent(filePath);
    return { content, filePath, fileName: path.basename(filePath) };
  });

  ipcMain.handle('dialog:saveFile', async (_, { content, filePath }) => {
    if (!filePath) {
      return handleSaveAs(content);
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return { filePath };
  });

  ipcMain.handle('dialog:saveAs', async (_, { content }) => {
    const result = await handleSaveAs(content);
    if (result && result.filePath) {
      addToRecent(result.filePath);
    }
    return result;
  });

  ipcMain.handle('file:saveClipboardImage', async (_, { mdPath }) => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return saveImageFile(img.toPNG(), mdPath);
  });

  ipcMain.handle('file:saveDroppedImage', async (_, { srcPath, mdPath }) => {
    const data = fs.readFileSync(srcPath);
    return saveImageFile(data, mdPath);
  });

  ipcMain.handle('file:saveImageBuffer', async (_, { buffer, mdPath }) => {
    return saveImageFile(Buffer.from(buffer), mdPath);
  });

  ipcMain.on('app:closeConfirmed', () => {
    forceClose = true;
    mainWindow.close();
  });

  ipcMain.on('app:autoSaveToggled', (_, enabled) => {
    const menu = Menu.getApplicationMenu();
    const fileMenu = menu ? menu.items.find(i => i.label === '文件') : null;
    if (fileMenu && fileMenu.submenu) {
      const item = fileMenu.submenu.items.find(i => i.label === '自动保存');
      if (item) item.checked = enabled;
    }
  });

  ipcMain.on('window:resetTitle', () => {
    mainWindow.setTitle('WuMark - 无码Markdown编辑器');
  });

  ipcMain.on('window:setTitle', (_, fileName) => {
    mainWindow.setTitle(`${fileName} - WuMark`);
  });

  ipcMain.on('recent:update', (_, files) => {
    recentFiles = files;
    saveRecentFiles();
  });

  ipcMain.handle('recent:open', (_, filePath) => {
    openFile(filePath);
  });

  ipcMain.handle('theme:getInitial', () => {
    try {
      const config = JSON.parse(fs.readFileSync(getThemeConfigPath(), 'utf-8'));
      const theme = config.theme || 'light';
      nativeTheme.themeSource = theme;
      return theme;
    } catch {
      nativeTheme.themeSource = 'light';
      return 'light';
    }
  });

  ipcMain.on('theme:save', (_, theme) => {
    try {
      fs.writeFileSync(getThemeConfigPath(), JSON.stringify({ theme }), 'utf-8');
      nativeTheme.themeSource = theme;
    } catch {}
  });

}

function saveImageFile(buffer, mdPath) {
  const dir = mdPath
    ? path.join(path.dirname(mdPath), path.basename(mdPath, path.extname(mdPath)) + '.assets')
    : path.join(app.getPath('userData'), 'images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const ext = '.png';
  let name;
  let filePath;
  for (let i = 1; i < 9999; i++) {
    name = `image-${String(i).padStart(3, '0')}${ext}`;
    filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) break;
  }
  fs.writeFileSync(filePath, buffer);
  return { fileName: name, filePath };
}

async function handleSaveAs(content) {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    defaultPath: '未命名.md',
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return { filePath: result.filePath };
}

app.whenReady().then(() => {
  handleIPC();
  createWindow();

  const fileToOpen = process.argv.find(a => a.endsWith('.md') || a.endsWith('.markdown'));
  mainWindow.webContents.once('did-finish-load', () => {
    if (fileToOpen) openFile(fileToOpen);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      openFile(filePath);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
