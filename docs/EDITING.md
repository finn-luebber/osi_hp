# Editing the OSI Lübeck website

Everything on the website is edited at **`<website address>/admin/`**. There is no link to it on the website, so bookmark it. Log in with your GitHub or GitLab account.

**For security, the editor logs you out by itself:** when you close the editor tab (reloading the page is fine), and after 30 minutes without activity. Two minutes before, a notice offers **Stay logged in**. Save your work before taking a long break; if you are logged out with unsaved changes, the editor usually offers to restore them after you log in again. On GitHub, a login also ends after 8 hours at the latest. Each time you save, the change is stored in the repository, and the website is updated **one to two minutes later**.

## Add a news item with a date and a picture

1. **Log in** at `/admin/`.
2. **Upload the picture:** click **Media** at the top, then **Upload**, and choose the file. Best size: 1600 × 900 pixels, landscape, main subject in the middle. The file name is cleaned up automatically (no spaces or umlauts).
3. **New news item:** in **News**, click **+ News item**.
4. **Fill in the basics:** title, publication date (usually today), short summary (one or two sentences), and the text.
5. **Featured image:** **Choose an image**, click your picture, **Choose selected**. Then write a short **description** of what the picture shows.
6. **Show on and labels:** choose where the news appears: **Home** is preset; add **Open Science**, **Citizen Science** and/or **Meta Science** as needed (one to four places; remove Home with its × if it should not be on the homepage). Labels are words separated by commas, for example `Events, Workshops`.
7. **The date to remember:** switch on **Date to remember**, choose the **kind** (talk, workshop, conference, deadline, award ceremony, event), enter the **date** (for a deadline: the last day), and if needed the **last day**, **time** and **place**.
8. **Publish:** click **Publish › Publish now**. "Entry saved" confirms it.

About two minutes later:

- the news appears at the top of **News**, and in the latest-news box of every place chosen under **Show on**,
- until the date has passed, it can appear in the **Upcoming** box of every place chosen: the homepage and/or the pages of the chosen areas (each box lists its next three dates),
- on the News page it shows the date in a block on the left, which turns grey once the date has passed.

To show it in the large **Featured** band, switch on **Show in the Featured band**; it then appears in the band of every place chosen under **Show on**. A news item marked **Draft** is saved but not shown.

## Other content

| What | Where in the editor | Notes |
|---|---|---|
| Team member | **Team › + Team member** | For each area choose *not in this area*, *member* or *head*. Heads appear in the homepage columns and at the top of their area page. Portrait: square, 800 × 800 pixels. Lower **order** numbers come first. |
| Box of an area | **Open Science: boxes** (and the other two) **› + box** | Title and summary show in the box; **Text of the box's page** is the box's own page. Order by the **order** number. |
| Page texts | **Page texts › Homepage** etc. | All headlines and texts, activities and information boxes. Lists have **Add** buttons, a cross to remove, and can be dragged to reorder. |
| Legal pages | **Page texts › Imprint / Privacy policy / Accessibility** | Update the date at the end when you change them. The accessibility statement should be reviewed once a year. |
| Hosting part of the privacy policy | **Page texts › Privacy policy: hosting paragraph** | The website shows the paragraph that fits where it is hosted, by itself. |
| Contact e-mail | **Settings › Contact** | |

To **remove** something, open it and click **Delete entry**. To **hide** a team member or box for a while, switch on **Hide from the site**.

## Writing texts

| What | How |
|---|---|
| Link | `[link text](https://address)`, or to a page of the site: `[Team](/team/)` |
| Bold, italics | `**bold**`, `*italics*` (or the B and I buttons) |
| Subheading (longer texts) | the H button, or a line starting with `## ` |
| List | the list button, or lines starting with `- ` |
| Picture inside a text | the **+** button › Image, or `![description](/uploads/name.jpg)` on a line of its own; the description becomes the caption |

Code typed into a text is shown as text and never run.

## Undoing a change

Every save is a commit. In the repository on GitHub or GitLab, open **History** of the file (or the list of commits) to see who changed what. An earlier version can be restored there ("Revert"), or ask the person who looks after the site.

## Without the editor

All content is plain text in the folder `content/`, so it can also be edited in GitHub's or GitLab's web editor:

| Folder | Contents |
|---|---|
| `content/news/` | one file per news item, `YYYY-MM-DD-title.md` |
| `content/team/` | one file per team member |
| `content/topics/<area>/` | one file per box |
| `content/pages/` | page texts |
| `content/uploads/` | pictures |

If a file has a mistake (missing date, picture not found, wrong link address), the website is still built, without that part; the build log lists the problem.
