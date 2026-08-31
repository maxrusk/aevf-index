/*
 * AEVF compute engine. Implements the index equations from the research spec:
 *   TCEVO  = C_inference / R           (token cost per economically viable output)
 *   FCSO   = C_total / R               (full cost per successful output)
 *   EV     = R * V - C                 (expected surplus per attempt)
 *   Phi    = R * V / C                 (viability ratio; > 1 means inside the frontier)
 *   CCR    = P_human / C_ai            (market cost-compression ratio)
 *
 * Every input is either sourced (prices, model rates) or a labeled modeled
 * assumption (tokens, review time, risk, reliability priors). Nothing here is
 * a measured trial result.
 */

const AEVF = (() => {

  const REVIEW_RATES = {
    attorney: 180, cpa: 120, engineer: 110, analyst: 85,
    editor: 60, support_lead: 45, clinician_admin: 75, recruiter: 65
  };

  const CAPITAL_SHARE = 0.10; // orchestration, storage, compliance overhead as share of direct cost

  // assumptions: { model, cacheShare, rScenario, priceScenario, reviewMult, riskMult, toolMult }
  function defaults() {
    return {
      modelId: 'claude-sonnet-5',
      cacheShare: 0.5,     // share of input tokens served from prompt cache
      rScenario: 'base',   // low | base | high
      priceScenario: 'base',
      reviewMult: 1.0,
      riskMult: 1.0,
      toolMult: 1.0,
      weighting: 'value'   // value | equal
    };
  }

  function inferenceCost(task, model, a) {
    const inMtok = task.input_tokens / 1e6;
    const outMtok = task.output_tokens / 1e6;
    const cacheRate = model.cache_read_per_mtok != null ? model.cache_read_per_mtok : model.input_per_mtok;
    const inputCost = inMtok * ((1 - a.cacheShare) * model.input_per_mtok + a.cacheShare * cacheRate);
    const outputCost = outMtok * model.output_per_mtok;
    return task.attempts_avg * (inputCost + outputCost);
  }

  function reliability(task, a) {
    if (a.rScenario === 'low') return task.r_low;
    if (a.rScenario === 'high') return task.r_high;
    return task.r_base;
  }

  function wtp(task, a) {
    if (a.priceScenario === 'low') return task.price_low;
    if (a.priceScenario === 'high') return task.price_high;
    return task.price_base;
  }

  function compute(task, model, a) {
    const cInf = inferenceCost(task, model, a);
    const cTool = task.tool_cost * a.toolMult;
    const rate = REVIEW_RATES[task.review_role] || 85;
    const cHuman = (task.review_minutes / 60) * rate * a.reviewMult;
    const direct = cInf + cTool + cHuman;
    const cCapital = direct * CAPITAL_SHARE;
    const cRisk = task.risk_cost * a.riskMult;
    const cTotal = direct + cCapital + cRisk;

    const R = reliability(task, a);
    const V = wtp(task, a);

    const tcevo = cInf / R;
    const fcso = cTotal / R;
    const ev = R * V - cTotal;
    const phi = (R * V) / cTotal;
    const ccr = V / cTotal;           // market compression vs historical price
    const viable = phi > 1 && R >= (task.min_reliability_relaxed ? task.min_reliability * 0.9 : 0);
    const meetsFloor = R >= task.min_reliability;

    return {
      task_id: task.task_id, cInf, cTool, cHuman, cCapital, cRisk, cTotal,
      R, V, tcevo, fcso, ev, phi, ccr, viable: phi > 1, meetsFloor,
      stronglyViable: phi > 1 && R >= task.min_reliability
    };
  }

  function computeAll(tasks, model, a) {
    return tasks.map(t => compute(t, model, a));
  }

  // Frontier share, spec section 11.6: weighted share of tasks with Phi > 1.
  function frontierShare(tasks, results, a, strict) {
    let num = 0, den = 0;
    tasks.forEach((t, i) => {
      const w = a.weighting === 'equal' ? 1 : (a.priceScenario === 'low' ? t.price_low : a.priceScenario === 'high' ? t.price_high : t.price_base);
      const inSet = strict ? results[i].stronglyViable : results[i].viable;
      den += w;
      if (inSet) num += w;
    });
    return den > 0 ? num / den : 0;
  }

  function median(arr) {
    const s = [...arr].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function summary(tasks, results, a) {
    const viable = results.filter(r => r.viable);
    const strict = results.filter(r => r.stronglyViable);
    return {
      count: tasks.length,
      viableCount: viable.length,
      strictCount: strict.length,
      shareValueWeighted: frontierShare(tasks, results, { ...a, weighting: 'value' }, false),
      shareEqualWeighted: frontierShare(tasks, results, { ...a, weighting: 'equal' }, false),
      shareStrictValue: frontierShare(tasks, results, { ...a, weighting: 'value' }, true),
      shareStrictEqual: frontierShare(tasks, results, { ...a, weighting: 'equal' }, true),
      medianPhi: median(results.map(r => r.phi)),
      medianCCR: median(results.map(r => r.ccr)),
      medianTCEVO: median(results.map(r => r.tcevo)),
      totalV: results.reduce((s, r) => s + r.V, 0),
      totalC: results.reduce((s, r) => s + r.cTotal, 0),
      frontierValue: results.filter(r => r.viable).reduce((s, r) => s + r.V, 0)
    };
  }

  return { defaults, compute, computeAll, frontierShare, summary, median, REVIEW_RATES, CAPITAL_SHARE };
})();

if (typeof module !== 'undefined') module.exports = AEVF;
