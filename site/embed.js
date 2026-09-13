/* embed.html: the frontier chart plus a compact assumptions panel, for iframing on other sites.
 * Reads ?theme=light|dark, opens task cards in the top window, and posts its height to the parent
 * as {type:'aevf-embed-height', height} so the iframe can size itself. */
(function () {
  const D = window.AEVF_DATA;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);

  const state = AEVF.defaults();
  AEVF_CONTROLS.init(state, render);

  function render() {
    const model = D.models.find(m => m.id === state.modelId);
    const results = AEVF.computeAll(D.tasks, model, state);
    const sum = AEVF.summary(D.tasks, results, state);
    $('stat-share').textContent = AEVF_TABLE.fmtPct(sum.shareStrictValue);
    $('stat-count').textContent = sum.strictCount;
    AEVF_CHART.render($('chart'), D.tasks, results, {
      theme,
      minWidth: 640,
      onOpen: t => window.open('https://aevf-index.vercel.app/tasks#' + encodeURIComponent(t.task_id), '_blank', 'noopener')
    });
    postHeight();
  }

  function postHeight() {
    if (window.parent === window) return;
    const h = Math.ceil(document.querySelector('.embed').getBoundingClientRect().height) + 4;
    window.parent.postMessage({ type: 'aevf-embed-height', height: h }, '*');
  }
  window.addEventListener('resize', postHeight);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeight);

  document.querySelectorAll('.n-tasks').forEach(n => { n.textContent = D.tasks.length; });
  render();
})();
