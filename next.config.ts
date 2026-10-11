import type { NextConfig } from "next";
import { parsePublicEnv, parseServerEnv } from "./lib/env/schema";

// Throws during `next build`/`next start` if env is invalid.
const publicEnv = parsePublicEnv(process.env);
parseServerEnv(process.env);
const supabase = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    // Only the public catalog bucket of our own Supabase (spec D7).
    remotePatterns: [
      {
        protocol: supabase.protocol === "http:" ? "http" : "https",
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: "/storage/v1/object/public/catalog/**",
      },
    ],
    // One day: keeps re-encoding work on the shared VPS low.
    minimumCacheTTL: 86_400,
  },
  experimental: {
    serverActions: {
      // 5 MiB images plus multipart overhead (spec D2).
      bodySizeLimit: "6mb",
    },
  },
  // Applies to every response independent of page code, incl. assets and errors.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
