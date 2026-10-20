# Second Brain Graph Deployment

Production deployments should follow one shape on every host:

- build the frontend locally or on the target host
- keep the Hermes llm-wiki as an external read-only data source
- run the Node API on `127.0.0.1:3030`
- let nginx serve `dist/` and proxy `/api/` to Node
- store app-owned data under the app directory, not inside the wiki

The only host-specific values should be paths, user names, and optional nginx `server_name`.

## Standard Layout

Recommended defaults:

```text
app directory      ~/second-brain-graph-app
static directory   /var/www/second-brain/dist
wiki directory     ~/wiki
node api           127.0.0.1:3030
nginx site         /etc/nginx/sites-available/second-brain
```

For root-managed hosts, such as the current `hsxb` deployment, the same layout can be represented with:

```text
app directory      /opt/second-brain
static directory   /opt/second-brain/dist
wiki directory     /root/wiki
node api           127.0.0.1:3030
```

## Data Safety

The app server is read-only with respect to `HERMES_WIKI_DIR`.

It reads wiki files to build the graph and to show node source content. It writes only app-owned state:

```text
<app directory>/data/auth.json
<app directory>/data/chat-history/
```

The only flow intended to create a new wiki file is the user-confirmed “Save to Wiki” action, which asks Hermes to use its own tools. Ordinary node chat is prompted as read-only and should not write to llm-wiki.

## Environment

Minimal variables:

```bash
export HERMES_WIKI_DIR="$HOME/wiki"
export SECOND_BRAIN_APP_DIR="$HOME/second-brain-graph-app"
export SECOND_BRAIN_STATIC_DIR="/var/www/second-brain/dist"
export SECOND_BRAIN_PORT=3030
export SECOND_BRAIN_HOST=127.0.0.1
```

Optional variables:

```bash
export SECOND_BRAIN_NODE_BIN="/usr/bin/node"
export SECOND_BRAIN_SERVER_NAME="_"
export SECOND_BRAIN_ADMIN_USER="admin"
export SECOND_BRAIN_ADMIN_PASSWORD="change-this-before-first-run"
export SECOND_BRAIN_AUTH_FILE="$SECOND_BRAIN_APP_DIR/data/auth.json"
```

Hermes API key is normally read from `~/.hermes/.env`:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=change-me-local-dev
```

If Hermes is not detectable from logs or the standard ports, set:

```bash
export HERMES_API_TARGET="http://127.0.0.1:8643"
```

## First Deploy

On the target host, install Node.js and nginx, and make sure Hermes and the wiki directory exist.

From the project root:

```bash
npm install
npm run build
```

Copy or pull the repository onto the target host, then run:

```bash
bash scripts/deploy-host.sh
```

The script:

- copies `dist/` and `server/` to `SECOND_BRAIN_APP_DIR`
- writes `<app directory>/start.sh`
- syncs static files to `SECOND_BRAIN_STATIC_DIR`
- writes nginx config
- reloads nginx
- restarts the Node API

It is safe to run the script from a checkout that is already the app directory. It also handles hosts where `SECOND_BRAIN_STATIC_DIR` is the same as `<app directory>/dist`, such as `hsxb`.

On first run, if `SECOND_BRAIN_ADMIN_PASSWORD` is not set, the server prints a generated password to the log:

```bash
tail -n 50 "$SECOND_BRAIN_APP_DIR/logs/server.log"
```

After login, rotate the password in the app user menu.

## Update Deploy

Use the same command on every host:

```bash
git pull
npm install
npm run build
bash scripts/deploy-host.sh
```

If you build locally and upload an archive instead, keep the final remote step the same: extract the project and run `bash scripts/deploy-host.sh` from the project root.

## Current Hosts

209:

```bash
export HERMES_WIKI_DIR="/home/jeffrey/wiki"
export SECOND_BRAIN_APP_DIR="/home/jeffrey/second-brain-graph-app"
export SECOND_BRAIN_STATIC_DIR="/var/www/second-brain/dist"
export SECOND_BRAIN_NODE_BIN="/usr/bin/node"
bash scripts/deploy-host.sh
```

hsxb:

```bash
export HERMES_WIKI_DIR="/root/wiki"
export SECOND_BRAIN_APP_DIR="/opt/second-brain"
export SECOND_BRAIN_STATIC_DIR="/opt/second-brain/dist"
export SECOND_BRAIN_NODE_BIN="/root/.hermes/node/bin/node"
bash scripts/deploy-host.sh
```

## Nginx Shape

The generated nginx config is intentionally simple:

```nginx
server {
  listen 80;
  server_name _;

  root /var/www/second-brain/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3030/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

`proxy_buffering off` keeps graph update events and Hermes streaming responsive.

## Verification

After deployment:

```bash
curl -i http://127.0.0.1/
curl -i http://127.0.0.1/api/graph
tail -n 50 "$SECOND_BRAIN_APP_DIR/logs/server.log"
```

`/api/graph` should return `401` without login. That is expected.

## Docker Deployment

Docker provides the fastest path from zero to running. No Node.js or nginx setup on the host is required — only Docker Engine and Docker Compose.

### Quick Start

```bash
# 1. Copy and fill in environment variables
cp docker.env.example .env
# Edit .env — at minimum set HERMES_WIKI_DIR and API_SERVER_KEY

# 2. Build and start
docker compose up -d --build

# 3. Check logs
docker compose logs -f second-brain
```

The app will be available at `http://localhost:3030` (or the port set in `.env`).

### Volume Layout

| Container Path | Purpose | Persistence |
|---|---|---|
| `/wiki` | Wiki knowledge base (read-only) | Mount the host directory using HERMES_WIKI_DIR in .env |
| `/app/data` | `auth.json` + chat history | Named volume `second-brain-data`, preserved when the container is recreated |

### Connecting to Hermes

**Hermes on the same host:**

```bash
# Option A: Set the address explicitly
HERMES_API_TARGET=http://host.docker.internal:8643

# Option B: Mount Hermes .env for automatic key detection
# Uncomment the volume line in docker-compose.yml:
# - "${HOME}/.hermes/.env:/root/.hermes/.env:ro"
```

**Hermes in another Docker container on the same network:**

```yaml
# Add to docker-compose.yml under second-brain:
networks:
  - hermes-net

# And at the bottom:
networks:
  hermes-net:
    external: true

# Then set:
HERMES_API_TARGET=http://hermes-container:8643
```

### Behind Nginx (Optional)

If you need TLS or want to run alongside other services, put nginx in front:

```nginx
server {
  listen 443 ssl;
  server_name your-domain.com;

  ssl_certificate     /etc/ssl/certs/second-brain.pem;
  ssl_certificate_key /etc/ssl/private/second-brain.key;

  location / {
    proxy_pass http://127.0.0.1:3030;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }
}
```

### Update Deploy

```bash
git pull
docker compose up -d --build
```

Docker Compose detects the image change, rebuilds, and restarts with zero manual steps. The `second-brain-data` volume preserves all auth and chat history.

### Troubleshooting

```bash
# View live logs
docker compose logs -f second-brain

# Enter the container shell
docker compose exec second-brain sh

# Verify wiki directory is mounted
docker compose exec second-brain ls /wiki

# Reset all data (destroys auth + chat history)
docker compose down -v
```
