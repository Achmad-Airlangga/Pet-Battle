import { GameServer } from './GameServer.ts';

const server = new GameServer({
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST,
});

const { port } = await server.listen();
console.log(`Pet Battle server listening: ws://localhost:${port}/ws  (http://localhost:${port}/health, /pets)`);

const shutdown = async () => {
  console.log('Shutting down...');
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
