FROM debian:bookworm-slim AS ffmpeg-builder

ARG FFMPEG_VERSION=8.1.2
ARG FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates curl nasm xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --show-error --location --proto '=https' --tlsv1.2 \
      "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
      --output ffmpeg.tar.xz \
  && echo "${FFMPEG_SHA256}  ffmpeg.tar.xz" | sha256sum --check --strict \
  && tar --extract --file ffmpeg.tar.xz

WORKDIR /src/ffmpeg-${FFMPEG_VERSION}
# 외부 코덱 자동 감지와 GPL/nonfree 옵션을 끈 LGPL 전용 빌드입니다.
RUN ./configure \
      --prefix=/opt/ffmpeg \
      --disable-autodetect \
      --disable-debug \
      --disable-doc \
      --disable-ffplay \
      --disable-ffprobe \
      --disable-gpl \
      --disable-network \
      --disable-nonfree \
      --disable-shared \
      --enable-ffmpeg \
      --enable-static \
  && make -j"$(nproc)" \
  && make install \
  && install -D -m 0644 COPYING.LGPLv2.1 /opt/ffmpeg/share/licenses/ffmpeg/COPYING.LGPLv2.1 \
  && /opt/ffmpeg/bin/ffmpeg -version | grep --fixed-strings -- '--disable-gpl'

FROM node:22.14-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm run test \
  && npm run license:check

FROM node:22.14-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV REQUIRE_LGPL_FFMPEG=true

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-builder /opt/ffmpeg/share/licenses/ffmpeg /usr/share/licenses/ffmpeg
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=build --chown=nextjs:nodejs /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
