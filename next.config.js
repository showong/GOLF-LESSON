/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@electric-sql/pglite",
    "@google/genai",
    "bullmq",
    "ffmpeg-static",
    "ioredis",
    "pg",
  ],
  poweredByHeader: false,
  output: "standalone",
};

module.exports = nextConfig;
