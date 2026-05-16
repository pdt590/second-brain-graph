# ---- Stage 1: build frontend ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: production runtime ----
# Production server is pure Node.js — no npm dependencies needed at runtime.
# All frontend deps are bundled into dist/ by Vite in stage 1.
FROM node:20-alpine

ENV NODE_ENV=production
ENV SECOND_BRAIN_HOST=0.0.0.0
ENV SECOND_BRAIN_PORT=3030

WORKDIR /app

# Copy built frontend and server code
COPY --from=builder /app/dist ./dist
COPY server ./server

# Create data directory for auth and chat history
RUN mkdir -p /app/data/chat-history

EXPOSE 3030

CMD ["node", "server/second-brain-server.mjs"]
