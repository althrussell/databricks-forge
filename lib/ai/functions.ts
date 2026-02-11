/**
 * AI Functions and Statistical Functions registries.
 *
 * These registries are injected into use-case generation prompts to guide the
 * LLM on what Databricks SQL functions are available.
 *
 * Ported from docs/references/databricks_inspire_v34.ipynb
 */

// ---------------------------------------------------------------------------
// AI Functions
// ---------------------------------------------------------------------------

export interface AIFunction {
  function: string;
  businessValue: string;
  exampleUseCases: string;
}

export const AI_FUNCTIONS: Record<string, AIFunction> = {
  ai_analyze_sentiment: {
    function: "ai_analyze_sentiment",
    businessValue:
      "Analyzes sentiment (positive/negative/neutral) in text to understand customer emotion and prioritize responses.",
    exampleUseCases:
      "Customer feedback analysis, social media monitoring, support ticket prioritization",
  },
  ai_classify: {
    function: "ai_classify",
    businessValue:
      "Classifies text into predefined categories for automated routing, segmentation, and prioritization. Array MUST have max 20 items, each <50 characters.",
    exampleUseCases:
      "Support ticket routing, document classification, lead scoring",
  },
  ai_extract: {
    function: "ai_extract",
    businessValue:
      "Extracts specified entities from unstructured text to structure data for analysis and automation. Array MUST have max 20 items, each <50 characters.",
    exampleUseCases:
      "Invoice data extraction, contract term extraction, resume parsing",
  },
  ai_fix_grammar: {
    function: "ai_fix_grammar",
    businessValue:
      "Corrects grammatical errors in text to improve communication quality and professionalism.",
    exampleUseCases:
      "Customer communication cleanup, report generation, template standardization",
  },
  ai_mask: {
    function: "ai_mask",
    businessValue:
      "Masks sensitive information (PII, PHI, financial data) for compliance and secure data sharing. MUST be combined with ai_query for compliance documentation.",
    exampleUseCases:
      "GDPR compliance, data anonymization, secure sharing",
  },
  ai_parse_document: {
    function: "ai_parse_document",
    businessValue:
      "Extracts structured text, layout, tables, and figures from unstructured document files (PDF, images, Word, PowerPoint). MUST ONLY be used with binary files from Unity Catalog volumes via READ_FILES().",
    exampleUseCases:
      "Invoice processing, contract analysis, report digitization",
  },
  ai_similarity: {
    function: "ai_similarity",
    businessValue:
      "Computes semantic similarity score (0-1) between two text strings for deduplication, matching, and record linkage. MUST be combined with ai_query for merge strategies.",
    exampleUseCases:
      "Duplicate detection, customer matching, product deduplication",
  },
  ai_summarize: {
    function: "ai_summarize",
    businessValue:
      "Creates concise summaries of long text to improve information accessibility and decision-making speed.",
    exampleUseCases:
      "Meeting notes summarization, news digest generation, report condensation",
  },
  ai_translate: {
    function: "ai_translate",
    businessValue:
      "Translates text to specified target languages for global communication and localization.",
    exampleUseCases:
      "Customer communication translation, content localization, multilingual support",
  },
  ai_query: {
    function: "ai_query",
    businessValue:
      "Invokes custom model serving endpoints or LLMs for flexible AI-powered analysis, generation, and recommendations.",
    exampleUseCases:
      "Custom analysis, recommendation generation, complex reasoning tasks",
  },
  ai_forecast: {
    function: "ai_forecast",
    businessValue:
      "Time series forecasting with prediction intervals for demand planning, capacity optimization, and trend prediction. MUST be combined with ai_query for strategic recommendations.",
    exampleUseCases:
      "Demand forecasting, revenue prediction, capacity planning",
  },
  vector_search: {
    function: "vector_search",
    businessValue:
      "Semantic search using vector embeddings for intelligent information retrieval and recommendation systems.",
    exampleUseCases:
      "Similar product recommendations, knowledge base search, semantic matching",
  },
};

// ---------------------------------------------------------------------------
// Statistical Functions
// ---------------------------------------------------------------------------

export interface StatisticalFunction {
  function: string;
  businessValue: string;
  useCases: string;
  category: string;
}

