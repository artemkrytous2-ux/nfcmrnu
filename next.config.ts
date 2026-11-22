import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/is-bot";

const nextConfig: NextConfig = {
  /* config options here */
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|iPhone|iPad`),
  skipTrailingSlashRedirect: true,
  cacheComponents: true,
  partialPrefetching: true,
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
