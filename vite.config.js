import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAuth } from './server/auth.mjs';
import { createWikiGraphIndexer, resolveWikiDir } from './server/wiki-graph-indexer.mjs';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return env;
      const [, key, rawValue] = match;
      env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
      return env;
    }, {});
}

function findHermesTargetFromLog(logPath) {
  if (!existsSync(logPath)) return '';
  const text = readFileSync(logPath, 'utf8');
  const matches = [...text.matchAll(/API server listening on (https?:\/\/[^\s]+) \(model:/g)];
  return matches.at(-1)?.[1] || '';
}

function requestHealth(target, timeoutMs = 700) {
  return new Promise((resolve) => {
    const url = new URL('/health', target);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function detectHermesTarget(env) {
  if (env.HERMES_API_TARGET) return env.HERMES_API_TARGET;

  const host = env.API_SERVER_HOST || '127.0.0.1';
  if (env.API_SERVER_PORT) return `http://${host}:${env.API_SERVER_PORT}`;

  const logTarget = findHermesTargetFromLog(join(homedir(), '.hermes', 'logs', 'gateway.log'));
  if (logTarget && await requestHealth(logTarget)) return logTarget;

  const candidates = ['8643', '8642'].map((port) => `http://${host}:${port}`);
  for (const candidate of candidates) {
    if (await requestHealth(candidate)) return candidate;
  }

  return candidates[0];
}

async function readDevChatHistory(nodeId) {
  if (!nodeId) return [];
  const filePath = devChatHistoryPath(nodeId);
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(await readFile(filePath, 'utf8'));
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

async function writeDevChatHistory(nodeId, messages) {
  if (!nodeId) return;
  const filePath = devChatHistoryPath(nodeId);
  await mkdir(join(process.cwd(), 'data', 'chat-history'), { recursive: true });
  await writeFile(filePath, JSON.stringify({ nodeId, updatedAt: new Date().toISOString(), messages: messages.slice(-80) }, null, 2));
}

function devChatHistoryPath(nodeId) {
  const safeId = String(nodeId).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_').slice(0, 140) || 'node';
  return join(process.cwd(), 'data', 'chat-history', `${safeId}.json`);
}

async function readDevJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

const hermesEnv = {
  ...loadEnvFile(join(homedir(), '.hermes', '.env')),
  ...loadEnvFile(join(process.cwd(), '.hermes', '.env')),
  ...process.env
};

const hermesResolvedApiKey = hermesEnv.API_SERVER_KEY || hermesEnv.HERMES_API_KEY || hermesEnv.VITE_HERMES_API_KEY || '';
const hermesBaseUrl = hermesEnv.VITE_HERMES_API_BASE_URL || '/api/hermes/v1';

export default defineConfig(async ({ command }) => {
  const hermesTarget = await detectHermesTarget(hermesEnv);
  const wikiIndexer = command === 'serve'
    ? createWikiGraphIndexer({ wikiDir: resolveWikiDir(hermesEnv) })
    : null;
  const auth = command === 'serve' ? await createAuth({ rootDir: process.cwd(), env: hermesEnv }) : null;
  if (wikiIndexer) await wikiIndexer.start();

  return {
  plugins: [
    react(),
    {
      name: 'second-brain-hermes-config',
      configureServer(server) {
        if (!wikiIndexer) return;
        server.middlewares.use('/api/auth', async (request, response) => {
          const url = new URL(request.url || '', 'http://localhost');
          url.pathname = `/api/auth${url.pathname}`;
          await auth.handle(request, response, url);
        });
        server.middlewares.use('/api', (request, response, next) => {
          if (request.url?.startsWith('/auth/')) return next();
          if (!auth.getSessionUser(request)) {
            response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          next();
        });
        server.middlewares.use('/api/graph', async (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(await wikiIndexer.getGraph()));
        });
        server.middlewares.use('/api/chat/history', async (request, response) => {
          const url = new URL(request.url || '', 'http://localhost');
          if (request.method === 'GET') {
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ messages: await readDevChatHistory(url.searchParams.get('nodeId') || '') }));
            return;
          }
          if (request.method === 'PUT') {
            const body = await readDevJsonBody(request);
            await writeDevChatHistory(body.nodeId, Array.isArray(body.messages) ? body.messages : []);
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: true }));
            return;
          }
          response.statusCode = 405;
          response.end('Method not allowed');
        });
        server.middlewares.use('/api/wiki/content', async (request, response) => {
          const url = new URL(request.url || '', 'http://localhost');
          const content = await wikiIndexer.getNodeContent(url.searchParams.get('id') || '');
          if (content == null) {
            response.statusCode = 404;
            response.end('Node content not found');
            return;
          }
          response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(content);
        });
        server.middlewares.use('/api/wiki/events', (request, response) => {
          response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive'
          });
          response.write(`event: ready\ndata: ${JSON.stringify({ version: wikiIndexer.getVersion() })}\n\n`);
          const unsubscribe = wikiIndexer.onUpdate(({ version }) => {
            response.write(`event: graph-update\ndata: ${JSON.stringify({ version })}\n\n`);
          });
          request.on('close', unsubscribe);
        });
        server.middlewares.use('/api/hermes/config', (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({
            baseUrl: hermesBaseUrl,
            target: hermesTarget,
            hasApiKey: Boolean(hermesResolvedApiKey),
            apiKey: hermesResolvedApiKey
          }));
        });
      }
    }
  ],
  server: {
    proxy: {
      '/api/hermes': {
        target: hermesTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('cookie');
            if (hermesResolvedApiKey) {
              proxyReq.setHeader('Authorization', `Bearer ${hermesResolvedApiKey}`);
            }
          });
        },
        rewrite: (path) => path.replace(/^\/api\/hermes/, '')
      }
    }
  }
  };
});
