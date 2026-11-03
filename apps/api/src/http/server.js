import { createServer } from 'node:http';
import { createApp } from './app.js';

export function createHttpServer(options) {
  const server = createServer(createApp(options));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
