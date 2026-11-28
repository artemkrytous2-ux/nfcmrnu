import type { NextConfig } from "next";

const SUPABASE_PROJECT_HOST = "yktqtxmhkgsrjfzhnsei.supabase.co";
const SITE_HOST = "nfcmenu.pro";

const nextConfig: NextConfig = {
  /* config options here */
  skipTrailingSlashRedirect: true,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_PROJECT_HOST,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: SITE_HOST,
        pathname: "/sb/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/sb/:path*",
        destination: `https://${SUPABASE_PROJECT_HOST}/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
