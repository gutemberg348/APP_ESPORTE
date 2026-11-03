FROM node:22.22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @nacional/api --include-workspace-root
COPY apps/api apps/api
COPY packages/shared packages/shared
WORKDIR /app/apps/api
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused npx prisma generate

FROM node:22.22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
