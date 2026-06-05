import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  outputFileTracingRoot: workspaceRoot,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "4say.site" },
    ],
  },
};

export default nextConfig;
