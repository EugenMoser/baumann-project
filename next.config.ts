import type { NextConfig } from "next";
// Side-effect import: throws during `next build`/`next start` if env is invalid.
import "./lib/env";

const nextConfig: NextConfig = {
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
