/* =====================================================================
   BTU SUPERVISOR SAFETY HUB — APP LOGIC
   Vanilla JS, no build step, no framework, no backend.

   ---------------------------------------------------------------------
   ADMIN GUIDE — everything below happens automatically from config.json
   ---------------------------------------------------------------------
   HOW TO ADD A NEW FORM
     Open config.json and add a new object to the array:
       {
         "title": "New Form Name",
         "typeOfForm": "Reporting Tools",   <- must match an existing
                                                category name exactly, or
                                                a brand-new one you invent
         "frequency": "As Required",
         "link": "https://forms.office.com/..."
       }
     Save the file and redeploy (see README.md). No code changes needed.

   HOW TO REMOVE A FORM
     Delete its object from the config.json array. Save and redeploy.

   HOW TO ADD A CATEGORY
     Just use a new "typeOfForm" value on any form — a new category
     section is created automatically, with the default (purple/blue)
     gradient accent. To give a brand-new category its own two-color
     gradient like the three built-in categories, add a rule in
     styles.css (search for "CATEGORY SECTIONS" and "FORM GRID + CARDS")
     following the existing [data-cat-key="..."] / [data-category="..."]
     pattern, and add a matching entry to CATEGORY_ICONS and
     CATEGORY_KEY_MAP below so it gets an icon and a stable slug.

   HOW TO UPDATE A LINK
     Edit the "link" value for that form in config.json. Save and
     redeploy.
   ===================================================================== */

