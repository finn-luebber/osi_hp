# OSI Lübeck website (static version)

**Version 1.0.2.**

The public website of the Open Science Initiative Lübeck, built as plain files from the content in this Git repository. It looks and reads exactly like the earlier PHP version; only the way content is stored and published changed.

## How it works

1. **Content** lives in `content/` as text files: one file per news item, team member and box, one file per page with its texts, and the pictures in `content/uploads/`.
2. **Editing** happens either in the editing interface at `/admin/` (Decap CMS; not linked from the site) or directly in the files. Every save is a commit in Git, with author and date.
3. **Building:** after each commit, GitHub or GitLab runs `npx @11ty/eleventy`, which turns `content/` into finished pages in `_site/` (Eleventy 3.1.7). Pictures are re-encoded on the way, which removes camera and location data, and get small copies for thumbnails.
4. **Publishing:** the finished pages are served by GitHub Pages or GitLab Pages, or copied to your own web server. No program and no database run on the web server.

## Folders

| Folder | What it holds | Who changes it |
|---|---|---|
| `content/news/` | one Markdown file per news item, named `YYYY-MM-DD-title.md` | editors |
| `content/team/` | one file per team member | editors |
| `content/topics/<area>/` | one file per box of an area; the file name is the page address | editors |
| `content/pages/` | texts of the homepage, the area pages, Team, News and the legal pages | editors |
| `content/uploads/` | pictures | editors |
| `content/settings.yml` | contact e-mail address | editors |
| `admin/` | the editing interface (`decap/`) and its content settings (`cms.yml`) | administrators |
| `lib/` | build helpers: editor settings, pictures | developers |
| `docs/` | guides for hosting and editing | – |
| `src/` | page templates, style sheet, fonts, logo, scripts | developers |
| `deploy/` | web server rules (Apache, nginx) and the GitHub login service | administrators |
| `tools/` | `export-from-php-site.php`: copies all content of the PHP version into `content/` | once |

## Guides

- **[docs/HOSTING.md](docs/HOSTING.md):** setting it up on (a) GitHub or (b) GitLab, publishing, editor login, own server, security.
- **[docs/EDITING.md](docs/EDITING.md):** for editors: adding news with dates and pictures, team, boxes, page texts.

## Reference

### Picture sizes

| Used for | Best size | Shape |
|---|---|---|
| Featured image of a news item, picture of a box's page | 1600 × 900 pixels | landscape, 16:9 |
| Portrait | 800 × 800 pixels | square |

Keep the main subject or face in the middle. JPG, PNG, WebP and GIF are accepted; WebP and GIF are turned into PNG.

### Addresses

| Page | Address |
|---|---|
| Area | `/open-science/` |
| Box of an area | `/open-science/open-access/` (the file name) |
| News item | `/news/title/` (the file name without the date) |
| Dates and events | `/news/dates/` |
| News of an area / with a label | `/news/area/open-science/`, `/news/label/events/` |

## Checks during the build

The build lists problems in `content/` (missing picture, missing date, unknown area …) and carries on without the faulty part. The list is shown in the GitLab pipeline log.

## What was tested

On the developer's machine, not on your servers:

- **Design:** the built pages were compared with the earlier PHP version: same HTML apart from intended differences, and identical screenshots of the main pages at desktop and phone width (apart from picture compression and the order of area tags on the Team page).
- **Code:** HTML of all pages checked with html-validate; all 1,251 internal links and jump marks resolve; accessibility audit (axe, WCAG 2.1 AA) without findings; no page wider than the screen at eight widths from 320 to 1920 pixels.
- **Content mistakes:** odd picture names (spaces, umlauts, upper-case endings), unsafe link addresses, a last day before the first day, a missing date and a reserved box name are handled and reported; phone photos are turned upright and lose their location data.
- **Editor:** under its security rule, against a local copy: uploading a picture, adding a news item with a date, picture, area and labels, a team member, a box with a link button, a point in an activity column, and editing an existing entry; every change appeared correctly after the build. The generated settings for GitHub and for GitLab were loaded in the editor without errors.
- **Not tested:** logging in through GitHub (with the login service) or GitLab, the GitHub workflow and GitLab pipeline themselves, GitHub/GitLab Pages, and the Apache and nginx rules.

## Known limitations

- Changes appear after the next build, usually one to two minutes later, not at once.
- Boxes and team members are ordered by a number, not by moving them.
- The editor has no live preview in the site's design.
- The editing interface needs the browser to evaluate scripts (`unsafe-eval`), but only on `/admin/`; the public pages do not.
- In the editor, the news list starts with the oldest item; use **Sort by › Publication date** to turn it round.
- When working on your own computer, a freshly uploaded picture shows as an empty square in the editor until the site is rebuilt.
- On GitHub Pages and GitLab Pages, the extra security headers of `deploy/` cannot be set; the rules inside the pages still apply.
