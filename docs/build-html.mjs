#!/usr/bin/env node
/**
 * Bangun versi HTML mandiri untuk setiap berkas Markdown di `docs/`.
 *
 * - Gambar `![](gambar/*.png)` **disematkan** sebagai data URI (base64) sehingga
 *   tiap berkas HTML dapat dibuka/dibagikan tanpa folder `gambar/`.
 * - Tautan antar-dokumen `*.md` ditulis ulang menjadi `*.html`.
 * - Judul diberi `id` (slug ala GitHub) agar tautan anchor seperti
 *   `guru.html#4-e-raport` tetap berfungsi.
 *
 * Tanpa dependensi eksternal. Jalankan: `npm run docs:html`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = __dirname;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

// ---------------------------------------------------------------------------
// Inline (dalam satu baris/paragraf)
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rewriteHref(href) {
  if (/^(https?:|mailto:|data:|#)/i.test(href)) return href;
  const hashIndex = href.indexOf('#');
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const rewritten = rawPath.endsWith('.md')
    ? `${rawPath.slice(0, -3)}.html`
    : rawPath;
  return `${rewritten}${hash}`;
}

function embedImage(src, baseDir) {
  if (/^(https?:|data:)/i.test(src)) return src;
  const filePath = path.resolve(baseDir, src);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext];
  if (!mime || !fs.existsSync(filePath)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  ! gambar tidak ditemukan: ${src}`);
    }
    return src;
  }
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${base64}`;
}

function renderInline(text, baseDir) {
  const placeholders = [];
  const stash = (html) => {
    placeholders.push(html);
    return `\u0000${placeholders.length - 1}\u0000`;
  };

  // 1. Kode inline dilindungi agar ** dan * di dalamnya tidak diproses.
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_m, code) =>
    stash(`<code>${code}</code>`),
  );

  // 2. Gambar.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) =>
    stash(
      `<img src="${embedImage(src, baseDir)}" alt="${alt}" loading="lazy">`,
    ),
  );

  // 3. Tautan.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const newHref = rewriteHref(href);
    const newLabel =
      newHref !== href && /\.md$/.test(label.trim())
        ? label.replace(/\.md$/, '.html')
        : label;
    return stash(`<a href="${newHref}">${newLabel}</a>`);
  });

  // 4. Tebal lalu miring.
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => placeholders[Number(i)]);
}

// ---------------------------------------------------------------------------
// Blok
// ---------------------------------------------------------------------------

const RE = {
  blank: /^\s*$/,
  fence: /^\s*```(\S*)\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*$/,
  hr: /^\s*(-{3,}|\*{3,}|_{3,})\s*$/,
  blockquote: /^>\s?/,
  ul: /^\s*[-*]\s+/,
  ol: /^\s*\d+\.\s+/,
  listItem: /^\s*(?:[-*]|\d+\.)\s+(.*)$/,
  ordered: /^\s*\d+\.\s+/,
  continuation: /^\s+\S/,
  separatorRow: /^\s*\|?[\s:|-]+\|?\s*$/,
};

function isTableStart(lines, i) {
  const line = lines[i];
  const next = lines[i + 1];
  return (
    typeof next === 'string' &&
    line.includes('|') &&
    next.includes('-') &&
    RE.separatorRow.test(next)
  );
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function renderBlocks(lines, baseDir) {
  const html = [];
  const usedSlugs = new Map();
  let i = 0;

  const uniqueSlug = (text) => {
    const base = slugify(text) || 'bagian';
    const count = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (RE.blank.test(line)) {
      i += 1;
      continue;
    }

    // Blok kode berpagar (```lang ... ```).
    const fence = line.match(RE.fence);
    if (fence) {
      const language = fence[1] || '';
      i += 1;
      const code = [];
      while (i < lines.length && !RE.fence.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // lewati pagar penutup
      const cls = language ? ` class="language-${language}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Horizontal rule.
    if (RE.hr.test(line)) {
      html.push('<hr>');
      i += 1;
      continue;
    }

    // Judul.
    const heading = line.match(RE.heading);
    if (heading) {
      const level = heading[1].length;
      const id = uniqueSlug(heading[2]);
      html.push(
        `<h${level} id="${id}">${renderInline(heading[2], baseDir)}</h${level}>`,
      );
      i += 1;
      continue;
    }

    // Kutipan.
    if (RE.blockquote.test(line)) {
      const parts = [];
      while (i < lines.length && RE.blockquote.test(lines[i])) {
        parts.push(lines[i].replace(RE.blockquote, ''));
        i += 1;
      }
      html.push(
        `<blockquote><p>${renderInline(parts.join(' ').trim(), baseDir)}</p></blockquote>`,
      );
      continue;
    }

    // Tabel.
    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i]);
      i += 2; // lewati baris pemisah
      const rows = [];
      while (
        i < lines.length &&
        !RE.blank.test(lines[i]) &&
        lines[i].includes('|')
      ) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${header
        .map((cell) => `<th>${renderInline(cell, baseDir)}</th>`)
        .join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td>${renderInline(cell, baseDir)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}</tbody>`;
      html.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Daftar (bertanda atau bernomor), termasuk baris lanjutan yang menjorok.
    if (RE.ul.test(line) || RE.ol.test(line)) {
      const ordered = RE.ordered.test(line);
      const items = [];
      let current = null;
      while (i < lines.length && !RE.blank.test(lines[i])) {
        const item = lines[i].match(RE.listItem);
        if (item) {
          if (current !== null) items.push(current);
          current = item[1];
          i += 1;
        } else if (current !== null && RE.continuation.test(lines[i])) {
          current += ` ${lines[i].trim()}`;
          i += 1;
        } else {
          break;
        }
      }
      if (current !== null) items.push(current);
      const tag = ordered ? 'ol' : 'ul';
      html.push(
        `<${tag}>${items
          .map((item) => `<li>${renderInline(item, baseDir)}</li>`)
          .join('')}</${tag}>`,
      );
      continue;
    }

    // Paragraf (kumpulkan baris sampai baris kosong atau awal blok baru).
    const paragraph = [];
    while (i < lines.length && !RE.blank.test(lines[i])) {
      const l = lines[i];
      if (
        paragraph.length > 0 &&
        (RE.heading.test(l) ||
          RE.hr.test(l) ||
          RE.fence.test(l) ||
          RE.blockquote.test(l) ||
          RE.ul.test(l) ||
          RE.ol.test(l) ||
          isTableStart(lines, i))
      ) {
        break;
      }
      paragraph.push(l.trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '), baseDir)}</p>`);
  }

  return html.join('\n');
}

// ---------------------------------------------------------------------------
// Templat HTML
// ---------------------------------------------------------------------------

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f1f5f9;
  color: #0f172a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.65;
  font-size: 16px;
}
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 24px; background: #0f172a; color: #e2e8f0; font-size: 14px;
}
.topbar a { color: #93c5fd; text-decoration: none; }
.topbar a:hover { text-decoration: underline; }
.topbar .brand { font-weight: 600; color: #f8fafc; }
main.doc {
  max-width: 920px; margin: 28px auto 64px; padding: 40px 48px;
  background: #fff; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .06);
}
h1, h2, h3, h4 { line-height: 1.3; color: #0f172a; }
h1 { font-size: 1.9rem; margin: 0 0 .6em; padding-bottom: .3em; border-bottom: 2px solid #e2e8f0; }
h2 { font-size: 1.4rem; margin: 1.8em 0 .6em; }
h3 { font-size: 1.15rem; margin: 1.5em 0 .5em; }
p { margin: .7em 0; }
a { color: #1d4ed8; }
strong { color: #0b1220; }
code {
  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px;
  padding: .1em .4em; font-size: .88em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
pre {
  background: #0f172a; color: #e2e8f0; padding: 16px 18px; border-radius: 10px;
  overflow-x: auto;
}
pre code { background: none; border: none; color: inherit; padding: 0; }
blockquote {
  margin: 1em 0; padding: .6em 1.1em; background: #eff6ff;
  border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; color: #1e3a8a;
}
blockquote p { margin: 0; }
ul, ol { margin: .6em 0; padding-left: 1.6em; }
li { margin: .3em 0; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }
img {
  display: block; max-width: 100%; height: auto; margin: 1em 0;
  border: 1px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .08);
}
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95em; }
th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; vertical-align: top; }
th { background: #f8fafc; font-weight: 600; }
tbody tr:nth-child(even) { background: #f8fafc; }
.doc-footer { margin-top: 3em; padding-top: 1em; border-top: 1px solid #e2e8f0; color: #64748b; font-size: .85em; }
@media print {
  body { background: #fff; }
  .topbar { position: static; }
  main.doc { box-shadow: none; border: none; margin: 0; padding: 0; max-width: none; }
  img, table, blockquote { break-inside: avoid; }
}
@media (max-width: 640px) {
  main.doc { margin: 12px; padding: 20px; }
}
`;

function renderDocument({ title, bodyHtml, isIndex }) {
  const backLink = isIndex
    ? '<span>Panduan Pengguna — Arsip Digital Sekolah</span>'
    : '<a href="README.html">← Indeks panduan</a>';
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<nav class="topbar">
  <a class="brand" href="README.html">Arsip Digital Sekolah</a>
  ${backLink}
</nav>
<main class="doc">
${bodyHtml}
<footer class="doc-footer">Dokumentasi ini dihasilkan dari berkas Markdown di <code>docs/</code>. Tangkapan layar disematkan sebagai gambar base64.</footer>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pemrosesan berkas
// ---------------------------------------------------------------------------

function listMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function convertFile(mdPath) {
  const baseDir = path.dirname(mdPath);
  const markdown = fs.readFileSync(mdPath, 'utf8').replace(/\r\n?/g, '\n');
  const lines = markdown.split('\n');

  const bodyHtml = renderBlocks(lines, baseDir);
  const firstHeading = markdown.match(/^#\s+(.+)$/m);
  const title = firstHeading ? firstHeading[1].trim() : path.basename(mdPath, '.md');
  const isIndex = path.basename(mdPath).toLowerCase() === 'readme.md';

  const htmlPath = mdPath.replace(/\.md$/, '.html');
  fs.writeFileSync(
    htmlPath,
    renderDocument({ title, bodyHtml, isIndex }),
    'utf8',
  );
  return { mdPath, htmlPath };
}

const files = listMarkdownFiles(DOCS_DIR);
console.log(`Mengonversi ${files.length} berkas Markdown → HTML (gambar disematkan):`);
for (const file of files) {
  const { htmlPath } = convertFile(file);
  const sizeKb = (fs.statSync(htmlPath).size / 1024).toFixed(0);
  console.log(`  ✓ ${path.relative(DOCS_DIR, htmlPath)} (${sizeKb} KB)`);
}
