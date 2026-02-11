import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Databricks Apps injects DATABRICKS_APP_PORT
  serverExternalPackages: ["exceljs", "pptxgenjs"],
};

export default nextConfig;
