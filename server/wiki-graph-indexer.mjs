import { existsSync, statSync, watch } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx', '.json']);
const IGNORED_DIRS = new Set(['.git', '.obsidian', 'node_modules', '.trash']);

export function resolveWikiDir(env = process.env) {
  const candidates = [
    expandHome(env.HERMES_WIKI_DIR),
    path.join(homedir(), '.hermes', 'llm-wiki'),
    path.join(process.cwd(), 'wiki')
  ].filter(Boolean);

  const found = candidates.find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });

  return found ? path.resolve(found) : path.resolve(candidates[0]);
}

function expandHome(value) {
  if (!value) return value;
  return String(value).replace(/^~(?=$|\/|\\)/, homedir());
}

export function createWikiGraphIndexer({ wikiDir = resolveWikiDir(), debounceMs = 450 } = {}) {
  let graph = { nodes: [], links: [] };
  let nodesById = new Map();
  let version = 0;
  let rebuilding = null;
  let debounceTimer = null;
  let watcherCleanup = () => {};
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) listener({ version, graph });
  };

  const rebuild = async () => {
    rebuilding = buildGraphFromWiki(wikiDir).then((next) => {
      graph = next;
      nodesById = new Map(next.nodes.map((node) => [node.id, node]));
      version += 1;
      notify();
      return graph;
    }).finally(() => {
      rebuilding = null;
    });
    return rebuilding;
  };

  const scheduleRebuild = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      rebuild().catch((error) => console.error('[wiki-graph] rebuild failed:', error));
    }, debounceMs);
  };

  const start = async () => {
    await rebuild();
    watcherCleanup = await watchWiki(wikiDir, scheduleRebuild);
    return graph;
  };

  const getGraph = async () => {
    if (rebuilding) await rebuilding;
    return publicGraph(graph);
  };

  const getNodeContent = async (id) => {
    if (rebuilding) await rebuilding;
    const node = nodesById.get(id);
    if (!node?.absolutePath) return null;
    const raw = await readFile(node.absolutePath, 'utf8');
    return stripFrontmatter(raw);
  };

  return {
    wikiDir,
    start,
    rebuild,
    getGraph,
    getNodeContent,
    getVersion: () => version,
    onUpdate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      clearTimeout(debounceTimer);
      watcherCleanup();
      listeners.clear();
    }
  };
}

export function toPublicGraph(graph) {
  return publicGraph(graph);
}

