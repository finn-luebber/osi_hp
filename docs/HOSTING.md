# Hosting the OSI Lübeck website

The repository runs in two versions: **(a) on GitHub** or **(b) on GitLab**. Both build the same site from the same files. Choose one; the other version's settings file is simply ignored.

|  | (a) GitHub | (b) GitLab |
|---|---|---|
| Build file | `.github/workflows/build.yml` | `.gitlab-ci.yml` |
| Publishing | GitHub Pages | GitLab Pages, or your own web server |
| Daily rebuild | built in (02:15 UTC) | one pipeline schedule to add |
| Editor login | GitHub App plus a small login service (included, runs on Cloudflare) | works directly (GitLab application) |
| Extra security headers | not possible on GitHub Pages | possible on your own server |

Both versions set the editor up by themselves from where the build runs: repository name, branch and login. You only enter the one login value named below.

**Recommendation:** GitLab, if the university runs one or you can use gitlab.com, because editors can log in without the extra login service.

---

## Before you start

- A Git account for every editor (GitHub or GitLab).
- For trying things on your own computer: [Node.js](https://nodejs.org) 20 or newer and Git.
- The folder from the ZIP file, uploaded as a new repository with the branch `main`.

```
cd osi-website-static
git init -b main
git add -A
git commit -m "First version"
git remote add origin <address of the new repository>
git push -u origin main
```

---

## (a) GitHub

### 1. Publish with GitHub Pages

1. **Before the first run:** Repository › **Settings › Pages** › Build and deployment › Source: **GitHub Actions**.
   - If you pushed first, the first run fails at "Configure Pages" with *Get Pages site failed … Not Found*. Set the source as above, then open **Actions**, click the failed run and choose **Re-run all jobs**.
   - If the Pages settings offer no "Source", the repository is probably private: on GitHub's free plan, Pages only works for public repositories.
2. Repository › **Actions**: the workflow "Build and publish" runs after every push, every night, and when started by hand ("Run workflow").
3. The site appears at `https://<owner>.github.io/<repository>/`. All links follow that sub-folder automatically.

**Own domain** (for example `osi-luebeck.de`): Settings › Pages › Custom domain, and set the DNS record as GitHub explains there. Then add the variable `SITE_URL` = `https://osi-luebeck.de` (Settings › Secrets and variables › Actions › **Variables**).

### 2. Editor login (GitHub App and login service)

The editor logs in through a **GitHub App**. Compared with an OAuth App, the key that an editor's browser receives is much weaker: it only reaches the repositories the app is installed on (here: only the website), it may only read and write files, and it stops working after 8 hours. GitHub only hands out such keys to a server that keeps a secret; `deploy/github-login/worker.js` is that server, to run on Cloudflare Workers (free plan).

1. **Create the GitHub App:** your account or organisation › Settings › Developer settings › **GitHub Apps › New GitHub App**.
   - GitHub App name: e.g. `OSI website editor`. Homepage URL: the website address.
   - Callback URL: `https://<worker-name>.<your-subdomain>.workers.dev/callback` (the worker's address from step 2; you can fill it in afterwards).
   - **Expire user authorization tokens:** ticked (the default). **Request user authorization (OAuth) during installation:** not ticked.
   - Webhook: untick **Active**.
   - Permissions › Repository permissions › **Contents: Read and write**. Leave everything else at "No access" (Metadata: Read-only is set by GitHub itself).
   - Where can this GitHub App be installed: **Only on this account**.
   - Click **Create GitHub App**. Note the **Client ID** (starts with `Iv`; not the App ID) and click **Generate a new client secret**.
2. **Install the app on the website repository only:** in the app's settings › **Install App** › your account › **Only select repositories** › choose the website repository › Install.
3. **Cloudflare Worker:** dash.cloudflare.com › Workers & Pages › **Create** › **Create Worker**, give it a name (for example `osi-login`) › **Deploy**. Then **Edit code**, replace everything with the content of `deploy/github-login/worker.js`, and **Deploy** again. The worker's address is shown at the top, for example `https://osi-login.<your-subdomain>.workers.dev`.
   - Settings › Variables and Secrets:
     - `GITHUB_CLIENT_ID`: the app's Client ID
     - `GITHUB_CLIENT_SECRET`: the client secret, added as type **Secret**
     - `ALLOWED_ORIGIN`: the website's origin, e.g. `https://osi-luebeck.github.io` or `https://osi-luebeck.de` (no path, no slash at the end)
     - `GITHUB_REPOSITORY`: the website repository, e.g. `osi-luebeck/website`; logins without write access to it are refused
4. In the GitHub repository, add the variable **`DECAP_OAUTH_URL`** = the worker's address (Settings › Secrets and variables › Actions › Variables).
5. Run the workflow again. The build log shows `[osi] editing interface: github, <owner>/<repository>, branch main`.
6. Give editors **Write** access to the repository (Settings › Collaborators and teams).

Editors then open `/admin/` (there is no link to it on the site; bookmark it) and click **Login with GitHub**. The first time, GitHub asks them to authorise the app. After 8 hours the key expires; the editor then has to log in again.

**If you set up an OAuth App before:** delete it (Settings › Developer settings › OAuth Apps › the app › Delete application). This also cancels every key it handed out.

> The login service was tested with simulated GitHub answers, not against GitHub itself. If you prefer not to run it, editors can still edit through GitHub's own web editor (press `.` in the repository) or on their own computer (see "On your own computer").
---

## (b) GitLab

### 1. Publish

**GitLab Pages** (default): nothing to set. After the first pipeline, the address is shown under **Deploy › Pages**. If GitLab serves the site from a sub-folder, all links follow it automatically.

**Your own web server** instead: Settings › CI/CD › **Variables**:

| Variable | Value |
|---|---|
| `DEPLOY_TARGET` | `server` |
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH` | server, account, folder of the website |
| `SSH_PRIVATE_KEY` | a key that may copy to that folder (protected, masked) |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan <server>` |

The server serves the folder as plain files. Apache uses the included `.htaccess` files (security headers, HTTPS, error page) by itself; for nginx see `deploy/nginx/osi-site.conf`.

**Own domain** on GitLab Pages: Deploy › Pages › New domain; then add the variable `SITE_URL`.

### 2. Daily rebuild

**Build › Pipeline schedules › New schedule**: every day, for example at 03:00, branch `main`. This moves dates that have passed out of "Upcoming".

### 3. Editor login (GitLab application)

1. Group or user **Settings › Applications › Add new application**:
   - Name: `OSI website editor`
   - Redirect URI: `<website address>/admin/` (for example `https://osi.pages.uni-luebeck.de/website/admin/`)
   - **Confidential: off.** Scopes: **api**.
2. Copy the **Application ID** into the CI/CD variable **`DECAP_GITLAB_APP_ID`**.
3. Run the pipeline again. The build log shows `[osi] editing interface: gitlab, <group>/<project>, branch main` and no "still missing".
4. Give editors at least the **Developer** role in the project, and allow Developers to push to `main` (Settings › Repository › Protected branches), or use the **Maintainer** role.

Editors then open `/admin/` (there is no link to it on the site; bookmark it) and click **Login with GitLab**.

---

## Legal pages

- **Privacy policy:** the paragraph about visiting the website depends on the hosting. The build picks it by itself: GitHub Pages, GitLab Pages on gitlab.com, or a web server (your own server, or GitLab Pages on a university GitLab). For a web server, fill in its operator and how long its log files are kept in `content/pages/privacy-hosting.yml` (or in the editor under Page texts); until then the build log reminds you. To choose by hand, set the variable `OSI_HOSTING` to `github`, `gitlab_com` or `server`.
- **Accessibility statement:** a self-assessment from November 2026, to be reviewed once a year.
- **Imprint:** names Frieder M Paulus as the person representing the initiative and responsible for the content. Update it if that changes.
- Have the privacy policy and the accessibility statement checked by the university's data protection officer and its accessibility contact before going live. A German version may be expected.

## On your own computer

```
npm ci
npm start            # website at http://localhost:8080, rebuilt on every change
npm run cms          # second window: editor at http://localhost:8080/admin/, works on the files here
```

`npm run cms` needs no login. Save in the editor, check the result at http://localhost:8080, then commit and push with Git.

---

## Settings you can set by hand

Normally not needed; for special cases (another branch, a mirror, testing):

| Variable | Meaning |
|---|---|
| `PATH_PREFIX` | sub-folder of the site, e.g. `/website/` |
| `SITE_URL` | full address of the site, shown in the editor |
| `CMS_BACKEND` | `github` or `gitlab` |
| `CMS_REPO`, `CMS_BRANCH` | repository and branch the editor writes to |
| `CMS_BASE_URL`, `CMS_API_ROOT` | address of the Git host and its API |
| `CMS_APP_ID` | GitLab application ID (same as `DECAP_GITLAB_APP_ID`) |
| `OSI_HOSTING` | which hosting paragraph the privacy policy shows: `github`, `gitlab_com` or `server` |

---

## Security

- The public site is plain files: no program, database or login runs on the web server.
- Every page carries a strict content security policy: only scripts, styles, fonts and pictures from the site itself. On your own server, the `.htaccess` (Apache) or nginx rules add it as a header too, with HTTPS enforcement and further protective headers.
- Pictures are decoded and saved again during the build, so camera and location data never reach the site.
- The editor at `/admin/` is served from the site itself (Decap CMS 3.17.3, no outside scripts). It needs a looser rule (it evaluates generated code) and may contact only the Git host. Logins and permissions are those of GitHub or GitLab, including two-factor login.
- **The key in the editor's browser.** Like every browser-based Git editor, the editor keeps a key in the browser while someone is logged in. `admin/session-guard.js` removes it when the editor tab is closed and after 30 minutes without activity (change `IDLE_LIMIT` there for another time). On GitHub it comes from a GitHub App and only reaches the website repository, only for files, for 8 hours; the login service keeps the refresh key back. On GitLab, keep the editor's application at scope `api` and limit editors' accounts to the projects they need; GitLab's keys also expire after a short time. Logging out removes the key from the browser.
- Who may change the site is decided in the repository's members list. Remove people who leave.

## Updating the tools

Versions are fixed in `package.json` and `package-lock.json`, so builds stay identical. To update, change the version, run `npm install`, check locally, commit. The editor is the folder `admin/decap/`; replace it with the `dist` files of a newer `decap-cms` package.

## When something goes wrong

| What you see | Cause and fix |
|---|---|
| The pipeline/workflow fails | Open its log. Content problems are listed after `[osi] … problem(s) in content/`. |
| "Problem(s) in content" in the log, site still built | The named file has a mistake (missing date, picture not found …); the site was built without that part. |
| Editor shows "Error loading the CMS configuration" | A mistake in `admin/cms.yml`; the message names the line. |
| Editor login fails (GitLab) | Redirect URI must match the address of `/admin/` exactly, including the trailing `/`. |
| Editor login fails (GitHub) | Check the four worker variables and `DECAP_OAUTH_URL`; `ALLOWED_ORIGIN` without trailing slash; the app's Callback URL ends in `/callback`; the app is installed on the website repository. |
| GitHub login says "may not edit this website" | The account has no write access to the repository, or the GitHub App is not installed on it. |
| Editor suddenly shows errors when saving (GitHub) | The 8-hour key has expired. Log out (top right) and log in again. |
| GitHub: "Login with GitHub" opens a window at api.netlify.com saying "Not found" | The variable `DECAP_OAUTH_URL` was missing when the site was built (version 1.0.3 and earlier). Set up the login service (part (a), step 2) and run the workflow again. From version 1.0.4 on, `/admin/` shows what is missing instead. |
| GitHub: "Get Pages site failed … Not Found" | Pages is not switched on for GitHub Actions yet; see part (a), step 1, then re-run the workflow. |
| Links broken on GitHub/GitLab Pages | The build sets `PATH_PREFIX` itself; if you changed the build file, make sure it still does. |
