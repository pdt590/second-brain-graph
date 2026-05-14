import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createAuth } from './server/auth.mjs';
import { readChatHistory, summarizeChatHistory, writeChatHistory } from './server/chat-history.mjs';
import { detectHermesTarget, loadRuntimeEnv } from './server/runtime-config.mjs';
import { createWikiGraphIndexer, resolveWikiDir } from './server/wiki-graph-indexer.mjs';

async function readDevJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

const hermesEnv = loadRuntimeEnv();
const hermesResolvedApiKey = hermesEnv.API_SERVER_KEY || '';
const hermesBaseUrl = '/api/hermes/v1';

export default defineConfig(async ({ command }) => {
  const hermesTarget = await detectHermesTarget(hermesEnv);
  const wikiIndexer = command === 'serve'
    ? createWikiGraphIndexer({ wikiDir: resolveWikiDir(hermesEnv) })
    : null;
  const auth = command === 'serve' ? await createAuth({ rootDir: process.cwd(), env: hermesEnv }) : null;
  if (wikiIndexer) await wikiIndexer.start();

  return {
  build: {
    chunkSizeWarningLimit: 800
  },
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
            response.end(JSON.stringify({ messages: await readChatHistory(process.cwd(), url.searchParams.get('nodeId') || '') }));
            return;
          }
          if (request.method === 'PUT') {
            const body = await readDevJsonBody(request);
            await writeChatHistory(process.cwd(), body.nodeId, body.messages);
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: true }));
            return;
          }
          response.statusCode = 405;
          response.end('Method not allowed');
        });
        server.middlewares.use('/api/chat/summary', async (request, response) => {
          const url = new URL(request.url || '', 'http://localhost');
          const nodeId = url.searchParams.get('nodeId') || '';
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(summarizeChatHistory(nodeId, await readChatHistory(process.cwd(), nodeId))));
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
