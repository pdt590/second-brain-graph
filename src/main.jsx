import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ForceGraph from 'force-graph';
import {
  ArrowUpRight,
  Bot,
  BookUp2,
  BrainCircuit,
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
  Sun,
  User,
  Video,
  X
} from 'lucide-react';
import './styles.css';

const categoryPalette = ['#16f2b3', '#45a8ff', '#ffcc4d', '#ff7a45', '#ff5d9e', '#7c6dff', '#34d399', '#f472b6', '#22d3ee', '#a3e635'];
const HERMES_CHAT_COMPLETIONS_URL = '/api/hermes/v1/chat/completions';
const HERMES_MODEL = 'hermes-agent';

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

const seedNodes = [
  {
    id: 'hermes-agent',
    name: 'Hermes Agent',
    category: 'agent',
    summary: 'Hermes Agent 是 llm-wiki 的知识调度核心，负责把模型、工具、记忆、协议和用户目标组织成可推理的任务网络。',
    media: [
      { type: 'image', title: 'Agent Topology', url: makeTopologyImage() },
      { type: 'link', title: 'React Force Graph Reference', url: 'https://vasturiano.github.io/react-force-graph/example/large-graph/' }
    ]
  },
  {
    id: 'llm-wiki',
    name: 'LLM-Wiki',
    category: 'dataset',
    summary: 'LLM-Wiki 是面向大模型系统的结构化知识库，保存概念、实现、案例、评测与多媒体证据。',
    media: [{ type: 'video', title: 'Knowledge Graph Motion', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }]
  },
  {
    id: 'retrieval-planner',
    name: 'Retrieval Planner',
    category: 'tool',
    summary: '检索规划器把用户问题拆成图谱遍历、向量召回、Web 证据和本地上下文读取等多个路径，并为每条路径生成可信度和成本预估。',
    media: [{ type: 'image', title: 'Retrieval Plan', url: makeSignalImage('Retrieval Plan', '#ffcc4d') }]
  },
  {
    id: 'long-memory',
    name: 'Long Memory',
    category: 'memory',
    summary: '长期记忆层维护可复用的用户偏好、任务历史、项目事实和跨会话知识锚点。',
    media: [{ type: 'audio', title: 'Memory Note', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }]
  },
  {
    id: 'mcp',
    name: 'MCP Interface',
    category: 'protocol',
    summary: 'MCP 为 Agent 提供标准化工具、资源和上下文接口，使不同数据源能够以统一方式进入推理链路。',
    media: [{ type: 'link', title: 'MCP Resource Contract', url: '#' }]
  },
  {
    id: 'tool-router',
    name: 'Tool Router',
    category: 'tool',
    summary: '工具路由器根据任务目标、权限、成本和可靠性选择合适工具，并把结果回写到上下文。',
    media: []
  },
  {
    id: 'embedding-space',
    name: 'Embedding Space',
    category: 'model',
    summary: '向量空间用于把节点内容、文档片段和查询意图映射到可比较的语义坐标中。',
    media: []
  },
  {
    id: 'evaluation-loop',
    name: 'Evaluation Loop',
    category: 'agent',
    summary: '评测回路对生成结果进行事实性、覆盖度、工具使用和用户价值的持续检查。',
    media: []
  },
  {
    id: 'prompt-kernel',
    name: 'Prompt Kernel',
    category: 'model',
    summary: 'Prompt Kernel 定义 Hermes Agent 的任务语气、约束、操作策略和知识图谱写入规则。',
    media: []
  },
  {
    id: 'graph-writeback',
    name: 'Graph Writeback',
    category: 'protocol',
    summary: '图谱回写协议负责把对话中产生的新结论、草稿和证据转化为可审阅的新节点。',
    media: []
  },
  {
    id: 'context-composer',
    name: 'Context Composer',
    category: 'agent',
    summary: '上下文编排器会把用户目标、当前节点、邻近节点、检索片段和系统约束压缩成一份可执行的上下文包，减少模型在长链路中丢失关键事实。',
    media: [{ type: 'image', title: 'Context Pack', url: makeSignalImage('Context Pack', '#16f2b3') }]
  },
  {
    id: 'rag-pipeline',
    name: 'RAG Pipeline',
    category: 'protocol',
    summary: 'RAG Pipeline 定义从问题重写、召回、重排、证据裁剪到答案生成的标准流程，是 llm-wiki 把文档知识注入节点对话的主路径。',
    media: [{ type: 'link', title: 'RAG Runbook', url: '#' }]
  },
  {
    id: 'reranker',
    name: 'Semantic Reranker',
    category: 'model',
    summary: '语义重排器会在向量召回之后重新评估候选内容与任务意图、当前节点和邻近节点的匹配度，优先保留可解释证据。',
    media: []
  },
  {
    id: 'chunking-policy',
    name: 'Chunking Policy',
    category: 'dataset',
    summary: '切片策略记录文档拆分粒度、标题继承、表格保留和跨段引用规则，决定节点摘要是否能追溯到稳定证据。',
    media: [{ type: 'image', title: 'Chunk Map', url: makeSignalImage('Chunk Map', '#ff7a45') }]
  },
  {
    id: 'citation-engine',
    name: 'Citation Engine',
    category: 'tool',
    summary: '引用引擎负责把回答中的结论绑定到文档片段、网页、节点历史和多媒体素材，避免生成内容成为无法审阅的孤立文本。',
    media: []
  },
  {
    id: 'knowledge-ingestion',
    name: 'Knowledge Ingestion',
    category: 'dataset',
    summary: '知识摄取模块把 Markdown、PDF、网页、会议纪要和代码仓库转换成结构化节点，并提取摘要、实体、时间线和候选关系。',
    media: [{ type: 'video', title: 'Ingestion Preview', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }]
  },
  {
    id: 'entity-resolver',
    name: 'Entity Resolver',
    category: 'tool',
    summary: '实体消歧器会合并同名概念、识别别名、保留来源差异，并把「LLM wiki」「llm-wiki」「知识库」这类表达映射到同一知识实体。',
    media: []
  },
  {
    id: 'schema-mapper',
    name: 'Schema Mapper',
    category: 'protocol',
    summary: 'Schema Mapper 定义节点类型、边类型、摘要字段、多媒体字段和权限字段，让图谱既能被可视化，也能被 Agent 可靠读写。',
    media: [{ type: 'link', title: 'Graph Schema Draft', url: '#' }]
  },
  {
    id: 'edge-confidence',
    name: 'Edge Confidence',
    category: 'dataset',
    summary: '边置信度用于表示两个节点关系的强弱、来源数量和更新时间；低置信关系会进入待审阅队列，高置信关系可直接参与推理。',
    media: []
  },
  {
    id: 'user-intent-model',
    name: 'User Intent Model',
    category: 'model',
    summary: '用户意图模型将输入拆分为探索、验证、创作、对比、执行和回写等意图，并影响图谱扩展方式和面板中推荐的下一步操作。',
    media: []
  },
  {
    id: 'task-decomposer',
    name: 'Task Decomposer',
    category: 'agent',
    summary: '任务分解器把复杂请求拆成图谱查询、工具调用、内容生成、事实校验和节点写入等步骤，并把执行状态同步到当前节点上下文。',
    media: [{ type: 'image', title: 'Task Lattice', url: makeSignalImage('Task Lattice', '#16f2b3') }]
  },
  {
    id: 'tool-permission',
    name: 'Tool Permission Gate',
    category: 'protocol',
    summary: '工具权限闸门记录哪些操作只读、哪些操作会传输数据、哪些操作需要用户确认，从而让 Agent 的工具调用边界可见且可审计。',
    media: []
  },
  {
    id: 'browser-agent',
    name: 'Browser Agent',
    category: 'tool',
    summary: 'Browser Agent 用于打开网页、读取页面、执行轻量交互和验证 UI 状态。它的输出会被转换成页面证据节点或操作日志节点。',
    media: [{ type: 'link', title: 'Browser Trace', url: '#' }]
  },
  {
    id: 'code-agent',
    name: 'Code Agent',
    category: 'tool',
    summary: 'Code Agent 读取仓库、运行测试、编辑文件并生成补丁摘要；在 llm-wiki 中，它通常连接到设计节点、实现节点和验证节点。',
    media: []
  },
  {
    id: 'prompt-library',
    name: 'Prompt Library',
    category: 'dataset',
    summary: 'Prompt Library 保存可复用的提示模板、失败案例和升级记录，帮助 Hermes Agent 在不同任务中保持稳定的行为边界。',
    media: []
  },
  {
    id: 'failure-memory',
    name: 'Failure Memory',
    category: 'memory',
    summary: '失败记忆专门记录错误路径、无效工具、过期假设和用户纠正，用来降低 Agent 在相似任务中重复犯错的概率。',
    media: [{ type: 'audio', title: 'Failure Review Note', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' }]
  },
  {
    id: 'session-memory',
    name: 'Session Memory',
    category: 'memory',
    summary: '会话记忆保存当前任务的临时约束、用户刚刚做出的选择、打开的节点和未提交的新节点草稿，通常在任务结束后被压缩或丢弃。',
    media: []
  },
  {
    id: 'project-memory',
    name: 'Project Memory',
    category: 'memory',
    summary: '项目记忆保存某个长期项目的架构偏好、命名习惯、关键文件、外部依赖和已做决策，是跨会话连续工作的基础。',
    media: []
  },
  {
    id: 'evaluation-dataset',
    name: 'Evaluation Dataset',
    category: 'dataset',
    summary: '评测数据集包含黄金问题、反例、真实用户任务和多轮对话样本，用于检测图谱召回、节点摘要和生成节点的质量。',
    media: [{ type: 'image', title: 'Eval Grid', url: makeSignalImage('Eval Grid', '#ff7a45') }]
  },
  {
    id: 'quality-rubric',
    name: 'Quality Rubric',
    category: 'protocol',
    summary: '质量量表定义事实性、可追溯性、覆盖度、新颖性、操作安全和用户价值等维度，作为节点写入和内容生成的评分标准。',
    media: []
  },
  {
    id: 'hallucination-guard',
    name: 'Hallucination Guard',
    category: 'model',
    summary: '幻觉防护模块会标记低证据结论、要求补充引用、降低模型断言强度，并在必要时把问题转回检索或用户确认。',
    media: []
  },
  {
    id: 'multimodal-index',
    name: 'Multimodal Index',
    category: 'dataset',
    summary: '多模态索引把图片、音频、视频和网页链接转换成可检索描述，并把素材与相关节点绑定，支持在节点面板中直接预览。',
    media: [{ type: 'image', title: 'Media Index', url: makeSignalImage('Media Index', '#ff7a45') }]
  },
  {
    id: 'audio-transcriber',
    name: 'Audio Transcriber',
    category: 'tool',
    summary: '音频转写器会把语音笔记、访谈和会议录音转换成带时间戳的文本节点，再由实体消歧器抽取关系。',
    media: [{ type: 'audio', title: 'Transcription Sample', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' }]
  },
  {
    id: 'video-summarizer',
    name: 'Video Summarizer',
    category: 'tool',
    summary: '视频摘要器提取关键帧、章节、讲者观点和行动项，并把长视频压缩成可被图谱检索的多段摘要。',
    media: [{ type: 'video', title: 'Video Summary Sample', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }]
  },
  {
    id: 'node-chat',
    name: 'Node Chat',
    category: 'agent',
    summary: 'Node Chat 是围绕单个节点展开的对话模式，会自动带入当前节点、邻近节点、证据片段和最近生成草稿，适合做深挖和改写。',
    media: []
  },
  {
    id: 'draft-review',
    name: 'Draft Review Queue',
    category: 'protocol',
    summary: '草稿审阅队列保存由对话生成但尚未写入图谱的节点，用户可以选择接受、修改、合并或丢弃。',
    media: []
  },
  {
    id: 'timeline-builder',
    name: 'Timeline Builder',
    category: 'tool',
    summary: '时间线构建器把节点中的日期、版本、决策和事件串联起来，帮助用户看到某个概念或项目如何演化。',
    media: [{ type: 'image', title: 'Timeline Trace', url: makeSignalImage('Timeline Trace', '#ffcc4d') }]
  }
];

const seedLinks = [
  ['hermes-agent', 'llm-wiki'],
  ['hermes-agent', 'retrieval-planner'],
  ['hermes-agent', 'tool-router'],
  ['hermes-agent', 'evaluation-loop'],
  ['llm-wiki', 'embedding-space'],
  ['llm-wiki', 'long-memory'],
  ['retrieval-planner', 'embedding-space'],
  ['retrieval-planner', 'mcp'],
  ['tool-router', 'mcp'],
  ['tool-router', 'graph-writeback'],
  ['long-memory', 'prompt-kernel'],
  ['prompt-kernel', 'hermes-agent'],
  ['evaluation-loop', 'graph-writeback'],
  ['graph-writeback', 'llm-wiki'],
  ['hermes-agent', 'context-composer'],
  ['context-composer', 'retrieval-planner'],
  ['context-composer', 'prompt-kernel'],
  ['context-composer', 'node-chat'],
  ['llm-wiki', 'knowledge-ingestion'],
  ['llm-wiki', 'schema-mapper'],
  ['llm-wiki', 'multimodal-index'],
  ['knowledge-ingestion', 'chunking-policy'],
  ['knowledge-ingestion', 'entity-resolver'],
  ['knowledge-ingestion', 'timeline-builder'],
  ['chunking-policy', 'embedding-space'],
  ['embedding-space', 'rag-pipeline'],
  ['rag-pipeline', 'retrieval-planner'],
  ['rag-pipeline', 'reranker'],
  ['reranker', 'citation-engine'],
  ['citation-engine', 'quality-rubric'],
  ['citation-engine', 'hallucination-guard'],
  ['schema-mapper', 'edge-confidence'],
  ['schema-mapper', 'graph-writeback'],
  ['edge-confidence', 'evaluation-loop'],
  ['user-intent-model', 'task-decomposer'],
  ['task-decomposer', 'tool-router'],
  ['task-decomposer', 'node-chat'],
  ['tool-router', 'tool-permission'],
  ['tool-permission', 'browser-agent'],
  ['tool-permission', 'code-agent'],
  ['browser-agent', 'citation-engine'],
  ['code-agent', 'evaluation-loop'],
  ['long-memory', 'session-memory'],
  ['long-memory', 'project-memory'],
  ['long-memory', 'failure-memory'],
  ['project-memory', 'prompt-library'],
  ['failure-memory', 'quality-rubric'],
  ['session-memory', 'node-chat'],
  ['evaluation-loop', 'evaluation-dataset'],
  ['evaluation-dataset', 'quality-rubric'],
  ['quality-rubric', 'draft-review'],
  ['hallucination-guard', 'evaluation-loop'],
  ['multimodal-index', 'audio-transcriber'],
  ['multimodal-index', 'video-summarizer'],
  ['audio-transcriber', 'knowledge-ingestion'],
  ['video-summarizer', 'knowledge-ingestion'],
  ['node-chat', 'draft-review'],
  ['draft-review', 'graph-writeback'],
  ['timeline-builder', 'edge-confidence']
].map(([source, target]) => ({ source, target }));

function buildGraph(extraNodes = [], extraLinks = []) {
  return { nodes: [...seedNodes, ...extraNodes], links: [...seedLinks, ...extraLinks] };
}

function normalizeGraphData(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links) || !data.nodes.length) return null;

  const nodes = data.nodes
    .filter((node) => node?.id)
    .map((node) => ({
      id: String(node.id),
      name: String(node.name || node.title || node.id),
      category: String(node.category || 'root'),
      summary: String(node.summary || node.description || '此节点来自 Hermes llm-wiki，暂无摘要。'),
      media: Array.isArray(node.media) ? node.media : [],
      sourcePath: node.sourcePath,
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

function makeTopologyImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 506">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="62%">
        <stop offset="0" stop-color="#16f2b3" stop-opacity=".9"/>
        <stop offset=".45" stop-color="#45a8ff" stop-opacity=".32"/>
        <stop offset="1" stop-color="#050b12"/>
      </radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="900" height="506" fill="#050b12"/>
    <path d="M0 90h900M0 180h900M0 270h900M0 360h900M0 450h900M90 0v506M180 0v506M270 0v506M360 0v506M450 0v506M540 0v506M630 0v506M720 0v506M810 0v506" stroke="#6ae7ff" stroke-opacity=".08"/>
    <circle cx="450" cy="253" r="210" fill="url(#g)" opacity=".72"/>
    <g filter="url(#glow)" stroke-linecap="round" stroke-width="3">
      <path d="M450 253 260 170 320 350 560 360 655 188 450 253 320 350M260 170 655 188M560 360 450 253" fill="none" stroke="#b9f8ff" stroke-opacity=".44"/>
      <circle cx="450" cy="253" r="42" fill="#16f2b3"/>
      <circle cx="260" cy="170" r="22" fill="#45a8ff"/>
      <circle cx="320" cy="350" r="25" fill="#ff7a45"/>
      <circle cx="560" cy="360" r="24" fill="#ff5d9e"/>
      <circle cx="655" cy="188" r="27" fill="#ffcc4d"/>
    </g>
    <text x="450" y="265" text-anchor="middle" font-family="Rajdhani,Arial" font-size="36" font-weight="700" fill="#041015">H</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makeSignalImage(title, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 506">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#06111d"/>
        <stop offset=".52" stop-color="#091827"/>
        <stop offset="1" stop-color="#02050a"/>
      </linearGradient>
      <radialGradient id="pulse" cx="50%" cy="48%" r="54%">
        <stop offset="0" stop-color="${color}" stop-opacity=".78"/>
        <stop offset=".42" stop-color="${color}" stop-opacity=".22"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="900" height="506" fill="url(#bg)"/>
    <path d="M0 96h900M0 192h900M0 288h900M0 384h900M120 0v506M240 0v506M360 0v506M480 0v506M600 0v506M720 0v506" stroke="#d9f7ff" stroke-opacity=".07"/>
    <circle cx="450" cy="245" r="224" fill="url(#pulse)"/>
    <g filter="url(#soft)" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-opacity=".9">
      <path d="M190 320c80-150 160 65 260-70s160-62 260-8"/>
      <path d="M230 230c58-38 108-54 170-10s117 74 196-8"/>
      <circle cx="190" cy="320" r="12" fill="${color}"/>
      <circle cx="450" cy="250" r="18" fill="${color}"/>
      <circle cx="710" cy="242" r="12" fill="${color}"/>
    </g>
    <text x="52" y="78" font-family="Rajdhani,Arial" font-size="48" font-weight="700" fill="#eef9ff">${title}</text>
    <text x="54" y="122" font-family="Sora,Arial" font-size="20" fill="#a9c9d8">Hermes Agent llm-wiki simulated artifact</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

function App() {
  const graphHostRef = useRef();
  const fgRef = useRef();
  const didInitialFitRef = useRef(false);
  const [graphReady, setGraphReady] = useState(false);
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
  const [selectedId, setSelectedId] = useState('hermes-agent');
  const [activeCats, setActiveCats] = useState(new Set());
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
  const [extraNodes, setExtraNodes] = useState([]);
  const [extraLinks, setExtraLinks] = useState([]);
  const graph = useMemo(() => {
    const baseGraph = wikiGraph ?? { nodes: [], links: [] };
    return {
      nodes: [...baseGraph.nodes, ...extraNodes],
      links: [...baseGraph.links, ...extraLinks]
    };
  }, [extraLinks, extraNodes, wikiGraph]);
  const categoryKeys = useMemo(() => [...new Set(graph.nodes.map((node) => node.category || 'root'))].sort(), [graph.nodes]);
  const chatMessages = chatNode
    ? messagesByNode[chatNode.id] || [{ role: 'agent', text: '可以围绕这个节点和它的邻近知识继续追问。' }]
    : [];

  useEffect(() => {
    setActiveCats(new Set(categoryKeys));
  }, [categoryKeys.join('|')]);

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
    const nodes = graph.nodes.filter((node) => {
      const categoryVisible = activeCats.has(node.category);
      const textVisible = !normalized || `${node.name} ${node.summary}`.toLowerCase().includes(normalized);
      return categoryVisible && textVisible;
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
  }, [activeCats, graph, query]);

  const toggleCategory = (key) => {
    setActiveCats((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const focusNode = useCallback((node) => {
    if (!node) return;
    setSelectedId(node.id);
    setIsFull(false);
    setIsPanelOpen(true);
    if (fgRef.current && Number.isFinite(node.x) && Number.isFinite(node.y)) {
      fgRef.current.centerAt(node.x, node.y, 850);
      fgRef.current.zoom(4.2, 850);
    }
  }, []);

  const restoreGraph = useCallback(() => {
    setQuery('');
    setActiveCats(new Set(categoryKeys));
    setSelectedId(graph.nodes[0]?.id ?? 'hermes-agent');
    setIsFull(false);
    setIsPanelOpen(false);
    setChatNode(null);
    requestAnimationFrame(() => {
      fgRef.current?.zoomToFit(850, 90);
    });
  }, [categoryKeys, graph.nodes]);

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
        setSelectedId(normalized.nodes[0]?.id ?? 'hermes-agent');
        setIsPanelOpen(false);
        didInitialFitRef.current = false;
        setGraphStatus('ready');
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
    if (!host || fgRef.current) return;

    const graphInstance = new ForceGraph(host)
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

    fgRef.current = graphInstance;
    setGraphReady(true);

    const resize = () => {
      graphInstance
        .width(host.clientWidth || window.innerWidth)
        .height(host.clientHeight || window.innerHeight);
    };
    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      graphInstance._destructor();
      fgRef.current = null;
      setGraphReady(false);
    };
  }, [authUser]);

  useEffect(() => {
    const graphInstance = fgRef.current;
    if (!graphReady || !graphInstance) return;

    graphInstance
      .graphData(filteredGraph)
      .linkColor(() => theme === 'dark' ? 'rgba(120, 220, 255, 0.24)' : 'rgba(41, 87, 113, 0.24)')
      .linkWidth((link) => {
        const source = typeof link.source === 'object' ? link.source.id : link.source;
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        return source === selectedNode.id || target === selectedNode.id ? 2.4 : 0.8;
      })
      .nodeCanvasObject((node, ctx, globalScale) => {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
        const cat = getCategoryMeta(node.category);
        const isSelected = node.id === selectedNode.id;
        const isNeighbor = neighborsById.get(selectedNode.id)?.has(node.id);
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

    if (!didInitialFitRef.current && filteredGraph.nodes.length) {
      didInitialFitRef.current = true;
      graphInstance.onEngineStop(() => {
        graphInstance.zoomToFit(900, 120);
        graphInstance.onEngineStop(() => {});
      });
      window.setTimeout(() => graphInstance.zoomToFit(900, 120), 450);
    }
  }, [filteredGraph, focusNode, graphReady, neighborsById, selectedNode, theme]);

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
      { role: 'system', text: '正在将本次对话提炼为 Wiki 洞察文件，写入 llm-wiki 知识库...' }
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
        <div ref={graphHostRef} className="force-graph-host" />
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
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索第二大脑中的任意关键词..." />
        </label>
        <button className="theme-button" onClick={toggleTheme} aria-label={theme === 'dark' ? '切换浅色模式' : '切换暗色模式'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="restore-button" onClick={restoreGraph} aria-label="恢复全图">
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

      <aside className="legend-dock" aria-label="Knowledge categories">
        {categoryKeys.map((key) => {
          const cat = getCategoryMeta(key);
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
              <span className="tag-tooltip">{cat.label}</span>
            </button>
          );
        })}
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
        <span>{node.sourcePath || 'Generated reference'}</span>
      </div>

      <article className={`summary ${isFull ? 'markdown-body' : ''}`}>
        {sourceStatus === 'loading' ? '正在读取原文...' : (
          isFull ? <MarkdownContent content={readableContent} /> : readableContent
        )}
        {sourceStatus === 'error' && <p>原文读取失败，当前显示摘要。</p>}
      </article>

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
    </PanelTag>
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
