# Example (Nordwind demo) image. Like deploy/Dockerfile but compiles with
# tsconfig.example.json (src + example together) and runs the example
# bootstrap. Build from the repository ROOT:
#   docker build -f example/Dockerfile -t mcp-production-kit-example .

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.example.json ./
COPY src ./src
COPY example ./example
RUN pnpm exec tsc -p tsconfig.example.json && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist-example ./dist-example
COPY package.json ./
USER node
EXPOSE 3000
# HOST must be 0.0.0.0 inside the container; set MCP_ALLOWED_HOSTS to your
# public hostname (DNS-rebinding protection validates the Host header).
ENV HOST=0.0.0.0
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist-example/example/src/main.js"]
