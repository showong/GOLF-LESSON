# 제3자 소프트웨어 고지 (Third-Party Notices)

골프 레슨 튜더는 아래 오픈소스 소프트웨어와 모델을 사용합니다. 각 구성 요소의 저작권은 해당 저작권자에게
있으며 각 라이선스 조건을 따릅니다. 라이선스 전문은 각 패키지의 `LICENSE` 파일(`node_modules/<패키지>/`)과
아래 출처에서 확인할 수 있습니다.

## 별도 확인이 필요한 구성 요소

### FFmpeg (ffmpeg-static) — GPL-3.0-or-later

- 서버(Worker)에서 영상 메타데이터 확인, 움직임 분석, 키 프레임 추출에 사용합니다.
- npm 패키지 `ffmpeg-static`이 설치하는 FFmpeg 정적 빌드(Linux x64: FFmpeg 7.0.2, johnvansickle.com 빌드)는
  `--enable-gpl --enable-version3` 구성이며 libx264·libx265를 포함합니다. `--enable-nonfree`는 포함하지 않습니다.
- 출처: https://ffmpeg.org/ · https://github.com/eugeneware/ffmpeg-static · 빌드 소스: https://johnvansickle.com/ffmpeg/
- 이 바이너리는 운영자 서버 안에서만 실행되며 이용자에게 배포되지 않습니다. 서버 이미지나 네이티브 앱으로
  FFmpeg를 제3자에게 배포하게 되면 GPL 소스 제공 의무를 이행하거나 LGPL 전용 빌드로 바꿔야 합니다.
- FFmpeg 빌드 구성 확인: `node_modules/ffmpeg-static/ffmpeg -buildconf`

### MediaPipe Tasks Vision과 포즈 모델 — Apache-2.0

- 이용자 브라우저에서 관절 위치를 추적합니다. 런타임(WASM)은 jsDelivr에서, 모델은 Google 저장소에서 내려받습니다.
- 런타임: `@mediapipe/tasks-vision` — https://github.com/google-ai-edge/mediapipe (Apache-2.0)
- 모델: `pose_landmarker_lite.task` (BlazePose GHUM 3D Lite) — Apache-2.0
  - https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
  - 모델 카드: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf

### libvips (@img/sharp-libvips-*) — LGPL-3.0-or-later

- Next.js 이미지 최적화(sharp)가 동적으로 연결해 사용하는 라이브러리입니다. 수정하지 않은 원본을 사용합니다.
- 출처: https://github.com/lovell/sharp-libvips · https://github.com/libvips/libvips

### Can I use 데이터 (caniuse-lite) — CC-BY-4.0

- 빌드 시 브라우저 호환성 판단에 사용합니다. 데이터 출처: https://caniuse.com (Alexis Deveria)

## 외부 서비스

아래 서비스는 소프트웨어를 배포받지 않고 API로 이용하며, 각 서비스 약관을 따릅니다.

- Google Gemini API — https://ai.google.dev/gemini-api/terms
- YouTube Data API (기본 비활성화) — https://developers.google.com/youtube/terms/api-services-terms-of-service

## 운영 의존성 전체 목록

`npm run notices`로 생성 (Linux x64 설치 기준, 운영 의존성 129개).

| 라이선스 | 패키지 수 |
|---|---|
| MIT | 69 |
| Apache-2.0 | 37 |
| BSD-3-Clause | 12 |
| ISC | 5 |
| LGPL-3.0-or-later | 2 |
| CC-BY-4.0 | 1 |
| GPL-3.0-or-later | 1 |
| BSD | 1 |
| 0BSD | 1 |

