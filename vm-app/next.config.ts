import type { NextConfig } from "next";

const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
      {
        source: "/backend-health",
        destination: `${BACKEND_URL}/health`,
      },
      {
        source: "/api/docs/:path*",
        destination: `${BACKEND_URL}/api/docs/:path*`,
      },
      {
        source: "/api/docs",
        destination: `${BACKEND_URL}/api/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${BACKEND_URL}/api/docs/openapi.json`,
      },
    ];
  },
};

export default nextConfig;

