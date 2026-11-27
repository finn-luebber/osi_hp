/**
 * Reads everything in content/ and prepares it for the page templates.
 * Editors never need to touch this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import markdownIt from 'markdown-it';
import sharp from 'sharp';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

const SECTIONS = { 'open-science': 'Open Science', 'citizen-science': 'Citizen Science', 'metascience': 'Meta Science' };
/** Where a news item can appear: the homepage and the three areas (one or more). */
const PLACES = ['home', ...Object.keys(SECTIONS)];
const EVENT_TYPES = { talk: 'Talk', workshop: 'Workshop', conference: 'Conference', deadline: 'Deadline', award: 'Award ceremony', other: 'Event' };
const NEWS_PER_PAGE = 9;
const RESERVED_IDS = ['topics', 'activities', 'people', 'join', 'latest-news', 'main', 'pillars'];

const problems = [];
const warn = (where, message) => problems.push(`${where}: ${message}`);

/* ---------- reading files ---------- */

function readYaml(file) {
  try {
    return yaml.load(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    throw new Error(`Cannot read ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

/** A Markdown file with a YAML block at the top. */
function readEntry(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  try {
    return { meta: m ? yaml.load(m[1]) || {} : {}, body: (m ? m[2] : text).trim(), file: path.relative(ROOT, file) };
  } catch (err) {
    throw new Error(`Cannot read ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

const listFiles = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort() : []);
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
/** Dates may be written as text or come from YAML as dates; both become YYYY-MM-DD. */
const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');

function slugify(text) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue', ß: 'ss' };
  const s = str(text).replace(/[äöüÄÖÜß]/g, (c) => map[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return s || 'item';
}

/* ---------- dates (Lübeck time) ---------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const parts = (d) => d.split('-').map(Number);
const fmtDate = (d) => { if (!d) return ''; const [y, m, day] = parts(d); return `${day} ${MONTHS[m - 1]} ${y}`; };
const fmtShort = (d) => { const [y, m, day] = parts(d); return `${day} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
function fmtEventDate(start, end) {
  if (!start) return '';
  if (!end || end === start) return fmtDate(start);
  const [ya, ma, da] = parts(start); const [yb, mb] = parts(end);
  if (ya === yb && ma === mb) return `${da}–${fmtDate(end)}`;
  return `${ya === yb ? `${da} ${MONTHS[ma - 1]}` : fmtDate(start)} – ${fmtDate(end)}`;
}

/* ---------- pictures: every picture is re-encoded at build time ---------- */
/* Re-encoding drops anything that is not picture data (camera and GPS details, hidden content). */

const pictures = new Map();
/** Reads the size of every picture; the files themselves are written after the build (lib/pictures.js). */
async function preparePictures() {
  const dir = path.join(CONTENT, 'uploads');
  const jobs = [];
  const taken = new Set();
  for (const file of listFiles(dir, '')) {
    if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(file)) {
      warn(`content/uploads/${file}`, 'not a JPG, PNG, WebP, GIF or SVG picture; ignored');
      continue;
    }
    const stem = slugify(file.replace(/\.[^.]+$/, ''));
    let base = stem;
    for (let i = 2; taken.has(base); i++) base = `${stem}-${i}`;
    taken.add(base);
    const isJpeg = /\.jpe?g$/i.test(file);
    try {
      const meta = await sharp(path.join(dir, file), { limitInputPixels: 40_000_000 }).metadata();
      let w = meta.width; let h = meta.height;
      if ((meta.orientation || 1) >= 5) [w, h] = [h, w];            // turned photos
      const scale = Math.min(1, 1600 / Math.max(w, h));
      const name = `${base}.${isJpeg ? 'jpg' : 'png'}`;
      pictures.set(`/uploads/${file}`, { url: `/uploads/${name}`, thumb: `/uploads/${base}-thumb.jpg`, width: Math.round(w * scale), height: Math.round(h * scale) });
      jobs.push({ src: path.join(dir, file), name, thumb: `${base}-thumb.jpg`, isJpeg });
    } catch (err) {
      warn(`content/uploads/${file}`, `cannot be read as a picture (${err.message})`);
    }
  }
  globalThis.osiPictureJobs = jobs;
}
function picture(ref, where, alt = '') {
  const key = str(ref);
  if (!key) return null;
  const wanted = key.startsWith('/') ? key : `/${key}`;
  let decoded = wanted; try { decoded = decodeURI(wanted); } catch { /* keep as written */ }
  const p = pictures.get(wanted) || pictures.get(decoded);
  if (!p) { warn(where, `picture ${key} not found in content/uploads`); return null; }
  return { ...p, alt: str(alt) };
}

/* ---------- text formatting (Markdown) ---------- */

const md = markdownIt({ html: false, linkify: true, breaks: true, typographer: false });
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  let src = token.attrGet('src') || '';
  try { src = decodeURI(src); } catch { /* keep as written */ }
  const p = pictures.get(src);
  if (p) {
    token.attrSet('src', p.url);
    token.attrSet('width', String(p.width));
    token.attrSet('height', String(p.height));
    token.attrSet('loading', 'lazy');
  }
  return defaultImage(tokens, idx, options, env, self);
};
/** A paragraph that holds nothing but one picture becomes a picture with caption. */
const figures = (html) => html.replace(/<p>(<img [^>]*alt="([^"]*)"[^>]*>)<\/p>/g, (_, img, alt) => `<figure class="osi-figure">${img}${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`);
const inline = (text) => md.renderInline(str(text));
const block = (text) => figures(md.render(str(text)));

/* ---------- fold-out sections on the boxes' pages ---------- */

/**
 * Subheadings can fold: the subheading and the text after it, up to the next subheading,
 * become a section that opens and closes when the heading is clicked.
 * Which subheadings fold: all of them when "fold_sections" is on, otherwise those written
 * with a plus sign first ("## + Past talks"). Everything else stays as normal text.
 * Returns null when nothing folds, so the page is shown as plain text.
 */
function foldSections(html, foldAll, avoid) {
  const parts = html.split(/(?=<h2>)/);
  const used = new Set(avoid);
  const blocks = [];
  let folds = 0;
  for (const part of parts) {
    const m = part.match(/^<h2>([\s\S]*?)<\/h2>\s*([\s\S]*)$/);
    const marked = m && /^\+\s*/.test(m[1]);
    if (m && (foldAll || marked)) {
      const title = m[1].replace(/^\+\s*/, '');
      const base = slugify(title.replace(/<[^>]+>/g, ''));
      let id = base;
      for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
      used.add(id);
      const last = blocks[blocks.length - 1];
      const section = { id, title, body: m[2].trim() };
      if (last && last.folds) last.folds.push(section); else blocks.push({ folds: [section] });
      folds += 1;
    } else if (part.trim()) {
      // a "+" typed in front of a subheading that is not folded is not shown
      const text = part.replace(/^<h2>\+\s*/, '<h2>').trim();
      const last = blocks[blocks.length - 1];
      if (last && last.text !== undefined) last.text += `\n${text}`; else blocks.push({ text });
    }
  }
  return folds ? blocks : null;
}

/* ---------- pages ---------- */

function columnsWithIds(columns, taken) {
  const seen = new Set(taken);
  return list(columns).map((c) => {
    let base = slugify(c.title); let id = base;
    for (let i = 2; seen.has(id) || RESERVED_IDS.includes(id); i++) id = `${base}-${i}`;
    seen.add(id);
    return { id, title: str(c.title), points: list(c.points).map(inline) };
  });
}
/** Addresses typed into link fields: web, e-mail, or a page of this site. Anything else is dropped. */
function safeUrl(url, where) {
  const u = str(url);
  if (!u) return '';
  if (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(u)) return u;
  warn(where, `link address "${u}" must start with https://, mailto: or / ; left out`);
  return '';
}
const linkOf = (l, where) => { const url = safeUrl(l?.url, where); return { text: str(l?.text) || url, url }; };

/* ---------- where a news item appears ---------- */

/**
 * "show_on" lists the places: home, open-science, citizen-science, metascience (one or more).
 * Older files only had "areas"; they appeared on the homepage as well, and still do.
 */
function placesOf(meta, file) {
  const known = (p) => { if (PLACES.includes(p)) return true; warn(file, `unknown place "${p}" in show_on`); return false; };
  const places = meta.show_on !== undefined
    ? [...new Set(list(meta.show_on).map(str).filter(known))]
    : ['home', ...list(meta.areas).filter((a) => SECTIONS[a])];
  if (!places.length) warn(file, 'show_on is empty; the news only appears in the full News list');
  return { places, areas: places.filter((p) => SECTIONS[p]) };
}

/* ---------- privacy policy: the hosting paragraph fits where the site is hosted ---------- */

function hostingParagraph() {
  const file = path.join(CONTENT, 'pages', 'privacy-hosting.yml');
  if (!fs.existsSync(file)) return '';
  const h = readYaml(file);
  const env = process.env;
  const host = str(env.OSI_HOSTING) || (env.GITHUB_ACTIONS === 'true' ? 'github'
    : env.GITLAB_CI === 'true' && env.DEPLOY_TARGET !== 'server' && /(^|\.)gitlab\.com$/.test(str(env.CI_SERVER_HOST)) ? 'gitlab_com' : 'server');
  const text = str(h[host]) || str(h.server);
  if (/\[NUMBER\]/.test(str(h.log_retention)) && host === 'server') warn('content/pages/privacy-hosting.yml', 'log_retention still needs the number of days');
  return text.replace(/\{operator\}/g, str(h.operator)).replace(/\{log_retention\}/g, str(h.log_retention));
}

/* ---------- build everything ---------- */

export default async function () {
  await preparePictures();
  const settings = readYaml(path.join(CONTENT, 'settings.yml'));
  const page = (key) => readYaml(path.join(CONTENT, 'pages', `${key}.yml`));

  /* team */
  const members = listFiles(path.join(CONTENT, 'team'), '.md').map((f) => {
    const { meta, body, file } = readEntry(path.join(CONTENT, 'team', f));
    const sections = {};
    for (const area of Object.keys(SECTIONS)) {          // area_open_science: none | member | head
      const role = str(meta[`area_${area.replace(/-/g, '_')}`]);
      if (role === 'member' || role === 'head') sections[area] = role === 'head';
    }
    for (const a of list(meta.areas)) {                    // older form: a list of { area, role }
      if (SECTIONS[a?.area]) sections[a.area] = a.role === 'head';
    }
    return { name: str(meta.name), expertise: str(meta.expertise), institute: str(meta.institute), order: Number(meta.order) || 0,
      photo: picture(meta.photo, file, `Portrait of ${str(meta.name)}`), sections, hidden: meta.hidden === true,
      slug: slugify(f.replace(/\.md$/, '')), about: block(body) };
  }).filter((m) => m.name && !m.hidden).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  for (const m of members) m.url = `/team/${m.slug}/`;
  const membersFor = (area, headsOnly = false) => members.filter((m) => area in m.sections && (!headsOnly || m.sections[area]))
    .sort((a, b) => Number(b.sections[area]) - Number(a.sections[area]) || a.order - b.order || a.name.localeCompare(b.name));

  /* news */
  const news = listFiles(path.join(CONTENT, 'news'), '.md').map((f) => {
    const { meta, body, file } = readEntry(path.join(CONTENT, 'news', f));
    const date = ymd(meta.date) || ymd(f.slice(0, 10));
    if (!date) warn(file, 'no valid date');
    // the date to remember is stored as flat fields (date_to_remember, event_type, event_start …)
    const ev = meta.date_to_remember === true ? { type: meta.event_type, start: meta.event_start, end: meta.event_end, time: meta.event_time, place: meta.event_place } : null;
    const start = ev ? ymd(ev.start) : '';
    if (ev && !start) warn(file, 'marked as a date to remember, but has no valid start date');
    let end = ev ? ymd(ev.end) : '';
    if (end && end < start) { warn(file, 'last day is before the first day; ignored'); end = ''; }
    const item = {
      slug: f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''),
      title: str(meta.title), date, dateText: fmtDate(date), summary: str(meta.summary), body: block(body),
      image: picture(meta.image, file, meta.image_alt),
      labels: [...new Map((typeof meta.labels === 'string' ? meta.labels.split(',') : list(meta.labels)).map(str).filter(Boolean).map((name) => [slugify(name), { name, slug: slugify(name) }])).values()],
      ...placesOf(meta, file), featured: meta.featured === true, draft: meta.draft === true,
      isEvent: Boolean(ev && start),
    };
    if (item.isEvent) {
      Object.assign(item, { eventType: EVENT_TYPES[ev.type] ? ev.type : 'other', eventStart: start, eventEnd: end, eventTime: str(ev.time), eventPlace: str(ev.place) });
      item.eventTypeName = EVENT_TYPES[item.eventType];
      item.eventDateText = fmtEventDate(start, end);
      item.eventLast = end || start;
      item.eventPast = item.eventLast < today;
      const [y, m, d] = parts(start);
      item.eventDay = d; item.eventMonth = `${MONTHS[m - 1].slice(0, 3)} ${y}`; item.eventShort = fmtShort(start);
      item.eventLine = [item.eventTypeName, item.eventDateText, item.eventTime, item.eventPlace].filter(Boolean);
    }
    if (!item.title) warn(file, 'no title');
    return item;
  }).filter((n) => n.title && n.date && !n.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
  const spelling = new Map();
  for (const n of [...news].reverse()) for (const l of n.labels) if (!spelling.has(l.slug)) spelling.set(l.slug, l.name);
  for (const n of news) n.labels = n.labels.map((l) => ({ ...l, name: spelling.get(l.slug) }));
  const used = new Set();
  for (const n of news) { let s = n.slug; for (let i = 2; used.has(s); i++) s = `${n.slug}-${i}`; n.slug = s; used.add(s); n.url = `/news/${s}/`; }

  // place: 'home' or an area. A news item shows up in the boxes of every place chosen for it.
  const at = (place) => (n) => n.places.includes(place);
  const featuredFor = (place) => news.find((n) => n.featured && at(place)(n)) || null;
  const latestFor = (place) => news.filter(at(place)).slice(0, 3);
  const upcoming = news.filter((n) => n.isEvent && !n.eventPast).sort((a, b) => a.eventStart.localeCompare(b.eventStart) || a.slug.localeCompare(b.slug));
  const upcomingFor = (place) => upcoming.filter(at(place)).slice(0, 8);   // three are shown; the rest stand by in case dates pass before the next build
  const dated = [...upcoming, ...news.filter((n) => n.isEvent && n.eventPast).sort((a, b) => b.eventStart.localeCompare(a.eventStart))];

  /* labels and the pages of the News list */
  const labels = [...new Map(news.flatMap((n) => n.labels).map((l) => [l.slug, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const filters = [
    { key: 'all', base: '/news/', items: news },
    { key: 'dates', base: '/news/dates/', items: dated },
    ...Object.keys(SECTIONS).map((a) => ({ key: `area:${a}`, base: `/news/area/${a}/`, items: news.filter((n) => n.areas.includes(a)) })),
    ...Object.keys(SECTIONS).map((a) => ({ key: `area:${a}`, base: `/news/area/${a}/dates/`, items: dated.filter((n) => n.areas.includes(a)), dates: true })),
    ...labels.map((l) => ({ key: `label:${l.slug}`, base: `/news/label/${l.slug}/`, items: news.filter((n) => n.labels.some((x) => x.slug === l.slug)) })),
  ];
  const chips = [
    { key: 'all', name: 'All', url: '/news/' }, { key: 'dates', name: 'Dates and events', url: '/news/dates/' },
    ...Object.entries(SECTIONS).map(([a, name]) => ({ key: `area:${a}`, name, url: `/news/area/${a}/` })),
    ...labels.map((l) => ({ key: `label:${l.slug}`, name: l.name, url: `/news/label/${l.slug}/` })),
  ];
  const newsPages = [];
  for (const f of filters) {
    const pages = Math.max(1, Math.ceil(f.items.length / NEWS_PER_PAGE));
    const urlOf = (p) => (p === 1 ? f.base : `${f.base}page/${p}/`);
    for (let p = 1; p <= pages; p++) {
      newsPages.push({ url: urlOf(p), filter: f.key, dates: f.dates === true, items: f.items.slice((p - 1) * NEWS_PER_PAGE, p * NEWS_PER_PAGE), page: p,
        pageLinks: pages > 1 ? Array.from({ length: pages }, (_, i) => ({ n: i + 1, url: urlOf(i + 1) })) : [] });
    }
  }

  /* areas and their boxes (topic pages) */
  const areas = []; const topics = [];
  for (const [slug, name] of Object.entries(SECTIONS)) {
    const c = page(slug);
    const cards = listFiles(path.join(CONTENT, 'topics', slug), '.md').map((f) => {
      const { meta, body, file } = readEntry(path.join(CONTENT, 'topics', slug, f));
      let id = slugify(f.replace(/\.md$/, ''));
      if (RESERVED_IDS.includes(id)) id = `${id}-topic`;
      return { id, title: str(meta.title), summary: inline(meta.summary), order: Number(meta.order) || 0,
        picture: picture(meta.picture, file, meta.picture_alt), link: linkOf(meta.link_url ? { text: meta.link_text, url: meta.link_url } : meta.link, file),
        blocks: foldSections(block(body), meta.fold_sections === true, RESERVED_IDS), body: block(body), area: slug, areaName: name, hidden: meta.hidden === true };
    }).filter((t) => t.title && !t.hidden).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    for (const t of cards) t.url = `/${slug}/${t.id}/`;
    for (const t of cards) {
      t.siblings = cards.filter((o) => o !== t).map((o) => ({ title: o.title, url: o.url }));
      topics.push(t);
    }
    areas.push({
      slug, name, url: `/${slug}/`,
      hero: { number: str(c.hero?.number), title: str(c.hero?.title), lead: inline(c.hero?.lead) },
      asideTitle: str(c.aside?.title), topicsLabel: str(c.topics?.label), topicsTitle: str(c.topics?.title), cards,
      activitiesTitle: str(c.activities?.title), columns: columnsWithIds(c.activities?.columns, cards.map((t) => t.id)),
      peopleTitle: str(c.people?.title), join: { title: str(c.join?.title), text: inline(c.join?.text) },
      people: membersFor(slug), heads: membersFor(slug, true), others: membersFor(slug).filter((m) => !m.sections[slug]),
      featured: featuredFor(slug), latest: latestFor(slug), upcoming: upcomingFor(slug),
      eventsBox: { title: str(c.events_box?.title), empty: str(c.events_box?.empty), all: str(c.events_box?.all) }, datesUrl: `/news/area/${slug}/dates/`,
    });
  }

  /* homepage */
  const h = page('home');
  const home = {
    hero: { label: str(h.hero?.label), title: str(h.hero?.title), lead: inline(h.hero?.lead), button: str(h.hero?.button), more: str(h.hero?.more) },
    eventsBox: { title: str(h.events_box?.title), empty: str(h.events_box?.empty), all: str(h.events_box?.all) },
    pillarsLabel: str(h.pillars?.label), pillarsTitle: str(h.pillars?.title),
    pillars: Object.entries(SECTIONS).map(([slug, name]) => ({ slug, name, text: inline(h.pillars?.[slug]?.text), heads: membersFor(slug, true) })),
    newsTitle: str(h.news?.title), activitiesLabel: str(h.activities?.label), activitiesTitle: str(h.activities?.title),
    columns: columnsWithIds(h.activities?.columns, []),
    boxes: list(h.boxes).map((b) => ({ label: str(b.label), title: str(b.title), text: inline(b.text), link: linkOf(b.link, 'content/pages/home.yml') })),
    join: { title: str(h.join?.title), text: inline(h.join?.text) },
    featured: featuredFor('home'), latest: latestFor('home'), upcoming: upcomingFor('home'), datesUrl: '/news/dates/',
  };

  const t = page('team'); const nw = page('news');
  const hosting = hostingParagraph();
  const legal = ['imprint', 'privacy', 'accessibility'].map((key) => {
    const { meta, body } = readEntry(path.join(CONTENT, 'pages', `${key}.md`));
    return { key, url: `/${key}/`, title: str(meta.title), body: block(body.replace(/^\[\[hosting\]\]$/m, hosting)) };
  });

  if (problems.length) {
    console.warn(`\n[osi] ${problems.length} problem(s) in content/:\n  - ${problems.join('\n  - ')}\n`);
  }

  return {
    today, year: today.slice(0, 4), contactEmail: str(settings.contact_email), sections: SECTIONS,
    home, areas, topics, news, newsPages, chips,
    team: { title: str(t.hero?.title), lead: inline(t.hero?.lead), join: { title: str(t.join?.title), text: inline(t.join?.text) }, members },
    newsPage: { title: str(nw.hero?.title), lead: inline(nw.hero?.lead) },
    legal, problems,
  };
}
