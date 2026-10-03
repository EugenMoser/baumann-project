import type { MetadataRoute } from "next";

// Preview only: no crawler may access any path.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
