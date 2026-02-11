import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pptxgenjs", "pg"],
};

export default nextConfig;
