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
