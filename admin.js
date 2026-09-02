/* =====================================================================
   SITE EDITOR — admin.js (GitHub-backed)
   Reads and writes config.json, branding.json, and logo.png directly to
   a GitHub repo via the REST Contents API, authenticated with a
   Personal Access Token the admin supplies. No separate server: this
   page's own browser talks to api.github.com, and GitHub Pages
   republishes automatically after each commit.
   ===================================================================== */

(function () {
  'use strict';

  const CREDS_KEY = 'btu-hub:admin-gh-creds';
  const DEFAULT_COLORS = {
    purple: '#674DA0',
    blue: '#457EC0',
    green: '#7AC362',
    yellow: '#FFF200',
    black: '#000000',
    white: '#FFFFFF',
  };

  /* ---- Connection state ---- */
  let gh = { owner: '', repo: '', branch: 'main', token: '' };

  /* ---- Content state ---- */
  let state = {
    forms: [],
    branding: {
      appTitle: 'Supervisor Safety Hub',
      eyebrow: '4Refuel · BTU',
      tagline: 'Delivering reliable and sustainable solutions.',
      colors: Object.assign({}, DEFAULT_COLORS),
    },
  };
  let shas = { config: null, branding: null, logo: null };
  let pendingLogoBlob = null; // set only when a new logo was uploaded this session
  let previewReady = false;
  let saveTimer = null;

  const COLOR_KEYS = ['purple', 'blue', 'green', 'yellow'];

  /* ---- DOM refs ---- */
  const el = {
    connectScreen: document.getElementById('connect-screen'),
    adminShell: document.getElementById('admin-shell'),
    inputOwner: document.getElementById('input-owner'),
    inputRepo: document.getElementById('input-repo'),
    inputBranch: document.getElementById('input-branch'),
    inputToken: document.getElementById('input-token'),
    inputRemember: document.getElementById('input-remember'),
    connectBtn: document.getElementById('connect-btn'),
    connectStatus: document.getElementById('connect-status'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    repoIndicator: document.getElementById('repo-indicator'),
    saveIndicator: document.getElementById('save-indicator'),

    tabs: document.querySelectorAll('.admin-tab'),
    panels: {
      branding: document.getElementById('tab-branding'),
      forms: document.getElementById('tab-forms'),
      publish: document.getElementById('tab-publish'),
    },

    appTitle: document.getElementById('input-appTitle'),
    eyebrow: document.getElementById('input-eyebrow'),
    tagline: document.getElementById('input-tagline'),
    logoPreviewImg: document.getElementById('logo-preview-img'),
    logoFileInput: document.getElementById('logo-file-input'),
    logoStatus: document.getElementById('logo-status'),
    colorResetBtn: document.getElementById('color-reset-btn'),

    formsList: document.getElementById('forms-list'),
    addFormBtn: document.getElementById('add-form-btn'),
    formRowTemplate: document.getElementById('form-row-template'),
    categorySuggestions: document.getElementById('category-suggestions'),

    publishBtn: document.getElementById('publish-btn'),
    publishBtn2: document.getElementById('publish-btn-2'),
    publishFileList: document.getElementById('publish-file-list'),
    publishLog: document.getElementById('publish-log'),
    publishBranchName: document.getElementById('publish-branch-name'),

    previewFrame: document.getElementById('preview-frame'),
    previewFrameWrap: document.getElementById('preview-frame-wrap'),
    previewSizeBtns: document.querySelectorAll('.preview-size-btn'),
  };

  let dirty = { config: false, branding: false, logo: false };

  init();

  function init() {
    bindConnectScreen();
    tryAutoConnect();
  }

  /* =====================================================================
     GITHUB API HELPERS
     ===================================================================== */

  function apiUrl(path) {
    return 'https://api.github.com/repos/' + gh.owner + '/' + gh.repo + '/contents/' + path;
  }

  async function ghGetFile(path) {
    const res = await fetch(apiUrl(path) + '?ref=' + encodeURIComponent(gh.branch), {
      headers: {
        Authorization: 'Bearer ' + gh.token,
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await safeJson(res);
      throw new Error('GitHub API error ' + res.status + (body && body.message ? ': ' + body.message : ''));
    }
    const data = await res.json();
    return {
      sha: data.sha,
      text: data.content ? b64DecodeUnicode(data.content.replace(/\n/g, '')) : '',
    };
  }

  async function ghPutFile(path, base64Content, sha, message) {
    const body = {
      message: message,
      content: base64Content,
      branch: gh.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl(path), {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + gh.token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error('GitHub API error ' + res.status + (data && data.message ? ': ' + data.message : ''));
    }
    return data.content ? data.content.sha : null;
  }

  async function safeJson(res) {
    try { return await res.json(); } catch (e) { return null; }
  }

  function b64DecodeUnicode(str) {
    return decodeURIComponent(
      atob(str)
        .split('')
        .map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); })
        .join('')
    );
  }

  function b64EncodeUnicode(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
        return String.fromCharCode('0x' + p1);
      })
    );
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* =====================================================================
     CONNECT SCREEN
     ===================================================================== */

  function bindConnectScreen() {
    el.connectBtn.addEventListener('click', handleConnectClick);
    el.disconnectBtn.addEventListener('click', handleDisconnect);
  }

  function tryAutoConnect() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CREDS_KEY) || 'null'); } catch (e) {}
    if (saved && saved.owner && saved.repo && saved.token) {
      el.inputOwner.value = saved.owner;
      el.inputRepo.value = saved.repo;
      el.inputBranch.value = saved.branch || 'main';
      el.inputToken.value = saved.token;
      connect(saved.owner, saved.repo, saved.branch || 'main', saved.token, true);
    }
  }

  async function handleConnectClick() {
    const owner = el.inputOwner.value.trim();
    const repo = el.inputRepo.value.trim();
    const branch = el.inputBranch.value.trim() || 'main';
    const token = el.inputToken.value.trim();

    if (!owner || !repo || !token) {
      setConnectStatus('Please fill in owner, repo, and token.', 'error');
      return;
    }
    await connect(owner, repo, branch, token, el.inputRemember.checked);
  }

  async function connect(owner, repo, branch, token, remember) {
    gh = { owner, repo, branch, token };
    setConnectStatus('Connecting…', null);
    el.connectBtn.disabled = true;

    try {
      const configFile = await ghGetFile('config.json');
      const brandingFile = await ghGetFile('branding.json');
      let logoSha = null;
      try {
        const logoRes = await fetch(apiUrl('logo.png') + '?ref=' + encodeURIComponent(gh.branch), {
          headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github+json' },
        });
        if (logoRes.ok) {
          const logoData = await logoRes.json();
          logoSha = logoData.sha;
        }
      } catch (e) { /* logo.png may not exist yet — fine */ }

      if (!configFile) throw new Error('config.json was not found in this repo/branch. Double check the repo name and branch.');

      state.forms = JSON.parse(configFile.text);
      shas.config = configFile.sha;

      if (brandingFile) {
        const brand = JSON.parse(brandingFile.text);
        state.branding.appTitle = brand.appTitle || state.branding.appTitle;
        state.branding.eyebrow = brand.eyebrow || state.branding.eyebrow;
        state.branding.tagline = brand.tagline || state.branding.tagline;
        state.branding.colors = Object.assign({}, DEFAULT_COLORS, brand.colors || {});
        shas.branding = brandingFile.sha;
      } else {
        shas.branding = null; // will be created on first publish
      }
      shas.logo = logoSha;

      if (remember) {
        try { localStorage.setItem(CREDS_KEY, JSON.stringify({ owner, repo, branch, token })); } catch (e) {}
      } else {
        try { localStorage.removeItem(CREDS_KEY); } catch (e) {}
      }

      setConnectStatus('Connected!', 'success');
      showEditor();
    } catch (err) {
      console.error(err);
      setConnectStatus(err.message || 'Could not connect. Check your details and token permissions.', 'error');
      el.connectBtn.disabled = false;
    }
  }

  function setConnectStatus(msg, kind) {
    el.connectStatus.textContent = msg;
    el.connectStatus.className = 'connect-status' + (kind === 'error' ? ' is-error' : kind === 'success' ? ' is-success' : '');
  }

  function handleDisconnect() {
    if (!confirm('Disconnect and forget the saved token on this browser?')) return;
    try { localStorage.removeItem(CREDS_KEY); } catch (e) {}
    location.reload();
  }

  function showEditor() {
    el.connectScreen.hidden = true;
    el.adminShell.hidden = false;
    el.repoIndicator.textContent = gh.owner + '/' + gh.repo + ' @ ' + gh.branch;
    el.publishBranchName.textContent = gh.branch;

    bindTabs();
    bindBrandingFields();
    bindFormsUI();
    bindPublish();
    bindPreviewControls();

    populateFieldsFromState();
    renderFormsList();
    renderPublishFileList();
    schedulePreviewPush();
  }

  /* =====================================================================
     TABS
     ===================================================================== */

  function bindTabs() {
    el.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        el.tabs.forEach(function (t) {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');

        Object.entries(el.panels).forEach(function ([key, panel]) {
          panel.hidden = key !== tab.dataset.tab;
        });
        if (tab.dataset.tab === 'publish') renderPublishFileList();
      });
    });
  }

  /* =====================================================================
     BRANDING FIELDS
     ===================================================================== */

  function bindBrandingFields() {
    el.appTitle.addEventListener('input', function () {
      state.branding.appTitle = el.appTitle.value;
      dirty.branding = true;
      commitDraftChange();
    });
    el.eyebrow.addEventListener('input', function () {
      state.branding.eyebrow = el.eyebrow.value;
      dirty.branding = true;
      commitDraftChange();
    });
    el.tagline.addEventListener('input', function () {
      state.branding.tagline = el.tagline.value;
      dirty.branding = true;
      commitDraftChange();
    });

    COLOR_KEYS.forEach(function (key) {
      const colorInput = document.getElementById('color-' + key);
      const hexInput = document.getElementById('color-' + key + '-hex');

      colorInput.addEventListener('input', function () {
        hexInput.value = colorInput.value.toUpperCase();
        state.branding.colors[key] = colorInput.value;
        dirty.branding = true;
        commitDraftChange();
      });

      hexInput.addEventListener('input', function () {
        const val = normalizeHex(hexInput.value);
        if (val) {
          colorInput.value = val;
          state.branding.colors[key] = val;
          dirty.branding = true;
          commitDraftChange();
        }
      });
    });

    el.colorResetBtn.addEventListener('click', function () {
      state.branding.colors = Object.assign({}, DEFAULT_COLORS);
      populateFieldsFromState();
      dirty.branding = true;
      commitDraftChange();
    });

    el.logoFileInput.addEventListener('change', handleLogoUpload);
  }

  function normalizeHex(value) {
    let v = value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null;
  }

  function handleLogoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      el.logoStatus.textContent = 'That image is quite large (over 4MB) — consider a smaller file.';
    } else {
      el.logoStatus.textContent = 'New logo ready — will be committed as logo.png on publish.';
    }

    const reader = new FileReader();
    reader.onload = function () {
      pendingLogoBlob = { dataUrl: reader.result };
      el.logoPreviewImg.src = reader.result;
      dirty.logo = true;
      commitDraftChange();
      pushLogoToPreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function populateFieldsFromState() {
    el.appTitle.value = state.branding.appTitle;
    el.eyebrow.value = state.branding.eyebrow;
    el.tagline.value = state.branding.tagline;

    COLOR_KEYS.forEach(function (key) {
      const val = state.branding.colors[key] || DEFAULT_COLORS[key];
      document.getElementById('color-' + key).value = val;
      document.getElementById('color-' + key + '-hex').value = val.toUpperCase();
    });

    // Current logo comes straight from the repo's raw file (cache-busted),
    // unless a new upload is pending this session.
    if (!pendingLogoBlob) {
      el.logoPreviewImg.src =
        'https://raw.githubusercontent.com/' + gh.owner + '/' + gh.repo + '/' + gh.branch + '/logo.png?t=' + Date.now();
    }
  }

  /* =====================================================================
     FORMS LIST
     ===================================================================== */

  function bindFormsUI() {
    el.addFormBtn.addEventListener('click', function () {
      state.forms.push({ title: '', typeOfForm: '', frequency: '', link: '' });
      renderFormsList();
      dirty.config = true;
      commitDraftChange();
      const rows = el.formsList.querySelectorAll('.form-row');
      const last = rows[rows.length - 1];
      if (last) last.querySelector('.f-title').focus();
    });
  }

  function renderFormsList() {
    el.formsList.innerHTML = '';
    state.forms.forEach(function (form, index) {
      el.formsList.appendChild(buildFormRow(form, index));
    });
    updateCategorySuggestions();
  }

  function buildFormRow(form, index) {
    const node = el.formRowTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.index = String(index);

    const titleInput = node.querySelector('.f-title');
    const typeInput = node.querySelector('.f-type');
    const freqInput = node.querySelector('.f-frequency');
    const linkInput = node.querySelector('.f-link');

    titleInput.value = form.title || '';
    typeInput.value = form.typeOfForm || '';
    freqInput.value = form.frequency || '';
    linkInput.value = form.link || '';

    titleInput.addEventListener('input', function () { form.title = titleInput.value; dirty.config = true; commitDraftChange(); });
    typeInput.addEventListener('input', function () { form.typeOfForm = typeInput.value; dirty.config = true; commitDraftChange(); updateCategorySuggestions(); });
    freqInput.addEventListener('input', function () { form.frequency = freqInput.value; dirty.config = true; commitDraftChange(); });
    linkInput.addEventListener('input', function () { form.link = linkInput.value; dirty.config = true; commitDraftChange(); });

    node.querySelector('.remove-row-btn').addEventListener('click', function () {
      const i = state.forms.indexOf(form);
      if (i !== -1) state.forms.splice(i, 1);
      renderFormsList();
      dirty.config = true;
      commitDraftChange();
    });

    node.addEventListener('dragstart', function () { node.classList.add('dragging'); });
    node.addEventListener('dragend', function () {
      node.classList.remove('dragging');
      el.formsList.querySelectorAll('.form-row').forEach(function (r) { r.classList.remove('drag-over'); });
    });
    node.addEventListener('dragover', function (e) {
      e.preventDefault();
      node.classList.add('drag-over');
    });
    node.addEventListener('dragleave', function () { node.classList.remove('drag-over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('drag-over');
      const draggingRow = el.formsList.querySelector('.dragging');
      if (!draggingRow || draggingRow === node) return;
      const fromIndex = Number(draggingRow.dataset.index);
      const toIndex = Number(node.dataset.index);
      const moved = state.forms.splice(fromIndex, 1)[0];
      state.forms.splice(toIndex, 0, moved);
      renderFormsList();
      dirty.config = true;
      commitDraftChange();
    });

    return node;
  }

  function updateCategorySuggestions() {
    const seen = {};
    const categories = [];
    state.forms.forEach(function (f) {
      if (f.typeOfForm && !seen[f.typeOfForm]) {
        seen[f.typeOfForm] = true;
        categories.push(f.typeOfForm);
      }
    });
    el.categorySuggestions.innerHTML = categories.map(function (c) {
      return '<option value="' + escapeHtml(c) + '">';
    }).join('');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* =====================================================================
     DRAFT CHANGE PIPELINE: live preview + publish tab refresh
     ===================================================================== */

  function commitDraftChange() {
    flashSaveIndicator();
    schedulePreviewPush();
    renderPublishFileList();
  }

  function flashSaveIndicator() {
    el.saveIndicator.textContent = 'Unpublished edit';
    el.saveIndicator.classList.add('is-visible');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { el.saveIndicator.classList.remove('is-visible'); }, 1600);
  }

  /* =====================================================================
     LIVE PREVIEW BRIDGE
     ===================================================================== */

  el.previewFrame.addEventListener('load', function () {
    previewReady = true;
    pushToPreview();
  });

  let previewPushTimer = null;
  function schedulePreviewPush() {
    clearTimeout(previewPushTimer);
    previewPushTimer = setTimeout(pushToPreview, 150);
  }

  function pushToPreview() {
    if (!previewReady) return;
    try {
      const win = el.previewFrame.contentWindow;
      if (win && win.BTUHubPreview) {
        win.BTUHubPreview.setBranding(state.branding);
        win.BTUHubPreview.setForms(state.forms);
      }
    } catch (err) { /* not ready yet — safe to ignore */ }
  }

  function pushLogoToPreview(dataUrl) {
    if (!previewReady) return;
    try {
      const win = el.previewFrame.contentWindow;
      if (win && win.BTUHubPreview) win.BTUHubPreview.setLogo(dataUrl);
    } catch (err) {}
  }

  function bindPreviewControls() {
    el.previewSizeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        el.previewSizeBtns.forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        el.previewFrameWrap.dataset.size = btn.dataset.size;
      });
    });
  }

  /* =====================================================================
     PUBLISH
     ===================================================================== */

  function bindPublish() {
    el.publishBtn.addEventListener('click', runPublish);
    el.publishBtn2.addEventListener('click', runPublish);
  }

  function renderPublishFileList() {
    const items = [
      { key: 'config', label: 'config.json', changed: dirty.config },
      { key: 'branding', label: 'branding.json', changed: dirty.branding },
      { key: 'logo', label: 'logo.png', changed: dirty.logo },
    ];
    el.publishFileList.innerHTML = items.map(function (item) {
      return '<li class="' + (item.changed ? 'will-change' : '') + '">' +
        '<span class="status-dot"></span>' +
        '<code>' + item.label + '</code>' +
        '<span>' + (item.changed ? '— has unpublished edits' : '— no changes since last publish') + '</span>' +
        '</li>';
    }).join('');
  }

  async function runPublish() {
    if (!dirty.config && !dirty.branding && !dirty.logo) {
      logPublish('Nothing to publish — no changes made yet.', 'pending');
      return;
    }

    el.publishBtn.disabled = true;
    el.publishBtn2.disabled = true;
    el.publishLog.innerHTML = '';

    try {
      if (dirty.config) {
        logPublish('Publishing config.json…', 'pending');
        const cleanForms = state.forms
          .filter(function (f) { return f.title && f.typeOfForm; })
          .map(function (f) {
            return {
              title: f.title.trim(),
              typeOfForm: f.typeOfForm.trim(),
              frequency: (f.frequency || '').trim(),
              link: (f.link || '').trim(),
            };
          });
        const content = JSON.stringify(cleanForms, null, 2) + '\n';
        shas.config = await ghPutFile('config.json', b64EncodeUnicode(content), shas.config, 'Site Editor: update forms');
        dirty.config = false;
        logPublish('config.json published.', 'ok');
      }

      if (dirty.branding) {
        logPublish('Publishing branding.json…', 'pending');
        const brandingOut = {
          _comment: 'Edit this directly, or use admin.html (the Site Editor) to change it visually.',
          appTitle: state.branding.appTitle || 'Supervisor Safety Hub',
          eyebrow: state.branding.eyebrow || '4Refuel · BTU',
          tagline: state.branding.tagline || 'Delivering reliable and sustainable solutions.',
          colors: state.branding.colors,
        };
        const content = JSON.stringify(brandingOut, null, 2) + '\n';
        shas.branding = await ghPutFile('branding.json', b64EncodeUnicode(content), shas.branding, 'Site Editor: update branding');
        dirty.branding = false;
        logPublish('branding.json published.', 'ok');
      }

      if (dirty.logo && pendingLogoBlob) {
        logPublish('Rendering and publishing logo.png…', 'pending');
        const img = await loadImage(pendingLogoBlob.dataUrl);
        const canvas = drawLogoOnCanvas(img, 512, 0.1);
        const blob = await canvasToBlob(canvas);
        const base64 = await blobToBase64(blob);
        shas.logo = await ghPutFile('logo.png', base64, shas.logo, 'Site Editor: update logo');
        dirty.logo = false;
        pendingLogoBlob = null;
        logPublish('logo.png published.', 'ok');
      }

      logPublish('Done — GitHub Pages will republish within about a minute.', 'ok');
      renderPublishFileList();
    } catch (err) {
      console.error(err);
      logPublish(err.message || 'Something went wrong publishing. See the console for details.', 'err');
    } finally {
      el.publishBtn.disabled = false;
      el.publishBtn2.disabled = false;
    }
  }

  function logPublish(msg, kind) {
    const line = document.createElement('div');
    line.className = 'log-line ' + (kind || '');
    line.textContent = msg;
    el.publishLog.appendChild(line);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawLogoOnCanvas(img, size, paddingRatio) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const pad = size * paddingRatio;
    const boxSize = size - pad * 2;
    const scale = Math.min(boxSize / img.width, boxSize / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
  }

})();
