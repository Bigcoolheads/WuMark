const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildExportHtml } = require('./exporter');

async function writeExportFile({
  format,
  filePath,
  title,
  contentHtml,
  theme,
  sourcePath,
  rootDir = path.join(__dirname, '..'),
}, dependencies = {}) {
  const html = buildExportHtml({
    title,
    contentHtml,
    theme,
    sourcePath,
    markdownCssPath: path.join(rootDir, 'src', 'styles', 'markdown.css'),
    katexCssPath: path.join(rootDir, 'node_modules', 'katex', 'dist', 'katex.min.css'),
  });

  if (format === 'html') {
    fs.writeFileSync(filePath, html, 'utf-8');
    return;
  }

  const tempPath = path.join(os.tmpdir(), `wumark-export-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tempPath, html, 'utf-8');
  const BrowserWindowClass = dependencies.BrowserWindow || require('electron').BrowserWindow;
  const exportWindow = new BrowserWindowClass({
    show: false,
    width: 1200,
    height: 900,
    backgroundColor: theme === 'dark' ? '#0b1320' : '#eef3f7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await exportWindow.loadFile(tempPath);
    await exportWindow.webContents.executeJavaScript(`
      Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        ...Array.from(document.images).map(image => image.complete
          ? Promise.resolve()
          : new Promise(resolve => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }))
      ])
    `);

    if (format === 'pdf') {
      const pdf = await exportWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      });
      fs.writeFileSync(filePath, pdf);
      return;
    }

    if (format !== 'png') throw new Error('不支持的导出格式');
    const dimensions = await exportWindow.webContents.executeJavaScript(`({
      width: Math.max(1200, document.documentElement.scrollWidth, document.body.scrollWidth),
      height: Math.max(900, document.documentElement.scrollHeight, document.body.scrollHeight)
    })`);
    if (dimensions.height > 30000 || dimensions.width > 16000) {
      throw new Error('文档尺寸过大，无法导出为单张 PNG，请改用 PDF');
    }
    exportWindow.setContentSize(Math.ceil(dimensions.width), Math.ceil(dimensions.height));
    await new Promise(resolve => setTimeout(resolve, 120));
    const image = await exportWindow.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.ceil(dimensions.width),
      height: Math.ceil(dimensions.height),
    });
    fs.writeFileSync(filePath, image.toPNG());
  } finally {
    if (!exportWindow.isDestroyed()) exportWindow.destroy();
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

module.exports = { writeExportFile };
