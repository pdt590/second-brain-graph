import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  BookUp2,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Command,
  FileText,
  Folder,
  KeyRound,
  LogOut,
  Maximize2,
  Minimize2,
  MessageCircle,
  Moon,
  Network,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sun,
  User,
  ZoomIn,
  ZoomOut,
  X
} from 'lucide-react';
import './styles.css';
import WikiFolderDialog from './WikiFolderDialog.jsx';
import useModalFocus from './useModalFocus.js';

const categoryPalette = ['#f4b900', '#d7a84b', '#c5be83', '#b9c284', '#e5c778', '#ce8b43', '#a8ad79', '#dcad6c', '#c6b5a0', '#d9ceaa'];
const categoryPaletteLight = ['#886300', '#946b26', '#6a6837', '#56622c', '#8c7025', '#9a5928', '#5c6440', '#92602d', '#71604d', '#776b3b'];
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

function getCategoryMeta(category = 'root', theme = 'dark') {
  const key = String(category || 'root');
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    key,
    label: titleFromCategory(key),
    color: (theme === 'light' ? categoryPaletteLight : categoryPalette)[hash % categoryPalette.length],
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
  const intensity = 1;
  const radius = state === 'selected' ? 39 : state === 'neighbor' ? 35 : 31;
  const cx = 48;
  const cy = 48;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
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

function createNodeSprite(node, selectedNodeId, neighborsById, threeModule, theme) {
  const cat = getCategoryMeta(node.category, theme);
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
      summary: String(node.summary || node.description || 'This node comes from Hermes llm-wiki. No summary is available.'),
      date: typeof node.date === 'string' ? node.date : null,
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
    const text = extractHermesContent(data).trim() || 'The Hermes API returned no readable content.';
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
    return text.length > maxLength ? `${text.slice(0, maxLength)}\n…` : text;
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
    return 'dark';
  });
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#050705' : '#ffffff');
  }, [theme]);
  const [authUser, setAuthUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('checking');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setIsUserMenuOpen(false);
        document.querySelector('[aria-label="User menu"]')?.focus();
      } else if (event.type === 'pointerdown' && !event.target.closest('.user-menu')) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [isUserMenuOpen]);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isWikiFolderOpen, setIsWikiFolderOpen] = useState(false);
  const [wikiRevision, setWikiRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selectedIdRef = useRef('');
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
  const messagesByNodeRef = useRef({});
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
    ? messagesByNode[chatNode.id] || [{ role: 'agent', text: 'Ask follow-up questions about this node and its related knowledge.' }]
    : [];
  selectedIdRef.current = selectedId;
  messagesByNodeRef.current = messagesByNode;

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
            : [{ role: 'agent', text: 'Ask follow-up questions about this node and its related knowledge.' }]
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

  const saveChatHistory = (nodeId) => {
    const messages = messagesByNodeRef.current[nodeId];
    if (!messages?.length || messages.some((message) => message.role === 'agent' && !message.text)) return;
    fetch('/api/chat/history', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, messages })
    }).catch(() => {});
  };

  useEffect(() => {
    if (!chatNode || !loadedChatNodes.has(chatNode.id)) return;
    const messages = messagesByNode[chatNode.id];
    if (!messages?.length || messages.some((message) => message.role === 'agent' && !message.text)) return;

    const timeout = window.setTimeout(() => saveChatHistory(chatNode.id), 500);

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

  const nodesById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  const selectedNode = nodesById.get(selectedId) ?? graph.nodes[0];
  const neighborNodes = useMemo(() => {
    if (!selectedNode) return [];
    return [...(neighborsById.get(selectedNode.id) ?? [])]
      .map((id) => nodesById.get(id))
      .filter(Boolean);
  }, [neighborsById, nodesById, selectedNode]);

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

  const zoomGraph = useCallback((direction) => {
    const instance = fgRef.current;
    if (!instance) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    const factor = direction > 0 ? 1.2 : 1 / 1.2;
    if (graphMode === GRAPH_MODES.TWO_D) {
      instance.zoom?.((instance.zoom?.() || 1) * factor, duration);
      return;
    }
    const controls = instance.controls?.();
    const target = controls?.target || { x: 0, y: 0, z: 0 };
    const current = instance.cameraPosition?.();
    if (!current) return;
    const offset = { x: current.x - target.x, y: current.y - target.y, z: current.z - target.z };
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    if (!distance) return;
    const nextDistance = Math.min(controls?.maxDistance || Infinity, Math.max(controls?.minDistance || 1, distance / factor));
    const scale = nextDistance / distance;
    instance.cameraPosition?.({ x: target.x + offset.x * scale, y: target.y + offset.y * scale, z: target.z + offset.z * scale }, { x: target.x, y: target.y, z: target.z }, duration);
  }, [graphMode]);

  const handleGraphKeyDown = useCallback((event) => {
    const graphInstance = fgRef.current;
    if (!graphInstance) return;
    if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      zoomGraph(event.key === '+' || event.key === '=' ? 1 : -1);
      return;
    }

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
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
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

    if (event.key === '0') {
      event.preventDefault();
      fitGraphView(graphInstance, filteredGraph, graphMode, 450);
    }
  }, [filteredGraph, graphMode, zoomGraph]);

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
    if (!response.ok) throw new Error(data.error || 'Login failed.');
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
    let hasLoadedGraph = false;
    setGraphStatus('loading');

    const loadGraph = () => fetch('/api/graph', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('No live graph data');
        return response.json();
      })
      .then((data) => {
        const normalized = normalizeGraphData(data);
        if (cancelled || !normalized) return;
        const firstLoad = !hasLoadedGraph;
        hasLoadedGraph = true;
        const nodeIds = new Set(normalized.nodes.map((node) => node.id));
        const previousSelectedId = selectedIdRef.current;
        const previousSelectionExists = previousSelectedId && nodeIds.has(previousSelectedId);

        setWikiGraph(normalized);
        setSelectedId((current) => nodeIds.has(current) ? current : (normalized.nodes[0]?.id ?? ''));
        if (previousSelectedId && !previousSelectionExists) {
          setIsPanelOpen(false);
          setIsFull(false);
          setChatNode(null);
        }
        if (firstLoad) didInitialFitRef.current = false;
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
  }, [authUser, wikiRevision]);

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
      setGraphNotice('This browser does not support WebGL. Switched to the 2D graph.');
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
            .nodeLabel((node) => `${escapeHtml(node.name)}<br/><span>${escapeHtml(getCategoryMeta(node.category).label)}</span>`)
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

        // Shorter links and gentler repulsion keep the default layout compact.
        graphInstance.d3Force('charge')?.strength(-12);
        graphInstance.d3Force('link')?.distance(18);
        let layoutNodes = [];
        const compactForce = (alpha) => {
          for (const node of layoutNodes) {
            if (Number.isFinite(node.x)) node.vx -= node.x * 0.03 * alpha;
            if (Number.isFinite(node.y)) node.vy -= node.y * 0.03 * alpha;
            if (graphMode === GRAPH_MODES.THREE_D && Number.isFinite(node.z)) node.vz -= node.z * 0.03 * alpha;
          }
        };
        compactForce.initialize = (nodes) => { layoutNodes = nodes; };
        graphInstance.d3Force('compact', compactForce);

        fgRef.current = graphInstance;
        setGraphReady(true);
        graphHostRef.current?.focus({ preventScroll: true });
        resize();
        window.addEventListener('resize', resize);
      } catch {
        if (cancelled) return;
        if (graphMode === GRAPH_MODES.THREE_D) {
          setGraphNotice('The 3D graph could not initialize. Switched to the 2D graph.');
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
        .nodeThreeObject((node) => createNodeSprite(node, selectedNodeId, neighborsById, threeModule, theme))
        .nodeThreeObjectExtend(false)
        .nodeOpacity(0.92)
        .linkColor((link) => linkTouchesNode(link, selectedNodeId)
          ? (theme === 'dark' ? 'rgba(244, 185, 0, .75)' : 'rgba(136, 99, 0, .7)')
          : (theme === 'dark' ? 'rgba(167, 165, 143, .24)' : 'rgba(98, 98, 98, .24)'))
        .linkWidth((link) => linkTouchesNode(link, selectedNodeId) ? 1.8 : 0.55)
        .linkOpacity(0.72)
        .linkDirectionalParticles((link) => linkTouchesNode(link, selectedNodeId) ? 1 : 0)
        .linkDirectionalParticleWidth(1.25)
        .linkDirectionalParticleSpeed(0.0025)
        .onNodeClick(focusNode);
    } else {
      graphInstance
        .graphData(filteredGraph)
        .linkColor(() => theme === 'dark' ? 'rgba(167, 165, 143, .3)' : 'rgba(98, 98, 98, .3)')
        .linkWidth((link) => linkTouchesNode(link, selectedNodeId) ? 2.4 : 0.8)
        .nodeCanvasObject((node, ctx) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
          const cat = getCategoryMeta(node.category, theme);
          const isSelected = node.id === selectedNodeId;
          const isNeighbor = neighborsById.get(selectedNodeId)?.has(node.id);
          const radius = isSelected ? 11 : isNeighbor ? 8 : 6;
          ctx.save();

          ctx.shadowColor = cat.color;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = cat.color;
          ctx.fill();

          ctx.shadowBlur = 0;
          if (isSelected || isNeighbor) {
            ctx.lineWidth = isSelected ? 2.6 : 1.8;
            ctx.strokeStyle = theme === 'dark' ? 'rgba(238,230,206,.9)' : 'rgba(32,32,32,.8)';
            ctx.stroke();
          }

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
      .map((id) => nodesById.get(id))
      .filter(Boolean);
    const sourceSnippet = await readNodeSourceSnippet(targetNode);
    const neighborContext = targetNeighbors.slice(0, 8).map((node) => (
      `- ${node.name} | Category: ${getCategoryMeta(node.category).label} | Path: ${node.sourcePath || 'Generated reference'}\n  Summary: ${node.summary}`
    )).join('\n');

    return [
      `Current node: ${targetNode.name}`,
      `Category: ${getCategoryMeta(targetNode.category).label}`,
      `File path: ${targetNode.sourcePath || 'Generated reference'}`,
      `Summary: ${targetNode.summary}`,
      sourceSnippet ? `Source excerpt: \n${sourceSnippet}` : '',
      neighborContext ? `Neighboring nodes: \n${neighborContext}` : ''
    ].filter(Boolean).join('\n\n');
  };

  const getNodeMessages = (nodeId) => (
    messagesByNode[nodeId] || [{ role: 'agent', text: 'Ask follow-up questions about this node and its related knowledge.' }]
  );

  const setNodeMessages = (nodeId, updater) => {
    setMessagesByNode((current) => {
      const previous = current[nodeId] || [{ role: 'agent', text: 'Ask follow-up questions about this node and its related knowledge.' }];
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
      throw new Error(errorText || `Hermes API request failed: ${response.status}`);
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
      ? `Previous conversation summary: \n${summary.conversations.map((c, i) => `- User asked: ${c.userQuestion}; AI answered: ${c.aiSummary}`).join('\n')}`
      : '';

    try {
      const recentMessages = getNodeMessages(targetNode.id).slice(-6).map((message) => ({
        role: message.role === 'agent' ? 'assistant' : 'user',
        content: message.text
      }));

      await streamHermesAnswer({
        targetNode,
        userText: `User question: ${text}`,
        systemPrompt: [
          'You are the Hermes Agent in the Second Brain knowledge graph. Answer questions using the current node, source excerpts, and neighboring nodes. Provide clear, readable, knowledge-focused answers with Markdown support.',
          'This conversation is read-only: do not create, modify, or delete files, write to llm-wiki, or use tools that change local files or the knowledge base. If the user asks to save, write, or generate a wiki file, remind them to use the Save to Wiki button.',
          historyContext,
          'If the question relates to an earlier discussion, build on it and avoid repeating information already provided.'
        ].filter(Boolean).join('\n\n'),
        recentMessages,
        onChunk: (_chunk, fullText) => {
          setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
            index === current.length - 1 ? { ...message, text: fullText || _chunk } : message
          )));
        }
      });
    } catch (error) {
      setChatError(error.message || 'The Hermes API request failed. Check the service URL, API key, and CORS settings.');
      setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
        index === current.length - 1 ? { ...message, text: 'The Hermes API request failed. Check the service URL, API key, and service status.' } : message
      )));
    } finally {
      saveChatHistory(targetNode.id);
      setIsSending(false);
    }
  };

  const generateInsightFile = async (targetNode = selectedNode) => {
    if (isGeneratingInsight || isSending) return;
    setIsGeneratingInsight(true);
    setChatError('');

    setNodeMessages(targetNode.id, (current) => [
      ...current,
      { role: 'system', text: 'Summarizing this conversation into a Wiki insight file in llm-wiki…' },
      { role: 'agent', text: '' }
    ]);

    try {
      const nodeMessages = getNodeMessages(targetNode.id);
      const transcript = nodeMessages.map((message) => (
        message.role === 'agent' ? `Hermes: ${message.text}` : message.role === 'user' ? `User: ${message.text}` : `[System] ${message.text}`
      )).join('\n\n');

      const recentMessages = nodeMessages.slice(-12).map((message) => ({
        role: message.role === 'agent' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
        content: message.text
      }));

      await streamHermesAnswer({
        targetNode,
        userText: [
          'Task: Use your available file tools to create a new Markdown insight file in the current Hermes llm-wiki directory.',
          'Requirements:',
          '- Place the file in an appropriate insights, notes, or related category directory. If necessary, infer the llm-wiki root from the current node path.',
          '- The Markdown file must include a title, background, key insights, related nodes, and next steps.',
          '- After writing the file, return its path and a brief summary.',
          'Conversation:',
          transcript
        ].join('\n'),
        systemPrompt: 'You are the Hermes Agent for Second Brain. The user explicitly requested saving the current node context and this conversation to llm-wiki. Use available tools to create a Markdown file instead of only returning text. If tools are unavailable, explain why and provide Markdown content that can be saved.',
        recentMessages,
        onChunk: (_chunk, fullText) => {
          setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
            index === current.length - 1 ? { ...message, text: fullText || _chunk } : message
          )));
        }
      });
    } catch (error) {
      setChatError(error.message || 'The insight file could not be generated. Check Hermes tool permissions and the llm-wiki path.');
      setNodeMessages(targetNode.id, (current) => current.map((message, index) => (
        index === current.length - 1 ? { ...message, text: 'The insight file could not be generated. Check Hermes tool permissions and the llm-wiki path.' } : message
      )));
    } finally {
      saveChatHistory(targetNode.id);
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
    <main id="main-content" tabIndex={-1} className="app-shell" data-theme={theme}>
      <a className="skip-link" href="#graph-content">Skip to knowledge graph</a>
      <div className="graph-stage">
        <div
          ref={graphHostRef}
          id="graph-content"
          aria-describedby="graph-keyboard-help"
          className={`force-graph-host is-${graphMode}`}
          tabIndex={0}
          onKeyDown={handleGraphKeyDown}
          onMouseDown={() => graphHostRef.current?.focus()}
          onTouchStart={() => graphHostRef.current?.focus()}
          aria-label={graphMode === GRAPH_MODES.THREE_D ? '3D Second Brain knowledge graph' : '2D Second Brain knowledge graph'}
        />
      </div>

      <label className="graph-node-picker">
        Select a graph node
        <select name="graph-node" value={selectedNode?.id || ''} onChange={(event) => focusNode(nodesById.get(event.target.value))} disabled={!graph.nodes.length}>
          {!graph.nodes.length && <option value="">No nodes available</option>}
          {graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
        </select>
      </label>
      <p id="graph-keyboard-help" className="visually-hidden">Use arrow keys to navigate the 3D graph, plus or minus to zoom, and zero to fit the graph. Use Select a graph node to open a file with the keyboard.</p>



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
          <Search aria-hidden="true" size={18} aria-hidden="true" />
          <input name="search" autoComplete="off" type="search" aria-label="Search Second Brain" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Second Brain…" />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <X aria-hidden="true" size={15} />
            </button>
          )}
        </div>
        <div className="time-filter" aria-label="Date filter">
          <CalendarDays aria-hidden="true" size={17} aria-hidden="true" />
          <label>
            <span>Start</span>
            <input
              type="date"
              autoComplete="off"
              value={dateRange.start}
              max={dateRange.end || undefined}
              onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
              name="start-date" aria-label="Start date"
            />
          </label>
          <span className="time-filter-separator">-</span>
          <label>
            <span>End</span>
            <input
              type="date"
              autoComplete="off"
              value={dateRange.end}
              min={dateRange.start || undefined}
              onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
              name="end-date" aria-label="End date"
            />
          </label>
          {(dateRange.start || dateRange.end) && (
            <button type="button" onClick={() => setDateRange({ start: '', end: '' })} aria-label="Clear date filter">
              <X aria-hidden="true" size={14} />
            </button>
          )}
          {!dateRange.start && !dateRange.end && <small>All time</small>}
          <small className="time-filter-count" title="Number of filtered nodes">
            {filteredGraph.nodes.length}
          </small>
        </div>
        <div className="topbar-actions">
        <button
          className={`graph-mode-button ${graphMode === GRAPH_MODES.THREE_D ? 'is-3d' : 'is-2d'}`}
          onClick={toggleGraphMode}
          aria-label={graphMode === GRAPH_MODES.THREE_D ? 'Switch to 2D graph' : 'Switch to 3D graph'}
          title={graphMode === GRAPH_MODES.THREE_D ? 'Switch to 2D graph' : 'Switch to 3D graph'}
        >
          <Network aria-hidden="true" size={18} />
          <span>{graphMode === GRAPH_MODES.THREE_D ? '3D' : '2D'}</span>
        </button>
        <button className="theme-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
        </button>
      <div className="graph-zoom-controls" role="group" aria-label="Graph zoom">
        <button type="button" onClick={() => zoomGraph(1)} disabled={!graphReady || !filteredGraph.nodes.length} aria-label="Zoom in" title="Zoom in (+)">
          <ZoomIn aria-hidden="true" size={20} />
        </button>
        <button type="button" onClick={() => zoomGraph(-1)} disabled={!graphReady || !filteredGraph.nodes.length} aria-label="Zoom out" title="Zoom out (-)">
          <ZoomOut aria-hidden="true" size={20} />
        </button>
      </div>
        <button className="restore-button" onClick={restoreGraph} aria-label="Fit graph to view" title="Fit graph to view">
          <RotateCcw aria-hidden="true" size={18} />
        </button>
        <div className="user-menu">
          <button className="avatar-button" onKeyDown={(event) => { if (event.key === 'Escape') setIsUserMenuOpen(false); }} onClick={() => setIsUserMenuOpen((value) => !value)} aria-expanded={isUserMenuOpen} aria-label="User menu">
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
                <KeyRound aria-hidden="true" size={16} />
                Change password
              </button>
              <button onClick={() => { setIsWikiFolderOpen(true); setIsUserMenuOpen(false); }}>
                <Folder aria-hidden="true" size={16} />
                Choose Wiki Folder
              </button>
              <button onClick={handleLogout}>
                <LogOut aria-hidden="true" size={16} />
                Log out
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      {graphStatus === 'loading' && <div className="graph-status" role="status">Loading the Second Brain graph…</div>}
      {graphStatus === 'error' && <div className="graph-status" role="status">The graph could not load. Check the server llm-wiki configuration.</div>}
      {graphStatus === 'empty' && <div className="graph-status" role="status">This wiki has no nodes to display. Check HERMES_WIKI_DIR or add Markdown or document files.</div>}
      {graphNotice && <div className="graph-mode-status" role="status">{graphNotice}</div>}

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
          style={{ '--cat': '#f4b900' }}
          onClick={() => setIsCategoryPanelOpen((value) => !value)}
          aria-label="Open category filter"
        >
          <SlidersHorizontal aria-hidden="true" size={17} />
          {hiddenCategoryCount > 0 && <span className="legend-count">+{hiddenCategoryCount}</span>}
          <span className="tag-tooltip">Category filter</span>
        </button>
        {isCategoryPanelOpen && (
          <div className="category-popover">
            <div className="category-popover-head">
              <strong>Category filter</strong>
              <span>{activeCats.size}/{categoryKeys.length}</span>
            </div>
            <label className="category-search">
              <Search aria-hidden="true" size={15} />
              <input name="category" aria-label="Search categories" autoComplete="off" type="search" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Search categories" />
            </label>
            <div className="category-actions">
              <button type="button" onClick={selectAllCategories}>Select all</button>
              <button type="button" onClick={clearAllCategories}>Clear all</button>
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
          aria-label="Open node AI chat"
          style={{ '--node-color': getCategoryMeta(selectedNode.category).color }}
        >
          <MessageCircle aria-hidden="true" size={22} />
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

      {isWikiFolderOpen && <WikiFolderDialog onClose={() => setIsWikiFolderOpen(false)} onSelected={() => {
        setIsWikiFolderOpen(false);
        setQuery(''); setDateRange({ start: '', end: '' });
        setSelectedId(''); setIsPanelOpen(false); setIsFull(false); setChatNode(null);
        setMessagesByNode({}); setLoadedChatNodes(new Set()); setChatSummaries({});
        previousCategoryKeysRef.current = new Set();
        didInitialFitRef.current = false;
        setWikiRevision((value) => value + 1);
      }} />}
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function LoginPage({ theme, onToggleTheme, onLogin }) {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLogin = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') || '').trim();
    const password = String(form.get('password') || '');
    if (!name || !password) {
      setError('Enter your username and password.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onLogin({ name, password });
    } catch (error) {
      setError(error.message || 'Login failed.');
      formElement.elements.password.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell login-shell" data-theme={theme}>
      <button className="login-theme-button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
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
            Username
            <input name="name" required spellCheck={false} autoComplete="username" placeholder="Enter your username" />
          </label>
          <label>
            Password
            <input name="password" required type="password" autoComplete="current-password" placeholder="Enter your password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            <User aria-hidden="true" size={17} />
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function PasswordDialog({ onClose }) {
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef(null);
  useModalFocus(dialogRef, onClose, true, isSaving);

  const submitPassword = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const current = String(formData.get('current') || '');
    const next = String(formData.get('next') || '');
    const confirm = String(formData.get('confirm') || '');
    if (!next || next !== confirm) {
      setMessage('The new passwords do not match.');
      form.elements.confirm.focus();
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
      if (!response.ok) throw new Error(data.error || 'The password could not be updated.');
      setMessage('Password updated.');
      form.reset();
    } catch (error) {
      setMessage(error.message || 'The password could not be updated.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="password-dialog" role="dialog" aria-modal="true" aria-label="Change password">
        <div className="dialog-head">
          <div>
            <strong>Change password</strong>
            <span>Update the login credentials for this account</span>
          </div>
          <button className="icon-button" onClick={onClose} disabled={isSaving} aria-label="Close password dialog">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <form onSubmit={submitPassword} className="login-form">
          <label>
            Current password
            <input name="current" required type="password" autoComplete="current-password" />
          </label>
          <label>
            New password
            <input name="next" required minLength={8} type="password" autoComplete="new-password" />
          </label>
          <label>
            Confirm new password
            <input name="confirm" required minLength={8} type="password" autoComplete="new-password" />
          </label>
          {message && <p className="form-error" role="status" aria-live="polite">{message}</p>}
          <button type="submit" disabled={isSaving}>
            <KeyRound aria-hidden="true" size={17} />
            {isSaving ? 'Saving…' : 'Save'}
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
    <PanelTag aria-label="Node details" className={`node-panel ${isFull ? 'is-full' : ''}`} style={{ '--node-color': cat.color }}>
      <div className="panel-scanline" />
      <div className="panel-head">
        <div>
          <div className="eyebrow"><span />{cat.label}</div>
          <h1>{node.name}</h1>
        </div>
        <div className="panel-actions">
          <button className="icon-button" onClick={isFull ? onCloseFull : onFull} aria-label={isFull ? 'Minimize node panel' : 'Maximize node panel'}>
            {isFull ? <Minimize2 aria-hidden="true" size={18} /> : <Maximize2 aria-hidden="true" size={18} />}
          </button>
          <button className="icon-button" onClick={onClose} aria-label="Close node panel">
            <X aria-hidden="true" size={18} />
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
                <article className={`summary markdown-body${/\.mdx?$/i.test(node.sourcePath || '') ? ' markdown-file-content' : ''}`}>
                  {sourceStatus === 'loading' ? 'Loading source…' : (
                    <MarkdownContent content={readableContent} />
                  )}
                  {sourceStatus === 'error' && <p>The source could not be loaded. Showing the summary.</p>}
                </article>
              )}
              {!shouldShowArticle && sourceStatus === 'loading' && (
                <article className={`summary markdown-body${/\.mdx?$/i.test(node.sourcePath || '') ? ' markdown-file-content' : ''}`}>Loading source…</article>
              )}
              {sourceAssets.length > 0 && (
                <SourceAssetGallery
                  assets={sourceAssets}
                  isFull={isFull}
                  title={node.asset ? 'Source file' : 'Related source files'}
                  variant={node.asset ? 'primary' : 'attachments'}
                />
              )}
            </div>
          )}
          <div className="full-column-right">
            <section className="neighbor-section">
              <div className="section-title">Neighboring nodes</div>
              <div className="neighbor-list">
                {neighbors.map((neighbor) => {
                  const neighborCat = getCategoryMeta(neighbor.category);
                  return (
                    <button key={neighbor.id} onClick={() => onFocus(neighbor)} style={{ '--neighbor': neighborCat.color }}>
                      <span />
                      <strong>{neighbor.name}</strong>
                      <ChevronRight aria-hidden="true" size={16} />
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
            <article className={`summary${/\.mdx?$/i.test(node.sourcePath || '') ? ' markdown-file-content' : ''}`}>
              {sourceStatus === 'loading' ? 'Loading source…' : readableContent}
              {sourceStatus === 'error' && <p>The source could not be loaded. Showing the summary.</p>}
            </article>
          )}

          {sourceAssets.length > 0 && (
            <SourceAssetGallery
              assets={sourceAssets}
              isFull={isFull}
              title={node.asset ? 'Source file' : 'Related source files'}
              variant={node.asset ? 'primary' : 'attachments'}
            />
          )}

          <section className="neighbor-section">
            <div className="section-title">Neighboring nodes</div>
            <div className="neighbor-list">
              {neighbors.map((neighbor) => {
                const neighborCat = getCategoryMeta(neighbor.category);
                return (
                  <button key={neighbor.id} onClick={() => onFocus(neighbor)} style={{ '--neighbor': neighborCat.color }}>
                    <span />
                    <strong>{neighbor.name}</strong>
                    <ChevronRight aria-hidden="true" size={16} />
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

function SourceAssetPreview({ asset, isFull, label = 'Source file' }) {
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
    if (!isFull) return <p>Maximize this panel to preview or download the file.</p>;
    if (asset.previewType === 'image') return <img src={asset.url} alt={asset.fileName} loading="lazy" decoding="async" />;
    if (asset.previewType === 'video') return <video aria-label={asset.fileName} src={asset.url} controls preload="metadata" />;
    if (asset.previewType === 'audio') return <audio aria-label={asset.fileName} src={asset.url} controls preload="metadata" />;
    if (asset.previewType === 'pdf') return <iframe src={asset.url} title={asset.fileName} />;
    if (canInlineText) {
      if (textStatus === 'loading') return <p>Loading source file…</p>;
      if (textStatus === 'error') return <p>The source preview could not load. Download the file to view it.</p>;
      if (asset.previewType === 'markdown') return <div className="markdown-body"><MarkdownContent content={textContent} /></div>;
      return <pre>{textContent}</pre>;
    }
    return <p>This file type cannot be previewed in the browser. Download it to view it.</p>;
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
          <a href={asset.url} target="_blank" rel="noreferrer" title="Open source file in a new window">
            <ArrowUpRight aria-hidden="true" size={16} />
            Open
          </a>
          <a href={asset.downloadUrl} download title="Download source file">
            <FileText aria-hidden="true" size={16} />
            Download
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
  const dialogRef = useRef(null);
  useModalFocus(dialogRef, onClose);
  const hasHistory = summary?.conversations?.length;
  const messagesRef = useRef(null);
  const isNearBottomRef = useRef(true);

  // Scroll to the bottom when opening the window or changing the layout.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
  }, [isMaximized, showHistory]);

  // Follow new messages while streaming; pause when the user scrolls up.
  useEffect(() => {
    const el = messagesRef.current;
    if (el && isNearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <div className="chat-modal-backdrop" style={{ '--node-color': getCategoryMeta(node.category).color }}>
      <div ref={dialogRef} tabIndex={-1} className={`chat-popover ${isMaximized ? 'is-maximized' : ''}`} role="dialog" aria-modal="true" aria-label="Node AI chat">
        <div className="chat-popover-head">
          <div>
            <strong>AI chat</strong>
            <span>{node.name}</span>
          </div>
          <div className="chat-window-actions">
            <button className="icon-button" onClick={() => setIsMaximized((value) => !value)} aria-label={isMaximized ? 'Restore chat window' : 'Maximize chat window'}>
              {isMaximized ? <Minimize2 aria-hidden="true" size={17} /> : <Maximize2 aria-hidden="true" size={17} />}
            </button>
            <button className="icon-button" onClick={onClose} aria-label="Close node AI chat">
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        </div>

        {hasHistory && (
          <div className="chat-history-bar">
            <button className="history-toggle" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              <MessageCircle aria-hidden="true" size={14} />
              {summary.totalMessages > 0 && <span className="history-count">{summary.totalMessages} past messages, {summary.conversations.length} conversations</span>}
              {!summary.totalMessages && <span>Previous conversations available</span>}
            </button>
          </div>
        )}

        {showHistory && hasHistory && (
          <div className="chat-history-panel">
            {summary.conversations.map((conv, i) => (
              <div key={i} className="history-conversation">
                <div className="history-user">
                  <strong>User: </strong>
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

        <p className="visually-hidden" role="status">{busy ? 'Hermes is processing your request…' : ''}</p>
        <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
          {(isMaximized ? messages : messages.slice(-4)).map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <MarkdownContent content={message.text || (message.role === 'agent' ? 'Thinking…' : '')} />
            </div>
          ))}
        </div>
        {error && <div className="chat-error" role="alert">{error}</div>}
        <div className="chat-toolbar">
          <button type="button" title="Save this conversation as a Markdown insight file in llm-wiki. AI will analyze the conversation and generate a structured document." onClick={() => onGenerateInsight(node)} disabled={busy}>
            {isGeneratingInsight ? <Command aria-hidden="true" size={15} /> : <BookUp2 aria-hidden="true" size={15} />}
            Save to Wiki
          </button>
        </div>
        <form onSubmit={(event) => onSend(event, node)} className="chat-form">
          <input aria-label="Message to Hermes" required name="message" placeholder={`Ask ${node.name}…`} autoComplete="off" disabled={busy} />
          <button type="submit" aria-label="Send" disabled={busy}>
            {isSending ? <Command aria-hidden="true" size={17} /> : <Send aria-hidden="true" size={17} />}
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
              <tr>{block.headers.map((cell, cellIndex) => <th scope="col" key={cellIndex}>{renderInlineMarkdown(cell)}</th>)}</tr>
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
      const href = link?.[2] || '';
      const isSafeScheme = /^(https?:|mailto:)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
      if (!isSafeScheme) {
        parts.push(<span key={parts.length}>{link?.[1] || token}</span>);
      } else {
        parts.push(<a key={parts.length} href={href} target="_blank" rel="noreferrer">{link[1]}</a>);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

createRoot(document.getElementById('root')).render(<App />);
