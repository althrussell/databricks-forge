/**
 * PDF export placeholder.
 *
 * TODO: Implement full PDF generation with @react-pdf/renderer.
 * For now, this exports a simple JSON structure that could be
 * rendered client-side or used by a future PDF renderer.
 */

import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { computeDomainStats } from "@/lib/domain/scoring";

export interface PDFCatalog {
  businessName: string;
  generatedAt: string;
  totalUseCases: number;
  domainCount: number;
  domains: Array<{
    name: string;
    count: number;
    avgScore: number;
    useCases: Array<{
      name: string;
      type: string;
      statement: string;
      solution: string;
      businessValue: string;
      overallScore: number;
    }>;
  }>;
}

/**
 * Generate a PDF catalog data structure.
 * In a future iteration, this will produce an actual PDF buffer.
 */
export function generatePDFCatalog(
  run: PipelineRun,
  useCases: UseCase[]
): PDFCatalog {
  const stats = computeDomainStats(useCases);

  const domains = stats.map((ds) => ({
    name: ds.domain,
    count: ds.count,
    avgScore: ds.avgScore,
    useCases: useCases
      .filter((uc) => uc.domain === ds.domain)
      .sort((a, b) => b.overallScore - a.overallScore)
      .map((uc) => ({
        name: uc.name,
        type: uc.type,
        statement: uc.statement,
        solution: uc.solution,
        businessValue: uc.businessValue,
        overallScore: uc.overallScore,
      })),
  }));

  return {
    businessName: run.config.businessName,
    generatedAt: new Date().toISOString(),
    totalUseCases: useCases.length,
    domainCount: stats.length,
    domains,
  };
}
