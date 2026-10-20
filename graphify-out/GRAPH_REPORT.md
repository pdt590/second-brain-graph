# Graph Report - second-brain-graph  (2026-10-20)

## Corpus Check
- 47 files · ~215,239 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: (none) 5, .cmd 4, .example 3)

## Summary
- 502 nodes · 933 edges · 27 communities (19 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c5f71bd9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Interactive Graph Interface
- Wiki Asset Indexing
- second-brain-server.mjs
- Hermes Runtime Configuration
- Windows Product Packaging
- Product Deployment Documentation
- vendor.js
- WSL Installation Workflow
- Frontend Package Dependencies
- Web Interface Guidelines
- Second Brain Icon
- Windows Archive Builder
- Host Deployment Script
- Graphify Exploration Workflow
- build-seo.mjs
- Hermes Web Creator
- app.js
- article.js
- privacy.js
- License information
- phan-duy-thang/content.en.md
- phan-duy-thang/content.vi.md
- page.js
- tai-lieu-iot/content.en.md
- tai-lieu-iot/content.vi.md

## God Nodes (most connected - your core abstractions)
1. `Ze()` - 22 edges
2. `App()` - 22 edges
3. `parseInline()` - 14 edges
4. `install-wsl.sh script` - 13 edges
5. `ingestMarkdown()` - 13 edges
6. `createApiRoutes()` - 12 edges
7. `_e()` - 11 edges
8. `link()` - 11 edges
9. `main()` - 11 edges
10. `sendJson()` - 11 edges

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

## Communities (27 total, 8 thin omitted)

### Community 0 - "Interactive Graph Interface"
Cohesion: 0.07
Nodes (50): 3d-force-graph, force-graph, lucide-react, react, react-dom, three, App(), BrainNodeLogo() (+42 more)

### Community 1 - "Wiki Asset Indexing"
Cohesion: 0.10
Nodes (47): buildGraphFromWiki(), cleanAssetReference(), createAssetDescriptor(), createAssetSummary(), createDocumentCache(), createFileSignature(), createGraphSignature(), createPublicAsset() (+39 more)

### Community 2 - "second-brain-server.mjs"
Cohesion: 0.05
Nodes (39): fs, {gzip}, http, path, types, source, target, createApiRoutes() (+31 more)

### Community 3 - "Hermes Runtime Configuration"
Cohesion: 0.15
Nodes (27): vite, @vitejs/plugin-react, createEmbeddedHermesManager(), createHermesEnv(), parseArgs(), resolveHermesArgs(), resolveHermesCommand(), shouldUseShell() (+19 more)

### Community 4 - "Windows Product Packaging"
Cohesion: 0.15
Nodes (23): allowMissingRuntime, copyApp(), copyConfig(), copyDocs(), copyFilter(), copyRuntime(), copyWindowsLaunchers(), createZip() (+15 more)

### Community 5 - "Product Deployment Documentation"
Cohesion: 0.11
Nodes (18): Docker deployment, Nginx and Node production deployment, second-brain-data persistent volume, Second Brain Compose service, Read-only /wiki bind mount, Chinese-language Second Brain HTML entrypoint, Bundled Windows product launcher, Offline Python dependency wheelhouse (+10 more)

### Community 6 - "vendor.js"
Cohesion: 0.05
Nodes (73): a(), n(), ae(), be(), blockquote(), blockTokens(), br(), checkbox() (+65 more)

### Community 7 - "WSL Installation Workflow"
Cohesion: 0.33
Nodes (13): detect_api_key(), detect_hermes_target(), detect_node(), detect_wiki_dir(), fail(), info(), need_command(), ok() (+5 more)

### Community 8 - "Frontend Package Dependencies"
Cohesion: 0.11
Nodes (17): dependencies, 3d-force-graph, force-graph, lucide-react, react, react-dom, three, vite (+9 more)

### Community 9 - "Web Interface Guidelines"
Cohesion: 0.40
Nodes (4): Guidelines Source, How It Works, Usage, Web Interface Guidelines

### Community 15 - "build-seo.mjs"
Cohesion: 0.09
Nodes (20): dependencies, dompurify, marked, name, private, scripts, check, dev (+12 more)

### Community 16 - "Hermes Web Creator"
Cohesion: 0.09
Nodes (19): Hermes web design system, Motion and interaction, Thư mục hỗ trợ và hình ảnh, Tokens, Type and layout, Current website structure, Members, Paths and runtime (+11 more)

### Community 17 - "app.js"
Cohesion: 0.15
Nodes (17): activate(), dialog, movePartners(), navLinks, observer, partnerPause, partnerRegion, partnerStrip (+9 more)

### Community 18 - "article.js"
Cohesion: 0.23
Nodes (10): articleBody, articleStatus, compactToc, loadMarkdown(), renderContents(), renderLanguage(), renderTheme(), setActiveSection() (+2 more)

### Community 19 - "privacy.js"
Cohesion: 0.31
Nodes (7): compactToc, renderContents(), renderLanguage(), renderTheme(), setActiveSection(), toc, tocDisclosure

### Community 20 - "License information"
Cohesion: 0.25
Nodes (7): Contribution License Agreement, DOMPurify, License information, Markdown, Marked, Marked, Third-party licenses

### Community 21 - "phan-duy-thang/content.en.md"
Cohesion: 0.40
Nodes (4): Applied AI, Education, Experience, Training & Teaching

### Community 22 - "phan-duy-thang/content.vi.md"
Cohesion: 0.40
Nodes (4): AI ứng dụng, Học vấn, Kinh nghiệm, Đào tạo & Giảng dạy

### Community 23 - "page.js"
Cohesion: 0.60
Nodes (3): renderLanguage(), renderTheme(), renderView()

## Knowledge Gaps
- **13 isolated node(s):** `dompurify`, `Four connected colored nodes`, `Second Brain icon`, `Graphify knowledge graph workflow`, `Docker deployment` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 176 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@vitejs/plugin-react` connect `Hermes Runtime Configuration` to `Interactive Graph Interface`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Ze()` (e.g. with `Se()` and `ue()`) actually correct?**
  _`Ze()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `dompurify`, `Four connected colored nodes`, `Second Brain icon` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Interactive Graph Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.06957047791893527 - nodes in this community are weakly interconnected._
- **Why does `vite` connect `Hermes Runtime Configuration` to `Interactive Graph Interface`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `Wiki Asset Indexing` be split into smaller, more focused modules?**
  _Cohesion score 0.10017730496453901 - nodes in this community are weakly interconnected._
- **Should `second-brain-server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.051759834368530024 - nodes in this community are weakly interconnected._