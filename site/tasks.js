/* Full task browser: every task in the index, searchable, filterable, sortable, deep-linkable. */
(function () {
  const D = window.AEVF_DATA;
  const T = AEVF_TABLE;
  const $ = id => document.getElementById(id);

  const state = AEVF.defaults();
  let sortKey = 'domain', sortDir = 1, filter = '', domainFilter = '', viaFilter = 'all', openRow = null, hit = null;
  let results = null;

  // deep link: tasks.html#task-id opens and scrolls to that row
  function readHash() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!id || !D.tasks.some(t => t.task_id === id)) return null;
    return id;
  }

  AEVF_CONTROLS.init(state, render);

  $('search').oninput = e => { filter = e.target.value.toLowerCase().trim(); openRow = null; renderTable(); };

  // industry chips
  const DOMAINS = [...new Set(D.tasks.map(t => t.domain))].sort((a, b) => a.localeCompare(b));
  const chipBox = $('chips');
  chipBox.innerHTML = [['', 'All industries']].concat(DOMAINS.map(d => [d, d])).map(([v, label]) => {
    const n = v ? D.tasks.filter(t => t.domain === v).length : D.tasks.length;
    return `<button data-d="${T.esc(v)}" class="${v === '' ? 'on' : ''}">${T.esc(label)}<span class="n">${n}</span></button>`;
  }).join('');
  chipBox.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      domainFilter = b.dataset.d;
      chipBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      openRow = null;
      renderTable();
    };
  });

  // frontier status filter
  $('seg-via').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      $('seg-via').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      viaFilter = b.dataset.v; openRow = null; renderTable();
    };
  });

  T.bindHeaderHelp($('tbl'));
  T.bindSortHeaders($('tbl'), () => ({ sortKey, sortDir }), (k, d) => { sortKey = k; sortDir = d; openRow = null; renderTable(); });

  function matches(t) {
    if (domainFilter && t.domain !== domainFilter) return false;
    if (filter) {
      const hay = [t.task_id, t.name, t.domain, t.unit, t.economic_output, t.confidence].join(' ').toLowerCase();
      if (!filter.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  function renderTable() {
    let rows = D.tasks.map((t, i) => ({ t, r: results[i] })).filter(({ t }) => matches(t));
    if (viaFilter === 'inside') rows = rows.filter(({ r }) => r.phi > 1 && r.meetsFloor);
    else if (viaFilter === 'floor') rows = rows.filter(({ r }) => r.phi > 1 && !r.meetsFloor);
    else if (viaFilter === 'outside') rows = rows.filter(({ r }) => r.phi <= 1);
    T.sortRows(rows, sortKey, sortDir);

    $('tbl-count').textContent = rows.length + ' of ' + D.tasks.length + ' tasks';
    $('tbl').querySelectorAll('thead th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.k === sortKey);
    });
    const modelName = T.modelName(state.modelId);
    $('tbody').innerHTML = rows.length
      ? rows.map(({ t, r }) => T.rowHTML(t, r, { openRow, hit, modelName, showId: true, permalink: true, anchor: true })).join('')
      : '<tr><td colspan="8" class="left" style="padding:28px;color:#6f6f6a;font-family:var(--sans);font-size:13.5px">No tasks match. Clear the search or pick another industry.</td></tr>';
    $('tbody').querySelectorAll('tr.row').forEach(tr => {
      tr.onclick = e => {
        if (e.target.closest('a')) return; // permalink or source link
        openRow = openRow === tr.dataset.id ? null : tr.dataset.id;
        hit = null;
        if (openRow) history.replaceState(null, '', '#' + openRow); else history.replaceState(null, '', location.pathname);
        renderTable();
      };
    });
  }

  function render() {
    const model = D.models.find(m => m.id === state.modelId);
    results = AEVF.computeAll(D.tasks, model, state);
    const sum = AEVF.summary(D.tasks, results, state);
    $('sum-line').innerHTML = `Under the current assumptions <b>${sum.strictCount}</b> of ${D.tasks.length} tasks are inside the frontier and meet their reliability floor, <b>${sum.viableCount}</b> clear cost alone. Median &Phi; ${sum.medianPhi >= 100 ? Math.round(sum.medianPhi) : sum.medianPhi.toFixed(1)}, median compression ${T.fmtX(sum.medianCCR)}.`;
    renderTable();
  }

  function openFromHash(scroll) {
    const id = readHash();
    if (!id) return;
    // reset filters so the linked row is visible
    filter = ''; $('search').value = '';
    domainFilter = ''; chipBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.d === ''));
    viaFilter = 'all'; $('seg-via').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === 'all'));
    openRow = id; hit = id;
    renderTable();
    if (scroll) {
      const el = document.getElementById('task-' + id);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
    }
  }

  window.addEventListener('hashchange', () => openFromHash(true));

  document.querySelectorAll('.n-tasks').forEach(n => { n.textContent = D.tasks.length; });
  document.querySelectorAll('.n-domains').forEach(n => { n.textContent = new Set(D.tasks.map(t => t.domain)).size; });
  $('hdr-date').textContent = D.built;
  $('ft-retrieved').textContent = D.retrieved;
  render();
  openFromHash(true);
})();
