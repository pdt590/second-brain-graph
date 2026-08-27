import { createReadStream, existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRoutes } from './api-routes.mjs';
import { createAuth, sendJson } from './auth.mjs';
import { createEmbeddedHermesManager } from './embedded-hermes-manager.mjs';
import { ensureProductRuntimeEnv, getHermesConfig, isProductMode, loadRuntimeEnv } from './runtime-config.mjs';
import { createWikiGraphIndexer, resolveWikiDir } from './wiki-graph-indexer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const env = loadRuntimeEnv({ rootDir });
ensureProductRuntimeEnv({ rootDir, env });
const port = Number(env.SECOND_BRAIN_PORT || 3030);
const host = env.SECOND_BRAIN_HOST || '127.0.0.1';
const stateRootDir = isProductMode(env) ? env.SECOND_BRAIN_PRODUCT_HOME : rootDir;
const wikiDir = resolveWikiDir(env);
const indexer = createWikiGraphIndexer({ wikiDir });
const auth = await createAuth({ rootDir: stateRootDir, env });
const apiRoutes = createApiRoutes({ indexer, stateRootDir });
const hermesManager = createEmbeddedHermesManager({ rootDir, env });

await hermesManager.start();
await indexer.start();
console.log(`[second-brain] wiki dir: ${wikiDir}`);
if (isProductMode(env)) {
  console.log(`[second-brain] product home: ${env.SECOND_BRAIN_PRODUCT_HOME}`);
  console.log(`[second-brain] embedded Hermes target: ${env.HERMES_API_TARGET}`);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (url.pathname === '/api/health') {
      return sendJson(response, {
        ok: true,
        productMode: isProductMode(env),
        wikiDir,
        hermesTarget: env.HERMES_API_TARGET || ''
      });
    }
    if (url.pathname.startsWith('/api/auth/')) return auth.handle(request, response, url);
    if (url.pathname.startsWith('/api/') && !auth.getSessionUser(request)) return sendJson(response, { error: 'Unauthorized' }, 401);
    if (await apiRoutes.handle(request, response, url)) return;
    if (url.pathname.startsWith('/api/hermes/')) return proxyHermes(request, response, url);
    return sendStatic(url, response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error.message || 'Internal server error' }));
  }
});

server.listen(port, host, () => {
  console.log(`[second-brain] listening on http://${host}:${port}`);
});

async function proxyHermes(request, response, url) {
  const config = await getHermesConfig(env);
  const target = new URL(url.pathname.replace(/^\/api\/hermes/, '') + url.search, config.target);
  const client = target.protocol === 'https:' ? https : http;
  const headers = { ...request.headers, host: target.host };
  delete headers.origin;
  delete headers.referer;
  delete headers.cookie;
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  else if (!headers.authorization) delete headers.authorization;

  const proxyRequest = client.request(target, {
    method: request.method,
    headers
  }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(response);
    proxyResponse.on('error', () => response.destroy());
  });

  proxyRequest.on('error', (error) => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    sendJson(response, { error: error.message }, 502);
  });
  request.on('error', () => proxyRequest.destroy());
  request.pipe(proxyRequest);
}

async function sendStatic(url, response) {
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(distDir, pathname));
  const safePath = filePath.startsWith(distDir) && existsSync(filePath) ? filePath : path.join(distDir, 'index.html');
  if (!existsSync(safePath)) return sendJson(response, { error: 'Build output not found. Run npm run build first.' }, 404);
  response.writeHead(200, { 'Content-Type': contentType(safePath) });
  createReadStream(safePath).pipe(response);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function shutdown() {
  indexer.close();
  hermesManager.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref?.();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
