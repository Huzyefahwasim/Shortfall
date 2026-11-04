import { config } from 'dotenv';
import { resolve } from 'node:path';

// Local web configuration contributes only the database URL; deployment environment wins.
const databaseEnvironment: Record<string, string> = {};
config({ path: resolve(process.cwd(), '.env.local'), processEnv: databaseEnvironment, quiet: true, override: false });
if (!process.env.DATABASE_URL && databaseEnvironment.DATABASE_URL) {
  process.env.DATABASE_URL = databaseEnvironment.DATABASE_URL;
}
// Only this process loads the provider secret. Web startup never loads this file.
config({ path: resolve(process.cwd(), '.env.worker.local'), quiet: true, override: false });

async function main(): Promise<void> {
  const { runWorker } = await import('./run');
  await runWorker();
}

main().catch(() => {
  console.error('Worker startup failed. Check database availability and worker configuration.');
  process.exitCode = 1;
});
