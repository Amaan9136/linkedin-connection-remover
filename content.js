if (!window.__lcrLoaded) {
  window.__lcrLoaded = true;
  const LCR = (() => {
    let connections = [];
    let selected = new Set();
    let removing = false;
    let searchQuery = '';
    let filterType = 'all';
    let sortType = 'name';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    const scrapeConnections = () => {
      const cards = document.querySelectorAll('li.mn-connection-card');
      return Array.from(cards).map(card => {
        const nameEl = card.querySelector('.mn-connection-card__name');
        const headlineEl = card.querySelector('.mn-connection-card__occupation');
        const imgEl = card.querySelector('.presence-entity__image, .mn-connection-card__picture img');
        const profileLink = card.querySelector('a.mn-connection-card__link');
        return {
          id: profileLink?.href?.split('/in/')?.[1]?.replace(/\/$/, '') || Math.random().toString(36).slice(2),
          name: nameEl?.textContent?.trim() || 'Unknown',
          headline: headlineEl?.textContent?.trim() || '',
          avatar: imgEl?.src || imgEl?.getAttribute('data-ghost-url') || null,
          element: card
        };
      }).filter(c => c.name !== 'Unknown' || c.id);
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
        const conn = connections.find(c => c.id === id);
        if (!conn?.element) { done++; continue; }
        try {
          const menuBtn = conn.element.querySelector('button[aria-label*="more"], .mn-connection-card__dropdown-trigger, button.artdeco-dropdown__trigger');
          if (menuBtn) {
            menuBtn.click();
            await sleep(700);
            const dropdownBtn = Array.from(document.querySelectorAll('.artdeco-dropdown__content li button, .artdeco-dropdown__content-inner li button')).find(b =>
              b.textContent.toLowerCase().includes('remove connection')
            );
            if (dropdownBtn) {
              dropdownBtn.click();
              await sleep(900);
              const confirmBtn = document.querySelector('button[data-test-dialog-primary-btn], .artdeco-modal__confirm-dialog-btn, button.artdeco-button--primary');
              if (confirmBtn && confirmBtn.textContent.toLowerCase().includes('remove')) {
                confirmBtn.click();
                await sleep(1200);
              } else failed++;
            } else {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              failed++;
            }
          }
        } catch (e) { failed++; }
        done++;
        bar.style.width = Math.round((done / total) * 100) + '%';
        pText.textContent = `Removing ${done} of ${total}…${failed ? ` (${failed} skipped)` : ''}`;
        await sleep(400);
      }
      const succeeded = done - failed;
      selected.clear();
      connections = connections.filter(c => !ids.includes(c.id));
      pText.textContent = `Done! Removed ${succeeded} connection${succeeded !== 1 ? 's' : ''}${failed ? `, ${failed} skipped` : ''}`;
      await sleep(2000);
      progress.style.display = 'none';
      footer.style.display = 'flex';
      bar.style.width = '0%';
      removing = false;
      renderList();
    };
    const autoLoadAll = async () => {
      const loadBtn = document.getElementById('lcr-load-more');
      if (loadBtn) { loadBtn.textContent = 'Auto-loading…'; loadBtn.disabled = true; }
      let attempts = 0;
      while (attempts < 30) {
        const showMore = document.querySelector('button.scaffold-finite-scroll__load-button');
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
    const buildPanel = () => {
      const existing = document.getElementById('lcr-panel');
      if (existing) { existing.remove(); return; }
      const panel = document.createElement('div');
      panel.id = 'lcr-panel';
      panel.innerHTML = `
        <div id="lcr-header">
          <span id="lcr-title">⚡ Connection Remover</span>
          <div style="display:flex;gap:6px;align-items:center">
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
      document.getElementById('lcr-search').addEventListener('input', e => { searchQuery = e.target.value; renderList(); });
      document.getElementById('lcr-filter-type').addEventListener('change', e => { filterType = e.target.value; renderList(); });
      document.getElementById('lcr-sort-type').addEventListener('change', e => { sortType = e.target.value; renderList(); });
      document.getElementById('lcr-select-all-btn').addEventListener('click', toggleSelectAll);
      document.getElementById('lcr-invert-btn').addEventListener('click', () => {
        filtered().forEach(c => selected.has(c.id) ? selected.delete(c.id) : selected.add(c.id));
        renderList();
      });
      document.getElementById('lcr-remove-btn').addEventListener('click', removeConnections);
      document.getElementById('lcr-load-more').addEventListener('click', () => {
        const showMore = document.querySelector('button.scaffold-finite-scroll__load-button');
        if (showMore) {
          showMore.click();
          setTimeout(() => { connections = scrapeConnections(); renderList(); }, 2200);
        } else {
          document.getElementById('lcr-load-more').textContent = 'No more to load';
          document.getElementById('lcr-load-more').disabled = true;
        }
      });
      document.getElementById('lcr-load-all').addEventListener('click', autoLoadAll);
      connections = scrapeConnections();
      renderList();
    };
    return { init: buildPanel };
  })();
  window.lcrInit = LCR.init;
}
window.lcrInit?.();
