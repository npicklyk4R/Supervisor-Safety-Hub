# BTU Supervisor Safety Hub

A mobile-first Progressive Web App giving 4Refuel BTU supervisors one-tap access to EHS forms — hosted on GitHub Pages and embeddable inside a Microsoft Power App.

*Delivering reliable and sustainable solutions.*

No backend, no database, no authentication, no APIs — the entire app is static HTML/CSS/JS reading from a single `config.json` file, cached by a service worker so it also works offline.

---

## Files in this project

| File | Purpose |
|---|---|
| `index.html` | Page structure and templates |
| `styles.css` | 4Refuel brand design system, layout, dark mode |
| `app.js` | Rendering, search, favorites, recents, theme, service worker registration |
| `config.json` | **The only file most admins will ever need to edit** — all form data |
| `manifest.json` | PWA install metadata (name, icons, colors) |
| `service-worker.js` | Offline caching |
| `icons/` | App icons (192/512, regular + maskable) |

---

## 1. Local testing

You need a local static server (opening `index.html` directly with `file://` will break the service worker and fetch of `config.json` due to browser security restrictions).

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

To test the installed/standalone PWA experience, open the local URL in Chrome, open DevTools → Application → Manifest, and use "Add to Home Screen" / the install icon in the address bar.

---

## 2. Deploying to GitHub Pages

1. Create a new GitHub repository (or use an existing one) and push all files in this folder to the repository root (or to a `/docs` folder — see step 3).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch," pick the branch (usually `main`) and the folder (`/root` or `/docs`, matching where you pushed the files).
4. Save. GitHub will publish the app at `https://<your-org-or-username>.github.io/<repo-name>/`.
5. Wait 1–2 minutes for the first deploy, then visit the URL to confirm it loads.

**To deploy an update after the first publish:**

1. Edit whatever file(s) you need (most commonly `config.json`).
2. **If you changed `styles.css`, `app.js`, `index.html`, or anything in `icons/`**, open `service-worker.js` and bump the `CACHE_VERSION` constant near the top (e.g. `'v1'` → `'v2'`). This forces devices that already installed the app to fetch your changes instead of serving the old cached version. (Editing only `config.json` does not require a version bump — it's already fetched network-first.)
3. Commit and push to the branch GitHub Pages is watching. The site updates automatically within a minute or two.

---

## 3. Embedding in Power Apps

1. Publish the app on GitHub Pages first and confirm the public URL loads correctly in a normal browser.
2. In Power Apps Studio, add a **PDF viewer** or (preferred) an **HTML/IFrame-capable** control — most setups use a custom **Web Viewer** / embedded browser control depending on your Power Apps environment (Canvas app on Teams, model-driven app, or Power Pages).
   - **Canvas app:** insert a "PDF viewer" control (works for any URL, not just PDFs) or a custom **HTML text** control with an `<iframe>` if your tenant allows it.
   - **Power Pages / Portals:** add a **Custom HTML** web template with an `<iframe src="https://<your-org>.github.io/<repo-name>/">`.
3. Set the control's `Document`/`URL`/`src` property to your GitHub Pages URL.
4. Size the control to fill the available screen space — the app is mobile-first and responsive, so it adapts to narrow embedded frames.
5. Test on the same device types your supervisors use (phone, tablet, desktop) since some mobile embedded browsers restrict pop-ups: the "Open Form" button uses `window.open(...)` to open the Microsoft Form in a new tab, which some embedded WebViews block or handle differently. If forms don't open inside Power Apps, ask your Power Platform admin to confirm the embedded browser control allows opening external links/new windows (this is a Power Apps/host-configuration setting, not something this app's code can control).

---

## 4. Updating forms (`config.json`)

`config.json` is a flat array. Each entry is one form:

```json
{
  "title": "Hazard Reporting Tool",
  "typeOfForm": "Reporting Tools",
  "frequency": "As Required",
  "link": "https://forms.office.com/..."
}
```

- **Add a form:** add a new object to the array with all four fields. It appears automatically under its category (existing or new) — no other file needs to change.
- **Remove a form:** delete its object from the array.
- **Update a link:** edit the `"link"` value for that form.
- **Rename a form:** edit `"title"`. Note: favorites and recently-opened are stored by title, so renaming a form will make it "un-favorite" on existing devices (it will show as a new item).
- **Change frequency or type:** edit `"frequency"` or `"typeOfForm"` directly.

