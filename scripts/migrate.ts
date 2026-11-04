import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
const { migrate, closePool } = await import('../src/lib/db');
await migrate();
await closePool();
console.log('Database schema is ready.');
