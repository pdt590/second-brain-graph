import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createApiRoutes } from './server/api-routes.mjs';
import { createAuth } from './server/auth.mjs';
import { detectHermesTarget, ensureProductRuntimeEnv, loadRuntimeEnv } from './server/runtime-config.mjs';
import { createWikiGraphIndexer, resolveWikiDir } from './server/wiki-graph-indexer.mjs';

const hermesEnv = ensureProductRuntimeEnv({ env: loadRuntimeEnv() });
const hermesResolvedApiKey = hermesEnv.API_SERVER_KEY || '';

export default defineConfig(async ({ command }) => {
  const hermesTarget = await detectHermesTarget(hermesEnv);
  const wikiIndexer = command === 'serve'
    ? createWikiGraphIndexer({ wikiDir: resolveWikiDir(hermesEnv) })
    : null;
  const auth = command === 'serve' ? await createAuth({ rootDir: process.cwd(), env: hermesEnv }) : null;
  const apiRoutes = command === 'serve' ? createApiRoutes({ indexer: wikiIndexer, stateRootDir: process.cwd() }) : null;
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
        server.middlewares.use('/api', async (request, response, next) => {
          if (request.url?.startsWith('/auth/')) return next();
          if (!auth.getSessionUser(request)) {
            response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          const url = new URL(request.url || '', 'http://localhost');
          url.pathname = `/api${url.pathname}`;
          const handled = await apiRoutes.handle(request, response, url);
          if (!handled) next();
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
