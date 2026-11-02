# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.22.2-alpine3.24

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sync-protocol/package.json packages/sync-protocol/package.json
RUN npm ci --ignore-scripts

COPY packages/sync-protocol packages/sync-protocol
COPY apps/api apps/api
RUN npm run build --workspace @psicodesk/sync-protocol \
  && npm run build --workspace @psicodesk/api

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/sync-protocol/package.json packages/sync-protocol/package.json
RUN npm ci --omit=dev --ignore-scripts \
  --workspace @psicodesk/api \
  --workspace @psicodesk/sync-protocol \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8787
WORKDIR /workspace

COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /workspace/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/sync-protocol/package.json ./packages/sync-protocol/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/packages/sync-protocol/dist ./packages/sync-protocol/dist

USER node
WORKDIR /workspace/apps/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
