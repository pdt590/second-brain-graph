import { createReadStream } from 'node:fs';
import { readChatHistory, summarizeChatHistory, writeChatHistory } from './chat-history.mjs';
import { sendJson } from './auth.mjs';

/**
 * Shared application routes for development (Vite middleware) and production (second-brain-server.mjs).
 * The caller handles authentication; handle returns true when a route has been handled.
 */
export function createApiRoutes({ indexer, stateRootDir }) {
  async function handleChatHistory(request, response, url) {
    if (request.method === 'GET') {
      const nodeId = url.searchParams.get('nodeId');
      if (!nodeId) return sendJson(response, { error: 'Missing nodeId' }, 400);
      return sendJson(response, { messages: await readChatHistory(stateRootDir, nodeId) });
    }

    if (request.method === 'PUT') {
      const body = await readJsonBody(request);
      if (!body.nodeId) return sendJson(response, { error: 'Missing nodeId' }, 400);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      await writeChatHistory(stateRootDir, body.nodeId, messages);
      return sendJson(response, { ok: true });
    }

    return sendJson(response, { error: 'Method not allowed' }, 405);
  }

  async function handleChatSummary(request, response, url) {
    if (request.method !== 'GET') return sendJson(response, { error: 'Method not allowed' }, 405);
    const nodeId = url.searchParams.get('nodeId');
    if (!nodeId) return sendJson(response, { error: 'Missing nodeId' }, 400);

    return sendJson(response, summarizeChatHistory(nodeId, await readChatHistory(stateRootDir, nodeId)));
  }

  async function handleWikiContent(url, response) {
    const id = url.searchParams.get('id');
    if (!id) return sendJson(response, { error: 'Missing node id' }, 400);
    const content = await indexer.getNodeContent(id);
    if (content == null) return sendJson(response, { error: 'Node content not found' }, 404);
    response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(content);
  }

  async function handleWikiAsset(url, response) {
    const id = url.searchParams.get('id');
    if (!id) return sendJson(response, { error: 'Missing node id' }, 400);
    const asset = await indexer.getNodeAsset(id);
    if (!asset) return sendJson(response, { error: 'Source file not found' }, 404);
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    response.writeHead(200, {
      'Content-Type': asset.mimeType,
      'Content-Length': asset.size,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    createReadStream(asset.absolutePath).pipe(response);
  }

  function handleWikiEvents(request, response) {
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

  return {
    async handle(request, response, url) {
      if (url.pathname === '/api/graph') {
        sendJson(response, await indexer.getGraph());
        return true;
      }
      if (url.pathname === '/api/chat/history') {
        await handleChatHistory(request, response, url);
        return true;
      }
      if (url.pathname === '/api/chat/summary') {
        await handleChatSummary(request, response, url);
        return true;
      }
      if (url.pathname === '/api/wiki/content') {
        await handleWikiContent(url, response);
        return true;
      }
      if (url.pathname === '/api/wiki/asset') {
        await handleWikiAsset(url, response);
        return true;
      }
      if (url.pathname === '/api/wiki/events') {
        handleWikiEvents(request, response);
        return true;
      }
      return false;
    }
  };
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}
