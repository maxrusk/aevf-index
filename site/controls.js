/* Assumption controls shared by index.html and tasks.html.
 * Wires #model, #seg-r, #seg-p, #cache, #review, #risk, #reset, and #seg-w when present,
 * onto a state object created by AEVF.defaults(); calls onChange() after every edit. */
const AEVF_CONTROLS = (() => {
  const D = window.AEVF_DATA;
  const $ = id => document.getElementById(id);

  function init(state, onChange) {
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
    modelSel.onchange = () => { state.modelId = modelSel.value; onChange(); };

    function segInit(id, key) {
      const seg = $(id);
      if (!seg) return;
      seg.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          state[key] = b.dataset.v;
          onChange();
        };
      });
    }
    segInit('seg-r', 'rScenario');
    segInit('seg-p', 'priceScenario');
    segInit('seg-w', 'weighting');

    $('cache').oninput = e => { state.cacheShare = +e.target.value / 100; $('cache-val').textContent = e.target.value + '%'; onChange(); };
    $('review').oninput = e => { state.reviewMult = +e.target.value / 100; $('review-val').textContent = (+e.target.value / 100).toFixed(1) + 'x'; onChange(); };
    $('risk').oninput = e => { state.riskMult = +e.target.value / 100; $('risk-val').textContent = (+e.target.value / 100).toFixed(1) + 'x'; onChange(); };

    $('reset').onclick = () => {
      Object.assign(state, AEVF.defaults());
      modelSel.value = state.modelId;
      $('cache').value = 50; $('cache-val').textContent = '50%';
      $('review').value = 100; $('review-val').textContent = '1.0x';
      $('risk').value = 100; $('risk-val').textContent = '1.0x';
      [['seg-r', 'base'], ['seg-p', 'base'], ['seg-w', 'value']].forEach(([id, v]) => {
        const seg = $(id);
        if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      });
      onChange();
    };
  }

  return { init };
})();
