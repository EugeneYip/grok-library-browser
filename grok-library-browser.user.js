// ==UserScript==
// @name         Grok Library Browser
// @namespace    https://github.com/EugeneYip/grok-library-browser
// @version      1.0.0
// @description  Cleaner grid + search for your Grok generated images and videos
// @match        https://grok.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ASSETS_ENDPOINT = 'https://grok.com/rest/assets';
  const WORKSPACE = 'WORKSPACE_KIND_IMAGINE_ALL';
  const PAGE_SIZE = 60;

  let allItems = [];
  let filtered = [];
  let panel, grid, searchInput, status;

  function createUI() {
    if (document.getElementById('grok-lib-browser')) return;

    panel = document.createElement('div');
    panel.id = 'grok-lib-browser';
    panel.innerHTML = `
      <style>
        #grok-lib-browser {
          position: fixed; top: 60px; right: 20px; width: 420px; max-height: 80vh;
          background: #111; border: 1px solid #333; border-radius: 12px;
          z-index: 99999; color: #eee; font-family: system-ui, sans-serif;
          box-shadow: 0 8px 32px rgba(0,0,0,.6); display: flex; flex-direction: column;
        }
        #grok-lib-browser header {
          padding: 12px 16px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;
        }
        #grok-lib-browser header h3 { margin: 0; font-size: 15px; }
        #grok-lib-browser .close { cursor: pointer; opacity: .7; }
        #grok-lib-browser .controls { padding: 10px 16px; display: flex; gap: 8px; }
        #grok-lib-browser input {
          flex: 1; background: #222; border: 1px solid #444; border-radius: 6px;
          padding: 6px 10px; color: #eee; font-size: 13px;
        }
        #grok-lib-browser .status { font-size: 11px; color: #888; padding: 0 16px 8px; }
        #grok-lib-browser .grid {
          overflow-y: auto; padding: 8px; display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px;
        }
        #grok-lib-browser .item {
          aspect-ratio: 1; border-radius: 8px; overflow: hidden; position: relative;
          background: #222; cursor: pointer;
        }
        #grok-lib-browser .item img, #grok-lib-browser .item video {
          width: 100%; height: 100%; object-fit: cover;
        }
        #grok-lib-browser .item .prompt {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,.85));
          font-size: 10px; padding: 16px 6px 4px; opacity: 0; transition: opacity .2s;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #grok-lib-browser .item:hover .prompt { opacity: 1; }
      </style>
      <header>
        <h3>Grok Library</h3>
        <span class="close">✕</span>
      </header>
      <div class="controls">
        <input type="text" placeholder="Search prompts…" id="glb-search">
      </div>
      <div class="status" id="glb-status">Loading…</div>
      <div class="grid" id="glb-grid"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.close').onclick = () => panel.style.display = 'none';
    searchInput = document.getElementById('glb-search');
    status = document.getElementById('glb-status');
    grid = document.getElementById('glb-grid');

    searchInput.oninput = () => filterAndRender();
  }

  async function fetchPage(cursor = null) {
    const body = {
      limit: PAGE_SIZE,
      workspace: WORKSPACE,
    };
    if (cursor) body.cursor = cursor;

    const res = await fetch(ASSETS_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  async function loadAll() {
    createUI();
    status.textContent = 'Fetching library…';
    allItems = [];
    let cursor = null;
    let pages = 0;

    try {
      do {
        const data = await fetchPage(cursor);
        const items = data.assets || data.items || data.posts || [];
        allItems.push(...items);
        cursor = data.nextCursor || data.cursor;
        pages++;
        status.textContent = `Loaded ${allItems.length} items…`;
        if (pages > 50) break; // safety
      } while (cursor);
    } catch (e) {
      status.textContent = 'Could not load (try refreshing or check login)';
      console.error(e);
      return;
    }

    status.textContent = `${allItems.length} items`;
    filterAndRender();
  }

  function filterAndRender() {
    const q = (searchInput.value || '').toLowerCase();
    filtered = allItems.filter(item => {
      const prompt = (item.prompt || item.text || '').toLowerCase();
      return !q || prompt.includes(q);
    });
    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    filtered.slice(0, 200).forEach(item => {
      const url = item.url || item.imageUrl || item.videoUrl ||
                  (item.storageKey ? `https://assets.grok.com/${item.storageKey}` : '');
      if (!url) return;

      const div = document.createElement('div');
      div.className = 'item';
      const isVideo = /\.(mp4|webm|mov)/i.test(url) || item.type === 'video';

      if (isVideo) {
        const v = document.createElement('video');
        v.src = url;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.onmouseenter = () => v.play();
        v.onmouseleave = () => { v.pause(); v.currentTime = 0; };
        div.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        div.appendChild(img);
      }

      const promptEl = document.createElement('div');
      promptEl.className = 'prompt';
      promptEl.textContent = item.prompt || item.text || '';
      div.appendChild(promptEl);

      div.onclick = () => window.open(url, '_blank');
      grid.appendChild(div);
    });
  }

  // Auto-start when on library or imagine pages
  if (location.pathname.includes('/library') || location.pathname.includes('/imagine')) {
    setTimeout(loadAll, 1500);
  }

  // Also add a small launcher button
  const btn = document.createElement('button');
  btn.textContent = 'Library Browser';
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99998;padding:8px 12px;background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:8px;cursor:pointer;font-size:13px;';
  btn.onclick = () => {
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    else loadAll();
  };
  document.body.appendChild(btn);
})();
