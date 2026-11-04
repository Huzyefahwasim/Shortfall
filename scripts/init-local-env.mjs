import { writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env.local')) {
  console.log('Existing database configuration left unchanged.');
} else {
  const password = randomBytes(24).toString('hex');
  writeFileSync('.env.local', `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://shortfall:${password}@127.0.0.1:5432/shortfall\nAPP_ORIGIN=http://localhost:3000\nANTHROPIC_MODEL=claude-opus-5-5\n`, {flag:'wx'});
  console.log('Created ignored database configuration; no credentials printed.');
}
