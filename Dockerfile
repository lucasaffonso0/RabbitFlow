# ── build: frontend (Vite) + servidor empacotado (esbuild) ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
COPY web web
RUN npm run build

# ── runtime: só o necessário para servir ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4100 \
    DATA_DIR=/data \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
# banco SQLite (usuários, sessões, layout): único lugar gravável do container
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:4100/healthz || exit 1
CMD ["node", "server/dist/index.js"]
