import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
mkdirSync('.deploy', { recursive: true });
const instance = JSON.parse(readFileSync('.deploy/instance.json', 'utf8'));
if (!/^\d+\.\d+\.\d+\.\d+$/.test(instance.ip) || instance.ip === '0.0.0.0')
  throw new Error('A ready instance address is required.');
const config = parseEnv(readFileSync('.env.local', 'utf8'));
if (!/^[a-f0-9]{48}$/.test(config.POSTGRES_PASSWORD || ''))
  throw new Error('Expected generated database configuration.');
const siteHost = `shortfall.${instance.ip}.sslip.io`;
writeFileSync(
  '.deploy/runtime.env',
  `POSTGRES_PASSWORD=${config.POSTGRES_PASSWORD}\nAPP_ORIGIN=https://${siteHost}\nSITE_HOST=${siteHost}\n`,
);
const result = spawnSync(
  'tar',
  [
    '-czf',
    '.deploy/source.tar.gz',
    '--exclude=./node_modules',
    '--exclude=./.git',
    '--exclude=./.next',
    '--exclude=./.deploy',
    '--exclude=./.env',
    '--exclude=./.env.*',
    '--exclude=./data',
    '--exclude=./backups',
    '--exclude=./test-results',
    '--exclude=./playwright-report',
    '--exclude=./.ci-logs',
    '--exclude=*.log',
    '--exclude=*.tsbuildinfo',
    '.',
  ],
  { encoding: 'utf8' },
);
if (result.status !== 0) throw new Error('Source packaging failed.');
const entries = spawnSync('tar', ['-tzf', '.deploy/source.tar.gz'], { encoding: 'utf8' });
if (
  entries.status !== 0 ||
  entries.stdout
    .split(/\r?\n/)
    .some((entry) => /(^|\/)(\.env(?:\.|$)|\.deploy\/|node_modules\/|\.git\/)/.test(entry))
)
  throw new Error('Archive contains excluded private or dependency files.');
console.log(
  JSON.stringify({
    archive: '.deploy/source.tar.gz',
    hostname: siteHost,
    credentialFilesExcluded: true,
  }),
);
