# BTU Supervisor Safety Hub

A mobile-first Progressive Web App giving 4Refuel BTU supervisors one-tap access to EHS forms — hosted on GitHub Pages and embeddable inside a Microsoft Power App.

*Delivering reliable and sustainable solutions.*

No traditional backend or database — the entire app is static HTML/CSS/JS reading from `config.json` and `branding.json`, cached by a service worker so it also works offline. Content is edited through **`admin.html`**, a web UI that commits changes directly to this GitHub repo using the GitHub API — so publishing is a click, not a manual file copy.

---

## Files in this project

| File | Purpose |
|---|---|
| `index.html` | Page structure and templates |
| `styles.css` | 4Refuel brand design system, layout, dark mode |
| `app.js` | Rendering, search, favorites, recents, theme, branding, service worker registration |
| `config.json` | All form data — edit via `admin.html`, or by hand |
| `branding.json` | Colors, app title, eyebrow, tagline — edit via `admin.html`, or by hand |
| `logo.png` | Company logo shown in the header — edit via `admin.html`, or by hand (see section 6) |
| `admin.html`, `admin.js`, `admin.css` | **Site Editor** — web UI for editing everything above and publishing straight to GitHub (see section 1) |
| `manifest.json` | PWA install metadata (name, icons, colors) |
| `service-worker.js` | Offline caching |
| `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` | App install icons (regular + maskable) |

---

## 1. Using the Site Editor (`admin.html`)

This is the main way to manage the site day-to-day. Open `admin.html` on your deployed GitHub Pages URL (e.g. `https://npicklyk4R.github.io/Supervisor-Safety-Hub/admin.html`) or locally (section 2).

### First-time connect

1. Create a **fine-grained Personal Access Token** scoped to just this repo:
   - GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - **Repository access:** "Only select repositories" → pick this repo specifically. Don't grant access to all repos.
   - **Permissions → Repository permissions:** set **Contents** to **Read and write**. Leave everything else as No access.
   - Set an expiration (90 days is reasonable — just regenerate when it lapses).
   - Generate and copy the token — GitHub only shows it once.
2. On the Site Editor's connect screen, enter your GitHub username/org, this repo's name, the branch (`main`), and the token.
3. Click **Connect to GitHub**. The editor loads your current forms and branding directly from the repo.

The token is stored **only in that browser's `localStorage`**, sent **only to `api.github.com`**, and never touches any third-party server. Uncheck "Remember on this browser" if you'd rather re-enter it every visit, and use **Disconnect** to clear it (e.g. before closing a shared computer).

### Editing

- **Branding & Logo tab** — app title, eyebrow label, tagline; upload a new logo (auto-resized to spec on publish); adjust the four brand colors with pickers or hex codes.
- **Forms & Categories tab** — add, edit, remove, and drag-reorder forms. Categories are still just whatever you type into "Type of Form" — nothing separate to manage.
- **Live preview** (right-hand pane) — the real app running live, updating as you type, switchable between mobile and desktop widths. This reflects your *draft*, not what's published yet.
- **Publish tab** — shows exactly which files (`config.json`, `branding.json`, `logo.png`) have unpublished edits. Click **Publish to GitHub** to commit them directly to the branch you connected to.

### After publishing

GitHub Pages detects the new commit and republishes automatically, usually within about a minute — no manual redeploy step. Refresh the live site to see it. If you changed the logo, also see the note on `CACHE_VERSION` in section 6.

### Good to know

- This edits your **live** site directly — there's no draft/staging environment. The live preview pane is your chance to review before publishing.
- If two people edit at once, the second publish may fail with a conflict (GitHub rejects a commit built on an outdated version of a file). Just reconnect (refresh the page) to pull the latest version and redo your edit.
- `admin.html` needs an internet connection (Google Fonts + the GitHub API) — it won't work fully offline the way the main app does.
- Anyone who finds the link to `admin.html` can view the connect screen, but they can't do anything without a valid token for your repo — the page itself has no elevated access. Still, since it's just a normal file in your repo, don't link to it from the main app (nothing here does), and treat repo access/token creation as you would any other admin credential.

---

## 2. Local testing