(function () {
  'use strict';

  /* ---- Config ---- */
  const CONFIG_URL = 'config.json';
  const STORAGE_KEYS = {
    favorites: 'btu-hub:favorites',
    recent: 'btu-hub:recent',
    theme: 'btu-hub:theme',
  };
  const MAX_RECENT = 6;

  // Known categories get a hand-picked icon + a short slug used for CSS
  // hooks (data-cat-key) and gradient styling. Anything not listed here
  // still works — it just renders with the default icon + gradient.
  const CATEGORY_ICONS = {
    'Reporting Tools': iconReport,
    'CRP Hiring & Performance': iconPeople,
    'Submissions & Inspections': iconClipboard,
  };
  const CATEGORY_KEY_MAP = {
    'Reporting Tools': 'reporting',
    'CRP Hiring & Performance': 'crp',
    'Submissions & Inspections': 'submissions',
  };

  /* ---- State ---- */
  let ALL_FORMS = [];
  let favorites = loadSet(STORAGE_KEYS.favorites);
  let recent = loadList(STORAGE_KEYS.recent);
  let searchTerm = '';

  /* ---- DOM refs ---- */
  const el = {
    categoriesContainer: document.getElementById('categories-container'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesGrid: document.getElementById('favorites-grid'),
    recentSection: document.getElementById('recent-section'),
    recentGrid: document.getElementById('recent-grid'),
    clearRecent: document.getElementById('clear-recent'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    searchStatus: document.getElementById('search-status'),
    emptyState: document.getElementById('empty-state'),
    emptyReset: document.getElementById('empty-reset'),
    themeToggle: document.getElementById('theme-toggle'),
    toast: document.getElementById('toast'),
    announcer: document.getElementById('a11y-announcer'),
    cardTemplate: document.getElementById('form-card-template'),
    categoryTemplate: document.getElementById('category-template'),
  };

  /* =====================================================================
     INIT
     ===================================================================== */

  init();

  async function init() {
    initTheme();
    bindGlobalEvents();
    registerServiceWorker();

    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      ALL_FORMS = await res.json();
    } catch (err) {
      console.error('Failed to load config.json', err);
      el.categoriesContainer.innerHTML =
        '<p style="padding:24px;color:var(--text-secondary);">' +
        'Could not load form data. Please refresh, or check that config.json is present.</p>';
      return;
    }

    render();
  }

  /* =====================================================================
     RENDERING
     ===================================================================== */

  function render() {
    const filtered = filterForms(ALL_FORMS, searchTerm);

    renderFavorites(filtered);
    renderRecent(filtered);
    renderCategories(filtered);
    renderEmptyState(filtered);
    renderSearchStatus(filtered);
  }

  function filterForms(forms, term) {
    if (!term) return forms;
    const q = term.trim().toLowerCase();
    return forms.filter((f) =>
      f.title.toLowerCase().includes(q) ||
      f.typeOfForm.toLowerCase().includes(q) ||
      f.frequency.toLowerCase().includes(q)
    );
  }

  function renderFavorites(filtered) {
    const favForms = filtered.filter((f) => favorites.has(f.title));
    el.favoritesGrid.innerHTML = '';
    if (favForms.length === 0) {
      el.favoritesSection.hidden = true;
      return;
    }
    el.favoritesSection.hidden = false;
    favForms.forEach((f) => el.favoritesGrid.appendChild(buildCard(f)));
  }

  function renderRecent(filtered) {
    const filteredTitles = new Set(filtered.map((f) => f.title));
    const recentForms = recent
      .map((title) => ALL_FORMS.find((f) => f.title === title))
      .filter((f) => f && filteredTitles.has(f.title));

    el.recentGrid.innerHTML = '';
    if (recentForms.length === 0) {
      el.recentSection.hidden = true;
      return;
    }
    el.recentSection.hidden = false;
    recentForms.forEach((f) => el.recentGrid.appendChild(buildCard(f)));
  }

  function renderCategories(filtered) {
    el.categoriesContainer.innerHTML = '';

    // Group forms by typeOfForm, preserving first-seen order from
    // config.json so category order is fully data-driven.
    const groups = new Map();
    filtered.forEach((f) => {
      if (!groups.has(f.typeOfForm)) groups.set(f.typeOfForm, []);
      groups.get(f.typeOfForm).push(f);
    });

    groups.forEach((forms, categoryName) => {
      el.categoriesContainer.appendChild(buildCategorySection(categoryName, forms));
    });
  }

  function renderEmptyState(filtered) {
    el.emptyState.hidden = filtered.length !== 0;
  }

  function renderSearchStatus(filtered) {
    if (!searchTerm) {
      el.searchStatus.textContent = '';
      return;
    }
    const count = filtered.length;
    el.searchStatus.textContent = count === 0
      ? 'No forms found.'
      : `${count} form${count === 1 ? '' : 's'} found.`;
  }

  /* ---- Card building ---- */

  function buildCard(form) {
    const node = el.cardTemplate.content.firstElementChild.cloneNode(true);
    const card = node;

    card.dataset.category = form.typeOfForm;
    card.querySelector('.form-card-title').textContent = form.title;
    card.querySelector('.meta-type').textContent = form.typeOfForm;
    card.querySelector('.meta-frequency').textContent = form.frequency;

    const favBtn = card.querySelector('.fav-btn');
    const isFav = favorites.has(form.title);
    favBtn.setAttribute('aria-pressed', String(isFav));
    favBtn.setAttribute('aria-label', isFav
      ? `Remove ${form.title} from favorites`
      : `Add ${form.title} to favorites`);
    favBtn.addEventListener('click', () => toggleFavorite(form, favBtn));

    const openBtn = card.querySelector('.open-form-btn');
    openBtn.setAttribute('aria-label', `Open ${form.title} in a new tab`);
    openBtn.addEventListener('click', () => openForm(form, openBtn));

    return card;
  }

  function buildCategorySection(categoryName, forms) {
    const node = el.categoryTemplate.content.firstElementChild.cloneNode(true);
    const section = node;
    const key = CATEGORY_KEY_MAP[categoryName] || slugify(categoryName);

    section.dataset.catKey = key;
    section.querySelector('.category-name').textContent = categoryName;
    section.querySelector('.category-count').textContent =
      `${forms.length} form${forms.length === 1 ? '' : 's'}`;

    const iconFn = CATEGORY_ICONS[categoryName] || iconDefault;
    section.querySelector('.category-icon').innerHTML = iconFn();

    const grid = section.querySelector('.category-grid');
    forms.forEach((f) => grid.appendChild(buildCard(f)));

    const header = section.querySelector('.category-header');
    const collapsedKey = 'btu-hub:collapsed:' + key;
    const wasCollapsed = localStorage.getItem(collapsedKey) === '1';
    if (wasCollapsed) {
      section.classList.add('collapsed');
      header.setAttribute('aria-expanded', 'false');
    }

    header.addEventListener('click', () => {
      const isCollapsed = section.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', String(!isCollapsed));
      try { localStorage.setItem(collapsedKey, isCollapsed ? '1' : '0'); } catch (e) {}
    });

    return section;
  }

  /* =====================================================================
     ACTIONS
     ===================================================================== */

  function toggleFavorite(form, btn) {
    const isFav = favorites.has(form.title);
    if (isFav) {
      favorites.delete(form.title);
    } else {
      favorites.add(form.title);
    }
    saveSet(STORAGE_KEYS.favorites, favorites);

    btn.classList.remove('pop');
    // Force reflow so the animation can re-trigger on rapid toggles.
    void btn.offsetWidth;
    btn.classList.add('pop');

    announce(isFav ? `Removed ${form.title} from favorites` : `Added ${form.title} to favorites`);
    render();
  }

  function openForm(form, btn) {
    btn.classList.add('loading');
    announce(`Opening ${form.title}`);

    // Brief, deliberate loading feedback before the tab opens — this is
    // cosmetic (the form itself opens immediately) but gives the tap a
    // felt response, which matters on slower mobile connections too.
    window.setTimeout(() => {
      window.open(form.link, '_blank', 'noopener,noreferrer');
      btn.classList.remove('loading');
    }, 260);

    addToRecent(form.title);
    showToast(`Opened “${form.title}”`);
  }

  function addToRecent(title) {
    recent = recent.filter((t) => t !== title);
    recent.unshift(title);
    recent = recent.slice(0, MAX_RECENT);
    saveList(STORAGE_KEYS.recent, recent);
    render();
  }

  /* =====================================================================
     SEARCH
     ===================================================================== */

  function bindGlobalEvents() {
    el.searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      el.searchClear.hidden = searchTerm.length === 0;
      render();
    });

    el.searchClear.addEventListener('click', () => {
      searchTerm = '';
      el.searchInput.value = '';
      el.searchClear.hidden = true;
      el.searchInput.focus();
      render();
    });

    el.emptyReset.addEventListener('click', () => {
      searchTerm = '';
      el.searchInput.value = '';
      el.searchClear.hidden = true;
      render();
    });

    el.clearRecent.addEventListener('click', () => {
      recent = [];
      saveList(STORAGE_KEYS.recent, recent);
      render();
    });

    el.themeToggle.addEventListener('click', toggleTheme);
  }

  /* =====================================================================
     THEME (DARK MODE)
     ===================================================================== */

  function initTheme() {
    let stored;
    try { stored = localStorage.getItem(STORAGE_KEYS.theme); } catch (e) {}

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      el.themeToggle.setAttribute('aria-pressed', 'true');
      el.themeToggle.setAttribute('aria-label', 'Switch to light mode');
    } else {
      document.documentElement.removeAttribute('data-theme');
      el.themeToggle.setAttribute('aria-pressed', 'false');
      el.themeToggle.setAttribute('aria-label', 'Switch to dark mode');
    }
    try { localStorage.setItem(STORAGE_KEYS.theme, theme); } catch (e) {}

    const metaTheme = document.querySelector('meta[name="theme-color"]:not([media])') ||
      document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#141221' : '#FFFFFF');
  }

  /* =====================================================================
     TOAST + ANNOUNCER
     ===================================================================== */

  let toastTimer = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('show');
      setTimeout(() => { el.toast.hidden = true; }, 260);
    }, 2400);
  }

  function announce(message) {
    el.announcer.textContent = '';
    // Re-set on next tick so screen readers reliably re-announce.
    window.setTimeout(() => { el.announcer.textContent = message; }, 30);
  }

  /* =====================================================================
     STORAGE HELPERS
     ===================================================================== */

  function loadSet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  }
  function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  function loadList(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  /* =====================================================================
     SERVICE WORKER
     ===================================================================== */

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch((err) => {
          console.warn('Service worker registration failed', err);
        });
      });
    }
  }

  /* =====================================================================
     ICONS (inline SVG strings, kept tiny and dependency-free)
     ===================================================================== */

  function iconReport() {
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  }
  function iconPeople() {
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
  }
  function iconClipboard() {
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M9 12l2 2 4-4"></path></svg>';
  }
  function iconDefault() {
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  }

})();
