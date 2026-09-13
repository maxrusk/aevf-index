/* Frontier scatter shared by index.html and embed.html.
 * AEVF_CHART.render(el, tasks, results, opts) draws reliability (x) against all-in AI cost per
 * success as a share of market price (y, log). opts.colors themes the chrome, opts.onOpen(task)
 * handles a click on a point, opts.minWidth sets the horizontal-scroll floor. */
const AEVF_CHART = (() => {
  const THEMES = {
    light: { grid: '#e6e5e0', axis: '#6f6f6a', frontier: '#111111', halo: '#fbfbf9' },
    dark:  { grid: '#2a2a28', axis: '#8a8a85', frontier: '#e4e4e0', halo: '#111110' }
  };

  function render(el, tasks, results, opts = {}) {
    const T = AEVF_TABLE;
    const { fmtUSD, fmtPct, showTip, hideTip } = T;
    const c = Object.assign({}, THEMES.light, THEMES[opts.theme] || {}, opts.colors || {});
    const minWidth = opts.minWidth == null ? 760 : opts.minWidth;

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

    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${minWidth}px;display:block" font-family="Geist, sans-serif" role="img" aria-label="Scatter of task reliability against AI cost as a share of market price">`;
    const yTicks = [0.01, 0.03, 0.1, 0.3, 1, 3];
    yTicks.forEach(t => {
      const y = Y(t);
      const main = t === 1;
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${main ? c.frontier : c.grid}" stroke-width="${main ? 1.2 : 1}"/>`;
      s += `<text x="${m.l - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${c.axis}" font-family="Geist Mono, monospace">${(t * 100) + '%'}</text>`;
    });
    s += `<text x="${W - m.r}" y="${Y(1) - 7}" text-anchor="end" font-size="11" fill="${c.frontier}" font-family="Geist Mono, monospace">frontier · cost = price</text>`;
    for (let t = 0.4; t <= 1.001; t += 0.1) {
      const x = X(t);
      s += `<line x1="${x}" x2="${x}" y1="${H - m.b}" y2="${H - m.b + 5}" stroke="${c.grid}"/>`;
      s += `<text x="${x}" y="${H - m.b + 20}" text-anchor="middle" font-size="11" fill="${c.axis}" font-family="Geist Mono, monospace">${Math.round(t * 100)}%</text>`;
    }
    s += `<text x="${m.l + iw / 2}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="${c.axis}">Reliability R · probability the output is accepted</text>`;
    s += `<text transform="rotate(-90 16 ${m.t + ih / 2})" x="16" y="${m.t + ih / 2}" text-anchor="middle" font-size="11.5" fill="${c.axis}">All-in AI cost per success, share of market price (log)</text>`;

    tasks.forEach((t, i) => {
      const r = results[i];
      const ratio = r.fcso / r.V;
      const cx = X(r.R), cy = Y(ratio), rad = R_(r.V);
      const col = r.viable ? '#3b6ea5' : '#c07a38';
      s += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${col}" fill-opacity="0.82" stroke="${c.halo}" stroke-width="2" data-i="${i}" style="cursor:pointer"/>`;
    });
    s += '</svg>';
    el.innerHTML = s;

    const onOpen = opts.onOpen || (t => { location.href = 'tasks.html#' + encodeURIComponent(t.task_id); });
    el.querySelectorAll('circle').forEach(circle => {
      circle.addEventListener('mousemove', e => {
        const i = +circle.dataset.i, t = tasks[i], r = results[i];
        showTip(
          `<div class="tt-name">${T.esc(t.name)}</div>` +
          `<div class="tt-row"><span>Market price</span><b>${fmtUSD(r.V)}</b></div>` +
          `<div class="tt-row"><span>AI cost / success</span><b>${fmtUSD(r.fcso)}</b></div>` +
          `<div class="tt-row"><span>Reliability</span><b>${fmtPct(r.R)}</b></div>` +
          `<div class="tt-row"><span>&Phi;</span><b>${r.phi.toFixed(1)}</b></div>` +
          `<div class="tt-row" style="margin-top:4px"><span>click to open the task card</span></div>`,
          e.clientX, e.clientY);
      });
      circle.addEventListener('mouseleave', hideTip);
      circle.addEventListener('click', () => onOpen(tasks[+circle.dataset.i]));
    });
  }

  return { render, THEMES };
})();
