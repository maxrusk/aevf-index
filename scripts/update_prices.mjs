// Refreshes data/model_pricing.json from the OpenRouter models API, then rebuilds site/data.js.
// Run on a schedule (see .github/workflows/update-prices.yml) so the index tracks
// falling model costs live. Reliability priors are NOT touched here: those are
// re-anchored manually against published evidence, per the methodology.
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'data', 'model_pricing.json');
const pricing = JSON.parse(readFileSync(file, 'utf8'));

// our id -> OpenRouter id
const MAP = {
  'claude-fable-5': 'anthropic/claude-fable-5',
  'claude-opus-5': 'anthropic/claude-opus-5',
  'claude-sonnet-5': 'anthropic/claude-sonnet-5',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
  'gpt-5.6-sol': 'openai/gpt-5.6-sol',
  'gpt-5.6-terra': 'openai/gpt-5.6-terra',
  'gpt-5.6-luna': 'openai/gpt-5.6-luna',
  'gemini-3.1-pro-preview': 'google/gemini-3.1-pro-preview',
  'gemini-3.7-flash': 'google/gemini-3.7-flash',
  'gemini-3.5-flash-lite': 'google/gemini-3.5-flash-lite',
  'deepseek-v4-pro': 'deepseek/deepseek-v4-pro-0813',
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash-0731'
};

const res = await fetch('https://openrouter.ai/api/v1/models');
if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);
const models = (await res.json()).data;
const byId = Object.fromEntries(models.map(m => [m.id, m]));
const today = new Date().toISOString().slice(0, 10);
const round = v => Math.round(v * 1000) / 1000;

let changed = 0;
for (const m of pricing.models) {
  const or = byId[MAP[m.id]];
  if (!or || !or.pricing) { console.warn(`no live price for ${m.id} (${MAP[m.id]}); keeping last value`); continue; }
  const input = round(parseFloat(or.pricing.prompt) * 1e6);
  const output = round(parseFloat(or.pricing.completion) * 1e6);
  const cache = or.pricing.input_cache_read ? round(parseFloat(or.pricing.input_cache_read) * 1e6) : m.cache_read_per_mtok;
  if (input !== m.input_per_mtok || output !== m.output_per_mtok || cache !== m.cache_read_per_mtok) {
    console.log(`${m.id}: $${m.input_per_mtok}/$${m.output_per_mtok} -> $${input}/$${output}`);
    changed++;
  }
  m.input_per_mtok = input;
  m.output_per_mtok = output;
  m.cache_read_per_mtok = cache;
  m.status = 'observed';
  m.source = { url: 'https://openrouter.ai/api/v1/models', title: 'OpenRouter models API (live feed; initial anchors read from provider pricing pages 2026-08-31)', retrieved: today };
}

pricing.retrieved = today;
pricing.status_note = `Prices tracked live via the OpenRouter models API (last refresh ${today}); initial anchors observed on provider pricing pages 2026-08-31. DeepSeek off-peak and provider batch tiers run ~50% below list.`;
writeFileSync(file, JSON.stringify(pricing, null, 2) + '\n');
execFileSync('node', [join(root, 'scripts', 'build_data.mjs')], { stdio: 'inherit' });
console.log(changed ? `${changed} model price(s) changed` : 'no price changes');
