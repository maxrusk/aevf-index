// Appends data/staging/*.cards.json into data/tasks_base.json (after validation) and
// removes the staging files. Run: node scripts/validate_data.mjs --staging && node scripts/merge_staging.mjs
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const basePath = join(root, 'data/tasks_base.json');
const base = JSON.parse(readFileSync(basePath, 'utf8'));
const files = readdirSync(join(root, 'data/staging')).filter(f => f.endsWith('.cards.json')).sort();
let added = 0;
for (const f of files) {
  const { tasks } = JSON.parse(readFileSync(join(root, 'data/staging', f), 'utf8'));
  for (const t of tasks) {
    if (base.tasks.some(x => x.task_id === t.task_id)) throw new Error(`duplicate ${t.task_id} in ${f}`);
    base.tasks.push(t); added++;
  }
}
writeFileSync(basePath, JSON.stringify(base, null, 2) + '\n');
for (const f of files) unlinkSync(join(root, 'data/staging', f));
console.log(`merged ${added} cards from ${files.length} staging files; universe now ${base.tasks.length}`);
