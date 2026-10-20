# Graph Report - second-brain-graph  (2026-10-19)

## Corpus Check
- 24 files · ~18,748 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: .cmd 4, (none) 3, .example 3)

## Summary
- 271 nodes · 542 edges · 15 communities (10 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Interactive Graph Interface
- Wiki Asset Indexing
- HTTP API and History
- Hermes Runtime Configuration
- Windows Product Packaging
- Product Deployment Documentation
- Authentication and Index Tests
- WSL Installation Workflow
- Frontend Package Dependencies
- Application Run Scripts
- Second Brain Icon
- Windows Archive Builder
- Host Deployment Script
- Graphify Exploration Workflow

## God Nodes (most connected - your core abstractions)
1. `App()` - 21 edges
2. `install-wsl.sh script` - 13 edges
3. `ingestMarkdown()` - 13 edges
4. `createApiRoutes()` - 12 edges
5. `main()` - 11 edges
6. `sendJson()` - 11 edges
7. `createEmbeddedHermesManager()` - 11 edges
8. `ensureProductRuntimeEnv()` - 11 edges
9. `isProductMode()` - 11 edges
10. `createWikiGraphIndexer()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Bundled Windows product launcher` --references--> `Cloud model credentials`  [INFERRED]
  packaging/windows/README-WINDOWS-PRODUCT.md → PRODUCT_MODE.md
- `Bundled Windows product launcher` --implements--> `Product mode runtime isolation`  [INFERRED]
  packaging/windows/README-WINDOWS-PRODUCT.md → PRODUCT_MODE.md
- `Bundled Windows product launcher` --implements--> `Offline bundled Windows product`  [INFERRED]
  packaging/windows/README-WINDOWS-PRODUCT.md → PRODUCT_MODE.md
- `WSL Windows installer` --semantically_similar_to--> `Offline bundled Windows product`  [INFERRED] [semantically similar]
  WINDOWS_INSTALL.md → PRODUCT_MODE.md
- `Chinese-language Second Brain HTML entrypoint` --conceptually_related_to--> `Second Brain knowledge graph application`  [INFERRED]
  index.html → README.md

## Import Cycles
- None detected.

## Communities (15 total, 5 thin omitted)

### Community 0 - "Interactive Graph Interface"
Cohesion: 0.07
Nodes (45): 3d-force-graph, force-graph, lucide-react, react, react-dom, three, App(), BrainNodeLogo() (+37 more)

### Community 1 - "Wiki Asset Indexing"
Cohesion: 0.10
Nodes (47): buildGraphFromWiki(), cleanAssetReference(), createAssetDescriptor(), createAssetSummary(), createDocumentCache(), createFileSignature(), createGraphSignature(), createPublicAsset() (+39 more)

### Community 2 - "HTTP API and History"
Cohesion: 0.11
Nodes (25): createApiRoutes(), handleChatHistory(), handleChatSummary(), handleWikiAsset(), handleWikiContent(), readJsonBody(), sendJson(), chatHistoryPath() (+17 more)

### Community 3 - "Hermes Runtime Configuration"
Cohesion: 0.14
Nodes (28): vite, @vitejs/plugin-react, createEmbeddedHermesManager(), createHermesEnv(), parseArgs(), resolveHermesArgs(), resolveHermesCommand(), shouldUseShell() (+20 more)

### Community 4 - "Windows Product Packaging"
Cohesion: 0.16
Nodes (23): allowMissingRuntime, copyApp(), copyConfig(), copyDocs(), copyFilter(), copyRuntime(), copyWindowsLaunchers(), createZip() (+15 more)

### Community 5 - "Product Deployment Documentation"
Cohesion: 0.11
Nodes (18): Docker deployment, Nginx and Node production deployment, second-brain-data persistent volume, Second Brain Compose service, Read-only /wiki bind mount, Chinese-language Second Brain HTML entrypoint, Bundled Windows product launcher, Offline Python dependency wheelhouse (+10 more)

### Community 6 - "Authentication and Index Tests"
Cohesion: 0.13
Nodes (5): authFilePath(), createAuth(), createAuthStore(), hashPassword(), saveAuthStore()

### Community 7 - "WSL Installation Workflow"
Cohesion: 0.33
Nodes (13): detect_api_key(), detect_hermes_target(), detect_node(), detect_wiki_dir(), fail(), info(), need_command(), ok() (+5 more)

### Community 8 - "Frontend Package Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, 3d-force-graph, force-graph, lucide-react, react, react-dom, three, vite (+1 more)

### Community 9 - "Application Run Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, package:windows-product, preview, serve, serve:product, test

## Knowledge Gaps
- **12 isolated node(s):** `Four connected colored nodes`, `Second Brain icon`, `Graphify knowledge graph workflow`, `Docker deployment`, `second-brain-data persistent volume` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 77 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@vitejs/plugin-react` connect `Hermes Runtime Configuration` to `Interactive Graph Interface`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **What connects `Four connected colored nodes`, `Second Brain icon`, `Graphify knowledge graph workflow` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Interactive Graph Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.07450980392156863 - nodes in this community are weakly interconnected._
- **Why does `vite` connect `Hermes Runtime Configuration` to `Interactive Graph Interface`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Should `Wiki Asset Indexing` be split into smaller, more focused modules?**
  _Cohesion score 0.10017730496453901 - nodes in this community are weakly interconnected._
- **Should `HTTP API and History` be split into smaller, more focused modules?**
  _Cohesion score 0.10588235294117647 - nodes in this community are weakly interconnected._
- **Should `Hermes Runtime Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.14015151515151514 - nodes in this community are weakly interconnected._