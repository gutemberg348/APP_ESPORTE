FROM node:22.22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @nacional/mobile --include-workspace-root
COPY apps/mobile apps/mobile
COPY packages/shared packages/shared

ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_CLUB=esporte
ARG EXPO_PUBLIC_TENANT_SLUG=nacional-patos
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} \
    EXPO_PUBLIC_API_HOST_MODE=configured \
    EXPO_PUBLIC_CLUB=${EXPO_PUBLIC_CLUB} \
    EXPO_PUBLIC_TENANT_SLUG=${EXPO_PUBLIC_TENANT_SLUG} \
    EXPO_PUBLIC_DEMO_MODE=false \
    EXPO_NO_TELEMETRY=1 \
    CI=1
WORKDIR /app/apps/mobile
RUN npm run export:web

FROM nginx:stable-alpine
COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
