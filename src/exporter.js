const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const MIME_TYPES = {
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDataUrl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[extension] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function inlineCssAssets(css, cssPath) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, value) => {
    const source = value.trim();
    if (!source || /^(data:|https?:|#)/i.test(source)) return match;
    const assetPath = path.resolve(path.dirname(cssPath), decodeURIComponent(source));
    if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) return match;
    try {
      return `url("${toDataUrl(assetPath)}")`;
    } catch {
      return match;
    }
  });
}

function readInlineCss(cssPath) {
  return inlineCssAssets(fs.readFileSync(cssPath, 'utf-8'), cssPath);
}

function resolveLocalImage(source, sourcePath) {
  if (!source || /^(data:|https?:|blob:)/i.test(source)) return null;
  try {
    if (/^file:/i.test(source)) return fileURLToPath(source);
    if (!sourcePath) return null;
    return path.resolve(path.dirname(sourcePath), decodeURIComponent(source));
  } catch {
    return null;
  }
}

function inlineLocalImages(contentHtml, sourcePath) {
  return contentHtml.replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi,
    (match, prefix, quote, source) => {
      const imagePath = resolveLocalImage(source, sourcePath);
      if (!imagePath || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
        return match;
      }
      try {
        return `${prefix}${quote}${toDataUrl(imagePath)}${quote}`;
      } catch {
        return match;
      }
    },
  );
}

function buildExportHtml({
  title,
  contentHtml,
  theme = 'light',
  sourcePath = null,
  markdownCssPath,
  katexCssPath,
}) {
  const dark = theme === 'dark';
  const markdownCss = readInlineCss(markdownCssPath);
  const katexCss = readInlineCss(katexCssPath);
  const content = inlineLocalImages(contentHtml, sourcePath)
    .replace(/\sloading=(["'])lazy\1/gi, '');
  const variables = dark
    ? `
      --bg-primary: #111a2a;
      --bg-secondary: #18263a;
      --text-primary: #e6edf5;
      --text-secondary: #9fb0c3;
      --border-color: #2a3b50;
      --accent-color: #22b8cf;
      --accent-soft: rgba(34, 184, 207, 0.12);
    `
    : `
      --bg-primary: #ffffff;
      --bg-secondary: #f4f7fa;
      --text-primary: #172033;
      --text-secondary: #5c6c7e;
      --border-color: #dbe5ec;
      --accent-color: #0788a8;
      --accent-soft: rgba(7, 136, 168, 0.09);
    `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:;">
  <title>${escapeHtml(title)}</title>
  <style>${katexCss}</style>
  <style>
    :root {${variables}}
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      padding: 48px 56px;
      color: var(--text-primary);
      background: ${dark ? '#0b1320' : '#eef3f7'};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .export-page {
      width: min(920px, 100%);
      min-height: calc(100vh - 96px);
      margin: 0 auto;
      padding: 48px 58px 72px;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      background: var(--bg-primary);
      box-shadow: 0 18px 50px ${dark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(37, 55, 74, 0.10)'};
    }
    ${markdownCss}
    .markdown-body { max-width: none; }
    .table-cell-active { box-shadow: none !important; }
    @page { size: A4; margin: 16mm 15mm 18mm; }
    @media print {
      body { padding: 0; background: var(--bg-primary); }
      .export-page {
        width: 100%;
        min-height: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .markdown-body pre, .markdown-body blockquote, .markdown-body table, .markdown-body img {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body class="${dark ? 'dark-mode' : 'light-mode'}">
  <main class="export-page">
    <article class="markdown-body">${content}</article>
  </main>
</body>
</html>`;
}

module.exports = {
  buildExportHtml,
  inlineCssAssets,
  inlineLocalImages,
};
