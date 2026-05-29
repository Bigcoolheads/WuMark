const { marked } = require('marked');
const hljs = require('highlight.js');

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }) {
  let highlighted;
  if (lang) {
    try {
      highlighted = hljs.highlight(text, { language: lang }).value;
    } catch {}
  }
  if (!highlighted) {
    try {
      highlighted = hljs.highlightAuto(text).value;
    } catch {}
  }
  const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
  return `<pre><code${langClass}>${highlighted || escapeHtml(text)}</code></pre>`;
};

renderer.heading = function ({ text, depth }) {
  const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};

renderer.image = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<img src="${href}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy">`;
};

renderer.link = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
  const target = isExternal ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
};

renderer.table = function ({ header, rows }) {
  const parser = this.parser;
  let html = '<div class="table-wrapper"><table><thead><tr>';
  for (const cell of header) {
    html += `<th>${parser.parseInline(cell.tokens)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) {
      html += `<td>${parser.parseInline(cell.tokens)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
};

marked.use({ renderer });

function parseMarkdown(text) {
  if (!text || !text.trim()) {
    return '<div class="empty-hint">输入 Markdown 即可预览</div>';
  }
  try {
    return marked.parse(text);
  } catch (e) {
    return `<div class="error-hint">解析错误: ${e.message}</div>`;
  }
}
