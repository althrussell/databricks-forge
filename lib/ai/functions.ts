/**
 * AI Functions, Statistical Functions, and Geospatial Functions registries.
 *
 * These registries are injected into use-case generation prompts to guide the
 * LLM on what Databricks SQL functions are available.
 *
 * Ported from docs/references/databricks_inspire_v34.ipynb (reference)
 * Extended with DBSQL-specific features from the Databricks SQL skill.
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
  ai_gen: {
    function: "ai_gen",
    businessValue:
      "Generates text from a prompt using a built-in LLM (no endpoint required). Simpler alternative to ai_query for straightforward text generation.",
    exampleUseCases:
      "Product description generation, email drafting, simple text enrichment",
  },
  ai_query: {
    function: "ai_query",
    businessValue:
      "Invokes custom model serving endpoints or LLMs for flexible AI-powered analysis, generation, and recommendations. Supports structured output via `responseFormat` parameter and graceful error handling via `failOnError => false`.",
    exampleUseCases:
      "Custom analysis, recommendation generation, complex reasoning tasks, structured data extraction",
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
      "Semantic search using vector embeddings for intelligent information retrieval and recommendation systems. Table-valued function requiring named arguments: `index =>`, `query_text =>`, `num_results =>`.",
    exampleUseCases:
      "Similar product recommendations, knowledge base search, semantic matching",
  },
  http_request: {
    function: "http_request",
    businessValue:
      "Makes HTTP requests to external services from SQL using Unity Catalog HTTP connections. Returns `STRUCT<status_code: INT, text: STRING>`. Requires a pre-configured CONNECTION.",
    exampleUseCases:
      "External API enrichment, webhook notifications, third-party data validation",
  },
  remote_query: {
    function: "remote_query",
    businessValue:
      "Runs SQL queries against external databases (PostgreSQL, MySQL, SQL Server, Snowflake, BigQuery, etc.) via Lakehouse Federation. Read-only table-valued function.",
    exampleUseCases:
      "Cross-system analytics, federated joins with external databases, data migration validation",
  },
  read_files: {
    function: "read_files",
    businessValue:
      "Reads CSV, JSON, Parquet, Avro, ORC, or XML files directly from Unity Catalog Volumes or cloud storage. Supports schema inference, glob patterns, and partition discovery.",
    exampleUseCases:
      "Volume file ingestion, ad-hoc file analysis, document pipeline input for ai_parse_document",
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
// Geospatial Functions (H3 + ST)
// ---------------------------------------------------------------------------

export interface GeospatialFunction {
  function: string;
  businessValue: string;
  useCases: string;
  category: string;
}

export const GEOSPATIAL_FUNCTIONS: Record<string, GeospatialFunction> = {
  // H3 Indexing
  "h3_longlatash3(lon, lat, resolution)": {
    function: "h3_longlatash3(lon, lat, resolution)",
    businessValue:
      "Convert longitude/latitude to H3 hexagonal cell ID for spatial indexing and efficient proximity joins",
    useCases:
      "Store catchment areas, delivery zone mapping, customer-to-location assignment",
    category: "H3 Indexing",
  },
  "h3_polyfillash3(geometry, resolution)": {
    function: "h3_polyfillash3(geometry, resolution)",
    businessValue:
      "Fill a polygon with H3 cells for area coverage and density analysis",
    useCases:
      "Service area coverage, zone density heatmaps, territory planning",
    category: "H3 Indexing",
  },
  "h3_toparent(h3CellId, resolution)": {
    function: "h3_toparent(h3CellId, resolution)",
    businessValue:
      "Roll up H3 cells to coarser resolution for multi-level spatial aggregation",
    useCases:
      "Regional rollups, zoom-level aggregation, hierarchical spatial analysis",
    category: "H3 Indexing",
  },
  "h3_kring(h3CellId, k)": {
    function: "h3_kring(h3CellId, k)",
    businessValue:
      "Get all H3 cells within grid distance k for neighbourhood analysis",
    useCases:
      "Nearby store lookup, local competitor analysis, proximity-based alerts",
    category: "H3 Indexing",
  },
  "h3_distance(h3CellId1, h3CellId2)": {
    function: "h3_distance(h3CellId1, h3CellId2)",
    businessValue:
      "Compute grid distance between two H3 cells for fast approximate proximity checks",
    useCases:
      "Distance-based filtering, nearest-neighbour approximation, logistics routing",
    category: "H3 Indexing",
  },

  // Spatial Constructors
  "ST_Point(x, y)": {
    function: "ST_Point(x, y)",
    businessValue:
      "Create point geometry from longitude/latitude for spatial operations",
    useCases:
      "Geocoding results, sensor locations, event coordinates",
    category: "Spatial Constructors",
  },
  "ST_MakeLine(point1, point2)": {
    function: "ST_MakeLine(point1, point2)",
    businessValue:
      "Create line geometry connecting two points for route and path analysis",
    useCases:
      "Delivery routes, travel paths, network edges",
    category: "Spatial Constructors",
  },

  // Spatial Measurements
  "ST_Distance(geom1, geom2)": {
    function: "ST_Distance(geom1, geom2)",
    businessValue:
      "Calculate exact distance between two geometries in metres for proximity analysis",
    useCases:
      "Store proximity, delivery radius, nearest-facility calculation",
    category: "Spatial Measurements",
  },
  "ST_Area(geometry)": {
    function: "ST_Area(geometry)",
    businessValue:
      "Calculate the area of a polygon for coverage and capacity analysis",
    useCases:
      "Territory sizing, warehouse footprint, coverage area measurement",
    category: "Spatial Measurements",
  },
  "ST_Length(geometry)": {
    function: "ST_Length(geometry)",
    businessValue:
      "Calculate length of a line for route and network analysis",
    useCases:
      "Route distance, pipeline length, road segment measurement",
    category: "Spatial Measurements",
  },

  // Spatial Relationships
  "ST_Contains(geom1, geom2)": {
    function: "ST_Contains(geom1, geom2)",
    businessValue:
      "Test if one geometry fully contains another for containment queries",
    useCases:
      "Point-in-polygon, zone assignment, boundary containment checks",
    category: "Spatial Relationships",
  },
  "ST_Intersects(geom1, geom2)": {
    function: "ST_Intersects(geom1, geom2)",
    businessValue:
      "Test if two geometries overlap for spatial join and overlap detection",
    useCases:
      "Zone overlap detection, coverage gap analysis, spatial joins",
    category: "Spatial Relationships",
  },
  "ST_Within(geom1, geom2)": {
    function: "ST_Within(geom1, geom2)",
    businessValue:
      "Test if a geometry is inside another for inclusion filtering",
    useCases:
      "Geofencing, region-based filtering, boundary compliance",
    category: "Spatial Relationships",
  },
  "ST_DWithin(geom1, geom2, distance)": {
    function: "ST_DWithin(geom1, geom2, distance)",
    businessValue:
      "Test if two geometries are within a specified distance for radius queries",
    useCases:
      "Radius search, proximity alerts, nearby entity detection",
    category: "Spatial Relationships",
  },

  // Spatial Transformations
  "ST_Buffer(geometry, distance)": {
    function: "ST_Buffer(geometry, distance)",
    businessValue:
      "Create a buffer zone around a geometry for catchment and exclusion analysis",
    useCases:
      "Delivery zones, exclusion perimeters, service area buffers",
    category: "Spatial Transformations",
  },
  "ST_Union(geom1, geom2)": {
    function: "ST_Union(geom1, geom2)",
    businessValue:
      "Merge two geometries into a single shape for territory consolidation",
    useCases:
      "Territory merging, coverage union, boundary consolidation",
    category: "Spatial Transformations",
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

/**
 * Generate a markdown summary of geospatial functions for prompt injection.
 */
export function generateGeospatialFunctionsSummary(): string {
  const byCategory: Record<string, GeospatialFunction[]> = {};
  for (const f of Object.values(GEOSPATIAL_FUNCTIONS)) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  const sections = Object.entries(byCategory).map(([cat, funcs]) => {
    const items = funcs
      .map((f) => `  - **${f.function}**: ${f.businessValue}`)
      .join("\n");
    return `### ${cat}\n${items}`;
  });

  return `## Available Geospatial Functions (H3 + ST)\n\n${sections.join("\n\n")}`;
}
