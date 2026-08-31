/* AEVF dashboard. Renders from window.AEVF_DATA using the AEVF compute engine. */
(function () {
  const D = window.AEVF_DATA;
  const $ = id => document.getElementById(id);

  const state = AEVF.defaults();
  let sortKey = 'domain', sortDir = 1, filter = '', domainFilter = '', openRow = null;

  const fmtUSD = v => {
    if (v >= 1000) return '$' + Math.round(v).toLocaleString('en-US');
    if (v >= 100) return '$' + v.toFixed(0);
    if (v >= 10) return '$' + v.toFixed(1);
    return '$' + v.toFixed(2);
  };
  const fmtX = v => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'x';
  const fmtPct = v => (v * 100).toFixed(0) + '%';

  // ---- controls ----
  const modelSel = $('model');
  const groups = {};
  D.models.forEach(m => { (groups[m.provider] = groups[m.provider] || []).push(m); });
  Object.entries(groups).forEach(([prov, ms]) => {
    const g = document.createElement('optgroup');
    g.label = prov;
    ms.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = `${m.name}  ·  $${m.input_per_mtok}/$${m.output_per_mtok} per Mtok`;
      g.appendChild(o);
    });
    modelSel.appendChild(g);
  });
  modelSel.value = state.modelId;
  modelSel.onchange = () => { state.modelId = modelSel.value; render(); };

  function segInit(id, key) {
    const seg = $(id);
    seg.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        state[key] = b.dataset.v;
        render();
      };
    });
  }
  segInit('seg-r', 'rScenario');
  segInit('seg-p', 'priceScenario');
  segInit('seg-w', 'weighting');

  $('cache').oninput = e => { state.cacheShare = +e.target.value / 100; $('cache-val').textContent = e.target.value + '%'; render(); };
  $('review').oninput = e => { state.reviewMult = +e.target.value / 100; $('review-val').textContent = (+e.target.value / 100).toFixed(1) + 'x'; render(); };
  $('risk').oninput = e => { state.riskMult = +e.target.value / 100; $('risk-val').textContent = (+e.target.value / 100).toFixed(1) + 'x'; render(); };

  $('reset').onclick = () => {
    Object.assign(state, AEVF.defaults());
    modelSel.value = state.modelId;
    $('cache').value = 50; $('cache-val').textContent = '50%';
    $('review').value = 100; $('review-val').textContent = '1.0x';
    $('risk').value = 100; $('risk-val').textContent = '1.0x';
    [['seg-r', 'base'], ['seg-p', 'base'], ['seg-w', 'value']].forEach(([id, v]) => {
      $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    });
    render();
  };

  $('search').oninput = e => { filter = e.target.value.toLowerCase(); openRow = null; renderTable(window.__results); };

  // industry filter chips
  const DOMAINS = [...new Set(D.tasks.map(t => t.domain))];
  const chipBox = $('chips');
  const chipDefs = [['', 'All industries']].concat(DOMAINS.map(d => [d, d]));
  chipBox.innerHTML = chipDefs.map(([v, label]) => {
    const n = v ? D.tasks.filter(t => t.domain === v).length : D.tasks.length;
    return `<button data-d="${v}" class="${v === '' ? 'on' : ''}">${label}<span class="n">${n}</span></button>`;
  }).join('');
  chipBox.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      domainFilter = b.dataset.d;
      chipBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      openRow = null;
      renderTable(window.__results);
    };
  });

  // plain-English explanations, shown on hover over column headers and stat tiles
  const HELP = {
    name: 'One discrete, buyable output. Click a row for the full task card, cost breakdown, and sources.',
    V: 'V · what buyers pay a human or firm for this outcome today. Sourced and cited per task. This is the bar the AI has to beat.',
    fcso: 'C / R · the all-in cost for the AI to deliver one ACCEPTED output: tokens, tools, human review, overhead, and expected error cost, with failed attempts priced in. The task is inside the frontier when this is below the market price.',
    tcevo: 'Token cost per economically viable output · inference spend alone, per accepted output. The token-efficiency number: once a task clears viability, volume should flow to whichever model minimizes this.',
    phi: 'Viability ratio · expected value per dollar of production cost (R x V, divided by C). Above 1 = inside the frontier. A 10 means one dollar of AI cost supports ten dollars of expected value.',
    ccr: 'Cost compression · how many times cheaper the AI is than the human: market price divided by all-in AI cost per success. 40x is a different production function, not a productivity gain.',
    R: 'Reliability · the probability a professional accepts the output, anchored to published evidence, not benchmark scores. Failures make every success cost more, which is why costs are divided by R.',
    confidence: 'Confidence grade · how well sourced this row is. A = observed prices and strong evidence; B = mostly observed; C = derived or thin evidence; D = speculative.'
  };
  const TILE_HELP = {
    'stat-share': 'The headline. Share of the basket (weighted by task value, or equally) where the AI is both cheaper than the human all-in AND clears the task’s minimum reliability floor. The cost-only share is shown beneath it.',
    'stat-count': 'Raw counts: tasks where AI cost per accepted output is below the human price / tasks that also meet their reliability floor.',
    'stat-phi': 'Median viability ratio across every tracked task: expected dollars of value supported by one dollar of AI production cost.',
    'stat-ccr': 'Median cost compression: how many times cheaper the AI process is than the human market price, all-in.'
  };
  document.querySelectorAll('thead th').forEach(th => {
    const help = HELP[th.dataset.k];
    if (help) {
      th.setAttribute('title', help);
      th.addEventListener('mousemove', e => showTip(`<div style="max-width:260px">${help}</div>`, e.clientX, e.clientY));
      th.addEventListener('mouseleave', hideTip);
    }
  });
  Object.entries(TILE_HELP).forEach(([id, help]) => {
    const tile = $(id).closest('.tile');
    tile.setAttribute('title', help);
    tile.addEventListener('mousemove', e => showTip(`<div style="max-width:260px">${help}</div>`, e.clientX, e.clientY));
    tile.addEventListener('mouseleave', hideTip);
  });

  document.querySelectorAll('thead th').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'confidence' ? 1 : -1; }
      openRow = null;
      renderTable(window.__results);
    };
  });

  // ---- tooltip ----
  const tip = $('tooltip');
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(x + 14, window.innerWidth - w - 12) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  // ---- chart: reliability (x) vs FCSO as % of WTP (y, log) ----
  function renderChart(tasks, results) {
    const W = 1020, H = 460, m = { t: 18, r: 24, b: 46, l: 64 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x0 = 0.4, x1 = 1.0;
    const yMinL = Math.log10(0.005), yMaxL = Math.log10(6); // 0.5% .. 600% of WTP
    const X = r => m.l + ((r - x0) / (x1 - x0)) * iw;
    const Y = v => {
      const l = Math.min(Math.max(Math.log10(v), yMinL), yMaxL);
      return m.t + (1 - (l - yMinL) / (yMaxL - yMinL)) * ih;
    };
    const vmax = Math.max(...results.map(r => r.V));
    const R_ = v => 4 + 9 * Math.sqrt(Math.log10(1 + v) / Math.log10(1 + vmax));

    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:760px;display:block" font-family="Geist, sans-serif" role="img" aria-label="Scatter of task reliability against AI cost as a share of market price">`;
    // gridlines
    const yTicks = [0.01, 0.03, 0.1, 0.3, 1, 3];
    yTicks.forEach(t => {
      const y = Y(t);
      const main = t === 1;
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${main ? '#111111' : '#e6e5e0'}" stroke-width="${main ? 1.2 : 1}" ${main ? '' : ''}/>`;
      s += `<text x="${m.l - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6f6f6a" font-family="Geist Mono, monospace">${t < 1 ? (t * 100) + '%' : (t * 100) + '%'}</text>`;
    });
    s += `<text x="${W - m.r}" y="${Y(1) - 7}" text-anchor="end" font-size="11" fill="#111111" font-family="Geist Mono, monospace">frontier · cost = price</text>`;
    for (let t = 0.4; t <= 1.001; t += 0.1) {
      const x = X(t);
      s += `<line x1="${x}" x2="${x}" y1="${H - m.b}" y2="${H - m.b + 5}" stroke="#e6e5e0"/>`;
      s += `<text x="${x}" y="${H - m.b + 20}" text-anchor="middle" font-size="11" fill="#6f6f6a" font-family="Geist Mono, monospace">${Math.round(t * 100)}%</text>`;
    }
    s += `<text x="${m.l + iw / 2}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="#6f6f6a">Reliability R · probability the output is accepted</text>`;
    s += `<text transform="rotate(-90 16 ${m.t + ih / 2})" x="16" y="${m.t + ih / 2}" text-anchor="middle" font-size="11.5" fill="#6f6f6a">All-in AI cost per success, share of market price (log)</text>`;

    // points
    tasks.forEach((t, i) => {
      const r = results[i];
      const ratio = r.fcso / r.V;
      const cx = X(r.R), cy = Y(ratio), rad = R_(r.V);
      const col = r.viable ? '#3b6ea5' : '#c07a38';
      s += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${col}" fill-opacity="0.82" stroke="#fbfbf9" stroke-width="2" data-i="${i}" style="cursor:pointer"/>`;
    });
    s += '</svg>';
    $('chart').innerHTML = s;

    $('chart').querySelectorAll('circle').forEach(c => {
      c.addEventListener('mousemove', e => {
        const i = +c.dataset.i, t = tasks[i], r = results[i];
        showTip(
          `<div class="tt-name">${t.name}</div>` +
          `<div class="tt-row"><span>Market price</span><b>${fmtUSD(r.V)}</b></div>` +
          `<div class="tt-row"><span>AI cost / success</span><b>${fmtUSD(r.fcso)}</b></div>` +
          `<div class="tt-row"><span>Reliability</span><b>${fmtPct(r.R)}</b></div>` +
          `<div class="tt-row"><span>&Phi;</span><b>${r.phi.toFixed(1)}</b></div>`,
          e.clientX, e.clientY);
      });
      c.addEventListener('mouseleave', hideTip);
      c.addEventListener('click', () => {
        const t = tasks[+c.dataset.i];
        location.hash = '#tasks';
        $('search').value = t.name; filter = t.name.toLowerCase();
        openRow = t.task_id; renderTable(window.__results);
      });
    });
  }

  // ---- table ----
  function detailHTML(t, r) {
    const parts = [
      ['Inference', r.cInf], ['Tools and APIs', r.cTool], ['Human review', r.cHuman],
      ['Capital overhead', r.cCapital], ['Expected error cost', r.cRisk]
    ];
    const maxc = Math.max(...parts.map(p => p[1]), 0.01);
    const bars = parts.map(([l, v]) =>
      `<div class="cost-row"><span class="cl">${l}</span><span class="bar" style="width:${Math.max(2, (v / maxc) * 200)}px"></span><span class="cv">${fmtUSD(v)}</span></div>`
    ).join('');
    const srcs = (t.sources || []).map(sr =>
      `<div>${sr.publisher || ''}: <a href="${sr.url}" target="_blank" rel="noreferrer">${sr.title}</a> (retrieved ${sr.retrieved})${sr.note ? ' · ' + sr.note : ''}</div>`
    ).join('');
    const floor = r.R < t.min_reliability
      ? `<div class="floorflag" style="margin-top:8px">Below its reliability floor of ${fmtPct(t.min_reliability)}: viable on cost, but acceptance risk remains the binding constraint.</div>` : '';
    return `<div class="detail"><div class="detail-grid">
      <div>
        <h4>Cost per attempt · ${D.models.find(m => m.id === state.modelId).name}</h4>
        <div class="cost-rows">${bars}
          <div class="cost-row" style="margin-top:8px;border-top:1px solid #e6e5e0;padding-top:8px"><span class="cl"><b>Total per attempt</b></span><span class="bar" style="width:200px"></span><span class="cv"><b>${fmtUSD(r.cTotal)}</b></span></div>
        </div>
        <div class="statline">
          TCEVO ${fmtUSD(r.tcevo)} · FCSO ${fmtUSD(r.fcso)} · EV ${fmtUSD(r.ev)} · &Phi; ${r.phi.toFixed(2)} · CCR ${fmtX(r.ccr)}
        </div>
        ${floor}
      </div>
      <div class="meta">
        <h4>Task card</h4>
        <div><b>Unit:</b> ${t.unit} · <b>Output:</b> ${t.economic_output}</div>
        <div><b>Market price:</b> ${fmtUSD(t.price_low)} / ${fmtUSD(t.price_base)} / ${fmtUSD(t.price_high)} (low, base, high) · ${t.price_status}</div>
        <div><b>Price basis:</b> ${t.price_basis}</div>
        <div><b>Reliability prior:</b> ${fmtPct(t.r_low)} to ${fmtPct(t.r_high)} (base ${fmtPct(t.r_base)}) · floor ${fmtPct(t.min_reliability)} · <b>Risk:</b> ${t.risk_class}</div>
        <div><b>Autonomy:</b> ${t.autonomy}/5 · <b>Substitutability:</b> ${t.substitutability}/5 · <b>Verification:</b> ${t.verification} · <b>Grade:</b> ${t.confidence}</div>
        <div style="margin-top:8px;color:#6f6f6a">${t.notes} ${t.price_notes || ''}</div>
        <div class="srcs"><h4 style="margin-top:14px">Sources</h4>${srcs || '<div>Wage-derived estimate; see methodology.</div>'}</div>
      </div>
    </div></div>`;
  }

  function renderTable(results) {
    const rows = D.tasks.map((t, i) => ({ t, r: results[i] }))
      .filter(({ t }) => (!domainFilter || t.domain === domainFilter) &&
        (!filter || (t.name + ' ' + t.domain).toLowerCase().includes(filter)));
    rows.sort((a, b) => {
      // default view: grouped by industry, best Phi first within each group
      if (sortKey === 'domain') {
        const d = a.t.domain.localeCompare(b.t.domain) * sortDir;
        return d !== 0 ? d : b.r.phi - a.r.phi;
      }
      let va, vb;
      if (sortKey === 'name') { va = a.t.name; vb = b.t.name; }
      else if (sortKey === 'confidence') { va = a.t.confidence; vb = b.t.confidence; }
      else { va = a.r[sortKey]; vb = b.r[sortKey]; }
      return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
    });
    $('tbl-count').textContent = rows.length + ' of ' + D.tasks.length + ' tasks';
    const tb = $('tbody');
    tb.innerHTML = rows.map(({ t, r }) => {
      const open = openRow === t.task_id;
      return `<tr class="row" data-id="${t.task_id}">
        <td class="left"><span class="dot ${r.viable ? 'v' : 'n'}"></span><span class="task-name">${t.name}</span><br><span class="task-domain">${t.domain} · ${t.unit}</span></td>
        <td><span class="num">${fmtUSD(r.V)}</span></td>
        <td><span class="num">${fmtUSD(r.fcso)}</span></td>
        <td><span class="num">${fmtUSD(r.tcevo)}</span></td>
        <td><span class="num">${r.phi >= 100 ? Math.round(r.phi) : r.phi.toFixed(1)}</span></td>
        <td><span class="num">${fmtX(r.ccr)}</span></td>
        <td><span class="num">${fmtPct(r.R)}</span>${r.R < t.min_reliability ? '<br><span class="floorflag">below floor</span>' : ''}</td>
        <td><span class="grade">${t.confidence}</span></td>
      </tr>` + (open ? `<tr class="detail"><td colspan="8">${detailHTML(t, r)}</td></tr>` : '');
    }).join('');
    tb.querySelectorAll('tr.row').forEach(tr => {
      tr.onclick = () => {
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
      btn.textContent = 'Copied'; btn.classList.add('done');
      setTimeout(() => { btn.textContent = 'Copy link'; btn.classList.remove('done'); }, 1800);
    };
  })();
})();
