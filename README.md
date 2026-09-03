# AEVF Index

**The AI Economic Viability Frontier**: a live, expanding index of real economic tasks, each priced two ways, what buyers pay a human or firm to produce the outcome, and what it costs an AI system to produce an accepted outcome all-in. The task universe grows release by release (v0.1 shipped with 50 tasks, v0.2 with 100, v0.3 with 200 across 32 domains); every aggregate recomputes over whatever the universe holds. A task is inside the frontier when

```
R · V > C
```

where `V` is willingness to pay, `R` is the probability the AI-produced output is accepted, and `C` is total production cost (inference + tools + human review + capital overhead + expected error cost).

Live site: https://aevf-index.vercel.app · A [Theseus Holdings](https://theseusholdings.xyz) research instrument.

## Metrics

| Metric | Formula | Meaning |
|---|---|---|
| TCEVO | `C_inference / R` | Token cost per economically viable output |
| FCSO | `C_total / R` | Full cost per successful output |
| EV | `R·V − C` | Expected surplus per attempt |
| Φ | `R·V / C` | Viability ratio; > 1 is inside the frontier |
| CCR | `P_human / C_AI` | Cost compression vs the human market price |

The index headline is the **frontier share**: the value-weighted share of the basket that clears cost *and* its task-specific reliability floor. Every figure recomputes live in the browser as you change the model, cache hit rate, reliability scenario, WTP scenario, and review/risk multipliers.

## Honesty contract

- **Observed**: market prices for most tasks (marketplace averages, benchmark studies like the CAQH Index and Ardent Partners, vendor list prices) and all model token prices, each cited with URL and retrieval date (2026-08-31).
- **Derived**: prices where no per-unit market exists (wage × time, derivation stated).
- **Anchored estimates**: reliability priors, anchored to published evidence (production support resolution rates, SWE-bench Verified/Pro, GDPval, Stanford legal hallucination study, AccountingBench, WMT) and discounted 15-30 points from headline benchmark numbers.
- **Modeled assumptions**: token counts, retry rates, review minutes, tool and risk costs.

Nothing in the index to date is a measured trial. Phase II replaces the priors with 20+ graded trials per task. The basket is selected for AI-plausibility, so its frontier share runs far ahead of the economy's; it is also open-ended, with new tasks added release by release. Full caveats in [the methodology](https://aevf-index.vercel.app/methodology.html).

## Repository layout

```
data/
  tasks_base.json            task cards: modeled cost assumptions, reliability priors, scores
  partials/*.json            sourced market prices per domain (with citations)
  TASK_METHODOLOGY.md        how to add a task card and its sourced price record
  model_pricing.json         live API pricing, observed 2026-08-31
  reliability_evidence.json  published evidence rows + prior mapping
scripts/build_data.mjs       merges data/ into site/data.js
site/                        static site (compute.js is the equation engine)
```

## Run locally

```
node scripts/build_data.mjs
open site/index.html
```

## Provenance

Built from the AEVF/TCEVO research specification (frontier definition, metric set, task schema, failure-mode list). The spec's Phase I feasibility stance applies: no headline aggregate should be quoted without its weighting and confidence caveats.
