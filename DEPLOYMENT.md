# Second Brain Deployment

Production deployment should not copy the Hermes llm-wiki into `public/`.

## Runtime

Run the API/index service on the host that also runs Hermes:

```bash
export HERMES_WIKI_DIR="/path/to/hermes/llm-wiki"
export SECOND_BRAIN_PORT=3030
export SECOND_BRAIN_ADMIN_USER="admin"
export SECOND_BRAIN_ADMIN_PASSWORD="change-this-before-first-run"
npm run build
npm run serve
```

The server:

- scans the llm-wiki directory on startup and serves `GET /api/graph`
- reads node Markdown lazily through `GET /api/wiki/content?id=...`
- watches the wiki directory and emits `GET /api/wiki/events` updates
- proxies `/api/hermes/*` to the local Hermes API server
- protects `/api/*` with an `HttpOnly` session cookie after password login

On first run the server stores a password hash in `data/auth.json` or `SECOND_BRAIN_AUTH_FILE`.
After the file exists, remove `SECOND_BRAIN_ADMIN_PASSWORD` from the process environment and use the in-app password dialog to rotate the password.

If `HERMES_WIKI_DIR` is omitted, it tries common Hermes locations such as `~/.hermes/llm-wiki` and `~/.hermes/wiki`.

## Nginx

Serve the built frontend statically, and proxy API calls to the Node service:

```nginx
server {
  listen 80;
  server_name second-brain.example.com;

  root /opt/second-brain/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3030/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

`proxy_buffering off` keeps graph update events and Hermes streaming responsive.
