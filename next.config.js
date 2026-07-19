/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV === "development";
const mediapipeWasmSource =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/";

const nextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@electric-sql/pglite",
    "@google/genai",
    "bullmq",
    "ioredis",
    "pg",
  ],
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: __dirname,
  outputFileTracingExcludes: {
    "*": [
      ".env*",
      ".git/**/*",
      "data/**/*",
      "docs/**/*",
      "scripts/**/*",
      "src/**/*",
      "README.md",
      "Dockerfile",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "eslint.config.mjs",
      "next.config.js",
      "package-lock.json",
      "postcss.config.js",
      "railway.json",
      "tailwind.config.ts",
      "tsconfig.json",
      "migrations/**/*",
      "dist/**/*",
      "public/**/*",
    ],
  },
  async headers() {
    const scriptPolicy = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
    if (isDevelopment) scriptPolicy.push("'unsafe-eval'");
    const contentSecurityPolicyDirectives = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src ${scriptPolicy.join(" ")} ${mediapipeWasmSource}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://i.ytimg.com",
      "media-src 'self' blob:",
      "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com",
      `worker-src 'self' blob: ${mediapipeWasmSource}`,
    ];
    if (!isDevelopment) contentSecurityPolicyDirectives.push("upgrade-insecure-requests");
    const contentSecurityPolicy = contentSecurityPolicyDirectives.join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          ...(!isDevelopment
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

module.exports = nextConfig;
