import type { NextConfig } from "next";
// Side-effect import: throws during `next build`/`next start` if env is invalid.
import "./lib/env";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
