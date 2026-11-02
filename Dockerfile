FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY examples ./examples
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}${BASE_PATH}/health" || exit 1
CMD ["node", "src/server.js"]
