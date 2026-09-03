// Validates task cards against data/TASK_METHODOLOGY.md and checks every card has a
// matching price record. Run: node scripts/validate_data.mjs [--staging]
// With --staging, also validates data/staging/*.cards.json as if merged.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(readFileSync(join(root, f), 'utf8'));
const staging = process.argv.includes('--staging');

const base = read('data/tasks_base.json');
const ROLES = Object.keys(base.defaults.review_rates_hr);
const ENUM = {
  risk_class: ['low', 'moderate', 'high'],
  verification: ['deterministic', 'expert', 'user', 'outcome'],
  confidence: ['A', 'B', 'C', 'D']
};
const FIELDS = ['task_id', 'name', 'domain', 'unit', 'economic_output', 'risk_class', 'verification', 'autonomy',
  'substitutability', 'min_reliability', 'r_base', 'r_low', 'r_high', 'input_tokens', 'output_tokens', 'attempts_avg',
  'tool_cost', 'review_minutes', 'review_role', 'risk_cost', 'confidence', 'notes'];

let cards = [...base.tasks];
if (staging && existsSync(join(root, 'data/staging'))) {
  for (const f of readdirSync(join(root, 'data/staging')).filter(f => f.endsWith('.cards.json')))
    cards.push(...read(join('data/staging', f)).tasks.map(t => ({ ...t, _file: f })));
}
const prices = readdirSync(join(root, 'data/partials')).filter(f => f.endsWith('.json'))
  .flatMap(f => read(join('data/partials', f)).tasks.map(t => ({ ...t, _file: f })));

const errors = [], warnings = [];
const err = (t, m) => errors.push(`${t.task_id || '?'}${t._file ? ' [' + t._file + ']' : ''}: ${m}`);
const warn = (t, m) => warnings.push(`${t.task_id || '?'}: ${m}`);

const seen = new Map();
for (const t of cards) {
  if (seen.has(t.task_id)) err(t, `duplicate task_id (also in ${seen.get(t.task_id)})`);
  seen.set(t.task_id, t._file || 'tasks_base.json');
  for (const f of FIELDS) if (t[f] === undefined || t[f] === null || t[f] === '') err(t, `missing field ${f}`);
  const extra = Object.keys(t).filter(k => !FIELDS.includes(k) && k !== '_file');
  if (extra.length) err(t, `unexpected fields ${extra.join(',')}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.task_id)) err(t, 'task_id not kebab-case');
  for (const [k, vals] of Object.entries(ENUM)) if (!vals.includes(t[k])) err(t, `${k} must be one of ${vals.join('|')}, got ${t[k]}`);
  if (!ROLES.includes(t.review_role)) err(t, `review_role ${t.review_role} not in ${ROLES.join('|')}`);
  for (const k of ['autonomy', 'substitutability']) if (!Number.isInteger(t[k]) || t[k] < 0 || t[k] > 5) err(t, `${k} must be integer 0-5`);
  for (const k of ['min_reliability', 'r_base', 'r_low', 'r_high']) if (typeof t[k] !== 'number' || t[k] <= 0 || t[k] > 1) err(t, `${k} must be in (0,1]`);
  if (!(t.r_low <= t.r_base && t.r_base <= t.r_high)) err(t, 'need r_low <= r_base <= r_high');
  for (const k of ['input_tokens', 'output_tokens', 'review_minutes', 'tool_cost', 'risk_cost']) if (typeof t[k] !== 'number' || t[k] < 0) err(t, `${k} must be a non-negative number`);
  if (typeof t.attempts_avg !== 'number' || t.attempts_avg < 1) err(t, 'attempts_avg must be >= 1');
  for (const k of ['name', 'economic_output', 'notes', 'unit', 'domain']) if (typeof t[k] === 'string' && /—/.test(t[k])) err(t, `em dash in ${k}`);
  const ps = prices.filter(p => p.task_id === t.task_id);
  if (ps.length === 0) err(t, 'no price record');
  else if (ps.length > 1) err(t, `price record in ${ps.length} files: ${ps.map(p => p._file).join(',')}`);
  else {
    const p = ps[0];
    // price units may qualify the card unit ("per return (1120-S)"), but must start with it
    if (!(p.unit || '').startsWith(t.unit)) err(t, `unit mismatch: card "${t.unit}" vs price "${p.unit}"`);
    if (!(p.price_low <= p.price_base && p.price_base <= p.price_high)) err(t, 'need price_low <= price_base <= price_high');
    if (!(p.price_base > 0)) err(t, 'price_base must be > 0');
    if (!Array.isArray(p.sources) || p.sources.length === 0) err(t, 'price record has no sources');
    else for (const s of p.sources) {
      for (const k of ['url', 'title', 'retrieved']) if (!s[k]) err(t, `source missing ${k}`);
      if (s.url && !/^https?:\/\//.test(s.url)) err(t, `bad source url ${s.url}`);
    }
    if (!p.status) err(t, 'price record missing status');
    if (!p.price_basis) warn(t, 'price record missing price_basis');
    for (const k of ['price_basis', 'notes', 'status']) if (typeof p[k] === 'string' && /—/.test(p[k])) err(t, `em dash in price ${k}`);
    if (p.human_minutes == null) warn(t, 'no human_minutes');
    if (p.price_high / p.price_low > 10 && p.sources.length < 2) warn(t, 'price range spans >10x with a single source');
  }
}
const orphans = prices.filter(p => !seen.has(p.task_id));
for (const p of orphans) warnings.push(`${p.task_id} [${p._file}]: price record with no card`);

const domains = {};
for (const t of cards) domains[t.domain] = (domains[t.domain] || 0) + 1;
console.log(`${cards.length} cards, ${prices.length} price records, ${Object.keys(domains).length} domains`);
console.log(Object.entries(domains).sort((a, b) => b[1] - a[1]).map(([d, n]) => `  ${d}: ${n}`).join('\n'));
if (warnings.length) console.log(`\n${warnings.length} warnings:\n  ` + warnings.join('\n  '));
if (errors.length) { console.error(`\n${errors.length} errors:\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('\nOK');
