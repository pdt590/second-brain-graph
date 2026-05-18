import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  Bot,
  BookUp2,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Command,
  FileText,
  Folder,
  Image,
  KeyRound,
  Link as LinkIcon,
  LogOut,
  Maximize2,
  Mic2,
  Minimize2,
  MessageCircle,
  Moon,
  Network,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sun,
  User,
  Video,
  X
} from 'lucide-react';
import './styles.css';

const categoryPalette = ['#16f2b3', '#45a8ff', '#ffcc4d', '#ff7a45', '#ff5d9e', '#7c6dff', '#34d399', '#f472b6', '#22d3ee', '#a3e635'];
const HERMES_CHAT_COMPLETIONS_URL = '/api/hermes/v1/chat/completions';
const HERMES_MODEL = 'hermes-agent';
const GRAPH_MODES = { TWO_D: '2d', THREE_D: '3d' };
const GRAPH_3D_CAMERA = { minDistance: 260, maxDistance: 980, padding: 1.28 };
const EMPTY_GRAPH = { nodes: [], links: [] };
const nodeSpriteMaterialCache = new Map();

const categoryIcons = {
  root: BrainCircuit,
  entities: CircleDot,
  concepts: BrainCircuit,
  architecture: Network,
  raw: FileText,
  mrd: FileText,
  prd: FileText,
  'use-cases': Command,
  references: Folder
};

function getCategoryMeta(category = 'root') {
  const key = String(category || 'root');
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    key,
    label: titleFromCategory(key),
    color: categoryPalette[hash % categoryPalette.length],
    icon: categoryIcons[key] ?? Folder
  };
}

function titleFromCategory(category) {
  return String(category || 'root')
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Root';
}

function getQuickCategoryLimit(width = window.innerWidth) {
  if (width <= 720) return 4;
  if (width <= 1120) return 6;
  return 8;
}

function hasWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function linkEndpointId(endpoint) {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function linkTouchesNode(link, nodeId) {
  return linkEndpointId(link.source) === nodeId || linkEndpointId(link.target) === nodeId;
}

function focusGraphNode(graphInstance, node, mode) {
  if (!graphInstance || !node) return;
  if (mode === GRAPH_MODES.THREE_D) {
    const { x = 0, y = 0, z = 0 } = node;
    if (![x, y, z].every(Number.isFinite)) return;
    const current = graphInstance.cameraPosition?.() || { x: 0, y: 0, z: 460 };
    const dx = current.x - x;
    const dy = current.y - y;
    const dz = current.z - z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const distance = 230;
    graphInstance.cameraPosition(
      {
        x: x + (dx / length) * distance,
        y: y + (dy / length) * distance,
        z: z + (dz / length) * distance
      },
      { x, y, z },
      850
    );
    return;
  }

  if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
    graphInstance.centerAt(node.x, node.y, 850);
    graphInstance.zoom(4.2, 850);
  }
}

function finiteGraphNodes(graphData) {
  return (graphData?.nodes || []).filter((node) => (
    Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)
  ));
}

function getPercentile(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * percentile)));
  return sortedValues[index];
}

function getRobustGraphCenterAndSpan(nodes) {
  const xs = nodes.map((node) => node.x).sort((a, b) => a - b);
  const ys = nodes.map((node) => node.y).sort((a, b) => a - b);
  const zs = nodes.map((node) => node.z).sort((a, b) => a - b);
  const low = nodes.length > 24 ? 0.08 : 0;
  const high = nodes.length > 24 ? 0.92 : 1;
  const minX = getPercentile(xs, low);
  const maxX = getPercentile(xs, high);
  const minY = getPercentile(ys, low);
  const maxY = getPercentile(ys, high);
  const minZ = getPercentile(zs, low);
  const maxZ = getPercentile(zs, high);

  return {
    center: {
      x: getPercentile(xs, 0.5),
      y: getPercentile(ys, 0.5),
      z: getPercentile(zs, 0.5)
    },
    span: Math.max(
      maxX - minX,
      maxY - minY,
      maxZ - minZ,
      1
    )
  };
}

function fitGraphView(graphInstance, graphData, mode, duration = 850) {
  if (!graphInstance) return;
  if (mode !== GRAPH_MODES.THREE_D) {
    graphInstance.zoomToFit?.(duration, 90);
    return;
  }

  const nodes = finiteGraphNodes(graphData);
  if (!nodes.length) {
    graphInstance.zoomToFit?.(duration, 40);
    return;
  }

  const { center, span } = getRobustGraphCenterAndSpan(nodes);
  const distance = Math.min(
    GRAPH_3D_CAMERA.maxDistance,
    Math.max(GRAPH_3D_CAMERA.minDistance, span * GRAPH_3D_CAMERA.padding)
  );
  graphInstance.cameraPosition?.(
    { x: center.x, y: center.y, z: center.z + distance },
    center,
    duration
  );
}

function getNodeSpriteMaterial(color, state, threeModule) {
  const key = `${color}-${state}`;
  if (nodeSpriteMaterialCache.has(key)) return nodeSpriteMaterialCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const intensity = state === 'selected' ? 1 : state === 'neighbor' ? 0.82 : 0.62;
  const outerAlpha = state === 'selected' ? 0.34 : state === 'neighbor' ? 0.22 : 0.14;
  const radius = state === 'selected' ? 39 : state === 'neighbor' ? 35 : 31;
  const cx = 48;
  const cy = 48;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 46);
  glow.addColorStop(0, `rgba(255,255,255,${0.34 * intensity})`);
  glow.addColorStop(0.28, `${color}f2`);
  glow.addColorStop(0.7, `${color}${Math.round(outerAlpha * 255).toString(16).padStart(2, '0')}`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.globalAlpha = intensity;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = state === 'selected' ? 0.42 : 0.24;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = state === 'selected' ? 4 : 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const texture = new threeModule.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new threeModule.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  nodeSpriteMaterialCache.set(key, material);
  return material;
}

function createNodeSprite(node, selectedNodeId, neighborsById, threeModule) {
  const cat = getCategoryMeta(node.category);
  const state = node.id === selectedNodeId
    ? 'selected'
    : neighborsById.get(selectedNodeId)?.has(node.id)
      ? 'neighbor'
      : 'normal';
  const sprite = new threeModule.Sprite(getNodeSpriteMaterial(cat.color, state, threeModule));
  const size = state === 'selected' ? 30 : state === 'neighbor' ? 22 : 16;
  sprite.scale.set(size, size, 1);
  return sprite;
}

