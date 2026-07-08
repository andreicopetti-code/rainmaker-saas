import fs from 'fs';
import path from 'path';

const sqlPath = path.join(process.cwd(), 'scripts/import-data/import-legacy.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const blocks = [...sql.matchAll(/DO \$\$[\s\S]*?END \$\$;/g)].map((m) => m[0]);
const outDir = path.join(process.cwd(), 'scripts/import-data/batches');
fs.mkdirSync(outDir, { recursive: true });

const batchSize = 5;
for (let i = 0; i < blocks.length; i += batchSize) {
  const batch = blocks.slice(i, i + batchSize).join('\n\n');
  const file = path.join(outDir, `batch-${Math.floor(i / batchSize) + 1}.sql`);
  fs.writeFileSync(file, batch);
  console.log(file, batch.length);
}
