// v2 — GET /rest/assets list (not POST). Full-screen 9:16 gallery.
(function () {
  if (document.getElementById('grok-reels-fullscreen')) return;

  const API = 'https://grok.com/rest/assets';
  const CDN = 'https://assets.grok.com/';
  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

  const allItems = [];
  const seen = new Set();
  const selected = new Set();
  let filtered = [];
  let overlay, grid, searchInput, statusEl, filterSelect, downloadBtn, debugEl;
  let playing = 0;

  function createUI() {
    overlay = document.createElement('div');
    overlay.id = 'grok-reels-fullscreen';
    overlay.innerHTML = [
      '<style>',
      '#grok-reels-fullscreen{position:fixed;inset:0;z-index:2147483646;background:#0a0a0a;color:#eee;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column}',
      '#grok-reels-fullscreen header{flex:0 0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:#111;border-bottom:1px solid #2a2a2a}',
      '#grok-reels-fullscreen h2{margin:0;font-size:15px;font-weight:650}',
      '#grok-reels-fullscreen .ver{font-size:11px;color:#888;margin-left:4px}',
      '#grok-reels-fullscreen .controls{display:flex;gap:8px;align-items:center;flex:1}',
      '#grok-reels-fullscreen input,#grok-reels-fullscreen select,#grok-reels-fullscreen button{background:#1a1a1a;border:1px solid #3a3a3a;border-radius:8px;padding:7px 12px;color:#eee;font-size:13px}',
      '#grok-reels-fullscreen input{flex:1;min-width:140px}',
      '#grok-reels-fullscreen button{cursor:pointer}',
      '#grok-reels-fullscreen button:disabled{opacity:.4;cursor:default}',
      '#grok-reels-fullscreen .close{margin-left:auto;background:transparent;border:none;color:#aaa;font-size:22px;cursor:pointer}',
      '#grok-reels-fullscreen .status{font-size:12px;color:#aaa;padding:6px 16px 0}',
      '#grok-reels-fullscreen .debug{font-size:11px;color:#fbbf24;padding:4px 16px 6px;white-space:pre-wrap;word-break:break-all;max-height:72px;overflow:auto}',
      '#grok-reels-fullscreen .grid{flex:1;overflow-y:auto;padding:14px 16px 48px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;align-content:start}',
      '#grok-reels-fullscreen .item{aspect-ratio:9/16;border-radius:12px;overflow:hidden;position:relative;background:#141414;cursor:pointer}',
      '#grok-reels-fullscreen .item.selected{outline:3px solid #4ade80;outline-offset:-3px}',
      '#grok-reels-fullscreen .item img,#grok-reels-fullscreen .item video{width:100%;height:100%;object-fit:cover;display:block;background:#000}',
      '#grok-reels-fullscreen .item .cap{position:absolute;left:0;right:0;bottom:0;padding:22px 8px 7px;font-size:11px;background:linear-gradient(transparent,rgba(0,0,0,.85));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0}',
      '#grok-reels-fullscreen .item:hover .cap{opacity:1}',
      '#grok-reels-fullscreen .badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.72);color:#fff;font-size:10px;font-weight:700;padding:3px 6px;border-radius:5px}',
      '#grok-reels-fullscreen .check{position:absolute;top:8px;left:8px;width:20px;height:20px;border:2px solid #fff;border-radius:5px;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}',
      '#grok-reels-fullscreen .item.selected .check{background:#4ade80;border-color:#4ade80;color:#000}',
      '</style>',
      '<header><h2>Reels Library<span class="ver">v2</span></h2>',
      '<div class="controls">',
      '<input id="grb-search" type="text" placeholder="Search name or summary">',
      '<select id="grb-filter"><option value="all">All</option><option value="video">Video</option><option value="image">Image</option></select>',
      '<button id="grb-download" disabled>Download selected (0)</button>',
      '</div><button class="close" type="button">\u2715</button></header>',
      '<div class="status" id="grb-status">Loading library\u2026</div>',
      '<div class="debug" id="grb-debug"></div>',
      '<div class="grid" id="grb-grid"></div>'
    ].join('');
    document.body.appendChild(overlay);
    overlay.querySelector('.close').onclick = function () { overlay.remove(); };
    searchInput = document.getElementById('grb-search');
    filterSelect = document.getElementById('grb-filter');
    statusEl = document.getElementById('grb-status');
    debugEl = document.getElementById('grb-debug');
    grid = document.getElementById('grb-grid');
    downloadBtn = document.getElementById('grb-download');
    searchInput.oninput = applyFilter;
    filterSelect.onchange = applyFilter;
    downloadBtn.onclick = downloadSelected;
  }

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }
  function setDebug(t) { if (debugEl) debugEl.textContent = t || ''; }

  function mediaUrl(key) {
    if (!key || typeof key !== 'string') return '';
    if (key.indexOf('http') === 0) return key;
    return CDN + key.replace(/^\//, '') + '?cache=1';
  }

  function kindOf(asset) {
    const mime = String(asset.mimeType || '').toLowerCase();
    const key = String(asset.key || '').toLowerCase();
    if (mime.indexOf('video/') === 0 || /\.(mp4|webm|mov|m4v)$/.test(key)) return 'video';
    if (mime.indexOf('image/') === 0 || /\.(jpg|jpeg|png|webp|gif|avif)$/.test(key)) return 'image';
    return '';
  }

  function normalize(asset) {
    const kind = kindOf(asset);
    return {
      id: asset.assetId || asset.key,
      kind: kind,
      url: mediaUrl(asset.key),
      poster: mediaUrl(asset.previewImageKey),
      text: asset.summary || asset.name || '',
      mime: asset.mimeType || ''
    };
  }

  async function getPage(params) {
    const res = await fetch(API + '?' + params.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    return { ok: res.ok, status: res.status, json: json, text: text.slice(0, 280) };
  }

  function baseParams(mode) {
    const p = new URLSearchParams();
    p.set('pageSize', '60');
    p.set('orderBy', 'ORDER_BY_CREATE_TIME');
    p.set('includeImagineFiles', 'true');
    if (mode === 'media') {
      IMAGE_MIMES.concat(VIDEO_MIMES).forEach(function (m) { p.append('mimeTypes', m); });
      p.set('source', 'SOURCE_ANY');
    } else {
      p.set('workspaceKind', 'WORKSPACE_KIND_IMAGINE_ALL');
    }
    return p;
  }

  function takeAssets(json) {
    if (!json) return null;
    if (Array.isArray(json.assets)) return json.assets;
    if (Array.isArray(json)) return json;
    return null;
  }

  function addAssets(list) {
    let added = 0;
    list.forEach(function (asset) {
      if (!asset || asset.isDeleted) return;
      const item = normalize(asset);
      if (!item.kind || !item.url || !item.id) return;
      if (seen.has(item.id)) return;
      seen.add(item.id);
      allItems.push(item);
      added++;
    });
    return added;
  }

  async function walk(mode) {
    let token = '';
    let pages = 0;
    let last = '';
    do {
      const params = baseParams(mode);
      if (token) params.set('pageToken', token);
      const page = await getPage(params);
      if (!page.ok) {
        last = mode + ' HTTP ' + page.status + ' ' + page.text;
        break;
      }
      const assets = takeAssets(page.json);
      if (!assets) {
        last = mode + ' unexpected keys: ' + Object.keys(page.json || {}).join(', ') + ' ' + page.text;
        break;
      }
      addAssets(assets);
      applyFilter();
      setStatus('Loaded ' + allItems.length + ' media\u2026');
      token = (page.json && (page.json.nextPageToken || page.json.next_page_token)) || '';
      pages++;
      if (pages >= 40) break;
    } while (token);
    return last;
  }

  async function loadAll() {
    createUI();
    setStatus('Loading library\u2026');
    const errA = await walk('media');
    const errB = allItems.length < 5 ? await walk('imagine') : '';
    if (!allItems.length) {
      setStatus('No image or video assets returned');
      setDebug([errA, errB].filter(Boolean).join('\n') || 'Both feeds returned zero media rows.');
      return;
    }
    setDebug('');
    setStatus(allItems.length + ' items. Scroll to scan. Click to select, double-click to open.');
    applyFilter();
  }

  function applyFilter() {
    const q = (searchInput.value || '').toLowerCase();
    const mode = filterSelect.value;
    filtered = allItems.filter(function (item) {
      if (mode !== 'all' && item.kind !== mode) return false;
      if (q && (item.text || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    filtered.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'item' + (selected.has(item.id) ? ' selected' : '');
      const check = document.createElement('div');
      check.className = 'check';
      check.textContent = selected.has(item.id) ? '\u2713' : '';
      card.appendChild(check);

      if (item.kind === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        if (item.poster) video.poster = item.poster;
        card.appendChild(video);
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = 'VIDEO';
        card.appendChild(badge);
        observe(video);
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.text || 'image';
        img.loading = 'lazy';
        card.appendChild(img);
      }

      if (item.text) {
        const cap = document.createElement('div');
        cap.className = 'cap';
        cap.textContent = item.text;
        card.appendChild(cap);
      }

      card.onclick = function () {
        if (selected.has(item.id)) {
          selected.delete(item.id);
          card.classList.remove('selected');
          check.textContent = '';
        } else {
          selected.add(item.id);
          card.classList.add('selected');
          check.textContent = '\u2713';
        }
        const n = selected.size;
        downloadBtn.textContent = 'Download selected (' + n + ')';
        downloadBtn.disabled = n === 0;
      };
      card.ondblclick = function (event) {
        event.stopPropagation();
        window.open(item.url, '_blank');
      };
      grid.appendChild(card);
    });
    if (filtered.length) {
      setStatus(filtered.length + ' shown' + (filtered.length < allItems.length ? ' of ' + allItems.length : '') + '. Videos play as you scroll.');
    }
  }

  function observe(video) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && playing < 4) {
          playing++;
          video.play().catch(function () { playing = Math.max(0, playing - 1); });
        } else if (!entry.isIntersecting) {
          if (!video.paused) playing = Math.max(0, playing - 1);
          video.pause();
        }
      });
    }, { root: grid, threshold: 0.6 });
    io.observe(video);
  }

  function filenameFor(item) {
    const id = String(item.id || 'grok').slice(0, 12);
    if (item.kind === 'video') return 'grok-' + id + '.mp4';
    if ((item.mime || '').indexOf('png') >= 0) return 'grok-' + id + '.png';
    if ((item.mime || '').indexOf('webp') >= 0) return 'grok-' + id + '.webp';
    return 'grok-' + id + '.jpg';
  }

  async function downloadSelected() {
    const items = filtered.filter(function (item) { return selected.has(item.id); });
    if (!items.length) return;
    downloadBtn.disabled = true;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      downloadBtn.textContent = 'Downloading ' + (i + 1) + '/' + items.length;
      try {
        const res = await fetch(item.url, { credentials: 'include' });
        if (!res.ok) continue;
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filenameFor(item);
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        await new Promise(function (r) { setTimeout(r, 350); });
      } catch (e) {}
    }
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download selected (' + selected.size + ')';
  }

  loadAll();
})();