function normalizeGraphData(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) return null;

  const nodes = data.nodes
    .filter((node) => node?.id)
    .map((node) => ({
      id: String(node.id),
      name: String(node.name || node.title || node.id),
      category: String(node.category || 'root'),
      summary: String(node.summary || node.description || '此节点来自 Hermes llm-wiki，暂无摘要。'),
      date: typeof node.date === 'string' ? node.date : null,
      media: Array.isArray(node.media) ? node.media : [],
      sourcePath: node.sourcePath,
      asset: node.asset && typeof node.asset === 'object' ? node.asset : null,
      attachments: Array.isArray(node.attachments) ? node.attachments.filter((asset) => asset && typeof asset === 'object') : [],
      contentUrl: node.contentUrl
    }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = data.links
    .map((link) => ({
      source: typeof link.source === 'object' ? link.source.id : link.source,
      target: typeof link.target === 'object' ? link.target.id : link.target
    }))
    .filter((link) => nodeIds.has(String(link.source)) && nodeIds.has(String(link.target)))
    .map((link) => ({ source: String(link.source), target: String(link.target) }));

  return { nodes, links };
}

function extractHermesContent(data) {
  return data.choices?.[0]?.delta?.content
    ?? data.choices?.[0]?.message?.content
    ?? data.delta
    ?? data.content
    ?? '';
}

async function readHermesResponse(response, onChunk) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('text/event-stream')) {
    const data = await response.json();
    const text = extractHermesContent(data).trim() || 'Hermes API 未返回可读取的内容。';
    onChunk(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLines = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, '').trim());

      for (const line of dataLines) {
        if (!line || line === '[DONE]') continue;
        try {
          const chunk = extractHermesContent(JSON.parse(line));
          if (!chunk) continue;
          fullText += chunk;
          onChunk(chunk, fullText);
        } catch {
          fullText += line;
          onChunk(line, fullText);
        }
      }
    }
  }

  return fullText.trim();
}