| 패키지 | 버전 | 라이선스 | 출처 |
|---|---|---|---|
| @aws-sdk/checksums | 3.1000.18 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/checksums |
| @aws-sdk/client-s3 | 3.1088.0 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3 |
| @aws-sdk/core | 3.975.3 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/core |
| @aws-sdk/credential-provider-env | 3.972.59 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-env |
| @aws-sdk/credential-provider-http | 3.972.61 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-http |
| @aws-sdk/credential-provider-ini | 3.973.3 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-ini |
| @aws-sdk/credential-provider-login | 3.972.65 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-login |
| @aws-sdk/credential-provider-node | 3.972.69 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-node |
| @aws-sdk/credential-provider-process | 3.972.59 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-process |
| @aws-sdk/credential-provider-sso | 3.973.3 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-sso |
| @aws-sdk/credential-provider-web-identity | 3.972.65 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/credential-provider-web-identity |
| @aws-sdk/middleware-sdk-s3 | 3.972.64 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/middleware-sdk-s3 |
| @aws-sdk/nested-clients | 3.997.33 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages/nested-clients |
| @aws-sdk/s3-request-presigner | 3.1088.0 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner |
| @aws-sdk/signature-v4-multi-region | 3.996.41 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages/signature-v4-multi-region |
| @aws-sdk/types | 3.974.2 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3/tree/main/packages-internal/types |
| @derhuerst/http-basic | 8.2.4 | MIT | https://github.com/derhuerst/http-basic |
| @electric-sql/pglite | 0.5.4 | Apache-2.0 | https://pglite.dev |
| @emnapi/runtime | 1.10.0 | MIT | https://github.com/toyobayashi/emnapi#readme |
| @google/genai | 2.12.0 | Apache-2.0 | https://github.com/googleapis/js-genai#readme |
| @img/colour | 1.1.0 | MIT | https://github.com/lovell/colour |
| @img/sharp-libvips-linux-x64 | 1.2.4 | LGPL-3.0-or-later | https://sharp.pixelplumbing.com |
| @img/sharp-libvips-linuxmusl-x64 | 1.2.4 | LGPL-3.0-or-later | https://sharp.pixelplumbing.com |
| @img/sharp-linux-x64 | 0.34.5 | Apache-2.0 | https://sharp.pixelplumbing.com |
| @img/sharp-linuxmusl-x64 | 0.34.5 | Apache-2.0 | https://sharp.pixelplumbing.com |
| @mediapipe/tasks-vision | 0.10.35 | Apache-2.0 | http://mediapipe.dev |
| @msgpackr-extract/msgpackr-extract-linux-x64 | 3.0.4 | MIT | http://github.com/kriszyp/msgpackr-extract |
| @next/env | 16.2.10 | MIT | https://github.com/vercel/next.js |
| @next/swc-linux-x64-gnu | 16.2.10 | MIT | https://github.com/vercel/next.js |
| @next/swc-linux-x64-musl | 16.2.10 | MIT | https://github.com/vercel/next.js |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/float | 1.0.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/path | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause | https://github.com/protobufjs/protobuf.js |
| @smithy/core | 3.29.4 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript/tree/main/packages/core |
| @smithy/credential-provider-imds | 4.4.9 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript/tree/main/packages/credential-provider-imds |
| @smithy/fetch-http-handler | 5.6.6 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript/tree/main/packages/fetch-http-handler |
| @smithy/node-http-handler | 4.9.6 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript/tree/main/packages/node-http-handler |
| @smithy/types | 4.16.1 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript/tree/main/packages/types |
| @swc/helpers | 0.5.15 | Apache-2.0 | https://swc.rs |
| @types/node | 20.19.43 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| @types/node | 10.17.60 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/retry | 0.12.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| agent-base | 7.1.4 | MIT | https://github.com/TooTallNate/proxy-agents |
| agent-base | 6.0.2 | MIT | git://github.com/TooTallNate/node-agent-base |
| base64-js | 1.5.1 | MIT | https://github.com/beatgammit/base64-js |
| baseline-browser-mapping | 2.10.42 | Apache-2.0 | https://github.com/web-platform-dx/baseline-browser-mapping |
| bignumber.js | 9.3.1 | MIT | https://github.com/MikeMcl/bignumber.js |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause | git@github.com:goinstant/buffer-equal-constant-time |
| buffer-from | 1.1.2 | MIT | LinusU/buffer-from |
| bullmq | 5.80.5 | MIT | https://bullmq.io/ |
| caniuse-lite | 1.0.30001802 | CC-BY-4.0 | browserslist/caniuse-lite |
| caseless | 0.12.0 | Apache-2.0 | https://github.com/mikeal/caseless |
| client-only | 0.0.1 | MIT | https://reactjs.org/ |
| concat-stream | 2.0.0 | MIT | http://github.com/maxogden/concat-stream |
| cron-parser | 4.9.0 | MIT | https://github.com/harrisiirak/cron-parser |
| data-uri-to-buffer | 4.0.1 | MIT | https://github.com/TooTallNate/node-data-uri-to-buffer |
| debug | 4.4.3 | MIT | git://github.com/debug-js/debug |
| detect-libc | 2.1.2 | Apache-2.0 | git://github.com/lovell/detect-libc |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 | https://github.com/Brightspace/node-ecdsa-sig-formatter#readme |
| env-paths | 2.2.1 | MIT | sindresorhus/env-paths |
| extend | 3.0.2 | MIT | https://github.com/justmoon/node-extend |
| fetch-blob | 3.2.0 | MIT | https://github.com/node-fetch/fetch-blob#readme |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later | https://github.com/eugeneware/ffmpeg-static |
| formdata-polyfill | 4.0.10 | MIT | https://github.com/jimmywarting/FormData#readme |
| gaxios | 7.2.0 | Apache-2.0 | https://github.com/googleapis/google-cloud-node/tree/main/core/packages/gaxios |
| gcp-metadata | 8.1.2 | Apache-2.0 | https://github.com/googleapis/google-cloud-node-core/tree/main/packages/gcp-metadata |
| google-auth-library | 10.9.0 | Apache-2.0 | https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs |
| google-logging-utils | 1.1.3 | Apache-2.0 | https://github.com/googleapis/google-cloud-node-core/tree/main/dev-packages/logging-utils |
| http-response-object | 3.0.2 | MIT | https://github.com/ForbesLindesay/http-response-object |
| https-proxy-agent | 7.0.6 | MIT | https://github.com/TooTallNate/proxy-agents |
| https-proxy-agent | 5.0.1 | MIT | git://github.com/TooTallNate/node-https-proxy-agent |
| inherits | 2.0.4 | ISC | git://github.com/isaacs/inherits |
| ioredis | 5.11.1 | MIT | git://github.com/luin/ioredis |
| json-bigint | 1.0.0 | MIT | git@github.com:sidorares/json-bigint |
| jwa | 2.0.1 | MIT | git://github.com/brianloveswords/node-jwa |
| jws | 4.0.1 | MIT | git://github.com/brianloveswords/node-jws |
| long | 5.3.2 | Apache-2.0 | https://github.com/dcodeIO/long.js |
| luxon | 3.7.2 | MIT | https://github.com/moment/luxon |
| msgpackr | 2.0.4 | MIT | http://github.com/kriszyp/msgpackr |
| msgpackr-extract | 3.0.4 | MIT | http://github.com/kriszyp/msgpackr-extract |
| nanoid | 3.3.15 | MIT | ai/nanoid |
| next | 16.2.10 | MIT | https://nextjs.org |
| node-abort-controller | 3.1.1 | MIT | https://github.com/southpolesteve/node-abort-controller#readme |
| node-domexception | 1.0.0 | MIT | https://github.com/jimmywarting/node-domexception#readme |
| node-fetch | 3.3.2 | MIT | https://github.com/node-fetch/node-fetch |
| node-gyp-build-optional-packages | 5.2.2 | MIT | https://github.com/prebuild/node-gyp-build |
| p-retry | 4.6.2 | MIT | sindresorhus/p-retry |
| parse-cache-control | 1.0.1 | BSD | https://github.com/roryf/parse-cache-control |
| pg | 8.22.0 | MIT | https://github.com/brianc/node-postgres |
| pg-cloudflare | 1.4.0 | MIT | git://github.com/brianc/node-postgres |
| pg-connection-string | 2.14.0 | MIT | https://github.com/brianc/node-postgres/tree/master/packages/pg-connection-string |
| pg-int8 | 1.0.1 | ISC | https://github.com/charmander/pg-int8 |
| pg-pool | 3.14.0 | MIT | https://github.com/brianc/node-postgres/tree/master/packages/pg-pool#readme |
| pg-protocol | 1.15.0 | MIT | git://github.com/brianc/node-postgres |
| pg-types | 2.2.0 | MIT | https://github.com/brianc/node-pg-types |
| pgpass | 1.0.5 | MIT | https://github.com/hoegaarden/pgpass |
| picocolors | 1.1.1 | ISC | alexeyraspopov/picocolors |
| postcss | 8.5.10 | MIT | https://postcss.org/ |
| postgres-array | 2.0.0 | MIT | bendrucker/postgres-array |
| postgres-bytea | 1.0.1 | MIT | bendrucker/postgres-bytea |
| postgres-date | 1.0.7 | MIT | bendrucker/postgres-date |
| postgres-interval | 1.2.0 | MIT | bendrucker/postgres-interval |
| progress | 2.0.3 | MIT | git://github.com/visionmedia/node-progress |
| protobufjs | 7.6.5 | BSD-3-Clause | https://protobufjs.github.io/protobuf.js/ |
| react | 19.2.0 | MIT | https://react.dev/ |
| react-dom | 19.2.0 | MIT | https://react.dev/ |
| readable-stream | 3.6.2 | MIT | git://github.com/nodejs/readable-stream |
| retry | 0.13.1 | MIT | https://github.com/tim-kos/node-retry |
| safe-buffer | 5.2.1 | MIT | https://github.com/feross/safe-buffer |
| semver | 7.8.5 | ISC | https://github.com/npm/node-semver |
| sharp | 0.34.5 | Apache-2.0 | https://sharp.pixelplumbing.com |
| source-map-js | 1.2.1 | BSD-3-Clause | https://github.com/7rulnik/source-map-js |
| split2 | 4.2.0 | ISC | https://github.com/mcollina/split2 |
| string_decoder | 1.3.0 | MIT | https://github.com/nodejs/string_decoder |
| styled-jsx | 5.1.6 | MIT | vercel/styled-jsx |
| tslib | 2.8.1 | 0BSD | https://www.typescriptlang.org/ |
| typedarray | 0.0.6 | MIT | https://github.com/substack/typedarray |
| undici-types | 6.21.0 | MIT | https://undici.nodejs.org |
| util-deprecate | 1.0.2 | MIT | https://github.com/TooTallNate/util-deprecate |
| uuid | 14.0.1 | MIT | https://github.com/uuidjs/uuid |
| web-streams-polyfill | 3.3.3 | MIT | https://github.com/MattiasBuelens/web-streams-polyfill#readme |
| ws | 8.21.1 | MIT | https://github.com/websockets/ws |
| xtend | 4.0.2 | MIT | https://github.com/Raynos/xtend |
