/**
 * Imports the news of the old WordPress website (all posts, with their pictures) into content/.
 *
 *   node tools/import-wordpress.js [https://osi-luebeck.de]
 *
 * Runs on GitHub with one click (Actions › "Import news from the old website") or on your own
 * computer. It needs internet access to the old site. Files that already exist are left alone,
 * so running it twice does no harm.
 */
import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';

const SITE = (process.argv[2] || process.env.OLD_SITE || 'https://osi-luebeck.de').replace(/\/$/, '');
const ROOT = process.cwd();
const NEWS = path.join(ROOT, 'content', 'news');
const UPLOADS = path.join(ROOT, 'content', 'uploads');
const host = new URL(SITE).host;

/* ---------- small helpers ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»' };
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const plain = (html) => decode(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const q = (v) => JSON.stringify(String(v));   // a safe YAML string

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'osi-luebeck-import' } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return { data: await res.json(), pages: Number(res.headers.get('x-wp-totalpages')) || 1 };
}

/** Picture file name in content/uploads: the old name, made safe; numbered if taken by another picture. */
const pictureFor = new Map();
function uploadName(url) {
  if (pictureFor.has(url)) return pictureFor.get(url);
  let base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'picture')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'picture';
  if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(base)) base += '.jpg';
  let name = base;
  const taken = new Set(pictureFor.values());
  for (let i = 2; taken.has(name); i++) name = base.replace(/(\.[^.]+)$/, `-${i}$1`);
  pictureFor.set(url, name);
  return name;
}
async function download(url) {
  const name = uploadName(url);
  const target = path.join(UPLOADS, name);
  if (fs.existsSync(target)) return `/uploads/${name}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'osi-luebeck-import' } });
  if (!res.ok) { console.warn(`  ! picture not downloaded (${res.status}): ${url}`); return ''; }
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return `/uploads/${name}`;
}
/** WordPress adds size suffixes (-1024x683) to pictures inside texts; the original is larger. */
const original = (url) => url.replace(/-\d{2,5}x\d{2,5}(\.[a-z]+)$/i, '$1');

/* ---------- HTML to Markdown ---------- */

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
turndown.remove(['script', 'style', 'iframe', 'form', 'noscript']);
turndown.addRule('figureCaption', { filter: 'figcaption', replacement: () => '' });

/* ---------- the import ---------- */

async function main() {
  fs.mkdirSync(NEWS, { recursive: true });
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`Importing from ${SITE} …`);

  const posts = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const r = await getJson(`${SITE}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish&_embed=wp:featuredmedia,wp:term`);
    pages = r.pages;
    posts.push(...r.data);
  }
  console.log(`${posts.length} posts found.`);
  const slugs = new Set(posts.map((p) => p.slug));

  let written = 0;
  for (const p of posts.sort((a, b) => a.date.localeCompare(b.date))) {
    const date = p.date.slice(0, 10);
    const file = path.join(NEWS, `${date}-${p.slug}.md`);
    if (fs.existsSync(file)) { console.log(`  = ${date} ${p.slug} (already there)`); continue; }

    let html = String(p.content?.rendered || '').replace(/<!--[\s\S]*?-->/g, '');
    // pictures inside the text: fetch them from the old site and point to the copies
    for (const m of [...html.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi)]) {
      const src = decode(m[1]);
      let local = '';
      try { if (new URL(src, SITE).host === host) local = await download(original(new URL(src, SITE).href)); } catch { /* odd address */ }
      const alt = (m[0].match(/\balt="([^"]*)"/i) || [])[1] || '';
      html = html.replace(m[0], local ? `<img src="${local}" alt="${alt}">` : '');
    }
    // links to other posts of the old site lead to the same news on the new site
    html = html.replace(/href="https?:\/\/[^"/]*\/([a-z0-9-]+)\/?"/gi, (all, slug) => (slugs.has(slug) ? `href="/news/${slug}/"` : all));

    const body = turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const image = media?.source_url ? await download(media.source_url) : '';
    const labels = (p._embedded?.['wp:term']?.[0] || []).map((t) => decode(t.name)).filter((n) => n && n !== 'Uncategorized');
    let summary = plain(p.excerpt?.rendered).replace(/\s*(\[…\]|\[&hellip;\]|…|Read More.*)$/i, '').trim();
    if (summary.length > 300) summary = `${summary.slice(0, 297).replace(/\s+\S*$/, '')} …`;

    const lines = ['---', `title: ${q(decode(p.title?.rendered))}`, `date: ${date}`];
    if (summary) lines.push(`summary: ${q(summary)}`);
    if (image) { lines.push(`image: ${image}`); if (media.alt_text) lines.push(`image_alt: ${q(decode(media.alt_text))}`); }
    if (labels.length) lines.push(`labels: ${q(labels.join(', '))}`);
    lines.push('show_on:', '  - home', '---', '', body, '');
    fs.writeFileSync(file, lines.join('\n'));
    written += 1;
    console.log(`  + ${date} ${p.slug}`);
  }
  console.log(`Done: ${written} news written, ${pictureFor.size} pictures handled.`);
}

main().catch((err) => { console.error(`Import failed: ${err.message}`); process.exit(1); });
