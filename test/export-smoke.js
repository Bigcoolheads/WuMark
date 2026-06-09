const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { writeExportFile } = require('../src/export-service');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(__dirname, '..', 'build', 'test-user-data', 'export'));
app.setPath('cache', path.join(__dirname, '..', 'build', 'test-cache', 'export'));

async function run() {
  const rootDir = path.join(__dirname, '..');
  const outputDir = path.join(os.tmpdir(), `wumark-export-test-${process.pid}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const targets = {
    html: path.join(outputDir, 'sample.html'),
    pdf: path.join(outputDir, 'sample.pdf'),
    png: path.join(outputDir, 'sample.png'),
  };
  const contentHtml = `
    <h1>WuMark 导出测试</h1>
    <p>正文、<strong>强调</strong>与公式 <span class="katex">E = mc²</span></p>
    <img src="${pathToFileURL(path.join(rootDir, 'assets', 'wuma.png')).href}" loading="lazy">
  `;

  try {
    for (const format of ['html', 'pdf', 'png']) {
      await writeExportFile({
        format,
        filePath: targets[format],
        title: 'WuMark 导出测试',
        contentHtml,
        theme: format === 'html' ? 'dark' : 'light',
        rootDir,
      });
    }

    const html = fs.readFileSync(targets.html, 'utf-8');
    const pdf = fs.readFileSync(targets.pdf);
    const png = fs.readFileSync(targets.png);
    const result = {
      htmlStandalone: html.includes('<!DOCTYPE html>')
        && html.includes('data:image/png;base64,')
        && html.includes('data:font/woff2;base64,')
        && !html.includes('loading="lazy"'),
      pdfGenerated: pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 1000,
      pngGenerated: png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        && png.length > 1000,
    };
    const failed = Object.entries(result).filter(([, passed]) => !passed);
    if (failed.length > 0) {
      throw new Error(`Export checks failed: ${failed.map(([name]) => name).join(', ')}`);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    for (const filePath of Object.values(targets)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    try { fs.rmdirSync(outputDir); } catch {}
  }
}

app.whenReady()
  .then(run)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
