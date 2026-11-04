import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Read named credential files only; output service status, never response bodies or secrets.
function config(path) { try { return parseEnv(readFileSync(path, 'utf8')); } catch { return {}; } }
const worker = config('.env.worker.local');
const deploy = config('.env.deploy.local');
async function check(label, url, headers, summarize) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) { console.log(JSON.stringify({service:label,status:response.status,ok:false})); return; }
    const data = await response.json();
    console.log(JSON.stringify({service:label,ok:true,...summarize(data)}));
  } catch { console.log(JSON.stringify({service:label,ok:false,error:'Connection failed or timed out'})); }
}
const operations = [];
if (worker.ANTHROPIC_API_KEY) {
  const headers = { 'x-api-key': worker.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' };
  if (worker.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = worker.ANTHROPIC_WORKSPACE_ID;
  operations.push(check('anthropic-model', 'https://api.anthropic.com/v1/models/claude-opus-5-5', headers, data => ({model:data.id})));
} else console.log(JSON.stringify({service:'anthropic-model',ok:false,error:'Key not configured'}));
if (deploy.VULTR_API_KEY) {
  const headers = { Authorization:`Bearer ${deploy.VULTR_API_KEY}` };
  operations.push(check('vultr-account','https://api.vultr.com/v2/account',headers, data=>({pendingCharges:data.account?.pending_charges, balance:data.account?.balance})));
  operations.push(check('vultr-instances','https://api.vultr.com/v2/instances',headers,data=>({instances:(data.instances||[]).map(item=>({id:item.id,label:item.label,region:item.region,plan:item.plan,status:item.status}))})));
} else console.log(JSON.stringify({service:'vultr-account',ok:false,error:'Key not configured'}));
await Promise.all(operations);
