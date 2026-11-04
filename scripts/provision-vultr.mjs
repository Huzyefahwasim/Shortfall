import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
const env = parseEnv(readFileSync('.env.deploy.local', 'utf8'));
if (!env.VULTR_API_KEY) throw new Error('Vultr key is missing.');
mkdirSync('.deploy', { recursive: true });
const headers = {
  Authorization: `Bearer ${env.VULTR_API_KEY}`,
  'Content-Type': 'application/json',
};
async function api(path, method = 'GET', body) {
  const result = await fetch(`https://api.vultr.com/v2/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!result.ok) throw new Error(`Vultr ${method} ${path} returned ${result.status}`);
  return result.json();
}
try {
  let instance;
  if (existsSync('.deploy/instance.json')) {
    const saved = JSON.parse(readFileSync('.deploy/instance.json', 'utf8'));
    instance = (await api(`instances/${saved.id}`)).instance;
  } else {
    const matching = (await api('instances')).instances.filter((i) => i.label === 'shortfall-demo');
    if (matching.length > 1)
      throw new Error('Multiple named deployments exist; manual reconciliation required.');
    instance = matching[0];
    if (!instance) {
      if (!process.argv.includes('--create'))
        throw new Error(
          'No deployment exists. Pass --create for the reviewed single-instance plan.',
        );
      const plan = (await api('plans?per_page=500')).plans.find((p) => p.id === 'vc2-2c-4gb');
      if (!plan || plan.monthly_cost > 30 || !plan.locations.includes('fra'))
        throw new Error('Reviewed plan is unavailable or exceeds the monthly allowance.');
      const sshPublic = readFileSync('.deploy/shortfall_ed25519.pub', 'utf8').trim();
      const keys = (await api('ssh-keys')).ssh_keys;
      let key = keys.find((k) => k.ssh_key?.trim() === sshPublic);
      if (!key)
        key = (await api('ssh-keys', 'POST', { name: 'shortfall-deploy', ssh_key: sshPublic }))
          .ssh_key;
      instance = (
        await api('instances', 'POST', {
          region: 'fra',
          plan: plan.id,
          os_id: 2284,
          label: 'shortfall-demo',
          hostname: 'shortfall',
          sshkey_id: [key.id],
          enable_ipv6: false,
          backups: 'disabled',
          user_data: Buffer.from(readFileSync('deploy/cloud-init.yaml', 'utf8')).toString('base64'),
          tags: ['shortfall', 'hackathon'],
        })
      ).instance;
    }
  }
  const safe = {
    id: instance.id,
    label: instance.label,
    region: instance.region,
    plan: instance.plan,
    ip: instance.main_ip,
    status: instance.status,
    powerStatus: instance.power_status,
    serverStatus: instance.server_status,
  };
  writeFileSync('.deploy/instance.json', JSON.stringify(safe, null, 2));
  console.log(JSON.stringify(safe));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Provisioning failed');
  process.exitCode = 1;
}
