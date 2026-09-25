# syntax=docker/dockerfile:1

# EventHub production image — multi-stage build.
#
# Base image: Debian slim (bookworm), not Alpine. Alpine's musl libc has a
# history of compatibility friction with Prisma's native/engine binaries and
# with argon2's prebuilt bindings; Debian slim is a few tens of MB larger but
# removes an entire class of "works on my machine, breaks in the container"
# bugs. Reliability over image-size optimization, per this phase's brief.
#
# No --platform pin: this Dockerfile is built natively wherever it runs —
# arm64 on an Apple Silicon dev machine, amd64 on GitHub Actions runners and
# on Railway's build infrastructure. `npm ci` and `prisma generate` resolve
# native/engine binaries for whatever architecture is actually building the
# image, so each build is internally consistent. The canonical production
# image is the one built by CI/Railway (amd64); a locally built arm64 image
# is only ever run locally, for verifying this Dockerfile's logic.
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Stage 1: deps — install the full dependency tree (including devDependencies,
# needed to compile TypeScript) and generate the Prisma Client. Isolated as
# its own stage so it's cached independently of application source changes.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# npm ci is reproducible from the committed lockfile — never `npm install`
# in a build. The postinstall hook (`prisma generate`) runs here, against
# the schema copied above; it needs no live database connection.
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: build — compile the NestJS application to dist/. Reuses deps'
# full node_modules (including devDependencies) to run the Nest compiler.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: prod-deps — a clean, separate install of ONLY production
# dependencies, built from scratch rather than by pruning the deps stage.
#
# Pruning was tried first and didn't work: `@prisma/client` declares
# `prisma` as an *optional peer* dependency, and npm auto-installs
# resolvable optional peers regardless of section placement — so even with
# `prisma` listed under devDependencies, `npm prune --omit=dev` kept it
# (verified directly: the pruned image was still ~916MB). In Prisma 7,
# `prisma` transitively pulls in Prisma Studio's UI toolchain (React, a
# diagram layout library, a functional-programming runtime, etc.) — over
# 150MB with no purpose in a headless API container.
#
# `--omit=optional` is what actually excludes it. `--ignore-scripts` skips
# the `postinstall` (`prisma generate`) hook, which would otherwise fail
# here anyway (no `prisma` CLI present to run it) — the already-generated
# client is copied in from the deps stage below instead.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# Overwrite the (ungenerated) @prisma/client package with the one actually
# generated against EventHub's schema in the deps stage.
COPY --from=deps /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

# ---------------------------------------------------------------------------
# Stage 4: runtime — minimal final image. Compiled JS, production-only
# node_modules, and package.json. No Prisma CLI, no source maps, no tests,
# no lint config, no .git, no .env. See the README's "Database Migration
# Strategy" section for how/when migrations actually run, since this image
# does not contain the tooling to run them.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root runtime user. Debian's base images don't ship a generic
# unprivileged app user the way some Node images do, so one is created
# explicitly with a fixed uid/gid (useful for volume permissions in more
# elaborate setups, though EventHub itself is stateless).
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --no-create-home nestjs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER nestjs

EXPOSE 3000

# Dependency-free healthcheck: Debian slim has no curl installed, and
# installing it just for this would grow the image for no runtime benefit.
# Node's built-in global fetch (stable since Node 18) is already present.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