Validate your JSON before deploying (missing commas/brackets will break the whole list) — paste it into [jsonlint.com](https://jsonlint.com) or run:

```bash
python3 -m json.tool config.json
```

---

## 5. Adding a new category

Categories are **not** hardcoded — they're derived automatically from the distinct `"typeOfForm"` values in `config.json`. Simply give a form a new `typeOfForm` value and a new category section appears with the form count, an expand/collapse header, and the default gradient accent (blue → purple).

To give a brand-new category its own two-tone gradient and icon (like the three built-in categories), open `styles.css` and `app.js`:

- In `app.js`, add an entry to `CATEGORY_ICONS` (pick or add an `icon...()` function) and `CATEGORY_KEY_MAP` (a short slug, e.g. `'training'`).
- In `styles.css`, search for `CATEGORY SECTIONS` and `FORM GRID + CARDS`, and add rules following the existing `[data-cat-key="..."]` / `[data-category="..."]` pattern, defining a new `--gradient-*` custom property in `:root` if you want a unique two-color combination.

This is optional — categories work correctly with the default styling even without this step.

---

## 6. Customizing colors / branding

All brand colors live as CSS custom properties at the top of `styles.css`, inside `:root`:

```css
--color-purple: #674DA0;
--color-blue: #457EC0;
--color-green: #7AC362;
--color-yellow: #FFF200;
--color-black: #000000;
--color-white: #FFFFFF;
```

Change any hex value and every gradient, button, focus ring, and accent derives from it automatically — there are no other hardcoded brand colors elsewhere in the stylesheet (dark-mode surface colors are intentionally neutral charcoal tones, not brand colors, and can be adjusted separately under the `[data-theme="dark"]` block).

**Typography:** headings use Poppins (loaded from Google Fonts in `index.html`), body text is set to `Gilmer` with a fallback stack (`Inter`, `Segoe UI`, `Arial`). Gilmer is a licensed commercial font not distributed publicly, so it isn't hotlinked from a CDN. If your organization has Gilmer webfont files, add them to a new `/fonts` folder and uncomment the `@font-face` block at the top of `styles.css`.

---

## 7. Updating logos / icons

App icons live in `icons/`:

- `icon-192.png`, `icon-512.png` — standard icons
- `icon-maskable-192.png`, `icon-maskable-512.png` — "maskable" icons (Android applies its own shape mask, e.g. a circle, so these need extra padding around the artwork; keep the logo within the center ~67% of the canvas)

To replace them, generate new PNGs at the same filenames and dimensions, or update `manifest.json` if you rename/resize them. After changing icons, bump `CACHE_VERSION` in `service-worker.js` and redeploy (see section 2) so installed devices pick up the new artwork — also update `<link rel="apple-touch-icon">` and `<link rel="icon">` in `index.html` if you change file paths.

---

## 8. Troubleshooting

**Forms don't appear / blank category list**
Check the browser console for a fetch error. Usually means `config.json` has invalid JSON syntax — validate it (see section 4).

**Changes aren't showing up after deploying**
Bump `CACHE_VERSION` in `service-worker.js`. The service worker caches the app shell aggressively for offline use and speed; without a version bump, browsers that already visited the app keep serving old cached files.

**"Open Form" doesn't open a new tab inside Power Apps**
Some embedded browser/WebView controls block `window.open()` or pop-ups by default. Confirm with your Power Platform admin whether the hosting control allows opening external links in a new window — this is a host configuration setting outside this app's code.

**Install prompt doesn't appear on iPhone**
iOS Safari doesn't show an automatic install banner. Users must tap the Share icon → "Add to Home Screen" manually. This is an iOS platform limitation, not a bug in the app.

**Dark mode doesn't match system setting**
The app remembers an explicit choice (via the toggle) in `localStorage` and will keep using it even if your OS theme changes afterward. Toggling the button again always overrides the system preference for that device.

**Favorites/recents disappeared**
These are stored in the browser's `localStorage`, which is per-device and per-browser. Clearing browser data, using a different browser, or using a different device will not carry them over — this is expected, since there is no backend/account system by design.

**Lighthouse PWA score is low**
Make sure you're testing the deployed HTTPS GitHub Pages URL (not `file://` or plain HTTP) — service workers and installability require a secure context. Also confirm `icons/` and `manifest.json` were actually pushed to the repository.
