/* AEVF dashboard (index.html). Renders from window.AEVF_DATA using the AEVF compute engine.
 * The task table here is a fixed-size preview; tasks.html holds the full browser. */
(function () {
  const D = window.AEVF_DATA;
  const T = AEVF_TABLE;
  const $ = id => document.getElementById(id);
  const { fmtUSD, fmtX, fmtPct, showTip, hideTip } = T;

  const PREVIEW_N = 15;
  const state = AEVF.defaults();
  let sortKey = 'phi', sortDir = -1, openRow = null;

  AEVF_CONTROLS.init(state, render);

  // stat tile explanations
  const TILE_HELP = {
    'stat-share': 'The headline. Share of the basket (weighted by task value, or equally) where the AI is both cheaper than the human all-in AND clears the task’s minimum reliability floor. The cost-only share is shown beneath it.',
    'stat-count': 'Raw counts: tasks where AI cost per accepted output is below the human price / tasks that also meet their reliability floor.',
    'stat-phi': 'Median viability ratio across every tracked task: expected dollars of value supported by one dollar of AI production cost.',
    'stat-ccr': 'Median cost compression: how many times cheaper the AI process is than the human market price, all-in.'
  };
  Object.entries(TILE_HELP).forEach(([id, help]) => {
    const tile = $(id).closest('.tile');
    tile.setAttribute('title', help);
    tile.addEventListener('mousemove', e => showTip(`<div style="max-width:260px">${help}</div>`, e.clientX, e.clientY));
    tile.addEventListener('mouseleave', hideTip);
  });

  T.bindHeaderHelp($('tbl'));
  T.bindSortHeaders($('tbl'), () => ({ sortKey, sortDir }), (k, d) => { sortKey = k; sortDir = d; openRow = null; renderTable(window.__results); });

  // ---- chart: shared renderer in chart.js ----
  function renderChart(tasks, results) {
    AEVF_CHART.render($('chart'), tasks, results);
  }

  // ---- preview table: top N by the active sort ----
  function renderTable(results) {
    const all = D.tasks.map((t, i) => ({ t, r: results[i] }));
    const rows = T.sortRows(all, sortKey, sortDir).slice(0, PREVIEW_N);
    const label = { phi: 'viability ratio', ccr: 'cost compression', V: 'market price', fcso: 'AI cost per success', tcevo: 'TCEVO', R: 'reliability', name: 'name', confidence: 'grade', domain: 'industry' }[sortKey];
    $('tbl-count').textContent = `showing ${rows.length} of ${D.tasks.length} · sorted by ${label}`;
    const modelName = T.modelName(state.modelId);
    const tb = $('tbody');
    tb.innerHTML = rows.map(({ t, r }) => T.rowHTML(t, r, { openRow, modelName, showId: false, permalink: true })).join('');
    tb.querySelectorAll('tr.row').forEach(tr => {
      tr.onclick = e => {
        if (e.target.closest('a')) return;
        openRow = openRow === tr.dataset.id ? null : tr.dataset.id;
        renderTable(results);
      };
    });
  }

  // ---- worked example ----
  function renderWorked(results) {
    const i = D.tasks.findIndex(t => t.task_id === 'nda-review');
    const t = D.tasks[i], r = results[i];
    const mdl = D.models.find(m => m.id === state.modelId);
    $('worked').innerHTML =
      `<b>Worked example, live:</b> a standard NDA review sells for <span class="num">${fmtUSD(r.V)}</span> ` +
      `(ContractsCounsel marketplace average). On ${mdl.name} under the current assumptions, inference is ` +
      `<span class="num">${fmtUSD(r.cInf)}</span>, attorney sign-off ${t.review_minutes} min is <span class="num">${fmtUSD(r.cHuman)}</span>, ` +
      `and the all-in cost per attempt is <span class="num">${fmtUSD(r.cTotal)}</span>. At R = <span class="num">${fmtPct(r.R)}</span>, ` +
      `TCEVO = <span class="num">${fmtUSD(r.tcevo)}</span>, full cost per accepted review = <span class="num">${fmtUSD(r.fcso)}</span>, ` +
      `&Phi; = <span class="num">${r.phi.toFixed(1)}</span>, and cost compression = <span class="num">${fmtX(r.ccr)}</span>. ` +
      `Note what dominates the cost: the human, not the tokens.`;
  }

  // ---- main render ----
  function render() {
    const model = D.models.find(m => m.id === state.modelId);
    const results = AEVF.computeAll(D.tasks, model, state);
    window.__results = results;
    const sum = AEVF.summary(D.tasks, results, state);

    const strictShare = state.weighting === 'equal' ? sum.shareStrictEqual : sum.shareStrictValue;
    const costShare = state.weighting === 'equal' ? sum.shareEqualWeighted : sum.shareValueWeighted;
    $('stat-share').textContent = fmtPct(strictShare);
    $('stat-share-sub').innerHTML = 'cheaper than the human <i>and</i> reliable enough · on cost alone: ' + fmtPct(costShare);
    $('stat-count').textContent = sum.viableCount + ' / ' + sum.strictCount;
    $('stat-count-sub').textContent = 'inside on cost / also meeting their reliability floor';
    $('stat-phi').textContent = sum.medianPhi >= 100 ? Math.round(sum.medianPhi) : sum.medianPhi.toFixed(1);
    $('stat-ccr').textContent = fmtX(sum.medianCCR);

    renderChart(D.tasks, results);
    renderTable(results);
    renderWorked(results);
  }

  $('hdr-date').textContent = D.built;
  $('ft-retrieved').textContent = D.retrieved;
  document.querySelectorAll('.n-tasks').forEach(n => { n.textContent = D.tasks.length; });
  document.querySelectorAll('.n-domains').forEach(n => { n.textContent = new Set(D.tasks.map(t => t.domain)).size; });
  render();

  // ---- share ----
  (function () {
    const URL_ = 'https://aevf-index.vercel.app';
    const TEXT = `The AI Economic Viability Frontier: a live index of ${D.tasks.length} real economic tasks measuring when AI agents become cheaper, all-in, than the human producer. C/R < V.`;
    const u = encodeURIComponent(URL_), t = encodeURIComponent(TEXT);
    const links = {
      x: `https://x.com/intent/post?text=${t}&url=${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      substack: `https://substack.com/notes?action=compose&message=${encodeURIComponent(TEXT + ' ' + URL_)}`,
      email: `mailto:?subject=${encodeURIComponent('The AI Economic Viability Frontier')}&body=${encodeURIComponent(TEXT + '\n\n' + URL_)}`
    };
    document.querySelectorAll('#share-row a').forEach(a => { a.href = links[a.dataset.net]; });
    const btn = $('copy-link');
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(URL_); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = URL_; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      btn.classList.add('done');
      $('icon-copy').hidden = true; $('icon-check').hidden = false;
      setTimeout(() => {
        btn.classList.remove('done');
        $('icon-copy').hidden = false; $('icon-check').hidden = true;
      }, 1800);
    };
  })();
})();
