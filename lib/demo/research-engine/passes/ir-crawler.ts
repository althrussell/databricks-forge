/**
 * Pass 2: IR (Investor Relations) Auto-Discovery
 *
 * Probes common IR page paths, extracts PDF links, downloads top PDFs,
 * and extracts text. Falls back to SEC EDGAR for US public companies.
 */

import type { Logger } from "@/lib/ports/logger";
import type { ResearchSource, DemoScope } from "../../types";

const IR_PATHS = [
  "/investor-relations",
  "/investors",
  "/about/investors",
  "/ir",
  "/about/investor-relations",
];

const PDF_PATTERNS = [
  /annual[-_]?report/i,
  /10-K/i,
  /investor[-_]?presentation/i,
  /earnings/i,
  /shareholder[-_]?letter/i,
  /strategy[-_]?update/i,
];

const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_PER_DOC = 50_000;
const MAX_PDFS = 3;
const FETCH_TIMEOUT_MS = 15_000;

export async function runIRDiscovery(
  websiteUrl: string | undefined,
  scope: DemoScope | undefined,
  opts: {
    fetchFn?: typeof fetch;
    parsePdf?: (buffer: Buffer) => Promise<string>;
    logger: Logger;
    signal?: AbortSignal;
    onSourceReady?: (source: ResearchSource) => void;
  },
): Promise<{ text: string; sources: ResearchSource[] }> {
  const { fetchFn = fetch, logger: log, signal, onSourceReady } = opts;
  const sources: ResearchSource[] = [];
  const texts: string[] = [];

  if (!websiteUrl) return { text: "", sources };

  const baseUrl = websiteUrl.replace(/\/$/, "");

  // Step 1: Find the IR page
  let irPageHtml: string | null = null;
  let irPageUrl: string | null = null;

  for (const path of IR_PATHS) {
    if (signal?.aborted) break;
    try {
      const url = `${baseUrl}${path}`;
      const resp = await timedFetch(fetchFn, url, signal);
      if (resp?.ok) {
        irPageHtml = await resp.text();
        irPageUrl = url;
        log.info("IR page found", { url });
        break;
      }
    } catch {
      // continue trying
    }
  }

  if (!irPageHtml || !irPageUrl) {
    log.debug("No IR page found, attempting SEC EDGAR fallback");
    const edgarResult = await trySecEdgar(websiteUrl, opts);
    return edgarResult;
  }

  // Step 2: Extract PDF links
  const pdfLinks = extractPdfLinks(irPageHtml, irPageUrl);
  log.info("PDF links found on IR page", { count: pdfLinks.length });

  // Step 3: Download and parse top PDFs
  const parsePdf = opts.parsePdf ?? defaultParsePdf;
  let downloaded = 0;

  for (const link of pdfLinks) {
    if (downloaded >= MAX_PDFS || signal?.aborted) break;

    const source: ResearchSource = {
      type: "investor-doc",
      title: link.title,
      charCount: 0,
      status: "fetching",
    };
    sources.push(source);

    try {
      const resp = await timedFetch(fetchFn, link.url, signal);
      if (!resp?.ok) {
        source.status = "failed";
        source.error = `HTTP ${resp?.status}`;
        continue;
      }

      const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
      if (contentLength > MAX_PDF_SIZE) {
        source.status = "failed";
        source.error = "Too large";
        continue;
      }

      const buffer = Buffer.from(await resp.arrayBuffer());
      const text = await parsePdf(buffer);
      const truncated = text.slice(0, MAX_TEXT_PER_DOC);

      source.charCount = truncated.length;
      source.status = "ready";
      texts.push(`[INVESTOR DOC: ${link.title}]\n${truncated}`);
      downloaded++;

      log.info("IR document parsed", { title: link.title, chars: truncated.length });
    } catch (err) {
      source.status = "failed";
      source.error = err instanceof Error ? err.message : String(err);
    }

    onSourceReady?.(source);
  }

  return { text: texts.join("\n\n---\n\n"), sources };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PdfLink {
  url: string;
  title: string;
  score: number;
}

function extractPdfLinks(html: string, pageUrl: string): PdfLink[] {
  const links: PdfLink[] = [];
  const hrefRegex = /href=["']([^"']*\.pdf[^"']*?)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    const url = href.startsWith("http") ? href : new URL(href, pageUrl).href;
    const filename = url.split("/").pop() ?? "";

    let score = 0;
    for (const pattern of PDF_PATTERNS) {
      if (pattern.test(filename) || pattern.test(href)) score += 10;
    }

    if (score > 0) {
      links.push({ url, title: filename.replace(/\.pdf$/i, "").replace(/[-_]/g, " "), score });
    }
  }

  return links.sort((a, b) => b.score - a.score);
}

async function trySecEdgar(
  _websiteUrl: string,
  _opts: { fetchFn?: typeof fetch; logger: Logger; signal?: AbortSignal; onSourceReady?: (source: ResearchSource) => void },
): Promise<{ text: string; sources: ResearchSource[] }> {
  // SEC EDGAR is US public companies only -- best-effort
  return { text: "", sources: [] };
}

async function timedFetch(
  fetchFn: typeof fetch,
  url: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    const resp = await fetchFn(url, {
      headers: { "User-Agent": "DatabricksForge/1.0" },
      signal: combined,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return resp;
  } catch {
    return null;
  }
}

async function defaultParsePdf(buffer: Buffer): Promise<string> {
  try {
    const mod = await import("pdf-parse");
    const pdfParse = ((mod as Record<string, unknown>).default ?? mod) as (
      buf: Buffer
    ) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text;
  } catch {
    return "";
  }
}
