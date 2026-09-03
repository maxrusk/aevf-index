/* Shared table rendering for the AEVF Index (index.html preview and tasks.html full browser).
 * Everything here is presentation; the numbers come from compute.js. */
const AEVF_TABLE = (() => {
  const D = window.AEVF_DATA;

  const fmtUSD = v => {
    if (v >= 1000) return '$' + Math.round(v).toLocaleString('en-US');
    if (v >= 100) return '$' + v.toFixed(0);
    if (v >= 10) return '$' + v.toFixed(1);
    return '$' + v.toFixed(2);
  };
  const fmtX = v => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'x';
  const fmtPct = v => (v * 100).toFixed(0) + '%';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // plain-English explanations, shown on hover over column headers
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

  // ---- tooltip ----
  const tip = document.getElementById('tooltip');
  function showTip(html, x, y) {
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(x + 14, window.innerWidth - w - 12) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  function bindHeaderHelp(table) {
    table.querySelectorAll('thead th').forEach(th => {
      const help = HELP[th.dataset.k];
      if (!help) return;
      th.setAttribute('title', help);
      th.addEventListener('mousemove', e => showTip(`<div style="max-width:260px">${help}</div>`, e.clientX, e.clientY));
      th.addEventListener('mouseleave', hideTip);
    });
  }

  // ---- expanded task card ----
  function detailHTML(t, r, modelName) {
    const parts = [
      ['Inference', r.cInf], ['Tools and APIs', r.cTool], ['Human review', r.cHuman],
      ['Capital overhead', r.cCapital], ['Expected error cost', r.cRisk]
    ];
    const maxc = Math.max(...parts.map(p => p[1]), 0.01);
    const bars = parts.map(([l, v]) =>
      `<div class="cost-row"><span class="cl">${l}</span><span class="bar" style="width:${Math.max(2, (v / maxc) * 200)}px"></span><span class="cv">${fmtUSD(v)}</span></div>`
    ).join('');
    const srcs = (t.sources || []).map(sr =>
      `<div>${esc(sr.publisher || '')}: <a href="${esc(sr.url)}" target="_blank" rel="noreferrer">${esc(sr.title)}</a> (retrieved ${esc(sr.retrieved)})${sr.note ? ' · ' + esc(sr.note) : ''}</div>`
    ).join('');
    const floor = r.R < t.min_reliability
      ? `<div class="floorflag" style="margin-top:8px">Below its reliability floor of ${fmtPct(t.min_reliability)}: viable on cost, but acceptance risk remains the binding constraint.</div>` : '';
    return `<div class="detail"><div class="detail-grid">
      <div>
        <h4>Cost per attempt · ${esc(modelName)}</h4>
        <div class="cost-rows">${bars}
          <div class="cost-row" style="margin-top:8px;border-top:1px solid #e6e5e0;padding-top:8px"><span class="cl"><b>Total per attempt</b></span><span class="bar" style="width:200px"></span><span class="cv"><b>${fmtUSD(r.cTotal)}</b></span></div>
        </div>
        <div class="statline">
          TCEVO ${fmtUSD(r.tcevo)} · FCSO ${fmtUSD(r.fcso)} · EV ${fmtUSD(r.ev)} · &Phi; ${r.phi.toFixed(2)} · CCR ${fmtX(r.ccr)}
        </div>
        ${floor}
      </div>
      <div class="meta">
        <h4>Task card · <span class="task-id">${esc(t.task_id)}</span></h4>
        <div><b>Unit:</b> ${esc(t.unit)} · <b>Output:</b> ${esc(t.economic_output)}</div>
        <div><b>Market price:</b> ${fmtUSD(t.price_low)} / ${fmtUSD(t.price_base)} / ${fmtUSD(t.price_high)} (low, base, high) · ${esc(t.price_status)}</div>
        <div><b>Price basis:</b> ${esc(t.price_basis)}</div>
        <div><b>Reliability prior:</b> ${fmtPct(t.r_low)} to ${fmtPct(t.r_high)} (base ${fmtPct(t.r_base)}) · floor ${fmtPct(t.min_reliability)} · <b>Risk:</b> ${esc(t.risk_class)}</div>
        <div><b>Autonomy:</b> ${t.autonomy}/5 · <b>Substitutability:</b> ${t.substitutability}/5 · <b>Verification:</b> ${esc(t.verification)} · <b>Grade:</b> ${esc(t.confidence)}</div>
        <div style="margin-top:8px;color:#6f6f6a">${esc(t.notes)} ${esc(t.price_notes || '')}</div>
        <div class="srcs"><h4 style="margin-top:14px">Sources</h4>${srcs || '<div>Wage-derived estimate; see methodology.</div>'}</div>
      </div>
    </div></div>`;
  }

  // ---- one table row (plus optional expanded detail row) ----
  function rowHTML(t, r, o) {
    const open = o.openRow === t.task_id;
    const idLine = o.showId ? `<br><span class="task-id">${esc(t.task_id)}</span>` : '';
    const link = o.permalink ? `<a class="permalink" href="tasks.html#${esc(t.task_id)}" title="Permanent link to this task" aria-label="Permanent link">#</a>` : '';
    return `<tr class="row${o.hit === t.task_id ? ' hit' : ''}" data-id="${esc(t.task_id)}" id="${o.anchor ? 'task-' + esc(t.task_id) : ''}">
      <td class="left"><span class="dot ${r.viable ? 'v' : 'n'}"></span><span class="task-name">${esc(t.name)}</span>${link}<br><span class="task-domain">${esc(t.domain)} · ${esc(t.unit)}${idLine}</span></td>
      <td><span class="num">${fmtUSD(r.V)}</span></td>
      <td><span class="num">${fmtUSD(r.fcso)}</span></td>
      <td><span class="num">${fmtUSD(r.tcevo)}</span></td>
      <td><span class="num">${r.phi >= 100 ? Math.round(r.phi) : r.phi.toFixed(1)}</span></td>
      <td><span class="num">${fmtX(r.ccr)}</span></td>
      <td><span class="num">${fmtPct(r.R)}</span>${r.R < t.min_reliability ? '<br><span class="floorflag">below floor</span>' : ''}</td>
      <td><span class="grade">${esc(t.confidence)}</span></td>
    </tr>` + (open ? `<tr class="detail"><td colspan="8">${detailHTML(t, r, o.modelName)}</td></tr>` : '');
  }

  // rows: [{t, r}]; sortKey one of domain|name|confidence|V|fcso|tcevo|phi|ccr|R
  function sortRows(rows, sortKey, sortDir) {
    rows.sort((a, b) => {
      if (sortKey === 'domain') {
        // grouped by industry, best Phi first within each group
        const d = a.t.domain.localeCompare(b.t.domain) * sortDir;
        return d !== 0 ? d : b.r.phi - a.r.phi;
      }
      let va, vb;
      if (sortKey === 'name') { va = a.t.name; vb = b.t.name; }
      else if (sortKey === 'confidence') { va = a.t.confidence; vb = b.t.confidence; }
      else { va = a.r[sortKey]; vb = b.r[sortKey]; }
      return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
    });
    return rows;
  }

  // header click sorting; get() returns {sortKey, sortDir}, set(k, dir) stores and rerenders
  function bindSortHeaders(table, get, set) {
    table.querySelectorAll('thead th').forEach(th => {
      th.onclick = () => {
        const k = th.dataset.k;
        if (!k) return;
        const { sortKey, sortDir } = get();
        if (sortKey === k) set(k, -sortDir);
        else set(k, k === 'name' || k === 'confidence' || k === 'domain' ? 1 : -1);
      };
    });
  }

  function modelName(modelId) {
    const m = D.models.find(x => x.id === modelId);
    return m ? m.name : modelId;
  }

  return { fmtUSD, fmtX, fmtPct, esc, HELP, showTip, hideTip, bindHeaderHelp, detailHTML, rowHTML, sortRows, bindSortHeaders, modelName };
})();
