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

const IR_SUB_PATHS = [
  "/presentations",
  "/annual-reports",
  "/governance",
  "/filings",
  "/proxy",
  "/sec-filings",
  "/financial-reports",
  "/sustainability",
];

const PDF_PATTERNS = [
  /annual[-_]?report/i,
  /10-K/i,
  /investor[-_]?presentation/i,
  /earnings/i,
  /shareholder[-_]?letter/i,
  /strategy[-_]?update/i,
  /proxy[-_]?statement/i,
  /DEF[-_]?14A/i,
  /sustainability[-_]?report/i,
  /ESG[-_]?report/i,
  /capital[-_]?markets[-_]?day/i,
  /CMD/i,
  /corporate[-_]?governance/i,
  /half[-_]?year/i,
  /interim[-_]?report/i,
];

const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_PER_DOC = 50_000;
const MAX_PDFS = 5;

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

  // Step 1.5: Crawl IR sub-pages for more PDF links
  const irBase = irPageUrl.replace(/\/$/, "");
  const allIRPages: { url: string; html: string }[] = [{ url: irPageUrl, html: irPageHtml }];
  const maxSubPages = 5;
  let subPagesCrawled = 0;

  for (const subPath of IR_SUB_PATHS) {
    if (subPagesCrawled >= maxSubPages || signal?.aborted) break;
    try {
      const subUrl = `${irBase}${subPath}`;
      const subResp = await timedFetch(fetchFn, subUrl, signal);
      if (subResp?.ok) {
        const subHtml = await subResp.text();
        allIRPages.push({ url: subUrl, html: subHtml });
        subPagesCrawled++;
        log.info("IR sub-page found", { url: subUrl });
      }
    } catch {
      // continue
    }
  }

  // Step 2: Extract PDF links from ALL IR pages
  const pdfLinks: PdfLink[] = [];
  for (const page of allIRPages) {
    pdfLinks.push(...extractPdfLinks(page.html, page.url));
  }
  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueLinks = pdfLinks.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
  uniqueLinks.sort((a, b) => b.score - a.score);
  log.info("PDF links found across IR pages", { count: uniqueLinks.length, pagesScanned: allIRPages.length });

  // Step 3: Download and parse top PDFs
  const parsePdf = opts.parsePdf ?? defaultParsePdf;
  let downloaded = 0;

  for (const link of uniqueLinks) {
    if (downloaded >= MAX_PDFS || signal?.aborted) break;

    const source: ResearchSource = {
      type: "investor-doc",
      title: link.title,
      url: link.url,
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
  websiteUrl: string,
  opts: { fetchFn?: typeof fetch; logger: Logger; signal?: AbortSignal; onSourceReady?: (source: ResearchSource) => void },
): Promise<{ text: string; sources: ResearchSource[] }> {
  const { fetchFn = fetch, logger: log, signal, onSourceReady } = opts;
  const sources: ResearchSource[] = [];

  try {
    // Extract company domain for search
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const companyName = domain.split(".")[0];

    // Search EDGAR for the company
    const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&dateRange=custom&startdt=${getOneYearAgo()}&forms=10-K&hits.hits.total.value=1`;
    const searchResp = await timedFetch(fetchFn, searchUrl, signal);
    if (!searchResp?.ok) return { text: "", sources };

    const searchText = await searchResp.text();

    // Try the simpler EDGAR full-text search API
    const ftSearchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=10-K`;
    const ftResp = await timedFetch(fetchFn, ftSearchUrl, signal);
    if (!ftResp?.ok) {
      log.debug("SEC EDGAR search returned no results", { companyName });
      return { text: "", sources };
    }

    // Try company tickers endpoint for CIK lookup
    const tickerResp = await timedFetch(fetchFn, "https://www.sec.gov/files/company_tickers.json", signal);
    if (!tickerResp?.ok) return { text: "", sources };

    const tickerData = (await tickerResp.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;

    // Find matching company by name
    const entries = Object.values(tickerData);
    const match = entries.find(
      (e) =>
        e.title.toLowerCase().includes(companyName.toLowerCase()) ||
        companyName.toLowerCase().includes(e.title.toLowerCase().split(" ")[0]),
    );

    if (!match) {
      log.debug("No SEC EDGAR match found", { companyName });
      return { text: "", sources };
    }

    const cik = String(match.cik_str).padStart(10, "0");
    log.info("SEC EDGAR CIK found", { companyName: match.title, cik, ticker: match.ticker });

    // Fetch filing index
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const subResp = await timedFetch(fetchFn, submissionsUrl, signal);
    if (!subResp?.ok) return { text: "", sources };

    const submissions = (await subResp.json()) as {
      filings: {
        recent: { form: string[]; accessionNumber: string[]; primaryDocument: string[] };
      };
    };

    // Find most recent 10-K
    const forms = submissions.filings.recent.form;
    const tenKIdx = forms.findIndex((f) => f === "10-K");
    if (tenKIdx === -1) {
      log.debug("No 10-K filing found", { cik });
      return { text: "", sources };
    }

    const accession = submissions.filings.recent.accessionNumber[tenKIdx].replace(/-/g, "");
    const primaryDoc = submissions.filings.recent.primaryDocument[tenKIdx];
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${match.cik_str}/${accession}/${primaryDoc}`;

    const source: ResearchSource = {
      type: "sec-filing",
      title: `10-K: ${match.title}`,
      url: filingUrl,
      charCount: 0,
      status: "fetching",
    };
    sources.push(source);

    const filingResp = await timedFetch(fetchFn, filingUrl, signal, 30_000);
    if (!filingResp?.ok) {
      source.status = "failed";
      source.error = `HTTP ${filingResp?.status}`;
      return { text: "", sources };
    }

    const html = await filingResp.text();
    // Strip HTML tags for plain text extraction
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const truncated = text.slice(0, 80_000);

    source.charCount = truncated.length;
    source.status = "ready";
    onSourceReady?.(source);

    log.info("SEC EDGAR 10-K retrieved", { company: match.title, chars: truncated.length });

    return {
      text: `[SEC FILING: 10-K ${match.title}]\n${truncated}`,
      sources,
    };
  } catch (err) {
    log.debug("SEC EDGAR lookup failed (non-fatal)", { error: String(err) });
    return { text: "", sources };
  }
}

function getOneYearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
}

async function timedFetch(
  fetchFn: typeof fetch,
  url: string,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
