import { existsSync, statSync, watch } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx', '.json']);
const RAW_ASSET_EXTENSIONS = new Set([
  '.apng', '.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp',
  '.m4a', '.mp3', '.oga', '.ogg', '.wav', '.webm',
  '.mov', '.mp4', '.m4v', '.ogv',
  '.csv', '.log', '.pdf', '.txt',
  '.doc', '.docx', '.key', '.numbers', '.pages', '.ppt', '.pptx', '.rtf', '.xls', '.xlsx'
]);
const RAW_ASSET_EXTENSION_PATTERN = [...RAW_ASSET_EXTENSIONS]
  .map((extension) => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
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

export function createWikiGraphIndexer({ wikiDir = resolveWikiDir(), debounceMs = 450, pollMs = 15000 } = {}) {
  let graph = { nodes: [], links: [] };
  let nodesById = new Map();
  let version = 0;
  let rebuilding = null;
  let debounceTimer = null;
  let pollTimer = null;
  let watcherCleanup = () => {};
  let watcherRefreshing = null;
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

  const scheduleRebuild = ({ refreshWatchers = true } = {}) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      rebuild()
        .then(() => {
          if (refreshWatchers) return refreshWatchersAfterRebuild();
          return null;
        })
        .catch((error) => console.error('[wiki-graph] rebuild failed:', error));
    }, debounceMs);
  };

  const refreshWatchersAfterRebuild = async () => {
    if (watcherRefreshing) return watcherRefreshing;
    watcherRefreshing = Promise.resolve()
      .then(() => watcherCleanup())
      .then(() => watchWiki(wikiDir, scheduleRebuild))
      .then((cleanup) => {
        watcherCleanup = cleanup;
      })
      .catch((error) => {
        console.error('[wiki-graph] watcher refresh failed:', error);
      })
      .finally(() => {
        watcherRefreshing = null;
      });
    return watcherRefreshing;
  };

  const start = async () => {
    await rebuild();
    await refreshWatchersAfterRebuild();
    if (pollMs > 0) {
      pollTimer = setInterval(() => scheduleRebuild({ refreshWatchers: false }), pollMs);
      pollTimer.unref?.();
    }
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

  const getNodeAsset = async (id) => {
    if (rebuilding) await rebuilding;
    const node = nodesById.get(id);
    if (!node?.absolutePath) return null;
    return createAssetDescriptor(node.absolutePath, node.id);
  };

  return {
    wikiDir,
    start,
    rebuild,
    getGraph,
    getNodeContent,
    getNodeAsset,
    getVersion: () => version,
    onUpdate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      clearTimeout(debounceTimer);
      if (pollTimer) clearInterval(pollTimer);
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
  const assetFiles = files.filter((filePath) => RAW_ASSET_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  const nodes = new Map();
  const links = [];
  const linkKeys = new Set();

  const addLink = (source, target) => {
    const sourceId = normalizeId(String(source || ''), wikiDir);
    const targetId = normalizeId(String(target || ''), wikiDir);
    if (!sourceId || !targetId || sourceId === targetId || shouldIgnoreReference(targetId)) return;
    const key = `${sourceId}::${targetId}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ source: sourceId, target: targetId });
  };

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (DOCUMENT_EXTENSIONS.has(ext) && ext === '.json') {
      await ingestJson(filePath, wikiDir, nodes, addLink);
    } else if (DOCUMENT_EXTENSIONS.has(ext)) {
      await ingestMarkdown(filePath, wikiDir, nodes, addLink, assetFiles);
    } else if (RAW_ASSET_EXTENSIONS.has(ext)) {
      ingestRawAsset(filePath, wikiDir, nodes);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    wikiDir,
    nodes: [...nodes.values()],
    links: links.filter((link) => nodes.has(link.source) && nodes.has(link.target))
  };
}

function publicGraph(graph) {
  return {
    ...graph,
    nodes: graph.nodes.map(({ absolutePath, ...node }) => ({
      ...node,
      asset: node.isRawAsset && absolutePath ? createPublicAsset(absolutePath, node.id) : null,
      attachments: Array.isArray(node.attachments) ? node.attachments.map((attachment) => createPublicAsset(attachment.absolutePath, attachment.id)) : []
    }))
  };
}

async function ingestMarkdown(filePath, wikiDir, nodes, addLink, assetFiles = []) {
  const raw = await readFile(filePath, 'utf8');
  const stat = statSync(filePath);
  const { data, body } = parseFrontmatter(raw);
  const id = normalizeId(data.id || data.slug || relativeStem(filePath, wikiDir), wikiDir);
  const sourcePath = path.relative(wikiDir, filePath);
  const attachments = extractAssetReferences(body, data, filePath, wikiDir, assetFiles);

  nodes.set(id, {
    id,
    name: String(data.title || firstHeading(body) || titleFromId(id)),
    category: rootCategoryFromFile(filePath, wikiDir),
    summary: String(data.summary || data.description || summarize(body)),
    date: inferNodeDate(data, filePath, sourcePath, stat),
    sourcePath,
    absolutePath: filePath,
    assetKind: getAssetKind(filePath),
    attachments,
    contentUrl: `/api/wiki/content?id=${encodeURIComponent(id)}`
  });

  const explicitLinks = normalizeList(data.links || data.related || data.edges);
  const sourceLinks = normalizeList(data.sources).map((source) => normalizeId(String(source), wikiDir));
  const wikiLinks = [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1]);
  const markdownLinks = [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((href) => {
      if (href.startsWith('http') || href.startsWith('#')) return false;
      const ext = path.extname(href.split('#')[0]).toLowerCase();
      return DOCUMENT_EXTENSIONS.has(ext) || RAW_ASSET_EXTENSIONS.has(ext);
    })
    .map((href) => normalizeId(relativeStem(path.resolve(path.dirname(filePath), href.split('#')[0]), wikiDir), wikiDir));

  const attachmentLinks = attachments.map((attachment) => attachment.id);
  for (const target of [...explicitLinks, ...sourceLinks, ...wikiLinks, ...markdownLinks, ...attachmentLinks]) addLink(id, target);
}

async function ingestJson(filePath, wikiDir, nodes, addLink) {
  const stat = statSync(filePath);
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  const entries = Array.isArray(parsed.nodes) ? parsed.nodes : [parsed];

  for (const entry of entries) {
    const id = normalizeId(entry.id || entry.slug || relativeStem(filePath, wikiDir), wikiDir);
    nodes.set(id, {
      id,
      name: String(entry.name || entry.title || titleFromId(id)),
      category: rootCategoryFromFile(filePath, wikiDir),
      summary: String(entry.summary || entry.description || '此节点来自 llm-wiki，暂无摘要。'),
      date: inferNodeDate(entry, filePath, path.relative(wikiDir, filePath), stat),
      sourcePath: path.relative(wikiDir, filePath),
      absolutePath: filePath,
      assetKind: getAssetKind(filePath),
      attachments: [],
      contentUrl: `/api/wiki/content?id=${encodeURIComponent(id)}`
    });
    for (const target of normalizeList(entry.links || entry.related || entry.edges)) addLink(id, target);
  }

  for (const link of parsed.links || []) addLink(link.source, link.target);
}

function ingestRawAsset(filePath, wikiDir, nodes) {
  const id = normalizeId(relativeStem(filePath, wikiDir), wikiDir);
  const stat = statSync(filePath);
  const kind = getAssetKind(filePath);
  nodes.set(id, {
    id,
    name: titleFromId(id),
    category: rootCategoryFromFile(filePath, wikiDir),
    summary: createAssetSummary(filePath, kind, stat.size),
    date: inferNodeDate({}, filePath, path.relative(wikiDir, filePath), stat),
    sourcePath: path.relative(wikiDir, filePath),
    absolutePath: filePath,
    assetKind: kind,
    attachments: [],
    isRawAsset: true
  });
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
    watcher.on('error', (error) => {
      console.warn(`[wiki-graph] watcher disabled for ${dir}: ${error.message}`);
    });
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

function extractAssetReferences(body, frontmatter, markdownPath, wikiDir, assetFiles = []) {
  const references = [];
  const addReference = (value) => {
    const cleaned = cleanAssetReference(value);
    if (cleaned) references.push(cleaned);
  };

  for (const value of extractFrontmatterAssetValues(frontmatter)) addReference(value);
  for (const match of body.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) addReference(match[1]);
  for (const match of body.matchAll(/(?<!!)\[[^\]]+]\(([^)]+)\)/g)) addReference(match[1]);
  for (const match of body.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g)) addReference(match[1]);
  for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g)) addReference(match[1]);
  for (const match of body.matchAll(new RegExp('`([^`]+\\.(' + RAW_ASSET_EXTENSION_PATTERN + '))`', 'gi'))) addReference(match[1]);
  for (const match of body.matchAll(new RegExp('(?:^|[\\s(:：])((?:~\\/wiki\\/|\\.\\.?\\/|\\/|assets\\/)[^\\n`"<>)]+?\\.(' + RAW_ASSET_EXTENSION_PATTERN + '))(?=$|[\\s,，。；;）)\\]])', 'gi'))) {
    addReference(match[1]);
  }

  const seen = new Set();
  const attachments = [];
  for (const reference of references) {
    const assetPath = resolveAssetReference(reference, markdownPath, wikiDir, assetFiles);
    if (!assetPath) continue;
    const key = path.resolve(assetPath);
    if (seen.has(key)) continue;
    seen.add(key);
    attachments.push({
      id: normalizeId(relativeStem(assetPath, wikiDir), wikiDir),
      absolutePath: assetPath
    });
  }
  return attachments;
}

function extractFrontmatterAssetValues(frontmatter = {}) {
  const assetKeys = new Set(['asset', 'assets', 'file', 'files', 'source', 'sources', 'source_file', 'source_files', 'sourcefile', 'sourcefiles']);
  const values = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value)) visit(item);
      return;
    }
    const text = String(value).trim();
    if (RAW_ASSET_EXTENSIONS.has(path.extname(text.split('#')[0]).toLowerCase())) values.push(text);
  };

  for (const [key, value] of Object.entries(frontmatter)) {
    const normalizedKey = key.toLowerCase().replace(/[-\s]+/g, '_');
    if (assetKeys.has(normalizedKey)) visit(value);
  }
  return values;
}

function cleanAssetReference(value) {
  let reference = String(value || '').trim();
  if (!reference) return '';
  reference = reference.replace(/^<(.+)>$/, '$1').replace(/^['"]|['"]$/g, '').trim();
  reference = reference.replace(/\s+["'][^"']+["']\s*$/, '').trim();
  if (/^(https?:|mailto:|data:|#)/i.test(reference)) return '';
  try {
    reference = decodeURIComponent(reference);
  } catch {
    // Keep the original value if it is not valid URI-encoded text.
  }
  return reference.split('#')[0].trim();
}

function resolveAssetReference(reference, markdownPath, wikiDir, assetFiles = []) {
  const extension = path.extname(reference).toLowerCase();
  if (!RAW_ASSET_EXTENSIONS.has(extension)) return null;
  const expandedReference = expandWikiAssetPath(reference, wikiDir);

  const candidates = path.isAbsolute(expandedReference)
    ? [expandedReference]
    : [
        path.resolve(path.dirname(markdownPath), expandedReference),
        path.resolve(wikiDir, expandedReference)
      ];

  for (const candidate of candidates) {
    if (isReadableFile(candidate)) return candidate;
  }

  const baseName = path.basename(expandedReference).toLowerCase();
  const normalizedReference = normalizeId(expandedReference.replace(/\.[^.]+$/, ''), wikiDir);
  return assetFiles.find((assetPath) => {
    if (path.basename(assetPath).toLowerCase() === baseName) return true;
    return normalizeId(relativeStem(assetPath, wikiDir), wikiDir) === normalizedReference;
  }) || null;
}

function expandWikiAssetPath(reference, wikiDir) {
  if (reference.startsWith('~/wiki/')) return path.join(wikiDir, reference.slice('~/wiki/'.length));
  return reference;
}

function isReadableFile(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
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

function inferNodeDate(data = {}, filePath, sourcePath, fileStat = null) {
  const frontmatterKeys = ['date', 'created', 'created_at', 'createdAt', 'updated', 'updated_at', 'updatedAt', 'published', 'published_at', 'publishedAt'];
  for (const key of frontmatterKeys) {
    const parsed = normalizeDateValue(data[key]);
    if (parsed) return parsed;
  }

  const fromPath = extractDateFromText(`${sourcePath || ''} ${path.basename(filePath || '')}`);
  if (fromPath) return fromPath;

  const timestamp = Number.isFinite(fileStat?.birthtimeMs) && fileStat.birthtimeMs > 0
    ? fileStat.birthtimeMs
    : fileStat?.mtimeMs;
  if (Number.isFinite(timestamp)) return toLocalDateString(new Date(timestamp));
  return null;
}

function normalizeDateValue(value) {
  if (!value) return null;
  if (Array.isArray(value)) return normalizeDateValue(value[0]);
  const text = String(value).trim();
  if (!text) return null;
  const direct = extractDateFromText(text);
  if (direct) return direct;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return toLocalDateString(date);
  return null;
}

function extractDateFromText(text) {
  const dashed = String(text).match(/(?:^|[^\d])((?:19|20)\d{2})[-_./年]([01]\d)[-_./月]([0-3]\d)(?:日)?(?:$|[^\d])/);
  if (dashed) return formatDateParts(dashed[1], dashed[2], dashed[3]);
  const compact = String(text).match(/(?:^|[^\d])((?:19|20)\d{2})([01]\d)([0-3]\d)(?:$|[^\d])/);
  if (compact) return formatDateParts(compact[1], compact[2], compact[3]);
  return null;
}

function formatDateParts(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function createAssetSummary(filePath, kind, size) {
  const fileName = path.basename(filePath);
  const sizeLabel = formatFileSize(size);
  return `源文件：${fileName}。类型：${kind.label}。大小：${sizeLabel}。可以在节点详情中预览或下载。`;
}

function createPublicAsset(filePath, id) {
  const descriptor = createAssetDescriptor(filePath, id);
  return {
    fileName: descriptor.fileName,
    extension: descriptor.extension,
    mimeType: descriptor.mimeType,
    previewType: descriptor.previewType,
    size: descriptor.size,
    sizeLabel: descriptor.sizeLabel,
    url: `/api/wiki/asset?id=${encodeURIComponent(id)}`,
    downloadUrl: `/api/wiki/asset?id=${encodeURIComponent(id)}&download=1`
  };
}

function createAssetDescriptor(filePath, id) {
  const stat = statSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = getMimeType(extension);
  return {
    id,
    absolutePath: filePath,
    fileName: path.basename(filePath),
    extension,
    mimeType,
    previewType: getPreviewType(extension, mimeType),
    size: stat.size,
    sizeLabel: formatFileSize(stat.size)
  };
}

function getAssetKind(filePath) {
  const previewType = getPreviewType(path.extname(filePath).toLowerCase(), getMimeType(path.extname(filePath).toLowerCase()));
  const labels = {
    image: '图片',
    video: '视频',
    audio: '音频',
    pdf: 'PDF 文档',
    text: '文本',
    markdown: 'Markdown 文档',
    unsupported: '文件'
  };
  return { type: previewType, label: labels[previewType] || '文件' };
}

function getPreviewType(extension, mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (['.md', '.mdx'].includes(extension)) return 'markdown';
  if (mimeType.startsWith('text/') || ['.csv', '.log', '.txt'].includes(extension)) return 'text';
  return 'unsupported';
}

function getMimeType(extension) {
  const types = {
    '.apng': 'image/apng',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.csv': 'text/csv; charset=utf-8',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.log': 'text/plain; charset=utf-8',
    '.m4a': 'audio/mp4',
    '.m4v': 'video/mp4',
    '.md': 'text/markdown; charset=utf-8',
    '.mdx': 'text/markdown; charset=utf-8',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.ogv': 'video/ogg',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.rtf': 'application/rtf',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[extension] || 'application/octet-stream';
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