You need a local static server (opening `index.html` directly with `file://` will break the service worker, `fetch()` calls, and `admin.html`'s GitHub connection).

**Option A — Python (already on most machines):**

```bash
cd btu-hub
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

**Option B — Node:**

```bash
npx serve .
```

**Option C — VS Code:** install the "Live Server" extension, right-click `index.html`, choose "Open with Live Server."

`admin.html` works the same way locally as it does deployed — it always talks to the real GitHub repo over the API, regardless of where the page itself is served from.

---

## 3. Deploying to GitHub Pages

1. Push all files in this folder to the repository root.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch," pick the branch (usually `main`) and the folder (`/root`).
4. Save. GitHub publishes the app at `https://<your-org-or-username>.github.io/<repo-name>/`.
5. Wait 1–2 minutes, then visit the URL to confirm it loads — both `index.html` and `admin.html`.

Once deployed, day-to-day changes go through `admin.html` (section 1) and need no further manual deploy step. Manual pushes still work too (e.g. for code changes to `app.js`/`styles.css` themselves) — just bump `CACHE_VERSION` in `service-worker.js` first if you changed anything in the cached app shell, so installed devices pick up the change.

---

## 4. Embedding in Power Apps

1. Publish the app on GitHub Pages first and confirm the public URL loads correctly in a normal browser.
2. In Power Apps Studio, add a **PDF viewer** or (preferred) an **HTML/IFrame-capable** control — most setups use a custom **Web Viewer** / embedded browser control depending on your Power Apps environment (Canvas app on Teams, model-driven app, or Power Pages).
   - **Canvas app:** insert a "PDF viewer" control (works for any URL, not just PDFs) or a custom **HTML text** control with an `<iframe>` if your tenant allows it.
   - **Power Pages / Portals:** add a **Custom HTML** web template with an `<iframe src="https://<your-org>.github.io/<repo-name>/">`.
3. Set the control's `Document`/`URL`/`src` property to your GitHub Pages URL (point at `index.html` for the supervisor-facing app — don't embed `admin.html` here).
4. Size the control to fill the available screen space — the app is mobile-first and responsive, so it adapts to narrow embedded frames.
5. Test on the same device types your supervisors use since some mobile embedded browsers restrict pop-ups: the "Open Form" button uses `window.open(...)`, which some embedded WebViews block or handle differently. If forms don't open inside Power Apps, ask your Power Platform admin to confirm the embedded browser control allows opening external links/new windows.

---

## 5. Adding a new category

Categories are **not** hardcoded — they're derived automatically from the distinct `"typeOfForm"` values across all forms. Add a form with a new `typeOfForm` (via `admin.html` or directly in `config.json`) and a new category section appears automatically with the default gradient accent (blue → purple).

To give a brand-new category its own two-tone gradient and icon (like the three built-in categories), open `styles.css` and `app.js`:

- In `app.js`, add an entry to `CATEGORY_ICONS` (pick or add an `icon...()` function) and `CATEGORY_KEY_MAP` (a short slug, e.g. `'training'`).
- In `styles.css`, search for `CATEGORY SECTIONS` and `FORM GRID + CARDS`, and add rules following the existing `[data-cat-key="..."]` / `[data-category="..."]` pattern, defining a new `--gradient-*` custom property in `:root` if you want a unique two-color combination.

This is optional — categories work correctly with the default styling even without this step.

---

## 6. Updating the logo

**Easiest way:** the Branding & Logo tab in `admin.html` — upload an image and publish; it's automatically resized and committed as `logo.png`.

**Manual way:** replace `logo.png` in the repo root directly, matching this spec:

| Property | Requirement | Why |
|---|---|---|
| Dimensions | **512 × 512px, square** | Crisp on retina/high-DPI phone screens even though it displays small in the header |
| Format | **PNG, transparent background** | Sits cleanly on both light and dark mode without a visible box around it |
| Safe area | Keep the artwork within the center **~80%** of the canvas | Avoids feeling cramped once scaled down to header size |

The header displays it at a small fixed size (roughly 30px) inside a rounded neutral tile, so very thin lines or small text may not stay legible — a simpler mark or monogram often works better than a full wordmark. The neutral tile background (light grey in light mode, dark charcoal in dark mode) means the logo should have reasonable contrast against **both**.

