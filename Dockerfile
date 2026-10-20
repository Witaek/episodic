# syntax=docker/dockerfile:1

# ---- Dependencies (native modules are compiled for the target architecture) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----
FROM node:22-bookworm-slim AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Episodic" \
	org.opencontainers.image.description="Self-hosted tracker for TV shows, anime and movies" \
	org.opencontainers.image.source="https://github.com/Witaek/episodic" \
	org.opencontainers.image.version="$VERSION" \
	org.opencontainers.image.revision="$REVISION"

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	DATA_DIR=/data \
	BODY_SIZE_LIMIT=50M

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY drizzle ./drizzle
COPY docker/entrypoint.sh docker/healthcheck.js ./

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "/app/healthcheck.js"]

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "build"]
