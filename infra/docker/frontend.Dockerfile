# syntax=docker/dockerfile:1.6

# Production image for the Next.js frontend.
# Build context: monorepo root (e.g. `docker build -f infra/docker/frontend.Dockerfile .`)

FROM node:20-alpine AS deps
WORKDIR /repo
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json turbo.json ./
COPY apps/frontend/package.json ./apps/frontend/
RUN npm ci --include-workspace-root --workspace apps/frontend

FROM node:20-alpine AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/frontend/node_modules ./apps/frontend/node_modules
COPY package.json package-lock.json turbo.json ./
COPY apps/frontend ./apps/frontend
RUN npx turbo run build --filter=vivexy-frontend

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/frontend/public ./apps/frontend/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
