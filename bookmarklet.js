// Full-screen vertical Reels gallery — robust URL extraction + diagnostics
(function(){
  if (document.getElementById('grok-reels-fullscreen')) return;
  const ASSETS_ENDPOINT = 'https://grok.com/rest/assets';
  const WORKSPACE = 'WORKSPACE_KIND_IMAGINE_ALL';
  const PAGE_SIZE = 60;
  let allItems = [], filtered = [], selected = new Set();
  let overlay, grid, searchInput, status, filterSelect, downloadBtn, debugEl;

  function createUI() {
    overlay = document.createElement('div');
    overlay.id = 'grok-reels-fullscreen';
    overlay.innerHTML = `
      <style>
        #grok-reels-fullscreen {
          position: fixed; inset: 0; z-index: 999999;
          background: #0a0a0a; color: #eee;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; flex-direction: column;
        }
        #grok-reels-fullscreen header {
          flex: 0 0 auto; padding: 12px 20px; background: #111;
          border-bottom: 1px solid #2a2a2a; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
        }
        #grok-reels-fullscreen header h2 { margin: 0; font-size: 16px; font-weight: 600; }
        #grok-reels-fullscreen .controls { display: flex; gap: 8px; align-items: center; flex: 1; }
        #grok-reels-fullscreen input, #grok-reels-fullscreen select, #grok-reels-fullscreen button {
          background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 8px;
          padding: 7px 12px; color: #eee; font-size: 13px;
        }
        #grok-reels-fullscreen input { flex: 1; min-width: 160px; }
        #grok-reels-fullscreen button { cursor: pointer; }
        #grok-reels-fullscreen button:disabled { opacity: .4; cursor: default; }
        #grok-reels-fullscreen .close { margin-left: auto; background: transparent; border: none; color: #aaa; font-size: 22px; cursor: pointer; }
        #grok-reels-fullscreen .status { font-size: 12px; color: #aaa; padding: 8px 20px; }
        #grok-reels-fullscreen .debug {
          font-size: 11px; color: #fbbf24; padding: 0 20px 8px; white-space: pre-wrap; word-break: break-all;
          max-height: 120px; overflow: auto; background: #1a1400;
        }
        #grok-reels-fullscreen .grid {
          flex: 1; overflow-y: auto; padding: 16px 20px 40px;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 14px; align-content: start;
        }
        #grok-reels-fullscreen .item {
          aspect-ratio: 9 / 16; border-radius: 12px; overflow: hidden;
          position: relative; background: #161616; cursor: pointer;
        }
        #grok-reels-fullscreen .item.selected { outline: 3px solid #4ade80; outline-offset: -3px; }
        #grok-reels-fullscreen .item img, #grok-reels-fullscreen .item video {
          width: 100%; height: 100%; object-fit: cover;
        }
        #grok-reels-fullscreen .item .prompt {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,.88));
          font-size: 12px; padding: 24px 10px 8px; opacity: 0; transition: opacity .15s;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #grok-reels-fullscreen .item:hover .prompt { opacity: 1; }
        #grok-reels-fullscreen .badge {
          position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.75);
          color: #fff; font-size: 10px; padding: 3px 7px; border-radius: 5px;
        }
        #grok-reels-fullscreen .check {
          position: absolute; top: 8px; left: 8px; width: 20px; height: 20px;
          background: rgba(0,0,0,.55); border: 2px solid #fff; border-radius: 5px;
          display: flex; align-items: center; justify-content: center; font-size: 13px;
        }
        #grok-reels-fullscreen .item.selected .check { background: #4ade80; border-color: #4ade80; color: #000; }
      </style>
      <header>
        <h2>Reels Library</h2>
        <div class="controls">
          <input type="text" placeholder="Search prompts…" id="grb-search">
          <select id="grb-filter"><option value="all">All</option><option value="video">Video</option><option value="image">Image</option></select>
          <button id="grb-download" disabled>Download selected (0)</button>
        </div>
        <button class="close">✕</button>
      </header>
      <div class="status" id="grb-status">Loading…</div>
      <div class="debug" id="grb-debug"></div>
      <div class="grid" id="grb-grid"></div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close').onclick = () => overlay.remove();
    searchInput = document.getElementById('grb-search');
    filterSelect = document.getElementById('grb-filter');
    status = document.getElementById('grb-status');
    debugEl = document.getElementById('grb-debug');
    grid = document.getElementById('grb-grid');
    downloadBtn = document.getElementById('grb-download');
    searchInput.oninput = filterAndRender;
    filterSelect.onchange = filterAndRender;
    downloadBtn.onclick = downloadSelected;
  }

  function setDebug(msg) {
    if (debugEl) debugEl.textContent = msg || '';
  }

  async function tryFetch(body) {
    const res = await fetch(ASSETS_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text: text.slice(0, 800) };
  }

  function extractUrl(item) {
    if (!item || typeof item !== 'object') return '';
    // Direct fields
    const direct = item.url || item.imageUrl || item.videoUrl || item.mediaUrl || item.src || item.href || item.fileUrl || item.assetUrl;
    if (direct && typeof direct === 'string' && direct.startsWith('http')) return direct;
    // Nested common patterns
    if (item.media && typeof item.media === 'object') {
      const m = item.media.url || item.media.src || item.media.href;
      if (m && typeof m === 'string') return m;
    }
    if (item.asset && typeof item.asset === 'object') {
      const a = item.asset.url || item.asset.src;
      if (a && typeof a === 'string') return a;
    }
    // Storage key variants
    const key = item.storageKey || item.key || item.fileKey || item.assetKey || item.storage_key;
    if (key && typeof key === 'string') return `https://assets.grok.com/${key}`;
    return '';
  }

  function isVideo(item, url) {
    if (!url) return false;
    return /\.(mp4|webm|mov|m4v)/i.test(url) || item.type === 'video' || item.mediaType === 'video' || item.kind === 'video' || item.media_type === 'video';
  }

  function getFilename(url, isVid) {
    try {
      const u = new URL(url);
      let name = u.pathname.split('/').pop() || 'grok-media';
      if (!/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)/i.test(name)) name += isVid ? '.mp4' : '.jpg';
      return name;
    } catch { return isVid ? 'grok-video.mp4' : 'grok-image.jpg'; }
  }

  async function loadAll() {
    createUI();
    status.textContent = 'Fetching library…';
    allItems = []; selected.clear();
    setDebug('');

    let result = await tryFetch({ limit: PAGE_SIZE, workspace: WORKSPACE });
    if (!result.ok) {
      setDebug(`Primary ${result.status}: ${result.text}`);
      result = await tryFetch({ limit: PAGE_SIZE });
      if (!result.ok) {
        setDebug(`Fallback ${result.status}: ${result.text}`);
        status.textContent = 'Request failed — see yellow text';
        return;
      }
    }

    const data = result.json || {};
    let items = data.assets || data.items || data.posts || data.results || data.data || [];
    if (!Array.isArray(items)) items = [];

    if (items.length === 0) {
      setDebug('No array found. Top-level keys: ' + Object.keys(data).join(', ') + '\nSnippet: ' + JSON.stringify(data).slice(0, 600));
      status.textContent = 'Empty response';
      return;
    }

    allItems = items;
    // Check how many have extractable URLs
    const withUrl = allItems.filter(it => extractUrl(it)).length;
    if (withUrl === 0) {
      const sample = allItems[0];
      setDebug('Loaded ' + allItems.length + ' items but none have a recognizable URL.\nFirst item keys: ' + Object.keys(sample || {}).join(', ') + '\nFirst item: ' + JSON.stringify(sample).slice(0, 700));
      status.textContent = allItems.length + ' items received, 0 with usable media URL';
    } else {
      setDebug('');
      status.textContent = withUrl + ' of ' + allItems.length + ' items have media';
    }
    filterAndRender();
  }

  function updateDownloadBtn() {
    const n = selected.size;
    downloadBtn.textContent = `Download selected (${n})`;
    downloadBtn.disabled = n === 0;
  }

  function toggleSelect(id, el) {
    if (selected.has(id)) { selected.delete(id); el.classList.remove('selected'); }
    else { selected.add(id); el.classList.add('selected'); }
    updateDownloadBtn();
  }

  async function downloadSelected() {
    if (selected.size === 0) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading…';
    const toDownload = filtered.filter(item => selected.has(item.id || extractUrl(item)));
    for (const item of toDownload) {
      const url = extractUrl(item);
      if (!url) continue;
      const video = isVideo(item, url);
      const filename = getFilename(url, video);
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) continue;
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 150);
        await new Promise(r => setTimeout(r, 200));
      } catch (e) { console.error(e); }
    }
    updateDownloadBtn();
  }

  function filterAndRender() {
    const q = (searchInput.value || '').toLowerCase();
    const mode = filterSelect.value;
    filtered = allItems.filter(item => {
      const url = extractUrl(item);
      if (!url) return false;
      const prompt = (item.prompt || item.text || item.caption || '').toLowerCase();
      if (q && !prompt.includes(q)) return false;
      const video = isVideo(item, url);
      if (mode === 'video' && !video) return false;
      if (mode === 'image' && video) return false;
      return true;
    });
    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    if (filtered.length === 0) {
      status.textContent = (status.textContent.includes('items') ? status.textContent : '0 shown');
      return;
    }
    filtered.slice(0, 300).forEach(item => {
      const url = extractUrl(item);
      if (!url) return;
      const id = item.id || url;
      const div = document.createElement('div');
      div.className = 'item' + (selected.has(id) ? ' selected' : '');
      const video = isVideo(item, url);

      const check = document.createElement('div');
      check.className = 'check';
      check.textContent = selected.has(id) ? '✓' : '';
      div.appendChild(check);

      if (video) {
        const v = document.createElement('video');
        v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
        v.onmouseenter = () => v.play().catch(() => {});
        v.onmouseleave = () => { v.pause(); v.currentTime = 0; };
        div.appendChild(v);
        const b = document.createElement('div'); b.className = 'badge'; b.textContent = 'VIDEO'; div.appendChild(b);
      } else {
        const img = document.createElement('img'); img.src = url; img.loading = 'lazy'; div.appendChild(img);
      }

      const p = document.createElement('div'); p.className = 'prompt'; p.textContent = item.prompt || item.text || item.caption || ''; div.appendChild(p);

      div.onclick = () => toggleSelect(id, div);
      div.ondblclick = (e) => { e.stopPropagation(); window.open(url, '_blank'); };
      grid.appendChild(div);
    });
    status.textContent = filtered.length + ' shown' + (filtered.length < allItems.length ? ' (of ' + allItems.length + ')' : '');
    updateDownloadBtn();
  }

  loadAll();
})();