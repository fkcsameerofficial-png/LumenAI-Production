FROM node:20-bookworm-slim AS base
WORKDIR /app

# better-sqlite3 needs build tools to compile its native binding
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
