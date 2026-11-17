// Bookmarklet source — minify or use the ready-to-drag version on the install page
(function(){
  if (document.getElementById('grok-reels-browser')) return;
  const ASSETS_ENDPOINT = 'https://grok.com/rest/assets';
  const WORKSPACE = 'WORKSPACE_KIND_IMAGINE_ALL';
  const PAGE_SIZE = 60;
  let allItems = [], filtered = [];
  let panel, grid, searchInput, status, filterSelect;

  function createUI() {
    panel = document.createElement('div');
    panel.id = 'grok-reels-browser';
    panel.innerHTML = `
      <style>
        #grok-reels-browser { position:fixed; top:40px; right:16px; width:380px; max-height:90vh; background:#0e0e0e; border:1px solid #333; border-radius:14px; z-index:999999; color:#eee; font-family:system-ui,-apple-system,sans-serif; box-shadow:0 12px 40px rgba(0,0,0,.7); display:flex; flex-direction:column; }
        #grok-reels-browser header { padding:14px 16px; border-bottom:1px solid #2a2a2a; display:flex; justify-content:space-between; align-items:center; }
        #grok-reels-browser header h3 { margin:0; font-size:15px; font-weight:600; }
        #grok-reels-browser .close { cursor:pointer; opacity:.6; font-size:18px; }
        #grok-reels-browser .controls { padding:10px 16px; display:flex; gap:8px; align-items:center; }
        #grok-reels-browser input, #grok-reels-browser select { background:#1a1a1a; border:1px solid #3a3a3a; border-radius:8px; padding:7px 10px; color:#eee; font-size:13px; }
        #grok-reels-browser input { flex:1; }
        #grok-reels-browser select { width:90px; }
        #grok-reels-browser .status { font-size:11px; color:#888; padding:0 16px 6px; }
        #grok-reels-browser .grid { overflow-y:auto; padding:10px; display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
        #grok-reels-browser .item { aspect-ratio:9/16; border-radius:10px; overflow:hidden; position:relative; background:#1a1a1a; cursor:pointer; }
        #grok-reels-browser .item img, #grok-reels-browser .item video { width:100%; height:100%; object-fit:cover; }
        #grok-reels-browser .item .prompt { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.9)); font-size:11px; padding:20px 8px 6px; opacity:0; transition:opacity .2s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #grok-reels-browser .item:hover .prompt { opacity:1; }
        #grok-reels-browser .badge { position:absolute; top:6px; right:6px; background:rgba(0,0,0,.7); color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; }
      </style>
      <header><h3>Reels Library</h3><span class="close">✕</span></header>
      <div class="controls">
        <input type="text" placeholder="Search prompts…" id="grb-search">
        <select id="grb-filter"><option value="all">All</option><option value="video">Video</option><option value="image">Image</option></select>
      </div>
      <div class="status" id="grb-status">Loading…</div>
      <div class="grid" id="grb-grid"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.close').onclick = () => panel.remove();
    searchInput = document.getElementById('grb-search');
    filterSelect = document.getElementById('grb-filter');
    status = document.getElementById('grb-status');
    grid = document.getElementById('grb-grid');
    searchInput.oninput = filterAndRender;
    filterSelect.onchange = filterAndRender;
  }

  async function fetchPage(cursor) {
    const body = { limit: PAGE_SIZE, workspace: WORKSPACE };
    if (cursor) body.cursor = cursor;
    const res = await fetch(ASSETS_ENDPOINT, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  async function loadAll() {
    createUI();
    status.textContent = 'Fetching library…';
    allItems = [];
    let cursor = null, pages = 0;
    try {
      do {
        const data = await fetchPage(cursor);
        const items = data.assets || data.items || data.posts || [];
        allItems.push(...items);
        cursor = data.nextCursor || data.cursor;
        pages++;
        status.textContent = `Loaded ${allItems.length}…`;
        if (pages > 40) break;
      } while (cursor);
    } catch(e) {
      status.textContent = 'Could not load (check login)';
      console.error(e);
      return;
    }
    status.textContent = `${allItems.length} items`;
    filterAndRender();
  }

  function getUrl(item) {
    return item.url || item.imageUrl || item.videoUrl || (item.storageKey ? `https://assets.grok.com/${item.storageKey}` : '');
  }
  function isVideo(item, url) {
    return /\.(mp4|webm|mov|m4v)/i.test(url) || item.type === 'video' || item.mediaType === 'video';
  }

  function filterAndRender() {
    const q = (searchInput.value || '').toLowerCase();
    const mode = filterSelect.value;
    filtered = allItems.filter(item => {
      const url = getUrl(item);
      if (!url) return false;
      const prompt = (item.prompt || item.text || '').toLowerCase();
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
    filtered.slice(0, 180).forEach(item => {
      const url = getUrl(item);
      if (!url) return;
      const div = document.createElement('div');
      div.className = 'item';
      const video = isVideo(item, url);
      if (video) {
        const v = document.createElement('video');
        v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
        v.onmouseenter = () => v.play().catch(()=>{});
        v.onmouseleave = () => { v.pause(); v.currentTime = 0; };
        div.appendChild(v);
        const b = document.createElement('div'); b.className = 'badge'; b.textContent = 'VIDEO'; div.appendChild(b);
      } else {
        const img = document.createElement('img'); img.src = url; img.loading = 'lazy'; div.appendChild(img);
      }
      const p = document.createElement('div'); p.className = 'prompt'; p.textContent = item.prompt || item.text || ''; div.appendChild(p);
      div.onclick = () => window.open(url, '_blank');
      grid.appendChild(div);
    });
    status.textContent = `${filtered.length} shown` + (filtered.length < allItems.length ? ` (of ${allItems.length})` : '');
  }

  loadAll();
})();