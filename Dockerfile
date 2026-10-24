FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# One-shot schema sync: needs dev deps (drizzle-kit) and the source.
FROM build AS migrate
CMD ["npx", "drizzle-kit", "push", "--force"]

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
RUN mkdir -p uploads logs && chown -R node:node /app
USER node
EXPOSE 4080
CMD ["node", "dist/qmsangular/server/server.mjs"]
