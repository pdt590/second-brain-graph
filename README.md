# Second Brain — LLM-Wiki Knowledge Graph

Interactive 3D/2D knowledge graph for exploring an LLM-powered wiki knowledge base.

## Features

- **Knowledge graph visualization** — force-directed layout where nodes represent wiki concepts and edges represent relationships (wikilinks, markdown links, explicit relations)
- **3D & 2D modes** — switch between Three.js/WebGL 3D view and canvas 2D view at runtime
- **AI-powered chat** — ask questions about any node; responses are streamed from the Hermes Agent backend with full node context
- **Real-time sync** — Server-Sent Events push graph updates when wiki files change, no page refresh needed
- **Node detail panel** — view summary, source markdown, media attachments, and navigate to neighbor nodes
- **Category filter & keyword search** — quickly narrow the graph to relevant concepts
- **Chat history per node** — conversations are persisted locally and can be saved back to the wiki as insight documents
- **Dark/light theme** — sci-fi aesthetic with full responsive design (desktop + mobile)

## Architecture

```
┌─────────────┐     ┌───────────────┐     ┌──────────────────┐
│  Frontend   │────▶│  Node Server  │────▶│  Wiki Directory  │
│  (Vite/     │◀────│  (HTTP API +  │◀────│  (Markdown/JSON  │
│   React)    │     │   SSE stream) │     │   files, watched)│
│             │     │               │     └──────────────────┘
│  3D: Three.js    │               │
│  2D: Canvas      │               │     ┌──────────────────┐
│                  │     ┌────────▶│────▶│  Hermes Agent    │
└─────────────┘     │     │         │     │  (External LLM)  │
                    │     │         │     └──────────────────┘
                    │     │         │
                    │     │         │     ┌──────────────────┐
                    │     │         │◀────│  Chat History    │
                    │     │         │     │  (JSON files)    │
                    └─────┴─────────┘     └──────────────────┘
```

The entire frontend is a single-file React app (~2100 lines) with no external router or state management library. The backend is a lightweight Node.js HTTP server using only built-in modules (no Express). The production server serves static files, proxies to Hermes, and watches the wiki directory for changes.

## Quick Start

### Option 1: Development Environment

Requires **Node.js 18+** and a running **Hermes Agent** instance.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional, auto-detection works in most cases)
cp .env.example .env
# Edit .env — set HERMES_WIKI_DIR if your wiki is not at the default location

# 3. Start dev server with hot reload + embedded API
npm run dev

# 4. Open http://localhost:5173
```

The dev server runs Vite with an embedded HTTP API plugin — no separate backend process is needed. All API routes (`/api/graph`, `/api/chat/*`, `/api/wiki/*`, `/api/hermes/*`) are served from the same Vite process.

### Option 2: Docker (Recommended for Production)

Requires **Docker Engine** and **Docker Compose**. No Node.js or nginx setup on the host.

```bash
# 1. Copy and configure environment
cp docker.env.example .env
# Edit .env — at minimum set HERMES_WIKI_DIR and API_SERVER_KEY

# 2. Build and start
docker compose up -d --build

# 3. Open http://localhost:3030 (or the port set in .env)
```

**Updating:**

```bash
git pull && docker compose up -d --build
```

Data (`auth.json`, chat history) is stored in a named Docker volume and persists across container rebuilds.

### Option 3: Nginx + Node.js (Traditional Production)

Requires **Node.js 18+**, **npm**, and **nginx** on the target host. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide.

```bash
# 1. Install dependencies and build frontend
npm install
npm run build

# 2. Deploy (copies files, writes nginx config, starts the server)
bash scripts/deploy-host.sh
```

The script:
- Copies `dist/` and `server/` to the app directory
- Writes and reloads the nginx configuration
- Starts the Node.js API on `127.0.0.1:3030`
- The Node server serves static files as a fallback; nginx serves them in production for better performance

### Option 4: Standalone Node Server

For quick testing or environments without nginx:

```bash
npm install
npm run build
SECOND_BRAIN_HOST=0.0.0.0 npm run serve
```

The server serves both the static frontend and all API routes from a single process on port 3030.

### Option 5: Product Mode / Bundled Runtime

Product mode is the foundation for a standalone offline installer that bundles Hermes and a private `llm-wiki` directory. It does not read or auto-detect the user's existing `~/.hermes` setup.

```bash
npm run build
npm run serve:product
```

See [PRODUCT_MODE.md](PRODUCT_MODE.md) for the bundled runtime layout and installer contract.

To create the Windows offline product package after adding local release-only Node and Hermes runtime files under the gitignored `runtime/` directory:

```bash
npm run package:windows-product
```

Upload the generated package from `release/` as a GitHub Release artifact; do not commit bundled runtime binaries to the source repository.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HERMES_WIKI_DIR` | `~/.hermes/llm-wiki` | Wiki directory (Markdown/JSON files) |
| `HERMES_API_TARGET` | auto-detect | Hermes API base URL |
| `API_SERVER_KEY` | — | Hermes API auth key (Bearer token) |
| `SECOND_BRAIN_PORT` | `3030` | Production server listen port |
| `SECOND_BRAIN_HOST` | `127.0.0.1` | Production server listen address |
| `SECOND_BRAIN_ADMIN_USER` | `admin` | Admin username |
| `SECOND_BRAIN_ADMIN_PASSWORD` | auto-generate | Admin password (auto-generated if not set) |
| `SECOND_BRAIN_AUTH_FILE` | `<project>/data/auth.json` | Credentials storage path |

## Data & Security

- The wiki directory is **read-only** — the app only reads wiki files to build the graph and show node content.
- The app writes only to its own `data/` directory: `auth.json` (credentials) and `data/chat-history/` (per-node conversation logs).
- Authentication uses HMAC-SHA256 signed cookies with scrypt password hashing.
- The "保存到 Wiki" action is the only flow that can create new wiki files, and it only runs when the user explicitly clicks that button.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build locally |
| `npm run serve` | Run standalone Node.js production server |

## License

MIT