async function readNodeSourceSnippet(node, maxLength = 6000) {
  if (!node?.contentUrl) return '';
  try {
    const response = await fetch(node.contentUrl, { cache: 'no-store' });
    if (!response.ok) return '';
    const text = stripFrontmatter(await response.text()).trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}\n...` : text;
  } catch {
    return '';
  }
}

function isNodeInDateRange(node, start, end) {
  if (!start && !end) return true;
  if (!node.date) return false;
  if (start && node.date < start) return false;
  if (end && node.date > end) return false;
  return true;
}

function App() {
  const graphHostRef = useRef();
  const fgRef = useRef();
  const graphRuntimeRef = useRef({ mode: null, three: null });
  const didInitialFitRef = useRef(false);
  const [graphReady, setGraphReady] = useState(false);
  const [graphMode, setGraphMode] = useState(GRAPH_MODES.THREE_D);
  const [graphNotice, setGraphNotice] = useState('');
  const [theme, setTheme] = useState(() => {
    const stored = window.localStorage.getItem('hermes-graph-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [authUser, setAuthUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('checking');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [activeCats, setActiveCats] = useState(new Set());
  const previousCategoryKeysRef = useRef(new Set());
  const [isCategoryPanelOpen, setIsCategoryPanelOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [quickCategoryLimit, setQuickCategoryLimit] = useState(() => getQuickCategoryLimit());
  const [isFull, setIsFull] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [chatNode, setChatNode] = useState(null);
  const [messagesByNode, setMessagesByNode] = useState({});
  const [loadedChatNodes, setLoadedChatNodes] = useState(new Set());
  const [chatSummaries, setChatSummaries] = useState({});
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [chatError, setChatError] = useState('');
  const [wikiGraph, setWikiGraph] = useState(null);
  const [graphStatus, setGraphStatus] = useState('idle');
  const graph = wikiGraph ?? EMPTY_GRAPH;
  const categoryKeys = useMemo(() => [...new Set(graph.nodes.map((node) => node.category || 'root'))].sort(), [graph.nodes]);
  const categoryStats = useMemo(() => {
    const counts = new Map();
    graph.nodes.forEach((node) => {
      const key = node.category || 'root';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return categoryKeys
      .map((key) => ({ key, count: counts.get(key) || 0, meta: getCategoryMeta(key) }))
      .sort((a, b) => b.count - a.count || a.meta.label.localeCompare(b.meta.label));
  }, [categoryKeys, graph.nodes]);
  const quickCategories = categoryStats.slice(0, quickCategoryLimit);
  const filteredCategoryStats = useMemo(() => {
    const normalized = categoryQuery.trim().toLowerCase();
    if (!normalized) return categoryStats;
    return categoryStats.filter(({ key, meta }) => `${key} ${meta.label}`.toLowerCase().includes(normalized));
  }, [categoryQuery, categoryStats]);
  const hiddenCategoryCount = Math.max(0, categoryStats.length - quickCategories.length);
  const chatMessages = chatNode
    ? messagesByNode[chatNode.id] || [{ role: 'agent', text: '可以围绕这个节点和它的邻近知识继续追问。' }]
    : [];

  useEffect(() => {
    setActiveCats((current) => {
      const nextKeys = new Set(categoryKeys);
      const previousKeys = previousCategoryKeysRef.current;
      previousCategoryKeysRef.current = nextKeys;

      if (!previousKeys.size) return new Set(nextKeys);

      const next = new Set([...current].filter((key) => nextKeys.has(key)));
      for (const key of nextKeys) {
        if (!previousKeys.has(key)) next.add(key);
      }
      return next;
    });
  }, [categoryKeys.join('|')]);

  useEffect(() => {
    const resize = () => setQuickCategoryLimit(getQuickCategoryLimit());
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!chatNode || loadedChatNodes.has(chatNode.id)) return;
    let cancelled = false;

    fetch(`/api/chat/history?nodeId=${encodeURIComponent(chatNode.id)}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then((response) => response.ok ? response.json() : { messages: [] })
      .then((data) => {
        if (cancelled) return;
        setMessagesByNode((current) => ({
          ...current,
          [chatNode.id]: data.messages?.length
            ? data.messages
            : [{ role: 'agent', text: '可以围绕这个节点和它的邻近知识继续追问。' }]
        }));
        setLoadedChatNodes((current) => new Set(current).add(chatNode.id));
      })
      .catch(() => {});

    // Load conversation summary
    fetch(`/api/chat/summary?nodeId=${encodeURIComponent(chatNode.id)}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then((response) => response.ok ? response.json() : { conversations: [], totalMessages: 0 })
      .then((data) => {
        if (cancelled) return;
        setChatSummaries((current) => ({ ...current, [chatNode.id]: data }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [chatNode, loadedChatNodes]);

  useEffect(() => {
    if (!chatNode || !loadedChatNodes.has(chatNode.id)) return;
    const messages = messagesByNode[chatNode.id];
    if (!messages?.length || messages.some((message) => message.role === 'agent' && !message.text)) return;

    const timeout = window.setTimeout(() => {
      fetch('/api/chat/history', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: chatNode.id, messages })
      }).catch(() => {});
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [chatNode, loadedChatNodes, messagesByNode]);

  const neighborsById = useMemo(() => {
    const map = new Map(graph.nodes.map((node) => [node.id, new Set()]));
    graph.links.forEach((link) => {
      const source = typeof link.source === 'object' ? link.source.id : link.source;
      const target = typeof link.target === 'object' ? link.target.id : link.target;
      map.get(source)?.add(target);
      map.get(target)?.add(source);
    });
    return map;
  }, [graph]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const neighborNodes = selectedNode ? [...(neighborsById.get(selectedNode.id) ?? [])]
    .map((id) => graph.nodes.find((node) => node.id === id))
    .filter(Boolean) : [];

  const filteredGraph = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const start = dateRange.start || '';
    const end = dateRange.end || '';
    const nodes = graph.nodes.filter((node) => {
      const categoryVisible = activeCats.has(node.category);
      const textVisible = !normalized || `${node.name} ${node.summary}`.toLowerCase().includes(normalized);
      const dateVisible = isNodeInDateRange(node, start, end);
      return categoryVisible && textVisible && dateVisible;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      links: graph.links.filter((link) => {
        const source = typeof link.source === 'object' ? link.source.id : link.source;
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        return nodeIds.has(source) && nodeIds.has(target);
      })
    };
  }, [activeCats, dateRange.end, dateRange.start, graph, query]);

  const toggleCategory = (key) => {
    setActiveCats((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAllCategories = () => setActiveCats(new Set(categoryKeys));
  const clearAllCategories = () => setActiveCats(new Set());

  const focusNode = useCallback((node) => {
    if (!node) return;
    setSelectedId(node.id);
    setIsFull(false);
    setIsPanelOpen(true);
    focusGraphNode(fgRef.current, node, graphMode);
  }, [graphMode]);

  const restoreGraph = useCallback(() => {
    const visibleNodeIds = new Set(filteredGraph.nodes.map((node) => node.id));
    if (filteredGraph.nodes.length && selectedId && !visibleNodeIds.has(selectedId)) {
      setSelectedId(filteredGraph.nodes[0].id);
    }
    requestAnimationFrame(() => {
      fitGraphView(fgRef.current, filteredGraph.nodes.length ? filteredGraph : graph, graphMode, 850);
    });
  }, [filteredGraph, graph, graphMode, selectedId]);

  const toggleGraphMode = useCallback(() => {
    didInitialFitRef.current = false;
    setGraphNotice('');
    setGraphMode((current) => current === GRAPH_MODES.THREE_D ? GRAPH_MODES.TWO_D : GRAPH_MODES.THREE_D);
  }, []);

  const handleGraphKeyDown = useCallback((event) => {
    const graphInstance = fgRef.current;
    if (!graphInstance) return;

    if (graphMode === GRAPH_MODES.THREE_D) {
      const key = event.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', '0'].includes(key)) return;
      event.preventDefault();
      if (key === '0') {
        fitGraphView(graphInstance, filteredGraph, graphMode, 450);
        return;
      }

      const current = graphInstance.cameraPosition?.() || { x: 0, y: 0, z: 460 };
      let next = { ...current };
      const angle = Math.PI / 18;
      if (key === '+' || key === '=') {
        next = { x: current.x * 0.84, y: current.y * 0.84, z: current.z * 0.84 };
      } else if (key === '-' || key === '_') {
        next = { x: current.x * 1.18, y: current.y * 1.18, z: current.z * 1.18 };
      } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const dir = key === 'ArrowLeft' ? -1 : 1;
        next = {
          x: current.x * Math.cos(angle * dir) - current.z * Math.sin(angle * dir),
          y: current.y,
          z: current.x * Math.sin(angle * dir) + current.z * Math.cos(angle * dir)
        };
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        next = { ...current, y: current.y + (key === 'ArrowUp' ? 40 : -40) };
      }
      graphInstance.cameraPosition?.(next, { x: 0, y: 0, z: 0 }, 220);
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      graphInstance.zoom?.((graphInstance.zoom?.() || 1) * 1.18, 220);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      graphInstance.zoom?.((graphInstance.zoom?.() || 1) * 0.84, 220);
    } else if (event.key === '0') {
      event.preventDefault();
      fitGraphView(graphInstance, filteredGraph, graphMode, 450);
    }
  }, [filteredGraph, graphMode]);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('hermes-graph-theme', next);
      return next;
    });
  };

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setAuthUser(data?.user || null))
      .finally(() => setAuthStatus('ready'));
  }, []);

  const handleLogin = async ({ name, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '登录失败。');
    didInitialFitRef.current = false;
    setAuthUser(data.user);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    setAuthUser(null);
    setIsUserMenuOpen(false);
    setIsPasswordOpen(false);
    setIsPanelOpen(false);
    setChatNode(null);
    setIsFull(false);
  };

  useEffect(() => {
    if (!authUser) {
      setWikiGraph(null);
      setGraphStatus('idle');
      return undefined;
    }

    let cancelled = false;
    setGraphStatus('loading');

    const loadGraph = () => fetch('/api/graph', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('No live graph data');
        return response.json();
      })
      .then((data) => {
        const normalized = normalizeGraphData(data);
        if (cancelled || !normalized) return;
        setWikiGraph(normalized);
        setSelectedId(normalized.nodes[0]?.id ?? '');
        setIsPanelOpen(false);
        didInitialFitRef.current = false;
        setGraphStatus(normalized.nodes.length ? 'ready' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        setWikiGraph({ nodes: [], links: [] });
        setGraphStatus('error');
      });

    loadGraph();

    const events = new EventSource('/api/wiki/events');
    events.addEventListener('graph-update', loadGraph);
    events.onerror = () => {};

    return () => {
      cancelled = true;
      events.close();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const host = graphHostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    let graphInstance;
    setGraphReady(false);
    graphRuntimeRef.current = { mode: null, three: null };
    host.replaceChildren();

    if (graphMode === GRAPH_MODES.THREE_D && !hasWebGLSupport()) {
      setGraphNotice('当前浏览器不支持 WebGL，已切换到 2D 图谱。');
      setGraphMode(GRAPH_MODES.TWO_D);
      return undefined;
    }

    const resize = () => {
      if (!graphInstance) return;
      graphInstance
        .width(host.clientWidth || window.innerWidth)
        .height(host.clientHeight || window.innerHeight);
    };

    const initGraph = async () => {
      try {
        if (graphMode === GRAPH_MODES.THREE_D) {
          const [{ default: ForceGraph3D }, threeModule] = await Promise.all([
            import('3d-force-graph'),
            import('three')
          ]);
          if (cancelled) return;
          graphRuntimeRef.current = { mode: graphMode, three: threeModule };
          graphInstance = new ForceGraph3D(host, {
            controlType: 'orbit',
            rendererConfig: {
              alpha: true,
              antialias: false,
              powerPreference: 'high-performance'
            }
          })
            .backgroundColor('rgba(0,0,0,0)')
            .showNavInfo(false)
            .enableNavigationControls(true)
            .enableNodeDrag(true)
            .cooldownTicks(90)
            .d3AlphaDecay(0.024)
            .d3VelocityDecay(0.26)
            .nodeRelSize(4)
            .nodeResolution(18)
            .nodeLabel((node) => `${node.name}<br/><span>${getCategoryMeta(node.category).label}</span>`)
            .onNodeDragEnd((node) => {
              node.fx = node.x;
              node.fy = node.y;
              node.fz = node.z;
            })
            .showPointerCursor((node) => Boolean(node));

          const controls = graphInstance.controls?.();
          if (controls) {
            controls.rotateSpeed = 0.78;
            controls.zoomSpeed = 0.92;
            controls.panSpeed = 0.72;
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
          }
        } else {
          const { default: ForceGraph2D } = await import('force-graph');
          if (cancelled) return;
          graphRuntimeRef.current = { mode: graphMode, three: null };
          graphInstance = new ForceGraph2D(host)
            .backgroundColor('rgba(0,0,0,0)')
            .cooldownTicks(80)
            .d3AlphaDecay(0.018)
            .d3VelocityDecay(0.22)
            .nodeRelSize(6)
            .nodePointerAreaPaint((node, color, ctx) => {
              if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 18, 0, 2 * Math.PI, false);
              ctx.fill();
            })
            .showPointerCursor((node) => Boolean(node));
        }

        fgRef.current = graphInstance;
        setGraphReady(true);
        graphHostRef.current?.focus({ preventScroll: true });
        resize();
        window.addEventListener('resize', resize);
      } catch {
        if (cancelled) return;
        if (graphMode === GRAPH_MODES.THREE_D) {
          setGraphNotice('3D 图谱初始化失败，已切换到 2D 图谱。');
          setGraphMode(GRAPH_MODES.TWO_D);
        }
      }
    };

    initGraph();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', resize);
      graphInstance?._destructor();
      host.replaceChildren();
      if (fgRef.current === graphInstance) fgRef.current = null;
      graphRuntimeRef.current = { mode: null, three: null };
      setGraphReady(false);
    };
  }, [authUser, graphMode]);

  useEffect(() => {
    const graphInstance = fgRef.current;
    if (!graphReady || !graphInstance) return;

    const selectedNodeId = selectedNode?.id;

    if (graphMode === GRAPH_MODES.THREE_D) {
      const threeModule = graphRuntimeRef.current.three;
      if (!threeModule) return;
      graphInstance
        .graphData(filteredGraph)
        .nodeThreeObject((node) => createNodeSprite(node, selectedNodeId, neighborsById, threeModule))
        .nodeThreeObjectExtend(false)
        .nodeOpacity(0.92)
        .linkColor((link) => linkTouchesNode(link, selectedNodeId)
          ? (theme === 'dark' ? 'rgba(174, 242, 255, .78)' : 'rgba(24, 94, 118, .62)')
          : (theme === 'dark' ? 'rgba(120, 220, 255, .18)' : 'rgba(41, 87, 113, .18)'))
        .linkWidth((link) => linkTouchesNode(link, selectedNodeId) ? 1.8 : 0.55)
        .linkOpacity(0.72)
        .linkDirectionalParticles((link) => linkTouchesNode(link, selectedNodeId) ? 1 : 0)
        .linkDirectionalParticleWidth(1.25)
        .linkDirectionalParticleSpeed(0.0025)
        .onNodeClick(focusNode);
    } else {
      graphInstance
        .graphData(filteredGraph)
        .linkColor(() => theme === 'dark' ? 'rgba(120, 220, 255, 0.24)' : 'rgba(41, 87, 113, 0.24)')
        .linkWidth((link) => linkTouchesNode(link, selectedNodeId) ? 2.4 : 0.8)
        .nodeCanvasObject((node, ctx, globalScale) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
          const cat = getCategoryMeta(node.category);
          const isSelected = node.id === selectedNodeId;
          const isNeighbor = neighborsById.get(selectedNodeId)?.has(node.id);
          const radius = isSelected ? 11 : isNeighbor ? 8 : 6;
          ctx.save();

          ctx.shadowColor = cat.color;
          ctx.shadowBlur = isSelected ? 14 : isNeighbor ? 9 : 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = cat.color;
          ctx.fill();

          ctx.shadowBlur = 0;
          if (isSelected || isNeighbor) {
            ctx.lineWidth = isSelected ? 2.6 : 1.8;
            ctx.strokeStyle = theme === 'dark' ? 'rgba(244,249,255,.86)' : 'rgba(20,39,50,.72)';
            ctx.stroke();
          }

          const label = node.name;
          const fontSize = Math.max(3, 13 / globalScale);
          ctx.font = `600 ${fontSize}px Sora, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = theme === 'dark'
            ? (isSelected || isNeighbor ? 'rgba(244,249,255,.96)' : 'rgba(187,204,218,.72)')
            : (isSelected || isNeighbor ? 'rgba(20,39,50,.95)' : 'rgba(55,83,98,.68)');
          ctx.fillText(label, node.x, node.y + radius + fontSize + 4 / globalScale);
          ctx.restore();
        })
        .onNodeClick(focusNode);
    }

    if (!didInitialFitRef.current && filteredGraph.nodes.length) {
      didInitialFitRef.current = true;
      if (graphMode === GRAPH_MODES.THREE_D) return;
      graphInstance.onEngineStop(() => {
        fitGraphView(graphInstance, filteredGraph, graphMode, 900);
        graphInstance.onEngineStop(() => {});
      });
      window.setTimeout(() => fitGraphView(graphInstance, filteredGraph, graphMode, 900), 650);
    }
  }, [filteredGraph, focusNode, graphMode, graphReady, neighborsById, selectedNode, theme]);

  const getNodeChatContext = async (targetNode) => {
    if (!targetNode) return '';
    const targetNeighbors = [...(neighborsById.get(targetNode.id) ?? [])]
      .map((id) => graph.nodes.find((node) => node.id === id))
      .filter(Boolean);
    const sourceSnippet = await readNodeSourceSnippet(targetNode);
    const neighborContext = targetNeighbors.slice(0, 8).map((node) => (
      `- ${node.name}｜类别：${getCategoryMeta(node.category).label}｜路径：${node.sourcePath || 'Generated reference'}\n  摘要：${node.summary}`
    )).join('\n');

    return [
      `当前节点：${targetNode.name}`,
      `类别：${getCategoryMeta(targetNode.category).label}`,
      `文件路径：${targetNode.sourcePath || 'Generated reference'}`,
      `摘要：${targetNode.summary}`,
      sourceSnippet ? `原文片段：\n${sourceSnippet}` : '',
      neighborContext ? `邻近节点：\n${neighborContext}` : ''
    ].filter(Boolean).join('\n\n');
  };

  const getNodeMessages = (nodeId) => (
    messagesByNode[nodeId] || [{ role: 'agent', text: '可以围绕这个节点和它的邻近知识继续追问。' }]
  );

  const setNodeMessages = (nodeId, updater) => {
    setMessagesByNode((current) => {
      const previous = current[nodeId] || [{ role: 'agent', text: '可以围绕这个节点和它的邻近知识继续追问。' }];
      return {
        ...current,
        [nodeId]: typeof updater === 'function' ? updater(previous) : updater
      };
    });
  };

  const streamHermesAnswer = async ({ targetNode, userText, systemPrompt, recentMessages, onChunk }) => {
    const nodeContext = await getNodeChatContext(targetNode);
    const response = await fetch(HERMES_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: HERMES_MODEL,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
          {
            role: 'user',
            content: [
              nodeContext,
              userText
            ].filter(Boolean).join('\n\n')
          }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        setAuthUser(null);
        setIsPanelOpen(false);
        setChatNode(null);
      }
      const errorText = await response.text();
      throw new Error(errorText || `Hermes API 请求失败：${response.status}`);
    }

    return readHermesResponse(response, onChunk);
  };

  const sendMessage = async (event, targetNode = selectedNode) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get('message') ?? '').trim();
    if (!text) return;
    event.currentTarget.reset();
    setIsSending(true);
    setChatError('');

    const assistantMessage = { role: 'agent', text: '' };
    setNodeMessages(targetNode.id, (current) => [...current, { role: 'user', text }, assistantMessage]);

    const summary = chatSummaries[targetNode.id];
    const historyContext = summary?.conversations?.length
      ? `之前的对话概要：\n${summary.conversations.map((c, i) => `- 用户问过：${c.userQuestion}；AI 回答了：${c.aiSummary}`).join('\n')}`
      : '';

    try {
      const recentMessages = getNodeMessages(targetNode.id).slice(-6).map((message) => ({
        role: message.role === 'agent' ? 'assistant' : 'user',
        content: message.text
      }));

      await streamHermesAnswer({
        targetNode,
        userText: `用户问题：${text}`,
        systemPrompt: [
          '你是 Second Brain 知识图谱中的 Hermes Agent。请基于当前节点、原文片段和邻近节点回答用户问题。回答要清晰、可读、偏知识沉淀，支持 Markdown。',
          '当前是只读对话模式：不要创建、修改、删除任何文件，不要写入 llm-wiki，也不要调用会改变本地文件或知识库状态的工具。如果用户要求保存、写入或生成新 wiki 文件，请提醒用户使用界面中的“保存到 Wiki”按钮。',
          historyContext,
          '如果用户的问题与之前的讨论相关，请在此基础上继续深入，避免重复已给出的信息。'
        ].filter(Boolean).join('\n\n'),
        recentMessages,
        onChunk: (_chunk, fullText) => {
          setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
            index === current.length - 1 ? { ...message, text: fullText || _chunk } : message
          )));
        }
      });
    } catch (error) {
      setChatError(error.message || 'Hermes API 请求失败，请检查服务地址、Key 和 CORS 设置。');
      setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
        index === current.length - 1 ? { ...message, text: 'Hermes API 请求失败，请检查服务地址、Key 和服务状态。' } : message
      )));
    } finally {
      setIsSending(false);
    }
  };

  const generateInsightFile = async (targetNode = selectedNode) => {
    if (isGeneratingInsight || isSending) return;
    setIsGeneratingInsight(true);
    setChatError('');

    setNodeMessages(targetNode.id, (current) => [
      ...current,
      { role: 'system', text: '正在将本次对话提炼为 Wiki 洞察文件，写入 llm-wiki 知识库...' },
      { role: 'agent', text: '' }
    ]);

    try {
      const nodeMessages = getNodeMessages(targetNode.id);
      const transcript = nodeMessages.map((message) => (
        message.role === 'agent' ? `Hermes：${message.text}` : message.role === 'user' ? `用户：${message.text}` : `[系统] ${message.text}`
      )).join('\n\n');

      const recentMessages = nodeMessages.slice(-12).map((message) => ({
        role: message.role === 'agent' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
        content: message.text
      }));

      await streamHermesAnswer({
        targetNode,
        userText: [
          '任务：请调用你可用的文件/工具能力，在当前 Hermes llm-wiki 存储目录中创建一个新的 Markdown 洞察文件。',
          '要求：',
          '- 文件应该放在适合的 insights / notes / 相关类别目录下；如果需要，请根据当前节点文件路径推断 llm-wiki 根目录。',
          '- Markdown 文件需要包含标题、背景、关键洞察、关联节点、后续行动。',
          '- 写入完成后，请回复文件路径和简短摘要。',
          '本批对话：',
          transcript
        ].join('\n'),
        systemPrompt: '你是 Second Brain 的 Hermes Agent。用户明确要求把当前节点上下文和这一批对话沉淀进 llm-wiki。请优先使用可用工具创建 Markdown 文件，而不是只返回文本。如果工具不可用，请说明原因，并给出可写入的 Markdown 内容。',
        recentMessages,
        onChunk: (_chunk, fullText) => {
          setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
            index === current.length - 1 ? { ...message, text: fullText || _chunk } : message
          )));
        }
      });
    } catch (error) {
      setChatError(error.message || '洞察文件生成失败，请检查 Hermes 工具权限和 llm-wiki 路径。');
      setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
        index === current.length - 1 ? { ...message, text: '洞察文件生成失败，请检查 Hermes 工具权限和 llm-wiki 路径。' } : message
      )));
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  if (authStatus === 'checking') {
    return <main className="app-shell login-shell" data-theme={theme} />;
  }

  if (!authUser) {
    return <LoginPage theme={theme} onToggleTheme={toggleTheme} onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="graph-stage">
        <div
          ref={graphHostRef}
          className={`force-graph-host is-${graphMode}`}
          tabIndex={0}
          onKeyDown={handleGraphKeyDown}
          onMouseDown={() => graphHostRef.current?.focus()}
          onTouchStart={() => graphHostRef.current?.focus()}
          aria-label={graphMode === GRAPH_MODES.THREE_D ? '3D 第二大脑知识图谱' : '2D 第二大脑知识图谱'}
        />
      </div>

      <header className="topbar">
        <button className="brand" onClick={() => focusNode(graph.nodes[0])} aria-label="Focus Hermes Agent" disabled={!graph.nodes.length}>
          <span className="brand-mark" aria-hidden="true">
            <BrainNodeLogo />
          </span>
          <span>
            <strong>Second Brain</strong>
            <small>LLM-Wiki Graph</small>
          </span>
        </button>
        <div className="search-box" role="search">
          <Search size={18} aria-hidden="true" />
          <input aria-label="搜索第二大脑" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索第二大脑中的任意关键词..." />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清除搜索内容">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="time-filter" aria-label="时间过滤">
          <CalendarDays size={17} aria-hidden="true" />
          <label>
            <span>开始</span>
            <input
              type="date"
              value={dateRange.start}
              max={dateRange.end || undefined}
              onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
              aria-label="开始日期"
            />
          </label>
          <span className="time-filter-separator">-</span>
          <label>
            <span>结束</span>
            <input
              type="date"
              value={dateRange.end}
              min={dateRange.start || undefined}
              onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
              aria-label="结束日期"
            />
          </label>
          {(dateRange.start || dateRange.end) && (
            <button type="button" onClick={() => setDateRange({ start: '', end: '' })} aria-label="清除时间过滤">
              <X size={14} />
            </button>
          )}
          {!dateRange.start && !dateRange.end && <small>全部时间</small>}
          <small className="time-filter-count" title="当前过滤后的节点数">
            {filteredGraph.nodes.length}
          </small>
        </div>
        <button
          className={`graph-mode-button ${graphMode === GRAPH_MODES.THREE_D ? 'is-3d' : 'is-2d'}`}
          onClick={toggleGraphMode}
          aria-label={graphMode === GRAPH_MODES.THREE_D ? '切换到 2D 图谱' : '切换到 3D 图谱'}
          title={graphMode === GRAPH_MODES.THREE_D ? '切换到 2D 图谱' : '切换到 3D 图谱'}
        >
          <Network size={18} />
          <span>{graphMode === GRAPH_MODES.THREE_D ? '3D' : '2D'}</span>
        </button>
        <button className="theme-button" onClick={toggleTheme} aria-label={theme === 'dark' ? '切换浅色模式' : '切换暗色模式'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="restore-button" onClick={restoreGraph} aria-label="适配当前图谱视图" title="适配当前图谱视图">
          <RotateCcw size={18} />
        </button>
        <div className="user-menu">
          <button className="avatar-button" onClick={() => setIsUserMenuOpen((value) => !value)} aria-label="用户菜单">
            {authUser.name.slice(0, 1).toUpperCase()}
          </button>
          {isUserMenuOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-head">
                <strong>{authUser.name}</strong>
                <span>Second Brain</span>
              </div>
              <button onClick={() => {
                setIsPasswordOpen(true);
                setIsUserMenuOpen(false);
              }}>
                <KeyRound size={16} />
                修改密码
              </button>
              <button onClick={handleLogout}>
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          )}
        </div>
      </header>

      {graphStatus === 'loading' && <div className="graph-status">正在加载第二大脑图谱...</div>}
      {graphStatus === 'error' && <div className="graph-status">图谱加载失败，请检查服务端 llm-wiki 配置。</div>}
      {graphStatus === 'empty' && <div className="graph-status">当前 wiki 没有可显示节点，请检查 HERMES_WIKI_DIR 或添加 Markdown / 文档文件。</div>}
      {graphNotice && <div className="graph-mode-status">{graphNotice}</div>}

      <aside className="legend-dock" aria-label="Knowledge categories">
        {quickCategories.map(({ key, count, meta: cat }) => {
          const Icon = cat.icon;
          const active = activeCats.has(key);
          return (
            <button
              key={key}
              className={`legend-dot ${active ? 'is-active' : ''}`}
              style={{ '--cat': cat.color }}
              onClick={() => toggleCategory(key)}
              aria-label={cat.label}
            >
              <Icon size={17} />
              <span className="tag-tooltip">{cat.label} · {count}</span>
            </button>
          );
        })}
        <button
          className={`legend-dot legend-more ${isCategoryPanelOpen ? 'is-active' : ''}`}
          style={{ '--cat': '#16f2b3' }}
          onClick={() => setIsCategoryPanelOpen((value) => !value)}
          aria-label="打开类别筛选"
        >
          <SlidersHorizontal size={17} />
          {hiddenCategoryCount > 0 && <span className="legend-count">+{hiddenCategoryCount}</span>}
          <span className="tag-tooltip">类别筛选</span>
        </button>
        {isCategoryPanelOpen && (
          <div className="category-popover">
            <div className="category-popover-head">
              <strong>类别筛选</strong>
              <span>{activeCats.size}/{categoryKeys.length}</span>
            </div>
            <label className="category-search">
              <Search size={15} />
              <input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="搜索类别" />
            </label>
            <div className="category-actions">
              <button type="button" onClick={selectAllCategories}>全选</button>
              <button type="button" onClick={clearAllCategories}>清空</button>
            </div>
            <div className="category-list">
              {filteredCategoryStats.map(({ key, count, meta }) => {
                const Icon = meta.icon;
                const active = activeCats.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={active ? 'is-active' : ''}
                    style={{ '--cat': meta.color }}
                    onClick={() => toggleCategory(key)}
                  >
                    <span className="category-dot"><Icon size={14} /></span>
                    <span>{meta.label}</span>
                    <small>{count}</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {isPanelOpen && selectedNode && (
        <NodePanel
          node={selectedNode}
          neighbors={neighborNodes}
          isFull={isFull}
          onClose={() => {
            setIsPanelOpen(false);
            setIsFull(false);
            setChatNode(null);
          }}
          onCloseFull={() => setIsFull(false)}
          onFull={() => setIsFull(true)}
          onFocus={focusNode}
        />
      )}

      {isPanelOpen && selectedNode && (
        <button
          className={`ai-fab ${isFull ? 'is-full' : ''}`}
          onClick={() => setChatNode(selectedNode)}
          aria-label="打开节点 AI 对话"
          style={{ '--node-color': getCategoryMeta(selectedNode.category).color }}
        >
          <MessageCircle size={22} />
        </button>
      )}

      {chatNode && (
        <ChatModal
          node={chatNode}
          messages={chatMessages}
          summary={chatSummaries[chatNode.id]}
          isSending={isSending}
          isGeneratingInsight={isGeneratingInsight}
          error={chatError}
          onClose={() => setChatNode(null)}
          onSend={sendMessage}
          onGenerateInsight={generateInsightFile}
        />
      )}

      {isPasswordOpen && <PasswordDialog onClose={() => setIsPasswordOpen(false)} />}
    </main>
  );
}

function BrainNodeLogo() {
  return (
    <svg viewBox="0 0 48 48" role="img" focusable="false">
      <path
        d="M15 28c-4.4 0-7.5-3.1-7.5-7.2 0-3.9 2.9-7 6.8-7.2 1.4-3.4 4.4-5.4 8.1-5.4 2.3 0 4.2.8 5.6 2.1 1.3-.7 2.8-1.1 4.5-1.1 5 0 8.5 3.5 8.5 8.2 0 2.8-1.3 5.1-3.4 6.6.2.7.3 1.4.3 2.2 0 4.7-3.7 8.2-8.6 8.2-2.4 0-4.5-.8-6-2.3-1.3 1.7-3.3 2.7-5.8 2.7-3.1 0-5.7-1.7-6.9-4.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M17 20h8l6 6M25 20v12M17 20l8 12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <circle cx="17" cy="20" r="3" fill="currentColor" />
      <circle cx="25" cy="20" r="3" fill="currentColor" />
      <circle cx="31" cy="26" r="3" fill="currentColor" />
      <circle cx="25" cy="32" r="3" fill="currentColor" />
    </svg>
  );
}

function stripFrontmatter(text) {
  return text.startsWith('---\n') ? text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim() : text.trim();
}

function LoginPage({ theme, onToggleTheme, onLogin }) {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLogin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const password = String(form.get('password') || '').trim();
    if (!name || !password) {
      setError('请输入用户名和密码。');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onLogin({ name, password });
    } catch (error) {
      setError(error.message || '登录失败。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell login-shell" data-theme={theme}>
      <button className="login-theme-button" onClick={onToggleTheme} aria-label={theme === 'dark' ? '切换浅色模式' : '切换暗色模式'}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true"><BrainNodeLogo /></span>
          <div>
            <strong>Second Brain</strong>
            <span>LLM-Wiki Graph</span>
          </div>
        </div>
        <form onSubmit={submitLogin} className="login-form">
          <label>
            用户名
            <input name="name" autoComplete="username" placeholder="请输入用户名" />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" placeholder="请输入密码" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            <User size={17} />
            {isSubmitting ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}

function PasswordDialog({ onClose }) {
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const submitPassword = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const current = String(formData.get('current') || '').trim();
    const next = String(formData.get('next') || '').trim();
    const confirm = String(formData.get('confirm') || '').trim();
    if (!next || next !== confirm) {
      setMessage('两次输入的新密码不一致。');
      return;
    }
    setIsSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '密码更新失败。');
      setMessage('密码已更新。');
      form.reset();
    } catch (error) {
      setMessage(error.message || '密码更新失败。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="password-dialog" role="dialog" aria-label="修改密码">
        <div className="dialog-head">
          <div>
            <strong>修改密码</strong>
            <span>更新当前账号的登录凭据</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭修改密码">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submitPassword} className="login-form">
          <label>
            当前密码
            <input name="current" type="password" autoComplete="current-password" />
          </label>
          <label>
            新密码
            <input name="next" type="password" autoComplete="new-password" />
          </label>
          <label>
            确认新密码
            <input name="confirm" type="password" autoComplete="new-password" />
          </label>
          {message && <p className="form-error">{message}</p>}
          <button type="submit" disabled={isSaving}>
            <KeyRound size={17} />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </form>
      </section>
    </div>
  );
}

function NodePanel({ node, neighbors, isFull, onClose, onCloseFull, onFull, onFocus }) {
  const cat = getCategoryMeta(node.category);
  const PanelTag = isFull ? 'section' : 'aside';
  const [sourceContent, setSourceContent] = useState('');
  const [sourceStatus, setSourceStatus] = useState('idle');
  const readableContent = isFull ? (sourceContent || node.summary) : node.summary;
  const shouldShowArticle = !isFull || !node.asset || node.asset.previewType === 'markdown';
  const attachments = Array.isArray(node.attachments) ? node.attachments : [];
  const sourceAssets = node.asset ? [node.asset] : attachments;

  useEffect(() => {
    let cancelled = false;
    setSourceContent('');
    setSourceStatus('idle');

    if (!isFull || !node.contentUrl) return () => {
      cancelled = true;
    };

    setSourceStatus('loading');
    fetch(node.contentUrl, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load source file');
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setSourceContent(stripFrontmatter(text));
        setSourceStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setSourceStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [isFull, node.contentUrl, node.id]);

  return (
    <PanelTag className={`node-panel ${isFull ? 'is-full' : ''}`} style={{ '--node-color': cat.color }}>
      <div className="panel-scanline" />
      <div className="panel-head">
        <div>
          <div className="eyebrow"><span />{cat.label}</div>
          <h1>{node.name}</h1>
        </div>
        <div className="panel-actions">
          <button className="icon-button" onClick={isFull ? onCloseFull : onFull} aria-label={isFull ? 'Minimize node panel' : 'Maximize node panel'}>
            {isFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button className="icon-button" onClick={onClose} aria-label="Close node panel">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="node-meta">
        <span>{cat.label}</span>
        {node.date && <span>{node.date}</span>}
        <span>{node.sourcePath || 'Generated reference'}</span>
      </div>

      {isFull ? (
        <div className="full-panel-body">
          {(shouldShowArticle || sourceAssets.length > 0) && (
            <div className="full-column-left">
              {shouldShowArticle && (
                <article className="summary markdown-body">
                  {sourceStatus === 'loading' ? '正在读取原文...' : (
                    <MarkdownContent content={readableContent} />
                  )}
                  {sourceStatus === 'error' && <p>原文读取失败，当前显示摘要。</p>}
                </article>
              )}
              {!shouldShowArticle && sourceStatus === 'loading' && (
                <article className="summary markdown-body">正在读取原文...</article>
              )}
              {sourceAssets.length > 0 && (
                <SourceAssetGallery
                  assets={sourceAssets}
                  isFull={isFull}
                  title={node.asset ? '源文件' : '相关源文件'}
                  variant={node.asset ? 'primary' : 'attachments'}
                />
              )}
            </div>
          )}
          <div className="full-column-right">
            <section className="neighbor-section">
              <div className="section-title">邻近节点</div>
              <div className="neighbor-list">
                {neighbors.map((neighbor) => {
                  const neighborCat = getCategoryMeta(neighbor.category);
                  return (
                    <button key={neighbor.id} onClick={() => onFocus(neighbor)} style={{ '--neighbor': neighborCat.color }}>
                      <span />
                      <strong>{neighbor.name}</strong>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <>
          {shouldShowArticle && (
            <article className="summary">
              {sourceStatus === 'loading' ? '正在读取原文...' : readableContent}
              {sourceStatus === 'error' && <p>原文读取失败，当前显示摘要。</p>}
            </article>
          )}

          {sourceAssets.length > 0 && (
            <SourceAssetGallery
              assets={sourceAssets}
              isFull={isFull}
              title={node.asset ? '源文件' : '相关源文件'}
              variant={node.asset ? 'primary' : 'attachments'}
            />
          )}

          <section className="neighbor-section">
            <div className="section-title">邻近节点</div>
            <div className="neighbor-list">
              {neighbors.map((neighbor) => {
                const neighborCat = getCategoryMeta(neighbor.category);
                return (
                  <button key={neighbor.id} onClick={() => onFocus(neighbor)} style={{ '--neighbor': neighborCat.color }}>
                    <span />
                    <strong>{neighbor.name}</strong>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </PanelTag>
  );
}

function SourceAssetGallery({ assets, isFull, title, variant }) {
  if (!assets.length) return null;
  return (
    <section className={`source-asset-gallery ${isFull ? 'is-full' : ''} is-${variant}`}>
      {!variant.includes('primary') && <div className="section-title">{title}</div>}
      <div className="source-asset-list">
        {assets.map((asset) => (
          <SourceAssetPreview key={`${asset.url}-${asset.fileName}`} asset={asset} isFull={isFull} label={title} />
        ))}
      </div>
    </section>
  );
}

function SourceAssetPreview({ asset, isFull, label = '源文件' }) {
  const [textContent, setTextContent] = useState('');
  const [textStatus, setTextStatus] = useState('idle');
  const canInlineText = ['text', 'markdown'].includes(asset.previewType);

  useEffect(() => {
    let cancelled = false;
    setTextContent('');
    setTextStatus('idle');

    if (!isFull || !canInlineText || !asset.url) return () => {
      cancelled = true;
    };

    setTextStatus('loading');
    fetch(asset.url, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load source file');
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setTextContent(asset.previewType === 'markdown' ? stripFrontmatter(text) : text);
        setTextStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setTextStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [asset.previewType, asset.url, canInlineText, isFull]);

  const renderPreview = () => {
    if (!isFull) return <p>最大化后可在节点内预览或下载这个文件。</p>;
    if (asset.previewType === 'image') return <img src={asset.url} alt={asset.fileName} />;
    if (asset.previewType === 'video') return <video src={asset.url} controls preload="metadata" />;
    if (asset.previewType === 'audio') return <audio src={asset.url} controls preload="metadata" />;
    if (asset.previewType === 'pdf') return <iframe src={asset.url} title={asset.fileName} />;
    if (canInlineText) {
      if (textStatus === 'loading') return <p>正在读取源文件...</p>;
      if (textStatus === 'error') return <p>源文件预览失败，可以下载后查看。</p>;
      if (asset.previewType === 'markdown') return <div className="markdown-body"><MarkdownContent content={textContent} /></div>;
      return <pre>{textContent}</pre>;
    }
    return <p>这个文件类型暂不支持浏览器内预览，可以直接下载后查看。</p>;
  };

  return (
    <section className={`source-asset ${isFull ? 'is-full' : ''}`}>
      <div className="source-asset-head">
        <div>
          <span>{label}</span>
          <strong>{asset.fileName}</strong>
          <small>{asset.mimeType} · {asset.sizeLabel}</small>
        </div>
        <div className="source-asset-actions">
          <a href={asset.url} target="_blank" rel="noreferrer" title="新窗口打开源文件">
            <ArrowUpRight size={16} />
            打开
          </a>
          <a href={asset.downloadUrl} download title="下载源文件">
            <FileText size={16} />
            下载
          </a>
        </div>
      </div>
      <div className="source-asset-preview">
        {renderPreview()}
      </div>
    </section>
  );
}

function ChatModal({ node, messages, summary, isSending, isGeneratingInsight, error, onClose, onSend, onGenerateInsight }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const busy = isSending || isGeneratingInsight;
  const hasHistory = summary?.conversations?.length;

  return (
    <div className="chat-modal-backdrop" style={{ '--node-color': getCategoryMeta(node.category).color }}>
      <div className={`chat-popover ${isMaximized ? 'is-maximized' : ''}`} role="dialog" aria-modal="true" aria-label="节点 AI 对话">
        <div className="chat-popover-head">
          <div>
            <strong>AI 对话</strong>
            <span>{node.name}</span>
          </div>
          <div className="chat-window-actions">
            <button className="icon-button" onClick={() => setIsMaximized((value) => !value)} aria-label={isMaximized ? '缩小聊天窗口' : '最大化聊天窗口'}>
              {isMaximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button className="icon-button" onClick={onClose} aria-label="关闭节点 AI 对话">
              <X size={17} />
            </button>
          </div>
        </div>

        {hasHistory && (
          <div className="chat-history-bar">
            <button className="history-toggle" onClick={() => setShowHistory((v) => !v)}>
              <MessageCircle size={14} />
              {summary.totalMessages > 0 && <span className="history-count">{summary.totalMessages} 条历史消息，{summary.conversations.length} 轮对话</span>}
              {!summary.totalMessages && <span>有历史对话</span>}
            </button>
          </div>
        )}

        {showHistory && hasHistory && (
          <div className="chat-history-panel">
            {summary.conversations.map((conv, i) => (
              <div key={i} className="history-conversation">
                <div className="history-user">
                  <strong>用户：</strong>
                  <span>{conv.userQuestion}</span>
                </div>
                {conv.aiSummary && (
                  <div className="history-ai">
                    <strong>AI：</strong>
                    <span>{conv.aiSummary}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="messages">
          {(isMaximized ? messages : messages.slice(-4)).map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <MarkdownContent content={message.text || (message.role === 'agent' ? '正在思考...' : '')} />
            </div>
          ))}
        </div>
        {error && <div className="chat-error">{error}</div>}
        <div className="chat-toolbar">
          <button type="button" title="将当前对话提炼为 Markdown 洞察文件，写入 llm-wiki 知识库。AI 会分析对话内容并生成结构化文档。" onClick={() => onGenerateInsight(node)} disabled={busy}>
            {isGeneratingInsight ? <Command size={15} /> : <BookUp2 size={15} />}
            保存到 Wiki
          </button>
        </div>
        <form onSubmit={(event) => onSend(event, node)} className="chat-form">
          <input name="message" placeholder={`向 ${node.name} 提问...`} autoComplete="off" disabled={busy} />
          <button type="submit" aria-label="Send" disabled={busy}>
            {isSending ? <Command size={17} /> : <Send size={17} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function MarkdownContent({ content }) {
  const blocks = parseMarkdownBlocks(content);
  return blocks.map((block, index) => {
    if (block.type === 'heading') {
      const HeadingTag = `h${Math.min(block.level, 4)}`;
      return <HeadingTag key={index}>{renderInlineMarkdown(block.text)}</HeadingTag>;
    }
    if (block.type === 'paragraph') {
      return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
    }
    if (block.type === 'quote') {
      return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
    }
    if (block.type === 'list') {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={index}>
          {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
        </ListTag>
      );
    }
    if (block.type === 'code') {
      return <pre key={index}><code>{block.text}</code></pre>;
    }
    if (block.type === 'table') {
      return (
        <div className="markdown-table-wrap" key={index}>
          <table>
            <thead>
              <tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <hr key={index} />;
  });
}

function parseMarkdownBlocks(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      index += 2;
      const rows = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const listMatch = line.match(/^\s*(?:[-*+]\s+|\d+\.\s+)/);
    if (listMatch) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (index < lines.length && (/^\s*[-*+]\s+/.test(lines[index]) || /^\s*\d+\.\s+/.test(lines[index]))) {
        items.push(lines[index].replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '').trim());
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quote.join(' ') });
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function isTableStart(lines, index) {
  return /^\s*\|.*\|\s*$/.test(lines[index] || '') && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[index + 1] || '');
}

function splitTableRow(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderInlineMarkdown(text) {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\])/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(<code key={parts.length}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[[')) {
      parts.push(<span className="wikilink" key={parts.length}>{token.slice(2, -2)}</span>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      parts.push(<a key={parts.length} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function MediaItem({ item }) {
  const [playing, setPlaying] = useState(false);
  if (item.type === 'image') {
    return (
      <figure className="media-card image-card">
        <img src={item.url} alt={item.title} />
        <figcaption><Image size={15} />{item.title}</figcaption>
      </figure>
    );
  }
  if (item.type === 'video') {
    return (
      <figure className="media-card">
        <video src={item.url} controls />
        <figcaption><Video size={15} />{item.title}</figcaption>
      </figure>
    );
  }
  if (item.type === 'audio') {
    return (
      <div className="media-card audio-card">
        <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause audio' : 'Play audio'}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div>
          <strong>{item.title}</strong>
          <audio src={item.url} controls autoPlay={playing} />
        </div>
        <Mic2 size={18} />
      </div>
    );
  }
  return (
    <a className="media-card link-card" href={item.url} target="_blank" rel="noreferrer">
      <LinkIcon size={17} />
      <span>{item.title}</span>
      <ArrowUpRight size={16} />
    </a>
  );
}

createRoot(document.getElementById('root')).render(<App />);
