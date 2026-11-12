# syntax=docker/dockerfile:1

FROM oven/bun:1.3.13-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev", "--", "--hostname", "0.0.0.0"]

# Next 16.4.5's page-data loader cannot execute its CommonJS runtime under Bun 1.3.13.
# Bun still installs the lockfile and runs dev; Node executes the production build.
FROM node:22-alpine AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_SOLID_ISSUER=http://localhost:3001/
ARG NEXT_PUBLIC_SOLID_CLIENT_ID=http://localhost:3000/id
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_SOLID_ISSUER=${NEXT_PUBLIC_SOLID_ISSUER} \
    NEXT_PUBLIC_SOLID_CLIENT_ID=${NEXT_PUBLIC_SOLID_CLIENT_ID} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN node node_modules/next/dist/bin/next build

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Next 16 emits .next/standalone/server.js; static and public assets need explicit copies.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
