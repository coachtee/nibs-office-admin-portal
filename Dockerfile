FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8088
ENV APP_PORT=8088
ENV DB_PATH=/data/nibs.db
ENV UPLOAD_DIR=/data/uploads
ENV EXPORT_DIR=/data/uploads/exports
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /data /data/uploads /data/uploads/exports
VOLUME ["/data"]
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8088/ || exit 1
USER node
CMD ["node", "server/index.js"]
