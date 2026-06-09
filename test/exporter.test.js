const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildExportHtml } = require('../src/exporter');
const { writeExportFile } = require('../src/export-service');

const rootDir = path.join(__dirname, '..');
const html = buildExportHtml({
  title: 'WuMark <导出>',
  contentHtml: `
    <h1>导出测试</h1>
    <img src="${pathToFileURL(path.join(rootDir, 'assets', 'wuma.png')).href}" loading="lazy">
  `,
  theme: 'dark',
  markdownCssPath: path.join(rootDir, 'src', 'styles', 'markdown.css'),
  katexCssPath: path.join(rootDir, 'node_modules', 'katex', 'dist', 'katex.min.css'),
});

assert(html.startsWith('<!DOCTYPE html>'));
assert(html.includes('<title>WuMark &lt;导出&gt;</title>'));
assert(html.includes('data:image/png;base64,'));
assert(html.includes('data:font/woff2;base64,'));
assert(html.includes('class="dark-mode"'));
assert(!html.includes('loading="lazy"'));
assert(html.includes("script-src 'none'") || html.includes("default-src 'none'"));

console.log(JSON.stringify({
  standaloneHtml: true,
  localImageInlined: true,
  katexFontsInlined: true,
  exportCspApplied: true,
}, null, 2));

class FakeBrowserWindow {
  constructor() {
    this.destroyed = false;
    this.webContents = {
      executeJavaScript: async (script) => (
        script.includes('scrollWidth') ? { width: 1200, height: 1400 } : undefined
      ),
      printToPDF: async () => Buffer.from('%PDF-mock'),
      capturePage: async () => ({
        toPNG: () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]),
      }),
    };
  }

  async loadFile() {}
  setContentSize() {}
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; }
}

async function testExportFlows() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wumark-export-unit-'));
  const files = {
    html: path.join(outputDir, 'sample.html'),
    pdf: path.join(outputDir, 'sample.pdf'),
    png: path.join(outputDir, 'sample.png'),
  };
  try {
    for (const format of Object.keys(files)) {
      await writeExportFile({
        format,
        filePath: files[format],
        title: '流程测试',
        contentHtml: '<h1>流程测试</h1>',
        theme: 'light',
        rootDir,
      }, { BrowserWindow: FakeBrowserWindow });
    }
    assert(fs.readFileSync(files.html, 'utf-8').startsWith('<!DOCTYPE html>'));
    assert.strictEqual(fs.readFileSync(files.pdf).subarray(0, 4).toString(), '%PDF');
    assert(fs.readFileSync(files.png).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    console.log(JSON.stringify({
      htmlFlow: true,
      pdfFlow: true,
      pngFlow: true,
    }, null, 2));
  } finally {
    for (const filePath of Object.values(files)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    try { fs.rmdirSync(outputDir); } catch {}
  }
}

testExportFlows().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
