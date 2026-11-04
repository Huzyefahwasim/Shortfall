import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const env=parseEnv(readFileSync('.env.deploy.local','utf8'));
if(!env.VULTR_API_KEY) throw new Error('Vultr key is not configured.');
const headers={Authorization:`Bearer ${env.VULTR_API_KEY}`};
for(const path of ['plans?per_page=500','regions?per_page=500','os?per_page=500']){
  const response=await fetch(`https://api.vultr.com/v2/${path}`,{headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok){console.log(JSON.stringify({resource:path,status:response.status}));continue;}
  const data=await response.json();
  if(data.plans)console.log(JSON.stringify({plans:data.plans.filter(p=>p.ram>=4096&&p.ram<=8192&&p.monthly_cost<=50&&p.vcpu_count>=2).map(p=>({id:p.id,ram:p.ram,vcpu:p.vcpu_count,cost:p.monthly_cost,locations:p.locations}))}));
  if(data.regions)console.log(JSON.stringify({regions:data.regions.filter(r=>['sgp','bom','del','blr','fra','ams','lhr','ewr'].includes(r.id)).map(r=>({id:r.id,city:r.city,options:r.options}))}));
  if(data.os)console.log(JSON.stringify({os:data.os.filter(o=>/Ubuntu 24.04|Ubuntu 22.04|Debian 12|Debian 13/i.test(o.name))}));
}
