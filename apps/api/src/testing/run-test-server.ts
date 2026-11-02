import { startDeterministicTestServer } from './test-app.js';

const server = await startDeterministicTestServer();
process.stdout.write(`${server.baseUrl}\n`);

const shutdown = async () => {
  await server.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