If you update `logo.png` by hand (not through `admin.html`), bump `CACHE_VERSION` in `service-worker.js` before pushing so installed devices pick up the new image. Publishing through `admin.html` doesn't require this — it's handled the same way `config.json`/`branding.json` already are (fetched fresh, not aggressively cached).

---

## 7. Customizing colors and text

**Easiest way:** the Branding & Logo tab in `admin.html`.

**Manual way:** edit `branding.json` directly:

```json
{
  "appTitle": "Supervisor Safety Hub",
  "eyebrow": "4Refuel · BTU",
  "tagline": "Delivering reliable and sustainable solutions.",
  "colors": {
    "purple": "#674DA0",
    "blue": "#457EC0",
    "green": "#7AC362",
    "yellow": "#FFF200",
    "black": "#000000",
    "white": "#FFFFFF"
  }
}
```

This is fetched at runtime, so a plain edit + push (no cache-version bump needed) is enough to see it live. The same six colors also exist as hardcoded fallbacks in `styles.css`'s `:root` block (used only if `branding.json` fails to load) — update those too if you want the fallback itself to change.

**Typography:** headings use Poppins (loaded from Google Fonts), body text is set to `Gilmer` with a fallback stack (`Inter`, `Segoe UI`, `Arial`). Gilmer is a licensed commercial font not distributed publicly, so it isn't hotlinked from a CDN. If your organization has Gilmer webfont files, add them to a new `/fonts` folder and uncomment the `@font-face` block at the top of `styles.css`.

---

## 8. Updating app icons (install icon, not the header logo)

App icons are separate from `logo.png` — they're what shows up on the home screen once the app is installed, and aren't currently editable through `admin.html`. They live in the repo root:

- `icon-192.png`, `icon-512.png` — standard icons
- `icon-maskable-192.png`, `icon-maskable-512.png` — "maskable" icons (Android applies its own shape mask, e.g. a circle, so these need extra padding around the artwork; keep the logo within the center ~67% of the canvas)

To replace them, generate new PNGs at the same filenames and dimensions, or update `manifest.json` if you rename/resize them. After changing icons, bump `CACHE_VERSION` in `service-worker.js` and push so installed devices pick up the new artwork.

---

## 9. Troubleshooting

**"config.json was not found in this repo/branch" when connecting in `admin.html`**
Double-check the owner/repo spelling and branch name. Also confirm the token's repository access actually includes this repo (fine-grained tokens are scoped per-repo).

**Publish fails with a permissions/403 error**
The token likely doesn't have **Contents: Read and write** permission, or it expired. Generate a new fine-grained token with that permission and reconnect.

**Publish fails with a 409/conflict error**
Someone else (or another browser tab) published a change since you connected. Refresh `admin.html` to reconnect and pull the latest file versions, then redo your edit.

**Changes published but the live site still looks old**
GitHub Pages can take a minute or two to republish after a commit — try a hard refresh after waiting briefly. If it's specifically the logo or app icons not updating, remember installed/PWA devices cache the app shell; bump `CACHE_VERSION` in `service-worker.js` for those (see section 6).

**Forms don't appear / blank category list on the main site**
Check the browser console for a fetch error on `config.json` — usually invalid JSON if it was hand-edited outside `admin.html`. Validate at [jsonlint.com](https://jsonlint.com) or with `python3 -m json.tool config.json`.

**Logo looks blurry or off-center**
Check `logo.png` matches the spec in section 6 — most issues come from a non-square source image or artwork placed too close to the edges.

**"Open Form" doesn't open a new tab inside Power Apps**
Some embedded browser/WebView controls block `window.open()` by default. Confirm with your Power Platform admin whether the hosting control allows opening external links in a new window — this is a host configuration setting outside this app's code.

**Install prompt doesn't appear on iPhone**
iOS Safari doesn't show an automatic install banner. Users must tap the Share icon → "Add to Home Screen" manually.

**Dark mode doesn't match system setting**
The app remembers an explicit toggle choice in `localStorage` and keeps using it even if the OS theme changes afterward.

**Favorites/recents disappeared**
These are stored in the browser's `localStorage`, per-device and per-browser — expected behavior, not a bug, since there's no user account system.

**Lighthouse PWA score is low**
Test the deployed HTTPS GitHub Pages URL, not `file://` or plain HTTP — service workers and installability require a secure context.
