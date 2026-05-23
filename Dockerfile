# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# native build deps for better-sqlite3
RUN apk add --no-cache python3 make g++ git

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache python3 make g++ tini tzdata \
  && cp /usr/share/zoneinfo/Asia/Kolkata /etc/localtime \
  && echo "Asia/Kolkata" > /etc/timezone \
  && addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force \
  && apk del python3 make g++

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/*.md ./

RUN mkdir -p /app/data && chown -R app:app /app

USER app

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "server/index.ts"]
