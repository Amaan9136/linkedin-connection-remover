if (!window.__lcrLoaded) {
  window.__lcrLoaded = true;
  const LCR = (() => {
    let connections = [];
    let selected = new Set();
    let removing = false;
    let searchQuery = '';
    let filterType = 'all';
    let sortType = 'name';
    let domObserver = null;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const log = (...args) => console.log('[LCR]', ...args);
    const filtered = () => {
      let list = !searchQuery ? connections : connections.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.headline.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (filterType === 'no-headline') list = list.filter(c => !c.headline);
      if (filterType === 'has-headline') list = list.filter(c => !!c.headline);
      if (sortType === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      if (sortType === 'name-desc') list = [...list].sort((a, b) => b.name.localeCompare(a.name));
      return list;
    };
    const scrapeFromCards = cards => {
      const results = [];
      cards.forEach((card, i) => {
        const profileLink = card.querySelector('a[href*="/in/"]');
        if (!profileLink) return;
        const href = profileLink.getAttribute('href') || '';
        const vanity = href.split('/in/')?.[1]?.replace(/[\/?#].*/, '').trim();
        if (!vanity) return;
        const nameEl = card.querySelector('p.d881224f') || card.querySelector('p[class*="d881224f"]');
        const headlineEl = card.querySelector('p.a1764846') || card.querySelector('p[class*="a1764846"]');
        const imgEl = card.querySelector('figure img[src*="licdn"]') || card.querySelector('img[alt*="profile picture"]');
        const name = nameEl?.textContent?.trim() || '';
        if (!name) { log(`Card ${i}: no name, skip`); return; }
        const headline = headlineEl?.textContent?.trim() || '';
        const avatar = imgEl?.src || null;
        log(`Card ${i}: vanity=${vanity} name="${name}" headline="${headline.slice(0, 30)}"`);
        results.push({ id: vanity, name, headline, avatar, element: card });
      });
      log('Scraped total:', results.length);
      return results;
    };
    const scrapeConnections = () => {
      const cards = document.querySelectorAll('div[data-component-type="LazyColumn"] > div > div[componentkey], div[data-testid="lazy-column"] > div > div[componentkey]');
      log('LazyColumn cards:', cards.length);
      if (cards.length) return scrapeFromCards(cards);
      const fallback = document.querySelectorAll('div.a0a492ad._4f7e3cb1');
      log('Fallback cards:', fallback.length);
      return scrapeFromCards(fallback);
    };
    const renderList = () => {
      const list = document.getElementById('lcr-list');
      if (!list) return;
      const items = filtered();
      if (!items.length) {
        list.innerHTML = '<div id="lcr-empty">No connections found</div>';
        updateStats();
        return;
      }
      list.innerHTML = items.map(c => `
        <div class="lcr-item${selected.has(c.id) ? ' lcr-selected' : ''}" data-id="${c.id}">
          <div class="lcr-checkbox"><span class="lcr-check-icon">✓</span></div>
          ${c.avatar ? `<img class="lcr-avatar" src="${c.avatar}" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'">` : ''}
          <div class="lcr-avatar-placeholder" style="${c.avatar ? 'display:none' : ''}">${c.name[0] || '?'}</div>
          <div class="lcr-info">
            <div class="lcr-name">${c.name}</div>
            ${c.headline ? `<div class="lcr-headline">${c.headline}</div>` : '<div class="lcr-headline lcr-no-headline">No headline</div>'}
          </div>
        </div>`).join('');
      list.querySelectorAll('.lcr-item').forEach(el => el.addEventListener('click', () => toggleSelect(el.dataset.id)));
      updateStats();
    };
    const updateStats = () => {
      const statsEl = document.getElementById('lcr-stats');
      const btn = document.getElementById('lcr-remove-btn');
      const selBtn = document.getElementById('lcr-select-all-btn');
      const f = filtered();
      if (statsEl) statsEl.innerHTML = `<span>${connections.length}</span> loaded &nbsp;·&nbsp; <span>${f.length}</span> shown &nbsp;·&nbsp; <span>${selected.size}</span> selected`;
      if (btn) {
        btn.textContent = selected.size ? `Remove ${selected.size} Connection${selected.size > 1 ? 's' : ''}` : 'Remove Selected';
        btn.disabled = !selected.size || removing;
      }
      if (selBtn) {
        const allSelected = f.length > 0 && f.every(c => selected.has(c.id));
        selBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
      }
    };
    const toggleSelect = id => {
      selected.has(id) ? selected.delete(id) : selected.add(id);
      const item = document.querySelector(`.lcr-item[data-id="${id}"]`);
      if (item) item.classList.toggle('lcr-selected', selected.has(id));
      updateStats();
    };
    const toggleSelectAll = () => {
      const f = filtered();
      const allSelected = f.every(c => selected.has(c.id));
      f.forEach(c => allSelected ? selected.delete(c.id) : selected.add(c.id));
      renderList();
    };
    const waitForElement = (selector, timeout = 2000) => new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
    const removeViaApi = async vanityName => {
      log('API remove:', vanityName);
      const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)/)?.[1] || '';
      const parentSpanId = btoa(Math.random().toString(36).slice(2)).slice(0, 12);
      const url = `https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=com.linkedin.sdui.mynetwork.RemoveConnectionVanityName&parentSpanId=${encodeURIComponent(parentSpanId)}`;
      const payload = { disconnectVanityName: vanityName, closeCurrentMenuOnCompletion: true };
      const argBlock = {
        '$type': 'proto.sdui.actions.requests.RequestedArguments',
        payload,
        requestedStateKeys: [],
        requestMetadata: { '$type': 'proto.sdui.common.RequestMetadata' }
      };
      const resp = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'csrf-token': csrfToken,
          'x-restli-protocol-version': '2.0.0',
          'x-li-page-instance': 'urn:li:page:d_flagship3_mynetwork_connections',
          'x-li-track': JSON.stringify({ clientVersion: '1.13', osName: 'web' })
        },
        body: JSON.stringify({
          requestId: 'com.linkedin.sdui.mynetwork.RemoveConnectionVanityName',
          serverRequest: { requestId: 'com.linkedin.sdui.mynetwork.RemoveConnectionVanityName', requestedArguments: argBlock, isStreaming: false, rumPageKey: '', isApfcEnabled: false },
          states: [],
          requestedArguments: { ...argBlock, states: [], screenId: 'com.linkedin.sdui.flagshipnav.mynetwork.Connections' }
        })
      });
      log(`API ${vanityName}: status ${resp.status}`);
      return resp.ok;
    };
    const removeViaDom = async conn => {
      const moreBtn = conn.element.querySelector('button[aria-label="Show more actions"]') || conn.element.querySelector('button[aria-label*="more actions"]');
      if (!moreBtn) { log('No more-actions btn for', conn.id); return false; }
      moreBtn.click();
      await sleep(800);
      const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
      log('Menu items:', menuItems.length, menuItems.map(m => m.textContent.trim()));
      const removeItem = menuItems.find(m => m.textContent.toLowerCase().includes('remove connection'));
      if (!removeItem) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        log('No remove connection menu item for', conn.id);
        return false;
      }
      removeItem.click();
      await sleep(900);
      const confirmBtn = await waitForElement('button[data-test-dialog-primary-btn], .artdeco-modal__actionbar > button:nth-child(2)');
      if (!confirmBtn) { log('No confirm dialog for', conn.id); return false; }
      confirmBtn.click();
      await sleep(1200);
      return true;
    };
    const removeConnections = async () => {
      if (!selected.size || removing) return;
      removing = true;
      const ids = [...selected];
      const total = ids.length;
      const footer = document.getElementById('lcr-footer');
      const progress = document.getElementById('lcr-progress');
      const bar = document.getElementById('lcr-progress-bar');
      const pText = document.getElementById('lcr-progress-text');
      const removeBtn = document.getElementById('lcr-remove-btn');
      footer.style.display = 'none';
      progress.style.display = 'block';
      if (removeBtn) removeBtn.disabled = true;
      let done = 0, failed = 0;
      for (const id of ids) {
        log(`Removing ${id} (${done + 1}/${total})`);
        let ok = await removeViaApi(id).catch(e => { log('API error:', e); return false; });
        if (!ok) {
          const conn = connections.find(c => c.id === id);
          ok = conn?.element ? await removeViaDom(conn).catch(e => { log('DOM error:', e); return false; }) : false;
          if (!ok) failed++;
        }
        done++;
        bar.style.width = Math.round((done / total) * 100) + '%';
        pText.textContent = `Removing ${done} of ${total}…${failed ? ` (${failed} skipped)` : ''}`;
        await sleep(1200);
      }
      const succeeded = done - failed;
      selected.clear();
      connections = connections.filter(c => !ids.includes(c.id));
      await sleep(800);
      connections = scrapeConnections();
      pText.textContent = `Done! Removed ${succeeded} connection${succeeded !== 1 ? 's' : ''}${failed ? `, ${failed} skipped` : ''}`;
      await sleep(2000);
      progress.style.display = 'none';
      footer.style.display = 'flex';
      bar.style.width = '0%';
      removing = false;
      renderList();
    };
    const getLoadMoreBtn = () =>
      document.querySelector('button.scaffold-finite-scroll__load-button') ||
      document.querySelector('button.scaffold-finite-scroll__load-btn') ||
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'load more');
    const autoLoadAll = async () => {
      const loadBtn = document.getElementById('lcr-load-all');
      if (loadBtn) { loadBtn.textContent = 'Auto-loading…'; loadBtn.disabled = true; }
      let attempts = 0;
      while (attempts < 30) {
        const showMore = getLoadMoreBtn();
        log(`Auto-load attempt ${attempts + 1}, found:`, !!showMore);
        if (!showMore) break;
        showMore.click();
        await sleep(2200);
        attempts++;
        connections = scrapeConnections();
        renderList();
        const statusEl = document.getElementById('lcr-autostatus');
        if (statusEl) statusEl.textContent = `Auto-loading… ${connections.length} found`;
      }
      if (loadBtn) { loadBtn.textContent = `All loaded (${connections.length})`; loadBtn.disabled = true; }
      const statusEl = document.getElementById('lcr-autostatus');
      if (statusEl) statusEl.textContent = '';
      connections = scrapeConnections();
      renderList();
    };
    const initWithObserver = () => {
      log('initWithObserver, URL:', location.href);
      const existing = scrapeConnections();
      if (existing.length > 0) { connections = existing; renderList(); return; }
      const listEl = document.getElementById('lcr-list');
      if (listEl) listEl.innerHTML = '<div id="lcr-empty">Waiting for connections to load…</div>';
      let settled = false;
      const obs = new MutationObserver(() => {
        const cards = document.querySelectorAll('div[data-component-type="LazyColumn"] > div > div[componentkey], div[data-testid="lazy-column"] > div > div[componentkey]');
        log('MutationObserver cards:', cards.length);
        if (cards.length > 0 && !settled) {
          settled = true;
          obs.disconnect();
          connections = scrapeConnections();
          renderList();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        if (!settled) { log('Observer timeout, forcing scrape'); obs.disconnect(); connections = scrapeConnections(); renderList(); }
      }, 6000);
    };
    const buildPanel = () => {
      const existing = document.getElementById('lcr-panel');
      if (existing) { existing.remove(); return; }
      const panel = document.createElement('div');
      panel.id = 'lcr-panel';
      panel.innerHTML = `
        <div id="lcr-header">
          <span id="lcr-title">⚡ Connection Remover</span>
          <div style="display:flex;gap:6px;align-items:center">
            <button id="lcr-refresh" title="Refresh list">↻</button>
            <button id="lcr-minimize" title="Minimize">−</button>
            <button id="lcr-close">×</button>
          </div>
        </div>
        <div id="lcr-body">
          <div id="lcr-toolbar">
            <input id="lcr-search" type="text" placeholder="Search by name or headline…">
            <button id="lcr-select-all-btn">Select All</button>
          </div>
          <div id="lcr-filters">
            <select id="lcr-filter-type">
              <option value="all">All connections</option>
              <option value="has-headline">Has headline</option>
              <option value="no-headline">No headline</option>
            </select>
            <select id="lcr-sort-type">
              <option value="name">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="default">Default order</option>
            </select>
          </div>
          <div id="lcr-stats"></div>
          <div id="lcr-list"><div id="lcr-empty">Loading connections…</div></div>
          <div id="lcr-autostatus"></div>
          <div id="lcr-load-actions">
            <button id="lcr-load-more">Load Next Batch</button>
            <button id="lcr-load-all">Auto-Load All</button>
          </div>
          <div id="lcr-progress">
            <div id="lcr-progress-bar-wrap"><div id="lcr-progress-bar"></div></div>
            <div id="lcr-progress-text"></div>
          </div>
          <div id="lcr-footer">
            <button id="lcr-invert-btn">Invert</button>
            <button id="lcr-remove-btn" disabled>Remove Selected</button>
          </div>
        </div>`;
      document.body.appendChild(panel);
      document.getElementById('lcr-close').addEventListener('click', () => panel.remove());
      document.getElementById('lcr-minimize').addEventListener('click', () => {
        const body = document.getElementById('lcr-body');
        const minimized = body.style.display === 'none';
        body.style.display = minimized ? 'flex' : 'none';
        document.getElementById('lcr-minimize').textContent = minimized ? '−' : '+';
      });
      document.getElementById('lcr-refresh').addEventListener('click', () => { log('Refresh'); connections = scrapeConnections(); renderList(); });
      document.getElementById('lcr-search').addEventListener('input', e => { searchQuery = e.target.value; renderList(); });
      document.getElementById('lcr-filter-type').addEventListener('change', e => { filterType = e.target.value; renderList(); });
      document.getElementById('lcr-sort-type').addEventListener('change', e => { sortType = e.target.value; renderList(); });
      document.getElementById('lcr-select-all-btn').addEventListener('click', toggleSelectAll);
      document.getElementById('lcr-invert-btn').addEventListener('click', () => { filtered().forEach(c => selected.has(c.id) ? selected.delete(c.id) : selected.add(c.id)); renderList(); });
      document.getElementById('lcr-remove-btn').addEventListener('click', removeConnections);
      document.getElementById('lcr-load-more').addEventListener('click', () => {
        const showMore = getLoadMoreBtn();
        log('Load more, found:', !!showMore);
        if (showMore) { showMore.click(); setTimeout(() => { connections = scrapeConnections(); renderList(); }, 2200); }
        else { document.getElementById('lcr-load-more').textContent = 'No more to load'; document.getElementById('lcr-load-more').disabled = true; }
      });
      document.getElementById('lcr-load-all').addEventListener('click', autoLoadAll);
      initWithObserver();
    };
    const setupSpaWatcher = () => {
      if (domObserver) return;
      let lastPath = location.pathname;
      domObserver = new MutationObserver(() => {
        if (location.pathname !== lastPath) {
          lastPath = location.pathname;
          if (location.pathname.includes('/mynetwork/invite-connect/connections')) {
            setTimeout(() => {
              if (!document.getElementById('lcr-panel')) buildPanel();
              else { connections = scrapeConnections(); renderList(); }
            }, 1500);
          }
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    };
    return { init: () => { log('LCR init'); buildPanel(); setupSpaWatcher(); } };
  })();
  window.lcrInit = LCR.init;
}
window.lcrInit?.();
