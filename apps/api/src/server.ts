import { app } from './app.js';

const port = Number(process.env.API_PORT ?? 4310);
await app.listen({ port, host: '127.0.0.1' });
