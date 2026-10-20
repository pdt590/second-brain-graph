# Windows One-Click Installation

To share the application with a Windows user:

1. Package the project as a ZIP archive and send it to them.
2. Extract the archive on Windows.
3. Double-click `install-second-brain-windows.bat`.
4. After installation, the browser opens:

```text
http://localhost:3030
```

Default login credentials:

```text
Username：admin
Password：123456
```

If `http://localhost:3030` does not open in the Windows browser, use the second address printed at the end of the installation, typically:

```text
http://172.xx.xx.xx:3030
```

This is the local WSL address. In some Windows/WSL environments it is more reliable than `localhost`.

## Prerequisites

The Windows computer must already have:

- WSL
- Hermes Agent
- A configured Hermes `llm-wiki` or an existing wiki directory
- Node.js 18+ and npm in WSL, or the Node runtime bundled with Hermes at `~/.hermes/node/bin`

## What the installer does

- Copies the project to `~/second-brain-graph-app` in WSL
- Automatically finds the wiki directory:
  - `$HERMES_WIKI_DIR`
  - `~/.hermes/llm-wiki`
  - `~/wiki`
  - `~/llm-wiki`
- Reads `API_SERVER_KEY` from `~/.hermes/.env`
- Automatically detects the Hermes API:
  - `http://127.0.0.1:8643`
  - `http://127.0.0.1:8642`
- Installs npm dependencies
- Builds the frontend
- Starts Second Brain Graph in the background

## Common commands

In WSL:

```bash
bash ~/second-brain-graph-app/status-second-brain.sh
bash ~/second-brain-graph-app/stop-second-brain.sh
bash ~/second-brain-graph-app/start-second-brain.sh
bash ~/second-brain-graph-app/reset-admin-password.sh 123456
```

Configuration file:

```bash
~/second-brain-graph-app/.env
```

If the wiki path is not detected automatically, update this setting in `.env`:

```bash
HERMES_WIKI_DIR=/path/to/wiki
```

Then restart:

```bash
bash ~/second-brain-graph-app/stop-second-brain.sh
bash ~/second-brain-graph-app/start-second-brain.sh
```
