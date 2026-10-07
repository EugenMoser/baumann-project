import type { NextConfig } from "next";
import { parsePublicEnv, parseServerEnv } from "./lib/env/schema";

// Throws during `next build`/`next start` if env is invalid.
parsePublicEnv(process.env);
parseServerEnv(process.env);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
