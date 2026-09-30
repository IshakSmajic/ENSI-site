import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Product/promotion image uploads go through Server Actions. Images are limited to
      // 5 MiB (src/lib/images/validation.ts, and the Storage buckets); the rest is room for
      // the multipart overhead. The default is 1 MB. Applies to every Server Action.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
