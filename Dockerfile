# One production image for web, worker and migrations (the command picks the role).
# Build: docker build -t seo-platform .   (docker-compose.prod.yml does this for you)

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_HOME=/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1
# openssl: Prisma's migration engine. pnpm is pinned by package.json "packageManager".
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.34.5 --activate && chmod -R a+rX /corepack
WORKDIR /app

# --- dependencies (cached until a manifest or the lockfile changes) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY fixtures/package.json fixtures/
COPY packages/crawler/package.json packages/crawler/
COPY packages/db/package.json packages/db/
COPY packages/fixes/package.json packages/fixes/
COPY packages/integrations/package.json packages/integrations/
COPY packages/keywords/package.json packages/keywords/
COPY packages/llm/package.json packages/llm/
COPY packages/rules/package.json packages/rules/
COPY packages/scoring/package.json packages/scoring/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- build ---
FROM deps AS build
COPY . .
RUN pnpm db:generate
# Build-time placeholders only: modules that open DB/Redis clients are imported while Next
# collects page data. Real values come from .env.production at runtime.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    REDIS_URL=redis://localhost:6379 \
    AUTH_SECRET=build-only \
    pnpm --filter @seo/web build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
# Chromium + its system libraries: audits render pages, the web app exports PDFs.
RUN pnpm --filter @seo/crawler exec playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /ms-playwright
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@seo/web", "start"]
