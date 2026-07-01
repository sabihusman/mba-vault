# syntax=docker/dockerfile:1
# MBA-Vault app image. Multi-stage: build the Next.js app, then ship only the
# standalone server. Code only — documents, the vector index, and the Gemini key
# live on the mounted volume / env, never in the image.

# ---- Builder ----
FROM node:24-slim AS builder
WORKDIR /repo

# Workspace manifests first (better layer caching on dependency changes).
COPY package.json package-lock.json ./
COPY app/package.json ./app/package.json
COPY ingestion/package.json ./ingestion/package.json

# Cross-platform native optional deps (npm/cli#4828): the committed lockfile is
# generated on Windows and omits Linux binaries (e.g. @tailwindcss/oxide), so we
# regenerate it on this Linux builder before installing.
RUN rm -f package-lock.json && npm install --no-audit --no-fund

# App source, then build (produces app/.next/standalone via output: "standalone").
COPY app/ ./app/
RUN npm run build --workspace app

# ---- Runner ----
FROM node:24-slim AS runner
WORKDIR /srv
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Standalone bundle → gives ./app/server.js and traced node_modules.
COPY --from=builder --chown=node:node /repo/app/.next/standalone ./
# Static assets + public/ are not included in the standalone output; copy them in.
COPY --from=builder --chown=node:node /repo/app/.next/static ./app/.next/static
COPY --from=builder --chown=node:node /repo/app/public ./app/public

USER node
EXPOSE 3000
CMD ["node", "app/server.js"]
