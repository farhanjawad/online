import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from jsDelivr CDN used in question HTML
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
      },
    ],
  },
  // Suppress MathJax hydration warnings
  reactStrictMode: false,
};

export default nextConfig;
