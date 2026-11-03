FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY migrations ./migrations
RUN npx vite build && npx esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/index.js && npm prune --omit=dev

FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
