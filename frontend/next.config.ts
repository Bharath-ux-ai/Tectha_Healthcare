import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL;

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Browser calls /api/* on the Next.js origin; Next proxies them to FastAPI in development or if BACKEND_URL is set
  async rewrites() {
    if (BACKEND_URL || process.env.NODE_ENV === "development") {
      return [{ source: "/api/:path*", destination: `${BACKEND_URL || "http://localhost:8000"}/api/:path*` }];
    }
    return [];
  },
};

export default nextConfig;
