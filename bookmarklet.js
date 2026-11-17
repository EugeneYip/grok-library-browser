// v3 — same GET the Imagine library uses. Full-screen 9:16 scan.
(function () {
  if (window.__grokReelsLoading && document.getElementById('grok-reels-fullscreen')) return;
  window.__grokReelsLoading = true;
  var old = document.getElementById('grok-reels-fullscreen');
  if (old) old.remove();

  var API = 'https://grok.com/rest/assets';
  var BULK = 'https://grok.com/rest/media/post/bulk-get';
  var CDN = 'https://assets.grok.com/';
  var LIB_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4'];
  var WIDE_MIMES = LIB_MIMES.concat(['image/gif', 'image/avif', 'video/webm', 'video/quicktime']);

  var items = [];
  var byId = {};
  var selected = {};
  var ui = {};
  var playing = 0;
  var io;
  var rendered = 0;

  function qs(spec, token) {
    var p = new URLSearchParams();
    Object.keys(spec).forEach(function (k) {
      var v = spec[k];
      if (v == null || v === '') return;
      if (Array.isArray(v)) v.forEach(function (x) { p.append(k, x); });
      else p.set(k, String(v));
    });
    if (token) p.set('pageToken', token);
    return p.toString();
  }

  function mediaUrl(key) {
    if (!key || typeof key !== 'string') return '';
    if (/^https?:\/\//i.test(key)) return key;
    return CDN + key.split('/').map(encodeURIComponent).join('/') + '?cache=1';
  }

  function kindOf(asset) {
    var mime = String(asset.mimeType || '').toLowerCase();
    var key = String(asset.key || '').toLowerCase();
    if (mime.indexOf('video/') === 0 || /\.(mp4|webm|mov|m4v)(\?|$)/.test(key)) return 'video';
    if (mime.indexOf('image/') === 0 || /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/.test(key)) return 'image';
    var src = String(asset.fileSource || '');
    if (src.indexOf('IMAGINE_GENERATED') >= 0 && asset.previewImageKey) return 'image';
    return '';
  }

  function addAsset(asset) {
    if (!asset || asset.isDeleted || !asset.assetId) return;
    var kind = kindOf(asset);
    var url = mediaUrl(asset.key);
    if (!kind || !url) return;
    if (byId[asset.assetId]) return;
    var item = {
      id: asset.assetId,
      kind: kind,
      url: url,
      poster: mediaUrl(asset.previewImageKey),
      text: asset.summary || asset.name || '',
      time: asset.createTime || asset.lastUseTime || '',
      root: asset.rootAssetId || asset.assetId,
      parentId: '',
      mime: asset.mimeType || ''
    };
    byId[item.id] = item;
    items.push(item);
  }

  async function getJson(url, opts) {
    var res = await fetch(url, opts);
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    return { ok: res.ok, status: res.status, json: json, text: text.slice(0, 220) };
  }

  var FEEDS = [
    { name: 'imagine-library', spec: { pageSize: '40', orderBy: 'ORDER_BY_CREATE_TIME', workspaceKind: 'WORKSPACE_KIND_IMAGINE_ALL', mimeTypes: LIB_MIMES } },
    { name: 'imagine-any-type', spec: { pageSize: '40', orderBy: 'ORDER_BY_CREATE_TIME', workspaceKind: 'WORKSPACE_KIND_IMAGINE_ALL' } },
    { name: 'source-generated', spec: { pageSize: '40', orderBy: 'ORDER_BY_CREATE_TIME', source: 'SOURCE_GENERATED', includeImagineFiles: 'true', mimeTypes: WIDE_MIMES } },
    { name: 'files-with-imagine', spec: { pageSize: '40', orderBy: 'ORDER_BY_LAST_USE_TIME', source: 'SOURCE_ANY', includeImagineFiles: 'true', isLatest: 'true', mimeTypes: WIDE_MIMES } }
  ];

  function setStatus(t) { if (ui.status) ui.status.textContent = t; }
  function setDebug(t) { if (ui.debug) ui.debug.textContent = t || ''; }

  function groups() {
    var q = (ui.search && ui.search.value || '').toLowerCase();
    var mode = ui.filter ? ui.filter.value : 'all';
    var visible = items.filter(function (it) {
      if (mode !== 'all' && it.kind !== mode) return false;
      if (q && (it.text || '').toLowerCase().indexOf(q) === -1 && it.id.indexOf(q) === -1) return false;
      return true;
    });
    var map = {};
    var order = [];
    visible.forEach(function (it) {
      var key = (it.parentId && byId[it.parentId]) ? it.parentId : (it.root || it.id);
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(it);
    });
    order.sort(function (a, b) {
      var ta = (map[a][0] && map[a][0].time) || '';
      var tb = (map[b][0] && map[b][0].time) || '';
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    var multi = [];
    var singles = [];
    order.forEach(function (key) {
      var list = map[key].slice().sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === 'image' ? -1 : 1;
        return a.time < b.time ? 1 : -1;
      });
      if (list.length > 1) multi.push(list);
      else singles.push(list[0]);
    });
    return { multi: multi, singles: singles, shown: visible.length };
  }

  function tile(it) {
    var card = document.createElement('div');
    card.className = 'tile' + (selected[it.id] ? ' on' : '');
    card.dataset.id = it.id;
    var check = document.createElement('div');
    check.className = 'check';
    check.textContent = selected[it.id] ? '\u2713' : '';
    card.appendChild(check);
    if (it.kind === 'video') {
      if (it.poster) {
        var poster = document.createElement('img');
        poster.src = it.poster;
        poster.alt = '';
        card.appendChild(poster);
      }
      var video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      video.dataset.src = it.url;
      if (it.poster) video.poster = it.poster;
      card.appendChild(video);
      var badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = 'VIDEO';
      card.appendChild(badge);
      if (io) io.observe(card);
    } else {
      var img = document.createElement('img');
      img.src = it.url;
      img.alt = it.text || 'image';
      img.loading = 'lazy';
      card.appendChild(img);
    }
    card.onclick = function () {
      if (selected[it.id]) delete selected[it.id];
      else selected[it.id] = 1;
      paintSelect();
    };
    card.ondblclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      window.open(it.url, '_blank');
    };
    return card;
  }

  function paintSelect() {
    var n = Object.keys(selected).length;
    if (ui.download) {
      ui.download.textContent = 'Download selected (' + n + ')';
      ui.download.disabled = n === 0;
    }
    var cards = ui.board.querySelectorAll('.tile');
    for (var i = 0; i < cards.length; i++) {
      var id = cards[i].dataset.id;
      var on = !!selected[id];
      cards[i].classList.toggle('on', on);
      var c = cards[i].querySelector('.check');
      if (c) c.textContent = on ? '\u2713' : '';
    }
  }

  function render() {
    if (!ui.board) return;
    var g = groups();
    ui.board.innerHTML = '';
    g.multi.forEach(function (list) {
      var row = document.createElement('div');
      row.className = 'cycle';
      var label = document.createElement('div');
      label.className = 'cycle-label';
      var when = (list[0].time || '').slice(0, 10);
      var prompt = '';
      for (var i = 0; i < list.length; i++) if (list[i].text) { prompt = list[i].text; break; }
      label.textContent = (when ? when + ' \u00b7 ' : '') + list.length + ' in this cycle' + (prompt ? '\n' + prompt : '');
      row.appendChild(label);
      var strip = document.createElement('div');
      strip.className = 'strip';
      list.forEach(function (it) { strip.appendChild(tile(it)); });
      row.appendChild(strip);
      ui.board.appendChild(row);
    });
    if (g.singles.length) {
      var grid = document.createElement('div');
      grid.className = 'grid';
      g.singles.forEach(function (it) { grid.appendChild(tile(it)); });
      ui.board.appendChild(grid);
    }
    rendered = g.shown;
    if (items.length) {
      var extra = g.multi.length ? (g.multi.length + ' cycles \u00b7 ') : '';
      setStatus('v3 \u00b7 ' + extra + g.shown + (g.shown !== items.length ? ' of ' + items.length : '') + ' shown. Scroll to scan. Click selects. Double-click opens.');
    }
  }

  function bindVideo(card) {
    var video = card.querySelector('video');
    if (!video || video.src) return;
    video.src = video.dataset.src;
    video.preload = 'metadata';
  }

  function watch() {
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target.querySelector('video');
        if (!video) return;
        if (entry.isIntersecting) {
          bindVideo(entry.target);
          if (playing < 6 && video.paused) {
            playing++;
            video.play().catch(function () { playing = Math.max(0, playing - 1); });
          }
        } else if (!video.paused) {
          video.pause();
          playing = Math.max(0, playing - 1);
        }
      });
    }, { root: ui.board, threshold: 0.45 });
  }

  function createUI() {
    var overlay = document.createElement('div');
    overlay.id = 'grok-reels-fullscreen';
    overlay.innerHTML = [
      '<style>',
      '#grok-reels-fullscreen{position:fixed;inset:0;z-index:2147483646;background:#070707;color:#eee;font:13px/1.35 system-ui,-apple-system,sans-serif;display:flex;flex-direction:column}',
      '#grok-reels-fullscreen header{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#111;border-bottom:1px solid #2a2a2a}',
      '#grok-reels-fullscreen h2{margin:0;font-size:15px;white-space:nowrap}',
      '#grok-reels-fullscreen .v{color:#4ade80;font-size:12px;margin-left:6px}',
      '#grok-reels-fullscreen input,#grok-reels-fullscreen select,#grok-reels-fullscreen button{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:7px 10px;color:#eee;font:inherit}',
      '#grok-reels-fullscreen input{flex:1;min-width:120px}',
      '#grok-reels-fullscreen button{cursor:pointer}#grok-reels-fullscreen button:disabled{opacity:.45;cursor:default}',
      '#grok-reels-fullscreen .x{margin-left:auto;background:transparent;border:none;color:#aaa;font-size:22px;cursor:pointer}',
      '#grok-reels-fullscreen .status{padding:6px 14px 0;color:#aaa;font-size:12px}',
      '#grok-reels-fullscreen .debug{display:none;margin:6px 14px;padding:8px;background:#3a2a05;color:#fbbf24;border-radius:8px;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow:auto;font-size:11px}',
      '#grok-reels-fullscreen .debug.on{display:block}',
      '#grok-reels-fullscreen .board{flex:1;overflow:auto;padding:12px 14px 48px}',
      '#grok-reels-fullscreen .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;align-content:start}',
      '#grok-reels-fullscreen .cycle{display:flex;gap:10px;align-items:stretch;margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid #222}',
      '#grok-reels-fullscreen .cycle-label{flex:0 0 148px;color:#bbb;font-size:12px;white-space:pre-wrap;overflow:hidden}',
      '#grok-reels-fullscreen .strip{display:flex;gap:10px;overflow-x:auto;flex:1}',
      '#grok-reels-fullscreen .tile{position:relative;aspect-ratio:9/16;width:100%;border-radius:10px;overflow:hidden;background:#141414;cursor:pointer}',
      '#grok-reels-fullscreen .strip .tile{width:148px;flex:0 0 148px}',
      '#grok-reels-fullscreen .tile.on{outline:3px solid #4ade80;outline-offset:-3px}',
      '#grok-reels-fullscreen .tile img,#grok-reels-fullscreen .tile video{width:100%;height:100%;object-fit:cover;display:block;background:#000}',
      '#grok-reels-fullscreen .badge{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);font-size:10px;font-weight:700;padding:2px 5px;border-radius:4px}',
      '#grok-reels-fullscreen .check{position:absolute;top:6px;left:6px;width:18px;height:18px;border:2px solid #fff;border-radius:4px;background:rgba(0,0,0,.4);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}',
      '#grok-reels-fullscreen .tile.on .check{background:#4ade80;border-color:#4ade80;color:#041}',
      '</style>',
      '<header><h2>Reels Library <span class="v">v3</span></h2>',
      '<input id="grb-search" placeholder="Filter by name or prompt">',
      '<select id="grb-filter"><option value="all">All</option><option value="video">Video</option><option value="image">Image</option></select>',
      '<button id="grb-dl" type="button" disabled>Download selected (0)</button>',
      '<button class="x" type="button">\u00d7</button></header>',
      '<div class="status" id="grb-status">v3 \u00b7 loading your Imagine library\u2026</div>',
      '<div class="debug" id="grb-debug"></div>',
      '<div class="board" id="grb-board"></div>'
    ].join('');
    document.body.appendChild(overlay);
    ui.board = overlay.querySelector('#grb-board');
    ui.status = overlay.querySelector('#grb-status');
    ui.debug = overlay.querySelector('#grb-debug');
    ui.search = overlay.querySelector('#grb-search');
    ui.filter = overlay.querySelector('#grb-filter');
    ui.download = overlay.querySelector('#grb-dl');
    overlay.querySelector('.x').onclick = function () {
      window.__grokReelsLoading = false;
      overlay.remove();
    };
    ui.search.oninput = render;
    ui.filter.onchange = render;
    ui.download.onclick = downloadSelected;
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') {
        window.__grokReelsLoading = false;
        overlay.remove();
        document.removeEventListener('keydown', esc);
      }
    });
    watch();
  }

  async function walk(feed) {
    var token = '';
    var pages = 0;
    var raw = 0;
    var before = items.length;
    do {
      var url = API + '?' + qs(feed.spec, token);
      var page = await getJson(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
      if (!page.ok) return { ok: false, note: feed.name + ' HTTP ' + page.status + ' ' + page.text };
      var assets = page.json && Array.isArray(page.json.assets) ? page.json.assets : null;
      if (!assets) {
        var keys = page.json && typeof page.json === 'object' ? Object.keys(page.json).join(', ') : 'not-json';
        return { ok: false, note: feed.name + ' was not a list. keys: ' + keys + ' ' + page.text };
      }
      raw += assets.length;
      assets.forEach(addAsset);
      if (items.length !== rendered) render();
      setStatus('v3 \u00b7 ' + feed.name + ' \u00b7 ' + items.length + ' media');
      token = (page.json && page.json.nextPageToken) || '';
      pages++;
      if (pages >= 80) break;
    } while (token);
    return { ok: true, raw: raw, added: items.length - before, pages: pages, capped: pages >= 80 && !!token };
  }

  async function linkCycles() {
    var ids = items.map(function (it) { return it.id; });
    var linked = 0;
    for (var i = 0; i < ids.length; i += 80) {
      var batch = ids.slice(i, i + 80);
      var page;
      try {
        page = await getJson(BULK, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch })
        });
      } catch (e) { break; }
      if (!page.ok || !page.json) break;
      var posts = page.json.posts || page.json.mediaPosts || [];
      if (!Array.isArray(posts)) break;
      posts.forEach(function (p) {
        var id = p.id || p.postId;
        var item = id && byId[id];
        if (!item) return;
        if (p.originalPostId && p.originalPostId !== id) { item.parentId = p.originalPostId; linked++; }
        var prompt = p.prompt || p.originalPrompt || '';
        if (prompt) item.text = prompt;
        if (!item.poster && p.thumbnailImageUrl) item.poster = p.thumbnailImageUrl;
      });
    }
    if (linked) render();
  }

  function filename(it) {
    var base = (it.text || 'grok').replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'grok';
    var id = String(it.id).slice(0, 8);
    if (it.kind === 'video') return base + '-' + id + '.mp4';
    if ((it.mime || '').indexOf('png') >= 0) return base + '-' + id + '.png';
    if ((it.mime || '').indexOf('webp') >= 0) return base + '-' + id + '.webp';
    return base + '-' + id + '.jpg';
  }

  async function downloadSelected() {
    var list = items.filter(function (it) { return selected[it.id]; });
    if (!list.length) return;
    ui.download.disabled = true;
    for (var i = 0; i < list.length; i++) {
      ui.download.textContent = 'Saving ' + (i + 1) + '/' + list.length;
      try {
        var res = await fetch(list[i].url, { credentials: 'include' });
        if (!res.ok) continue;
        var blob = await res.blob();
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename(list[i]);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function (href) { return function () { URL.revokeObjectURL(href); }; }(a.href), 1500);
        await new Promise(function (r) { setTimeout(r, 400); });
      } catch (e) {}
    }
    paintSelect();
    setStatus('v3 \u00b7 if Safari saved only one file, allow multiple downloads for grok.com (Safari \u2192 Settings \u2192 Websites \u2192 Downloads).');
  }

  async function main() {
    createUI();
    var notes = [];
    var used = '';
    for (var i = 0; i < FEEDS.length; i++) {
      if (items.length) break;
      var result = await walk(FEEDS[i]);
      notes.push(result.note || (FEEDS[i].name + ' raw ' + result.raw + ' kept ' + result.added));
      if (result.ok && items.length) {
        used = FEEDS[i].name;
        if (result.capped) notes.push('stopped after 80 pages');
        break;
      }
    }
    if (!items.length) {
      setStatus('v3 \u00b7 no images or videos came back.');
      ui.debug.className = 'debug on';
      setDebug(notes.filter(Boolean).join('\n'));
      window.__grokReelsLoading = false;
      return;
    }
    setDebug('');
    ui.debug.className = 'debug';
    render();
    setStatus('v3 \u00b7 ' + items.length + ' media via ' + used + '. Linking image + video cycles\u2026');
    try { await linkCycles(); } catch (e) {}
    render();
    window.__grokReelsLoading = false;
  }

  main().catch(function (err) {
    window.__grokReelsLoading = false;
    setStatus('v3 \u00b7 failed');
    if (ui.debug) { ui.debug.className = 'debug on'; setDebug(String(err && err.message || err)); }
  });
})();
