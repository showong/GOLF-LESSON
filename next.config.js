/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "ffmpeg-static"],
  },
  // 골프 스윙 영상은 보통 5~30MB. 서버 액션에서도 받을 수 있도록 한도를 넉넉히 둠.
  serverRuntimeConfig: {
    maxFileSize: 60 * 1024 * 1024,
  },
};

module.exports = nextConfig;
