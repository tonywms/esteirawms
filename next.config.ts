import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.WMS_VALIDATION_BUILD_DIR ? { distDir: ".next-wms-v2-validation" } : {}),
};
export default nextConfig;