export async function buildGraphFromWiki(wikiDir) {
  const files = await walk(wikiDir);
  const nodes = new Map();
  const links = [];
  const linkKeys = new Set();
  const unresolvedReferences = new Set();

  const addLink = (source, target) => {
    const sourceId = normalizeId(String(source || ''), wikiDir);
    const targetId = normalizeId(String(target || ''), wikiDir);
    if (!sourceId || !targetId || sourceId === targetId || shouldIgnoreReference(targetId)) return;
    if (!nodes.has(targetId)) unresolvedReferences.add(targetId);
    const key = `${sourceId}::${targetId}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ source: sourceId, target: targetId });
  };

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.has(ext)) continue;

    if (ext === '.json') {
      await ingestJson(filePath, wikiDir, nodes, addLink);
    } else {
      await ingestMarkdown(filePath, wikiDir, nodes, addLink);
    }
  }

  for (const id of unresolvedReferences) {
    if (nodes.has(id) || shouldIgnoreReference(id)) continue;
    nodes.set(id, {
      id,
      name: titleFromId(id),
      category: 'references',
      summary: '此概念被 llm-wiki 中的页面引用，但尚未创建独立文档。',
      sourcePath: null,
      contentUrl: null
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    wikiDir,
    nodes: [...nodes.values()],
    links
  };
}

function publicGraph(graph) {
  return {
    ...graph,
    nodes: graph.nodes.map(({ absolutePath, ...node }) => node)
  };
}

async function ingestMarkdown(filePath, wikiDir, nodes, addLink) {
  const raw = await readFile(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const id = normalizeId(data.id || data.slug || relativeStem(filePath, wikiDir), wikiDir);
  const sourcePath = path.relative(wikiDir, filePath);

  nodes.set(id, {
    id,
    name: String(data.title || firstHeading(body) || titleFromId(id)),
    category: rootCategoryFromFile(filePath, wikiDir),
    summary: String(data.summary || data.description || summarize(body)),
    sourcePath,
    absolutePath: filePath,
    contentUrl: `/api/wiki/content?id=${encodeURIComponent(id)}`
  });

  const explicitLinks = normalizeList(data.links || data.related || data.edges);
  const sourceLinks = normalizeList(data.sources).map((source) => normalizeId(String(source), wikiDir));
  const wikiLinks = [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1]);
  const markdownLinks = [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((href) => !href.startsWith('http') && !href.startsWith('#') && DOCUMENT_EXTENSIONS.has(path.extname(href.split('#')[0]).toLowerCase()))
    .map((href) => normalizeId(relativeStem(path.resolve(path.dirname(filePath), href.split('#')[0]), wikiDir), wikiDir));

  for (const target of [...explicitLinks, ...sourceLinks, ...wikiLinks, ...markdownLinks]) addLink(id, target);
}

async function ingestJson(filePath, wikiDir, nodes, addLink) {
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  const entries = Array.isArray(parsed.nodes) ? parsed.nodes : [parsed];

  for (const entry of entries) {
    const id = normalizeId(entry.id || entry.slug || relativeStem(filePath, wikiDir), wikiDir);
    nodes.set(id, {
      id,
      name: String(entry.name || entry.title || titleFromId(id)),
      category: rootCategoryFromFile(filePath, wikiDir),
      summary: String(entry.summary || entry.description || '此节点来自 llm-wiki，暂无摘要。'),
      sourcePath: path.relative(wikiDir, filePath),
      absolutePath: filePath,
      contentUrl: `/api/wiki/content?id=${encodeURIComponent(id)}`
    });
    for (const target of normalizeList(entry.links || entry.related || entry.edges)) addLink(id, target);
  }

  for (const link of parsed.links || []) addLink(link.source, link.target);
}

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(entryPath));
    else result.push(entryPath);
  }

  return result;
}

async function watchWiki(wikiDir, onChange) {
  const watchers = [];
  const addWatcher = (dir) => {
    const watcher = watch(dir, { persistent: false }, onChange);
    watchers.push(watcher);
  };

  const dirs = (await walkDirs(wikiDir)).filter((dir) => !dir.split(path.sep).some((part) => IGNORED_DIRS.has(part.toLowerCase())));
  for (const dir of dirs) {
    try {
      addWatcher(dir);
    } catch {
      // Some network filesystems do not support native watchers; startup scan still works.
    }
  }

  return () => watchers.forEach((watcher) => watcher.close());
}

async function walkDirs(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [dir];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
    result.push(...await walkDirs(path.join(dir, entry.name)));
  }
  return result;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return { data: {}, body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: raw };
  return { data: parseYamlLite(raw.slice(4, end).trim()), body: raw.slice(end + 4).trim() };
}

function parseYamlLite(input) {
  const data = {};
  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const pair = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value) data[key] = parseScalar(value);
    else {
      const items = [];
      while (lines[i + 1]?.match(/^\s+-\s+/)) {
        i += 1;
        items.push(parseScalar(lines[i].replace(/^\s+-\s+/, '')));
      }
      data[key] = items;
    }
  }
  return data;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1).split(',').map((item) => stripQuotes(item.trim())).filter(Boolean);
  return stripQuotes(trimmed);
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? item.id || item.target || item.href || item.url : item).filter(Boolean);
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function firstHeading(body) {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function summarize(body) {
  const text = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 220) || '此节点来自 llm-wiki，暂无摘要。';
}

function stripFrontmatter(text) {
  return text.startsWith('---\n') ? text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim() : text.trim();
}

function rootCategoryFromFile(filePath, wikiDir) {
  const relative = path.relative(wikiDir, filePath).replace(/\\/g, '/');
  const [root] = relative.split('/');
  return relative.includes('/') ? root : 'root';
}

function shouldIgnoreReference(id) {
  return new Set(['wikilinks']).has(String(id).toLowerCase());
}

function normalizeId(value, wikiDir) {
  return String(value)
    .replace(pathToFileURL(wikiDir).href, '')
    .replace(/\.[^.]+$/, '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('/');
}

function relativeStem(filePath, wikiDir) {
  return path.relative(wikiDir, filePath).replace(/\.[^.]+$/, '');
}

function titleFromId(id) {
  return id.split('/').pop().split('-').filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}
