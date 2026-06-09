const { marked } = require('marked');
const hljs = require('highlight.js/lib/core');
const markedKatex = require('marked-katex-extension');
const emoji = require('node-emoji');

const LANG_NAMES = [
  'javascript', 'typescript', 'python', 'java', 'csharp',
  'php', 'ruby', 'go', 'rust', 'swift', 'kotlin',
  'c', 'cpp', 'bash', 'powershell', 'sql',
  'xml', 'css', 'json', 'yaml', 'markdown',
  'plaintext', 'diff',
];

for (const name of LANG_NAMES) {
  try {
    hljs.registerLanguage(name, require(`highlight.js/lib/languages/${name}`));
  } catch {}
}

// 'xml' language already registers 'html' as an alias

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const renderer = new marked.Renderer();
let renderTableIndex = 0;
let renderHeadingIndex = 0;
let headingSlugCounts = new Map();

function createHeadingId(text) {
  const base = stripHeadingFormatting(text)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'heading';
  const count = headingSlugCounts.get(base) || 0;
  headingSlugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

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

renderer.heading = function ({ text, depth, tokens }) {
  const id = createHeadingId(text);
  const content = tokens ? this.parser.parseInline(tokens) : text;
  return `<h${depth} id="${id}" data-heading-index="${renderHeadingIndex++}">${content}</h${depth}>`;
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
  const tableIndex = renderTableIndex++;
  let html = `<div class="table-wrapper" data-table-index="${tableIndex}"><table><thead><tr>`;
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

const emojiExtension = {
  name: 'emoji',
  level: 'inline',
  start(src) {
    const index = src.indexOf(':');
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    const match = /^:([+\-\w]+):/.exec(src);
    if (!match || !emoji.has(match[1])) return undefined;
    return {
      type: 'emoji',
      raw: match[0],
      emoji: emoji.get(match[1]),
    };
  },
  renderer(token) {
    return `<span class="emoji" title="${escapeHtml(token.raw)}">${token.emoji}</span>`;
  },
};

marked.use(
  { gfm: true, breaks: false, renderer, extensions: [emojiExtension] },
  markedKatex({ throwOnError: false, nonStandard: true }),
);

function parseMarkdown(text) {
  if (!text || !text.trim()) {
    return '<div class="empty-hint">输入 Markdown 即可预览</div>';
  }
  try {
    renderTableIndex = 0;
    renderHeadingIndex = 0;
    headingSlugCounts = new Map();
    return marked.parse(text);
  } catch (e) {
    return `<div class="error-hint">解析错误: ${e.message}</div>`;
  }
}

function stripHeadingFormatting(text) {
  return emoji.emojify(text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim());
}

function extractMarkdownHeadings(text) {
  const lines = text.split('\n');
  const headings = [];
  const slugCounts = new Map();
  let fence = null;

  const makeId = (value) => {
    const base = value
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'heading';
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  for (let line = 0; line < lines.length; line++) {
    const value = lines[line];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(value);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence) continue;

    const atx = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(value);
    if (atx) {
      const label = stripHeadingFormatting(atx[2]);
      headings.push({ level: atx[1].length, text: label, line, id: makeId(label) });
      continue;
    }

    if (line + 1 < lines.length && value.trim()) {
      const setext = /^\s{0,3}(=+|-+)\s*$/.exec(lines[line + 1]);
      if (setext) {
        const label = stripHeadingFormatting(value);
        headings.push({ level: setext[1][0] === '=' ? 1 : 2, text: label, line, id: makeId(label) });
        line++;
      }
    }
  }

  return headings;
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.endsWith('|') && !trimmed.endsWith('\\|');
  const cells = [];
  let current = '';
  let escaped = false;
  let codeTicks = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '`') {
      let count = 1;
      while (trimmed[i + count] === '`') count++;
      codeTicks = codeTicks === count ? 0 : (codeTicks === 0 ? count : codeTicks);
      current += '`'.repeat(count);
      i += count - 1;
      continue;
    }
    if (char === '|' && codeTicks === 0) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());

  if (hasLeadingPipe && cells[0] === '') cells.shift();
  if (hasTrailingPipe && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function findMarkdownTables(text) {
  const lines = text.split('\n');
  const tables = [];
  let fence = null;

  for (let line = 0; line < lines.length - 1; line++) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(lines[line]);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence || !lines[line].includes('|')) continue;

    const header = splitMarkdownTableRow(lines[line]);
    const delimiter = splitMarkdownTableRow(lines[line + 1]);
    if (header.length === 0 || delimiter.length !== header.length) continue;
    if (!delimiter.every(cell => /^:?-{3,}:?$/.test(cell))) continue;

    let endLine = line + 1;
    const body = [];
    while (endLine + 1 < lines.length && lines[endLine + 1].includes('|') && lines[endLine + 1].trim()) {
      const cells = splitMarkdownTableRow(lines[endLine + 1]);
      if (cells.length === 0) break;
      body.push(cells);
      endLine++;
    }
    tables.push({ startLine: line, endLine, header, delimiter, body });
    line = endLine;
  }

  return tables;
}
