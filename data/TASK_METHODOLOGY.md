# Adding tasks to the AEVF Index

Every task in the index is two records that share a `task_id`:

1. A **task card** in `data/tasks_base.json` (`tasks[]`): modeled cost assumptions and reliability priors.
2. A **price record** in one `data/partials/*.json` file (`tasks[]`): the sourced human-market price with citations.

`scripts/build_data.mjs` joins them on `task_id` and fails the build if a card has no price.

## Task selection

A task belongs in the index when it is (a) a discrete unit of economic output that a buyer actually pays for, (b) gradable by a professional against acceptance criteria, and (c) plausibly producible by an AI system with scaffolding today. Prefer tasks with a real per-unit market (flat fees, marketplace rates, vendor list prices, benchmark cost studies). Where none exists, derive the price from wage times task time and say so. Avoid duplicating an existing `task_id`; name a task by the output, not the tool.

## Task card schema (`data/tasks_base.json`)

| field | type | rule |
|---|---|---|
| `task_id` | kebab-case string | unique across the index |
| `name` | string | short, output-named ("Standard mutual NDA review") |
| `domain` | string | industry label shown as a filter chip; reuse an existing label where one fits |
| `unit` | string | the priced unit: "per document", "per 100 invoices", "per month" |
| `economic_output` | string | one sentence: what the buyer receives and what "accepted" means |
| `risk_class` | `low` \| `moderate` \| `high` | consequence of an undetected error |
| `verification` | `deterministic` \| `expert` \| `user` \| `outcome` | how acceptance is judged |
| `autonomy` | 0-5 | how far the AI runs unattended today (5 = fully autonomous) |
| `substitutability` | 0-5 | how completely the AI output replaces the human deliverable (5 = drop-in) |
| `min_reliability` | 0-1 | acceptance rate a buyer needs before adopting; high-stakes tasks 0.95+, drafts 0.70-0.85 |
| `r_base`, `r_low`, `r_high` | 0-1 | anchored reliability prior, see below |
| `input_tokens`, `output_tokens` | int | per attempt, for a competent single-agent scaffold including context, retrieved documents, tool outputs |
| `attempts_avg` | float >= 1 | expected attempts including retries (1.1 to 1.6 typical) |
| `tool_cost` | USD | search, OCR, enrichment APIs, code execution per attempt |
| `review_minutes` | int | human review or sign-off minutes per output |
| `review_role` | one of `attorney` 180, `cpa` 120, `engineer` 110, `analyst` 85, `editor` 60, `support_lead` 45, `clinician_admin` 75, `recruiter` 65, `designer` 75, `specialist` 130, `underwriter` 90, `ops_manager` 70 | hourly rate applied to review minutes |
| `risk_cost` | USD | expected error or liability cost per output: low 0-5, moderate 5-40, high 40-500 depending on stakes |
| `confidence` | `A` \| `B` \| `C` \| `D` | A = observed price + strong reliability evidence + near-deterministic verification; B = observed or well-anchored price, reasonable evidence; C = derived price or thin evidence; D = speculative |
| `notes` | string | one line: the key constraint, analog, or regulatory gate |

## Reliability priors

R is the probability a professional accepts the output, not a benchmark score. Discount headline benchmarks 15 to 30 points. Domain ranges used so far (2026-08): software 0.70-0.85; support 0.55-0.75; legal bimodal (narrow review 0.75-0.85, open research 0.55-0.65); medical coding 0.45-0.70; translation 0.75-0.90; finance and bookkeeping 0.40-0.65 at task level; general knowledge deliverables 0.50-0.70. Narrow, well-specified, checkable tasks sit at the top of a range; open-ended, multi-period, or judgment-heavy tasks sit at the bottom. `r_low` is typically 8 to 15 points under `r_base`, `r_high` 5 to 10 points over.

Calibrate against analogs, not in isolation. Before finalizing a prior, find the closest existing card by structure (verification type, autonomy, risk class, output shape) and set R relative to it: a deterministic form-assembly task should sit near `underwriting-intake` or `po-processing` (0.92 to 0.95), a narrow expert review near `nda-review` (0.85), an open research memo near `legal-research-memo` (0.65). Different authors drift by 10 points or more on the same task; the analog check is what keeps the frontier share comparable across releases.

## Price record schema (`data/partials/*.json`)

```json
{"task_id": "...", "unit": "...", "price_low": 0, "price_base": 0, "price_high": 0,
 "human_minutes": 0,
 "price_basis": "How the three numbers were produced, with the anchor figures quoted",
 "status": "observed | derived | estimated | mixed, with a parenthetical saying which parts",
 "sources": [{"url": "...", "title": "...", "publisher": "...", "date": "YYYY-MM-DD or YYYY", "retrieved": "YYYY-MM-DD", "note": "the figure taken from this source"}],
 "notes": "one line of context"}
```

Rules: `unit` must match the card. Prices are USD per unit for the human or firm alternative, not for AI tools. At least one source per record, two where the range spans an order of magnitude. `status` vocabulary: `observed` (a published price for this unit), `derived` (wage x time, both sourced), `estimated` (author judgment on observed anchors), `mixed` (say which is which). Every source carries a `retrieved` date. Never cite a source you did not open.

## Honesty contract

Nothing here is a measured trial. Say what is observed and what is modeled. Where AI supply is already compressing the market price, note it, because V then overstates durable willingness to pay. Where a task is legally gated (signature, licence, bar membership), note it in the card.
