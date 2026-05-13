import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth, sendJson } from './auth.mjs';
import { createWikiGraphIndexer, resolveWikiDir } from './wiki-graph-indexer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.SECOND_BRAIN_PORT || 3030);
const host = process.env.SECOND_BRAIN_HOST || '127.0.0.1';
const wikiDir = resolveWikiDir();
const indexer = createWikiGraphIndexer({ wikiDir });
const auth = await createAuth({ rootDir });

await indexer.start();
console.log(`[second-brain] wiki dir: ${wikiDir}`);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/auth/')) return auth.handle(request, response, url);
    if (url.pathname.startsWith('/api/') && !auth.getSessionUser(request)) return sendJson(response, { error: 'Unauthorized' }, 401);
    if (url.pathname === '/api/graph') return sendJson(response, await indexer.getGraph());
    if (url.pathname === '/api/chat/history') return handleChatHistory(request, response, url);
    if (url.pathname === '/api/wiki/content') return sendWikiContent(url, response);
    if (url.pathname === '/api/wiki/events') return sendWikiEvents(request, response);
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

async function sendWikiContent(url, response) {
  const id = url.searchParams.get('id');
  if (!id) return sendJson(response, { error: 'Missing node id' }, 400);
  const content = await indexer.getNodeContent(id);
  if (content == null) return sendJson(response, { error: 'Node content not found' }, 404);
  response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}

async function handleChatHistory(request, response, url) {
  if (request.method === 'GET') {
    const nodeId = url.searchParams.get('nodeId');
    if (!nodeId) return sendJson(response, { error: 'Missing nodeId' }, 400);
    return sendJson(response, { messages: await readChatHistory(nodeId) });
  }

  if (request.method === 'PUT') {
    const body = await readJsonBody(request);
    if (!body.nodeId) return sendJson(response, { error: 'Missing nodeId' }, 400);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    await writeChatHistory(body.nodeId, messages);
    return sendJson(response, { ok: true });
  }

  return sendJson(response, { error: 'Method not allowed' }, 405);
}

async function readChatHistory(nodeId) {
  const filePath = chatHistoryPath(nodeId);
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(await readFile(filePath, 'utf8'));
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

async function writeChatHistory(nodeId, messages) {
  const filePath = chatHistoryPath(nodeId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({
    nodeId,
    updatedAt: new Date().toISOString(),
    messages: messages
      .filter((message) => ['user', 'agent'].includes(message.role) && typeof message.text === 'string')
      .slice(-80)
  }, null, 2));
}

function chatHistoryPath(nodeId) {
  const safeId = String(nodeId).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_').slice(0, 140) || 'node';
  return path.join(rootDir, 'data', 'chat-history', `${safeId}.json`);
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function sendWikiEvents(request, response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive'
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ version: indexer.getVersion() })}\n\n`);
  const unsubscribe = indexer.onUpdate(({ version }) => {
    response.write(`event: graph-update\ndata: ${JSON.stringify({ version })}\n\n`);
  });
  request.on('close', unsubscribe);
}

async function proxyHermes(request, response, url) {
  const config = await getHermesConfig();
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
  });

  proxyRequest.on('error', (error) => sendJson(response, { error: error.message }, 502));
  request.pipe(proxyRequest);
}

async function getHermesConfig() {
  const env = {
    ...loadEnvFile(path.join(homedir(), '.hermes', '.env')),
    ...loadEnvFile(path.join(process.cwd(), '.hermes', '.env')),
    ...process.env
  };
  const target = env.HERMES_API_TARGET
    || findHermesTargetFromLog(path.join(homedir(), '.hermes', 'logs', 'gateway.log'))
    || `http://${env.API_SERVER_HOST || '127.0.0.1'}:${env.API_SERVER_PORT || '8643'}`;
  return {
    target,
    apiKey: env.API_SERVER_KEY || env.HERMES_API_KEY || env.VITE_HERMES_API_KEY || ''
  };
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return env;
      env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      return env;
    }, {});
}

function findHermesTargetFromLog(logPath) {
  if (!existsSync(logPath)) return '';
  const text = readFileSync(logPath, 'utf8');
  const matches = [...text.matchAll(/API server listening on (https?:\/\/[^\s]+) \(model:/g)];
  return matches.at(-1)?.[1] || '';
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
