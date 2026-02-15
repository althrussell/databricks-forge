import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pptxgenjs", "pdfkit", "pg"],
};

export default nextConfig;
