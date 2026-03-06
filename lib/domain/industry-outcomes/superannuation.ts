import type { IndustryOutcome } from "./index";

export const SUPERANNUATION: IndustryOutcome = {
  id: "superannuation",
  name: "Superannuation & Retirement",
  subVerticals: [
    "Profit-for-Member (Industry Funds)",
    "Retail Super",
    "Public Sector Super",
    "Corporate Super",
    "Self-Managed Super Funds (SMSF)",
    "Retirement Income / Pension",
  ],
  suggestedDomains: [
    "Member Administration",
    "Investments",
    "Insurance (Group)",
    "Risk & Compliance",
    "Digital & Member Engagement",
    "Operations",
  ],
  suggestedPriorities: [
    "Grow Membership & FUM",
    "Improve Member Outcomes",
    "Reduce Cost-to-Serve",
    "Strengthen Compliance",
    "Enhance Member Experience",
  ],
  objectives: [
    {
      name: "Drive Growth",
      whyChange:
        "Superannuation funds face intensifying competition from fund mergers, Your Future Your Super performance tests, and rising member expectations for digital-first experiences. Funds must grow funds under management through employer acquisition, member retention, and superior net returns while demonstrating value through personalised engagement and transparent investment reporting.",
      priorities: [
        {
          name: "Member Acquisition & Retention",
          useCases: [
            {
              name: "Member 360",
              description:
                "Build a unified view of each member across accumulation accounts, pension accounts, insurance cover, employer relationships, and digital interactions to power personalised engagement and next-best-action decisioning.",
              typicalDataEntities: [
                "Member Profiles",
                "Account Balances",
                "Employer Links",
                "Insurance Cover",
                "Interaction History",
                "Beneficiary Records",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "CRM",
                "Insurance Admin System",
                "Digital Platform",
              ],
            },
            {
              name: "Churn & Rollover Prediction",
              description:
                "Use ML models to predict members at risk of rolling out to a competitor fund or SMSF, enabling proactive retention outreach before consolidation events.",
              businessValue:
                "Reducing rollover outflows by even 1% can retain tens of millions in FUM for a large fund.",
              typicalDataEntities: [
                "Member Activity Logs",
                "Rollover History",
                "Contribution Patterns",
                "Engagement Scores",
                "Competitor Signals",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "ATO SuperMatch Data",
                "CRM",
                "Digital Platform",
              ],
            },
            {
              name: "Employer Engagement Analytics",
              description:
                "Analyse employer contribution patterns, default fund retention rates, and employer segment profitability to prioritise relationship management and win new employer mandates.",
              typicalDataEntities: [
                "Employer Profiles",
                "Contribution Streams",
                "Default Fund Agreements",
                "Payroll Integration Status",
                "Employer Satisfaction Scores",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Employer Portal",
                "CRM",
                "Clearing House",
              ],
            },
            {
              name: "Choice of Fund Optimisation",
              description:
                "Analyse member switching behaviour, choice-of-fund election patterns, and competitor benchmarking to improve acquisition funnels and retain members exercising choice.",
              typicalDataEntities: [
                "Choice Elections",
                "Fund Comparison Data",
                "Member Demographics",
                "Acquisition Channel Attribution",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "ATO SuperStream",
                "Digital Platform",
                "Marketing Platform",
              ],
            },
          ],
          kpis: [
            "Net member growth rate",
            "Rollover-out ratio (% of FUM lost to competitor funds)",
            "Employer default fund win rate",
            "Member retention rate at 12 months",
          ],
          personas: [
            "Chief Member Officer",
            "Head of Growth & Partnerships",
            "Head of Employer Relationships",
            "Head of Digital",
          ],
        },
        {
          name: "Investment Performance & Reporting",
          useCases: [
            {
              name: "Investment Performance Attribution",
              description:
                "Decompose portfolio returns by asset class, manager, sector, and factor exposure to explain performance drivers and support investment committee reporting.",
              typicalDataEntities: [
                "Portfolio Holdings",
                "Benchmark Returns",
                "Manager Allocations",
                "Factor Exposures",
                "Attribution Results",
              ],
              typicalSourceSystems: [
                "Custody Platform",
                "Investment Management System",
                "Market Data Provider",
                "Performance Analytics Engine",
              ],
            },
            {
              name: "Strategic & Tactical Asset Allocation Analytics",
              description:
                "Model SAA/TAA scenarios using historical returns, risk metrics, and forward-looking assumptions to optimise long-horizon portfolio construction for member cohorts.",
              typicalDataEntities: [
                "Asset Class Returns",
                "Risk Metrics",
                "Correlation Matrices",
                "Liability Profiles",
                "Scenario Parameters",
              ],
              typicalSourceSystems: ["Custody Platform", "ALM Platform", "Market Data Provider"],
            },
            {
              name: "Member Investment Choice Analytics",
              description:
                "Analyse member investment option selections, switching frequency, and lifecycle stage alignment to improve product design and identify members in inappropriate risk profiles.",
              businessValue:
                "Proactive outreach to members in misaligned options improves retirement outcomes and reduces regulatory risk.",
              typicalDataEntities: [
                "Investment Option Elections",
                "Switching History",
                "Member Age Profiles",
                "Option Performance",
                "Lifecycle Stage",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Investment Management System",
                "Digital Platform",
              ],
            },
            {
              name: "ESG & Responsible Investment Analytics",
              description:
                "Track and report ESG scores, carbon footprint, and responsible investment commitments across the portfolio to meet member expectations and regulatory disclosure requirements.",
              typicalDataEntities: [
                "ESG Ratings",
                "Carbon Metrics",
                "Stewardship Activities",
                "Exclusion Lists",
                "Impact Metrics",
              ],
              typicalSourceSystems: [
                "ESG Data Provider",
                "Custody Platform",
                "Investment Management System",
              ],
            },
          ],
          kpis: [
            "Net investment return vs benchmark (1yr, 5yr, 10yr)",
            "APRA Performance Test ranking",
            "Investment cost ratio (bps)",
            "ESG disclosure completeness",
          ],
          personas: [
            "Chief Investment Officer",
            "Head of Investment Operations",
            "Head of Investment Strategy",
            "Chief Financial Officer",
          ],
        },
        {
          name: "Digital Member Engagement",
          useCases: [
            {
              name: "Personalised Digital Experience",
              description:
                "Deliver tailored content, projections, and nudges through the member portal and app based on lifecycle stage, balance, contribution behaviour, and engagement history.",
              typicalDataEntities: [
                "Member Profiles",
                "Digital Interaction Logs",
                "Content Preferences",
                "Retirement Projections",
                "Engagement Scores",
              ],
              typicalSourceSystems: [
                "Digital Platform",
                "Member Administration System",
                "CRM",
                "Content Management System",
              ],
            },
            {
              name: "Retirement Income Planning Tools",
              description:
                "Provide interactive modelling tools that let members explore drawdown strategies, Age Pension entitlements, and projected income streams under different scenarios.",
              businessValue:
                "Members who engage with planning tools are 3x more likely to consolidate additional balances into the fund.",
              typicalDataEntities: [
                "Member Balances",
                "Contribution Projections",
                "Age Pension Parameters",
                "Tax Rules",
                "Scenario Models",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Financial Planning Engine",
                "Digital Platform",
              ],
            },
            {
              name: "Financial Wellness & Advice Nudges",
              description:
                "Use behavioural analytics to identify members who would benefit from contribution increases, insurance reviews, or beneficiary updates and deliver contextual nudges via digital channels.",
              typicalDataEntities: [
                "Contribution History",
                "Insurance Cover",
                "Beneficiary Status",
                "Salary Estimates",
                "Nudge Response History",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Insurance Admin System",
                "Digital Platform",
                "Marketing Automation",
              ],
            },
          ],
          kpis: [
            "Digital engagement rate (monthly active members)",
            "Retirement calculator completion rate",
            "Voluntary contribution uplift from nudges",
            "App NPS score",
          ],
          personas: [
            "Head of Digital",
            "Head of Member Experience",
            "Chief Marketing Officer",
            "Head of Advice",
          ],
        },
      ],
    },
    {
      name: "Protect the Fund",
      whyChange:
        "Superannuation funds operate under intense APRA prudential oversight with annual performance tests, Best Financial Interests Duty obligations, and growing scrutiny of insurance claims handling. Robust compliance, fraud detection, and risk management capabilities are essential to maintain licence, protect member assets, and preserve trustee reputation.",
      priorities: [
        {
          name: "APRA Prudential Compliance",
          useCases: [
            {
              name: "APRA Performance Test Analytics",
              description:
                "Build automated dashboards tracking MySuper and Trustee-Directed Product performance against APRA benchmarks, with early-warning alerts when products approach underperformance thresholds.",
              businessValue:
                "Failing the APRA performance test triggers member notification requirements and potential product closure — early detection is critical.",
              typicalDataEntities: [
                "Product Returns",
                "APRA Benchmark Indices",
                "Fee Structures",
                "Asset Allocation Weights",
                "Test Result History",
              ],
              typicalSourceSystems: [
                "Investment Management System",
                "Custody Platform",
                "APRA Reporting System",
                "Fee Management System",
              ],
            },
            {
              name: "Member Outcome Assessments",
              description:
                "Automate the annual member outcomes assessment process mandated by SPS 515, measuring whether products and services are delivering appropriate outcomes for member cohorts.",
              typicalDataEntities: [
                "Member Demographics",
                "Product Holdings",
                "Fee Impact Analysis",
                "Insurance Utilisation",
                "Service Metrics",
                "Peer Comparisons",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Investment Management System",
                "Insurance Admin System",
                "APRA Returns",
              ],
            },
            {
              name: "Regulatory Reporting Automation",
              description:
                "Automate production of APRA SRS returns, ATO reporting, and ASIC disclosure documents with end-to-end data lineage and reconciliation controls.",
              typicalDataEntities: [
                "SRS Return Data",
                "Member Statistics",
                "Financial Statements",
                "Contribution Data",
                "Tax Reporting Data",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "General Ledger",
                "Custody Platform",
                "Tax Engine",
                "APRA Reporting System",
              ],
            },
            {
              name: "Best Financial Interests Duty Analytics",
              description:
                "Monitor expenditure decisions, related-party transactions, and service provider costs against the Best Financial Interests Duty framework to ensure every dollar spent demonstrably benefits members.",
              typicalDataEntities: [
                "Expenditure Records",
                "Related Party Register",
                "Cost-Benefit Analyses",
                "Member Impact Assessments",
                "Board Decision Logs",
              ],
              typicalSourceSystems: [
                "General Ledger",
                "Procurement System",
                "Board Papers System",
                "Compliance Platform",
              ],
            },
          ],
          kpis: [
            "APRA Performance Test pass/fail status by product",
            "SRS return submission timeliness (days before deadline)",
            "Member outcome assessment rating by cohort",
            "BFID expenditure review coverage (%)",
          ],
          personas: [
            "Chief Risk Officer",
            "Head of Regulatory Affairs",
            "Chief Financial Officer",
            "Head of Governance",
          ],
        },
        {
          name: "Insurance Claims & Fraud",
          useCases: [
            {
              name: "Group Insurance Claims Management",
              description:
                "Streamline end-to-end claims processing for death, TPD, and income protection claims within the super fund's group insurance arrangements, tracking insurer SLAs and member communication touchpoints.",
              typicalDataEntities: [
                "Claims Data",
                "Insurance Cover Details",
                "Medical Assessments",
                "Insurer SLA Metrics",
                "Member Communications",
              ],
              typicalSourceSystems: [
                "Insurance Admin System",
                "Claims Management System",
                "Document Management",
                "Group Insurer Portal",
              ],
            },
            {
              name: "Death & TPD Claims Triage",
              description:
                "Use predictive models to triage incoming death and total permanent disability claims by complexity, automatically routing straightforward claims for expedited processing and flagging complex cases for specialist review.",
              businessValue:
                "Faster claims resolution directly improves member/beneficiary outcomes during vulnerable life events.",
              typicalDataEntities: [
                "Claim Attributes",
                "Historical Outcomes",
                "Complexity Indicators",
                "Medical Evidence",
                "Policy Terms",
              ],
              typicalSourceSystems: [
                "Claims Management System",
                "Insurance Admin System",
                "Document Management",
              ],
            },
            {
              name: "Income Protection Return-to-Work Analytics",
              description:
                "Analyse income protection claim durations, rehabilitation program effectiveness, and return-to-work rates to optimise support programs and manage claims costs.",
              typicalDataEntities: [
                "IP Claim Duration",
                "Rehabilitation Plans",
                "Return-to-Work Outcomes",
                "Occupation Data",
                "Insurer Payments",
              ],
              typicalSourceSystems: [
                "Claims Management System",
                "Rehabilitation Provider Portal",
                "Insurance Admin System",
              ],
            },
            {
              name: "Insurance Claims Fraud Detection",
              description:
                "Apply ML models and network analysis to detect suspicious patterns across group insurance claims, identifying potential fraud rings or serial claimants.",
              typicalDataEntities: [
                "Claims History",
                "Claimant Networks",
                "Provider Patterns",
                "Anomaly Scores",
                "Investigation Outcomes",
              ],
              typicalSourceSystems: [
                "Claims Management System",
                "Insurance Admin System",
                "Fraud Detection Engine",
              ],
            },
          ],
          kpis: [
            "Average claims processing time (days)",
            "Claims decision overturn rate",
            "Income protection return-to-work rate",
            "Fraud detection rate",
          ],
          personas: [
            "Head of Insurance",
            "Head of Claims",
            "Chief Risk Officer",
            "Head of Member Services",
          ],
        },
        {
          name: "AML/KYC & Financial Crime",
          useCases: [
            {
              name: "Member Identity Verification",
              description:
                "Automate member identity verification at onboarding, rollover, and benefit payment using digital ID checks, reducing manual effort while meeting AML/CTF obligations.",
              typicalDataEntities: [
                "Identity Documents",
                "Verification Results",
                "Watchlist Matches",
                "Risk Ratings",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Identity Verification Service",
                "AML Platform",
              ],
            },
            {
              name: "Anti-Money Laundering Monitoring",
              description:
                "Monitor contribution patterns, early release requests, and benefit payments for AML red flags, with automated suspicious matter reporting to AUSTRAC.",
              typicalDataEntities: [
                "Transaction Patterns",
                "Contribution Anomalies",
                "Early Release Requests",
                "Benefit Payments",
                "Suspicious Matter Reports",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "AML Platform",
                "Payments System",
                "AUSTRAC Reporting",
              ],
            },
            {
              name: "Suspicious Matter Reporting",
              description:
                "Automate the detection, investigation, and lodgement of suspicious matter reports (SMRs) with AUSTRAC, including full audit trail and case management.",
              typicalDataEntities: [
                "SMR Records",
                "Investigation Files",
                "Transaction Evidence",
                "Lodgement Confirmations",
                "Case Notes",
              ],
              typicalSourceSystems: [
                "AML Platform",
                "Case Management System",
                "Member Administration System",
                "AUSTRAC Portal",
              ],
            },
          ],
          kpis: [
            "Identity verification straight-through rate",
            "AML alert false positive rate",
            "SMR lodgement timeliness",
            "Regulatory examination findings",
          ],
          personas: [
            "Chief Compliance Officer",
            "Head of Financial Crime",
            "Chief Risk Officer",
            "Head of Legal",
          ],
        },
      ],
    },
    {
      name: "Operate Efficiently",
      whyChange:
        "With fee pressure from APRA performance tests and member advocacy groups, super funds must ruthlessly drive down cost-to-serve while maintaining service quality. Fund mergers create integration complexity. Automation, digital self-service, and operational analytics are essential to reduce administration costs that directly erode member returns.",
      priorities: [
        {
          name: "Member Administration Automation",
          useCases: [
            {
              name: "Contribution Processing Automation",
              description:
                "Automate end-to-end contribution processing from SuperStream receipt through allocation, validation, and reconciliation, reducing manual exception handling.",
              typicalDataEntities: [
                "Contribution Messages",
                "Employer Records",
                "Member Accounts",
                "Allocation Rules",
                "Exception Queues",
              ],
              typicalSourceSystems: [
                "SuperStream Gateway",
                "Clearing House",
                "Member Administration System",
                "Employer Portal",
              ],
            },
            {
              name: "Rollover & Consolidation Processing",
              description:
                "Streamline inbound and outbound rollover processing and proactive account consolidation campaigns, leveraging ATO SuperMatch data to identify lost or duplicate accounts.",
              typicalDataEntities: [
                "Rollover Requests",
                "ATO SuperMatch Data",
                "Member Accounts",
                "Lost Member Records",
                "Consolidation Outcomes",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "ATO SuperStream",
                "ATO SuperMatch",
                "CRM",
              ],
            },
            {
              name: "Beneficiary Management",
              description:
                "Analyse binding and non-binding beneficiary nomination completeness, validity, and staleness across the membership base, and trigger proactive reviews for life events.",
              typicalDataEntities: [
                "Beneficiary Nominations",
                "Member Life Events",
                "Nomination Validity",
                "Dependant Records",
                "Review Triggers",
              ],
              typicalSourceSystems: ["Member Administration System", "CRM", "Document Management"],
            },
            {
              name: "Fund Merger Data Integration",
              description:
                "Manage data migration, member mapping, and system integration during successor fund transfers, with reconciliation dashboards tracking data quality across the merged estates.",
              businessValue:
                "Clean data integration post-merger is critical to avoid regulatory breaches and member service disruptions.",
              typicalDataEntities: [
                "Legacy Member Records",
                "Account Mappings",
                "Product Translations",
                "Data Quality Scores",
                "Reconciliation Reports",
              ],
              typicalSourceSystems: [
                "Legacy Admin System",
                "Target Admin System",
                "Data Migration Platform",
                "Data Quality Engine",
              ],
            },
          ],
          kpis: [
            "Contribution straight-through processing rate",
            "Rollover processing time (hours)",
            "Beneficiary nomination completeness (%)",
            "Post-merger data quality score",
          ],
          personas: [
            "Chief Operating Officer",
            "Head of Operations",
            "Head of Member Services",
            "Head of Transformation",
          ],
        },
        {
          name: "Retirement Income Operations",
          useCases: [
            {
              name: "Account-Based Pension Analytics",
              description:
                "Analyse pension drawdown patterns, minimum payment compliance, commutation trends, and reversionary pension utilisation to optimise retirement product design and member communications.",
              typicalDataEntities: [
                "Pension Accounts",
                "Drawdown History",
                "Minimum Payment Rules",
                "Commutation Records",
                "Reversionary Details",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Pension Platform",
                "Tax Engine",
              ],
            },
            {
              name: "Longevity Risk Modelling",
              description:
                "Model member cohort longevity using demographic, health, and behavioural data to inform product pricing, reserve adequacy, and retirement income sustainability projections.",
              typicalDataEntities: [
                "Mortality Tables",
                "Member Demographics",
                "Health Indicators",
                "Drawdown Rates",
                "Reserve Projections",
              ],
              typicalSourceSystems: [
                "Actuarial Platform",
                "Member Administration System",
                "External Mortality Data",
              ],
            },
            {
              name: "Drawdown Pattern Analytics",
              description:
                "Identify members drawing down too quickly or too conservatively relative to their balance and life expectancy, enabling targeted advice nudges and wellbeing interventions.",
              typicalDataEntities: [
                "Drawdown Rates",
                "Balance Trajectories",
                "Life Expectancy Estimates",
                "Income Needs",
                "Intervention History",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Financial Planning Engine",
                "Digital Platform",
              ],
            },
            {
              name: "Retirement Income Covenant Compliance",
              description:
                "Track and report on the fund's retirement income strategy implementation, measuring how well products and services meet the covenant's objectives of maximising income, managing risk, and providing flexibility.",
              typicalDataEntities: [
                "Covenant Metrics",
                "Product Utilisation",
                "Member Satisfaction",
                "Income Adequacy Measures",
                "Strategy Implementation Status",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Investment Management System",
                "Compliance Platform",
                "Survey Platform",
              ],
            },
          ],
          kpis: [
            "Retirement income adequacy ratio",
            "Pension minimum payment compliance rate",
            "Average drawdown rate vs sustainable benchmark",
            "Retirement income covenant metric coverage",
          ],
          personas: ["Head of Retirement", "Chief Actuary", "Head of Product", "Head of Advice"],
        },
        {
          name: "Cost & Operations",
          useCases: [
            {
              name: "Cost-to-Serve Analytics",
              description:
                "Build granular cost attribution models allocating administration costs to member segments, products, and service channels to identify cost reduction opportunities and inform fee structures.",
              typicalDataEntities: [
                "Activity-Based Costs",
                "Service Volumes",
                "Channel Utilisation",
                "Product Costs",
                "Member Segment Profitability",
              ],
              typicalSourceSystems: [
                "General Ledger",
                "Member Administration System",
                "Contact Centre Platform",
                "Cost Allocation System",
              ],
            },
            {
              name: "Contact Centre Intelligence",
              description:
                "Analyse call volumes, reason codes, resolution rates, and member sentiment to optimise staffing, identify self-service deflection opportunities, and improve first-contact resolution.",
              typicalDataEntities: [
                "Call Records",
                "Reason Codes",
                "Resolution Outcomes",
                "Wait Times",
                "Sentiment Scores",
                "Agent Performance",
              ],
              typicalSourceSystems: [
                "Contact Centre Platform",
                "CRM",
                "Speech Analytics Engine",
                "Workforce Management",
              ],
            },
            {
              name: "Straight-Through Processing Analytics",
              description:
                "Measure and optimise end-to-end STP rates across key transaction types (contributions, rollovers, benefit payments, insurance claims), identifying bottlenecks that drive manual intervention.",
              typicalDataEntities: [
                "Transaction Volumes",
                "Exception Rates",
                "Processing Times",
                "Manual Intervention Points",
                "STP Rates by Type",
              ],
              typicalSourceSystems: [
                "Member Administration System",
                "Workflow System",
                "Payments System",
                "Insurance Admin System",
              ],
            },
          ],
          kpis: [
            "Administration cost per member",
            "Contact centre first-contact resolution rate",
            "Overall STP rate across transaction types",
            "Cost-to-income ratio",
          ],
          personas: [
            "Chief Operating Officer",
            "Chief Financial Officer",
            "Head of Service Delivery",
            "Head of Transformation",
          ],
        },
      ],
    },
  ],
};
