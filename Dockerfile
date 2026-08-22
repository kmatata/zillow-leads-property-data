# Glama (and any MCP client that prefers containers) runs this image with
# APIFY_TOKEN in the environment; the server speaks MCP over stdio.
FROM node:22-alpine

WORKDIR /app/mcp-server

COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --omit=dev

COPY mcp-server/index.js mcp-server/input-schema.json ./

CMD ["node", "index.js"]
