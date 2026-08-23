# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /build

RUN npm install --global pnpm@10.12.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY vite.config.server.ts LICENSE ./
COPY scripts/build-server-package.js ./scripts/build-server-package.js
COPY src/server ./src/server
COPY src/shared ./src/shared

ARG DAILY_SERVER_PACKAGE_VERSION
ENV DAILY_SERVER_PACKAGE_VERSION=${DAILY_SERVER_PACKAGE_VERSION}

RUN pnpm build:server:package

FROM node:22-slim AS runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system daily \
  && useradd --system --gid daily --home-dir /var/lib/daily-server --shell /usr/sbin/nologin daily \
  && mkdir -p /var/lib/daily-server \
  && chown daily:daily /var/lib/daily-server

WORKDIR /app

COPY --from=builder /build/dist-server/ ./

RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force \
  && chmod +x /app/index.js \
  && ln -s /app/index.js /usr/local/bin/daily-server

ENV NODE_ENV=production
ENV DAILY_SERVER_DATA_DIR=/var/lib/daily-server

USER daily

ARG DAILY_SERVER_PACKAGE_VERSION
LABEL org.opencontainers.image.title="Daily Sync Server" \
  org.opencontainers.image.description="Self-hosted sync server for Daily — the Daily Sync Protocol in one container, configured from the environment." \
  org.opencontainers.image.source="https://github.com/scheron/Daily" \
  org.opencontainers.image.documentation="https://github.com/scheron/Daily/blob/main/src/server/README.md" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.vendor="Scheron" \
  org.opencontainers.image.version="${DAILY_SERVER_PACKAGE_VERSION}"

ENTRYPOINT ["daily-server"]
CMD ["start"]
