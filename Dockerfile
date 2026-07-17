FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN rm -rf .next/standalone/.demo-state \
  .next/standalone/.tokens \
  .next/standalone/.vercel \
  .next/standalone/*.pem \
  .next/standalone/*.key \
  .next/standalone/*credential* \
  .next/standalone/*credentials* \
  .next/standalone/*secret* \
  .next/standalone/bot-maternaly-*.json \
  .next/standalone/bot-somos-muy-perros-*.json

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /data \
  && chown -R nextjs:nodejs /data

COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/db/migrations ./db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/maternaly-sheets-live-write-test.mjs ./scripts/maternaly-sheets-live-write-test.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/maternaly-sheets-sync-group-tabs.mjs ./scripts/maternaly-sheets-sync-group-tabs.mjs

RUN test -s /app/public/maternaly/services/taller-blw.jpeg \
  && test -s /app/public/maternaly/services/charla-informativa-embarazo.jpeg

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
