# ---- Build stage: every dependency, then compile the app ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# The repo also ships an Electron desktop build. Its ~100 MB binary is
# irrelevant to the server image and only slows the build down.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
# scripts/build-verified.sh bounds the build at three minutes by default,
# which a modest server can exceed.
ENV SITES_BUILD_TIMEOUT=10m
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The scripts are exec'd by name, so they need the bit set. It is fixed in
# git too, but this repo is developed on Windows, where a later commit can
# silently drop it again and break every deployment.
RUN chmod +x scripts/*.sh
RUN npm run build

# ---- Runtime stage: production dependencies only ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# server.mjs binds to 127.0.0.1 by default, which nothing outside the
# container can reach — the reverse proxy in front of it included.
ENV HOST=0.0.0.0
ENV PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# dist/ is what the server serves; drizzle/ holds the migrations it applies
# on start, before it accepts traffic.
COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle
COPY server.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]
