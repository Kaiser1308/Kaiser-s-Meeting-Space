import { OutboxDispatcher } from './dispatcher.js';
import { KMSWorker } from './worker.js';
import { JobTypeSchema } from '@kms/domain';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}
const dbUrl: string = databaseUrl;

const dispatcher = new OutboxDispatcher({ databaseUrl: dbUrl, redisUrl });
const workers: KMSWorker[] = [];

async function bootstrap() {
  console.log('Starting background worker process...');
  
  // Start outbox dispatcher
  await dispatcher.start();
  console.log('Outbox dispatcher started');

  // Start a worker for each job type in the domain registry
  for (const type of JobTypeSchema.options) {
    const worker = new KMSWorker(type, { databaseUrl: dbUrl, redisUrl });
    await worker.start();
    workers.push(worker);
    console.log(`Worker started for job type: ${type}`);
  }
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down worker process gracefully...`);
  
  // Stop outbox dispatcher
  await dispatcher.stop().catch(console.error);
  
  // Stop all job workers
  await Promise.all(workers.map((w) => w.stop().catch(console.error)));
  
  console.log('Graceful shutdown completed');
  process.exit(0);
}

// Register signal listeners
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

bootstrap().catch((err) => {
  console.error('Bootstrap failure:', err);
  process.exit(1);
});