export const STATISTICAL_FUNCTIONS: Record<string, StatisticalFunction> = {
  // Central Tendency
  "AVG(col)": {
    function: "AVG(col)",
    businessValue: "Calculate average values for benchmarking and trend analysis",
    useCases: "Average order value, mean response time, average revenue per user",
    category: "Central Tendency",
  },
  "MEDIAN(col)": {
    function: "MEDIAN(col)",
    businessValue: "Robust central measure less affected by outliers",
    useCases: "Median salary analysis, median delivery time, median customer spend",
    category: "Central Tendency",
  },
  "MODE(col)": {
    function: "MODE(col)",
    businessValue: "Identify most frequent values for pattern recognition",
    useCases: "Most common product, peak hour analysis, popular categories",
    category: "Central Tendency",
  },

  // Dispersion
  "STDDEV_POP(col)": {
    function: "STDDEV_POP(col)",
    businessValue: "Measure data spread for risk and volatility assessment",
    useCases: "Price volatility, quality variation, performance consistency",
    category: "Dispersion",
  },
  "STDDEV_SAMP(col)": {
    function: "STDDEV_SAMP(col)",
    businessValue: "Sample standard deviation for statistical inference",
    useCases: "Sample quality analysis, A/B test variance, survey analysis",
    category: "Dispersion",
  },
  "VAR_POP(col)": {
    function: "VAR_POP(col)",
    businessValue: "Population variance for comprehensive spread analysis",
    useCases: "Portfolio risk, demand variability, cost variance analysis",
    category: "Dispersion",
  },

  // Distribution Shape
  "SKEWNESS(col)": {
    function: "SKEWNESS(col)",
    businessValue: "Detect asymmetric distributions for risk assessment",
    useCases: "Revenue distribution analysis, loss distribution, tail risk",
    category: "Distribution Shape",
  },
  "KURTOSIS(col)": {
    function: "KURTOSIS(col)",
    businessValue: "Detect heavy tails and extreme values in distributions",
    useCases: "Extreme event detection, fat-tail risk, outlier propensity",
    category: "Distribution Shape",
  },

  // Percentiles
  "PERCENTILE_APPROX(col, p)": {
    function: "PERCENTILE_APPROX(col, p)",
    businessValue: "Approximate percentiles for large-scale SLA and performance monitoring",
    useCases: "P95 latency, SLA compliance, top/bottom segment analysis",
    category: "Percentiles",
  },

  // Trend Analysis
  "REGR_SLOPE(y, x)": {
    function: "REGR_SLOPE(y, x)",
    businessValue: "Linear trend detection for growth and decline analysis",
    useCases: "Revenue growth rate, cost escalation, adoption velocity",
    category: "Trend Analysis",
  },
  "REGR_INTERCEPT(y, x)": {
    function: "REGR_INTERCEPT(y, x)",
    businessValue: "Baseline value estimation in regression models",
    useCases: "Base cost estimation, starting point analysis, fixed component isolation",
    category: "Trend Analysis",
  },
  "REGR_R2(y, x)": {
    function: "REGR_R2(y, x)",
    businessValue: "Measure strength of linear relationships",
    useCases: "Model fit assessment, predictor quality, correlation strength",
    category: "Trend Analysis",
  },

  // Correlation
  "CORR(col1, col2)": {
    function: "CORR(col1, col2)",
    businessValue: "Identify relationships between business metrics",
    useCases: "Price-demand correlation, marketing-revenue correlation, feature impact",
    category: "Correlation",
  },
  "COVAR_POP(col1, col2)": {
    function: "COVAR_POP(col1, col2)",
    businessValue: "Measure how two variables move together",
    useCases: "Portfolio diversification, cross-sell analysis, risk co-movement",
    category: "Correlation",
  },

  // Ranking
  "CUME_DIST()": {
    function: "CUME_DIST()",
    businessValue: "Cumulative distribution for percentile-based ranking",
    useCases: "Customer percentile ranking, performance percentile, score distribution",
    category: "Ranking",
  },
  "NTILE(n)": {
    function: "NTILE(n)",
    businessValue: "Divide data into equal groups for segmentation",
    useCases: "Customer quintiles, performance tiers, risk buckets",
    category: "Ranking",
  },
  "DENSE_RANK()": {
    function: "DENSE_RANK()",
    businessValue: "Rank items without gaps for competitive analysis",
    useCases: "Product ranking, employee ranking, region performance rank",
    category: "Ranking",
  },

  // Time Series
  "LAG(col, n)": {
    function: "LAG(col, n)",
    businessValue: "Compare current values with previous periods",
    useCases: "Month-over-month change, previous period comparison, churn detection",
    category: "Time Series",
  },
  "LEAD(col, n)": {
    function: "LEAD(col, n)",
    businessValue: "Look ahead to future values for forecasting context",
    useCases: "Next period prediction context, forward-looking analysis",
    category: "Time Series",
  },

  // OLAP
  "ROLLUP(cols)": {
    function: "ROLLUP(cols)",
    businessValue: "Hierarchical aggregation for drill-down analysis",
    useCases: "Region > country > city rollup, category hierarchy, time rollup",
    category: "OLAP",
  },
  "CUBE(cols)": {
    function: "CUBE(cols)",
    businessValue: "Cross-dimensional aggregation for multidimensional analysis",
    useCases: "Product x region analysis, time x category cube, full cross-tabulation",
    category: "OLAP",
  },
};

// ---------------------------------------------------------------------------
// Summary generators (for prompt injection)
// ---------------------------------------------------------------------------

/**
 * Generate a markdown summary of AI functions for prompt injection.
 */
export function generateAIFunctionsSummary(): string {
  const lines = Object.values(AI_FUNCTIONS).map(
    (f) =>
      `- **${f.function}**: ${f.businessValue}\n  Examples: ${f.exampleUseCases}`
  );
  return `## Available AI Functions\n\n${lines.join("\n\n")}`;
}

/**
 * Generate a markdown summary of statistical functions for prompt injection.
 */
export function generateStatisticalFunctionsSummary(): string {
  const byCategory: Record<string, StatisticalFunction[]> = {};
  for (const f of Object.values(STATISTICAL_FUNCTIONS)) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  const sections = Object.entries(byCategory).map(([cat, funcs]) => {
    const items = funcs
      .map((f) => `  - **${f.function}**: ${f.businessValue}`)
      .join("\n");
    return `### ${cat}\n${items}`;
  });

  return `## Available Statistical Functions\n\n${sections.join("\n\n")}`;
}
