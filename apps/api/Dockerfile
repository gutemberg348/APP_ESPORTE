FROM node:22.22-alpine AS runtime
RUN apk add --no-cache openssl glib expat libjpeg-turbo libpng libwebp libexif lcms2
ENV LD_LIBRARY_PATH=/opt/vips/lib

FROM runtime AS build
# The official sharp x64 prebuild requires x86-64-v2. VPS CPU models can lack
# those instructions, so compile the same sharp/libvips versions for baseline CPUs.
# Keep all compilers and development headers out of the runtime stage.
RUN apk add --no-cache build-base python3 pkgconf meson ninja curl xz \
    glib-dev expat-dev libjpeg-turbo-dev libpng-dev libwebp-dev libexif-dev lcms2-dev zlib-dev
RUN curl -fsSL https://github.com/libvips/libvips/releases/download/v8.18.7/vips-8.18.7.tar.xz -o /tmp/vips.tar.xz \
    && printf '%s  %s\n' '5baaead3b0bb20ffdb9e9ff09aa9fda08620923df77b63b436654cb5e0b3bf94' '/tmp/vips.tar.xz' | sha256sum -c - \
    && tar -xJf /tmp/vips.tar.xz -C /tmp \
    && meson setup /tmp/vips-build /tmp/vips-8.18.7 --prefix=/opt/vips --libdir=lib \
       --buildtype=release --auto-features=disabled -Dcplusplus=true -Dmodules=disabled \
       -Djpeg=enabled -Dpng=enabled -Dwebp=enabled -Dexif=enabled -Dlcms=enabled -Dzlib=enabled \
       -Dexamples=false -Ddocs=false -Dcpp-docs=false -Dnsgif=false -Dppm=false -Dradiance=false \
    && meson compile -C /tmp/vips-build --jobs 2 \
    && meson install -C /tmp/vips-build \
    && rm -rf /tmp/vips.tar.xz /tmp/vips-8.18.7 /tmp/vips-build
ENV PKG_CONFIG_PATH=/opt/vips/lib/pkgconfig
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @nacional/api --include-workspace-root
RUN npm_config_jobs=2 npm explore sharp -- npm run build
COPY apps/api apps/api
COPY packages/shared packages/shared
WORKDIR /app/apps/api
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused npx prisma generate
RUN node scripts/check-image-runtime.mjs --require-local-build

FROM runtime
RUN apk add --no-cache libwebpdemux libwebpmux
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /opt/vips/lib /opt/vips/lib
USER node
WORKDIR /app/apps/api
RUN node scripts/check-image-runtime.mjs --require-local-build
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
