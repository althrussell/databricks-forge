/**
 * Industry Outcome Maps -- Structured Knowledge Base
 *
 * Curated extraction from the 10 industry outcome maps in /docs/outcome maps/.
 * Each industry contains strategic objectives, priorities, reference use cases,
 * KPIs, and personas used to enrich the pipeline prompts.
 *
 * This is NOT a full copy of the documents -- it captures the most actionable
 * use cases and strategic context for prompt injection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferenceUseCase {
  name: string;
  description: string;
  businessValue?: string;
  /** Typical data entities/models needed to enable this use case */
  typicalDataEntities?: string[];
  /** Common source systems where this data typically resides */
  typicalSourceSystems?: string[];
}

export interface StrategicPriority {
  name: string;
  useCases: ReferenceUseCase[];
  
  kpis: string[];
  personas: string[];
}

export interface IndustryObjective {
  name: string;
  whyChange: string;
  priorities: StrategicPriority[];
}

export interface IndustryOutcome {
  id: string;
  name: string;
  subVerticals?: string[];
  objectives: IndustryObjective[];
  /** Suggested business domains when this industry is selected. */
  suggestedDomains: string[];
  /** Suggested business priorities when this industry is selected. */
  suggestedPriorities: string[];
}

// ---------------------------------------------------------------------------
// Industry Data
// ---------------------------------------------------------------------------

const BANKING: IndustryOutcome = {
  id: "banking",
  name: "Banking & Payments",
  subVerticals: [
    "Retail Banking",
    "Commercial Banking",
    "Wealth Management",
    "Payments",
    "Capital Markets",
  ],
  suggestedDomains: [
    "Finance",
    "Risk & Compliance",
    "Marketing",
    "Operations",
    "Customer Experience",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Mitigate Risk",
    "Reduce Cost",
    "Enhance Experience",
  ],
  objectives: [
    {
      name: "Drive Growth",
      whyChange:
        "Retail banking is being reshaped by fintech disruptors, open banking, and digital-first customer expectations. Banks must modernize payment systems, leverage AI for hyper-personalized services, and unify fragmented customer data while ensuring compliance.",
      priorities: [
        {
          name: "Hyper Personalization & Lead Management",
          useCases: [
            {
              name: "Prospecting & Campaign Development",
              description:
                "Utilize data analytics to identify potential customers and tailor marketing campaigns that resonate with their needs, enhancing engagement and conversion rates.",
              businessValue:
                "Increased customer acquisition through targeted campaigns.",
              typicalDataEntities: ["Customer Demographics", "Campaign Interactions", "Lead Scores", "Product Holdings"],
              typicalSourceSystems: ["Salesforce CRM", "Adobe Campaign", "Core Banking Platform"],
            },
            {
              name: "Hyper Personalized Banking",
              description:
                "Leverage AI and customer data to deliver tailored banking experiences, improving customer satisfaction and loyalty through personalized insights and recommendations.",
              typicalDataEntities: ["Customer Profiles", "Transaction History", "Product Holdings", "Channel Interactions"],
              typicalSourceSystems: ["Core Banking Platform", "CRM", "Digital Banking Platform"],
            },
            {
              name: "Cross Sell and Upsell Products",
              description:
                "Implement targeted strategies to offer complementary or upgraded products to existing customers, boosting revenue and customer retention.",
              typicalDataEntities: ["Customer Profiles", "Product Catalog", "Transaction History", "Propensity Scores"],
              typicalSourceSystems: ["Core Banking Platform", "Product Management System", "CRM"],
            },
            {
              name: "Churn Prediction and Customer Segmentation",
              description:
                "Use ML models to predict customer churn and segment the customer base effectively, enabling proactive retention efforts and tailored service offerings.",
              typicalDataEntities: ["Customer Profiles", "Transaction History", "Engagement Metrics", "Churn Risk Scores"],
              typicalSourceSystems: ["Core Banking Platform", "CRM", "Digital Banking Platform"],
            },
          ],
          kpis: [
            "Personalizing customer experiences",
            "Optimizing marketing spend",
            "Measuring campaign effectiveness",
          ],
          personas: [
            "Head of Consumer Banking",
            "Head of Marketing Strategy",
            "Head of Customer Experience",
            "Head of Digital Banking",
          ],
        },
        {
          name: "Cards & Payments Innovation",
          useCases: [
            {
              name: "Partner Offers and Rewards",
              description:
                "Leverage customer transaction data to deliver personalized offers, rewards, and cashback opportunities in collaboration with partner merchants.",
              typicalDataEntities: ["Transaction History", "Merchant Data", "Reward Programs", "Customer Preferences"],
              typicalSourceSystems: ["Core Banking Platform", "Card Network", "Loyalty Platform"],
            },
            {
              name: "Transaction Enrichment",
              description:
                "Automate the classification of merchants from transaction data to deliver clearer insights into spending patterns.",
              typicalDataEntities: ["Transaction Data", "Merchant Classifications", "Spending Categories", "Customer Profiles"],
              typicalSourceSystems: ["Core Banking Platform", "Card Network", "Merchant Directory"],
            },
            {
              name: "Open Banking Integration",
              description:
                "Create seamless data-sharing ecosystems between market participants and banking aggregators through APIs and data sharing.",
              typicalDataEntities: ["Account Data", "Transaction History", "Consent Records", "API Usage Logs"],
              typicalSourceSystems: ["Core Banking Platform", "Open Banking Gateway", "API Management Platform"],
            },
            {
              name: "Data Monetization",
              description:
                "Generate new revenue streams by leveraging anonymized customer data to deliver insights and create value for third-party partners.",
              typicalDataEntities: ["Aggregated Customer Data", "Market Insights", "Consent Records", "Usage Analytics"],
              typicalSourceSystems: ["Core Banking Platform", "Data Marketplace", "API Gateway"],
            },
          ],
          kpis: [
            "Increasing cardholder acquisition and retention",
            "Reducing processing costs",
            "Optimizing payment transaction flows",
          ],
          personas: [
            "Head of Consumer Banking",
            "Head of Payments / Operations",
            "Head of Innovation & Product Strategy",
            "Head of Digital Banking",
          ],
        },
        {
          name: "Loans & Personal Investment",
          useCases: [
            {
              name: "Mortgage/Loan Origination Automation",
              description:
                "Streamline and automate loan onboarding and origination processes, reducing operational costs by 30-70% while enhancing the customer experience through faster approvals.",
              businessValue:
                "Up to 45% increase in conversion rates for loan offerings.",
              typicalDataEntities: ["Loan Applications", "Credit Reports", "Income Verification", "Property Valuations"],
              typicalSourceSystems: ["Loan Origination System", "Credit Bureau", "Core Banking Platform"],
            },
            {
              name: "SMB and Corporate Banking Innovation",
              description:
                "Leverage data and AI to provide tailored financial products and services for small and medium businesses.",
              typicalDataEntities: ["Business Profiles", "Cash Flow Data", "Industry Benchmarks", "Product Suitability"],
              typicalSourceSystems: ["Core Banking Platform", "Treasury Management", "ERP Systems"],
            },
          ],
          kpis: [
            "Loan conversion rates",
            "Processing time reduction",
            "Straight-through processing rates",
          ],
          personas: [
            "Head of Lending",
            "Head of Consumer Banking",
            "Head of Risk Management",
          ],
        },
      ],
    },
    {
      name: "Protect the Firm",
      whyChange:
        "Escalating regulatory pressures and severe financial and reputational risks of non-compliance drive the need for sophisticated, real-time data capabilities for AML, KYC, and fraud detection. Recent multi-billion dollar penalties underscore the urgency.",
      priorities: [
        {
          name: "Risk Management",
          useCases: [
            {
              name: "Dynamic Pricing",
              description:
                "Implement dynamic pricing strategies to adjust loan rates based on real-time risk assessments and customer profiles.",
              typicalDataEntities: ["Customer Risk Profiles", "Market Rates", "Product Terms", "Competitive Intelligence"],
              typicalSourceSystems: ["Core Banking Platform", "Risk Engine", "Pricing System"],
            },
            {
              name: "Credit Decisioning",
              description:
                "Utilize advanced analytics and ML to streamline credit decisioning, improving accuracy in assessing borrower risk.",
              typicalDataEntities: ["Credit Reports", "Application Data", "Payment History", "Bureau Scores"],
              typicalSourceSystems: ["Core Banking Platform", "Credit Bureau", "Loan Origination System"],
            },
            {
              name: "Credit Limit Management",
              description:
                "Leverage data-driven insights to proactively assess and adjust credit limits based on customer behavior and creditworthiness.",
              typicalDataEntities: ["Credit Utilization", "Payment History", "Income Data", "Risk Scores"],
              typicalSourceSystems: ["Core Banking Platform", "Credit Bureau", "Risk Engine"],
            },
            {
              name: "Debt Collection Optimization",
              description:
                "Employ predictive analytics to optimize debt collection strategies, identifying the most effective approaches for different customer segments.",
              typicalDataEntities: ["Delinquency History", "Customer Contact Data", "Payment Propensity", "Collection Outcomes"],
              typicalSourceSystems: ["Core Banking Platform", "Collections System", "CRM"],
            },
          ],
          kpis: [
            "Assessing customer creditworthiness",
            "Managing portfolio risk under market fluctuations",
            "Ensuring data transparency for regulators",
          ],
          personas: [
            "Head of Credit Risk Management",
            "Head of Consumer/Commercial Banking",
            "Head of Enterprise Risk Management",
          ],
        },
        {
          name: "Regulatory Compliance",
          useCases: [
            {
              name: "AML/KYC Automation",
              description:
                "Automate anti-money laundering and know-your-customer processes using AI to improve detection accuracy and reduce false positives.",
              typicalDataEntities: ["Customer Identity Data", "Transaction History", "Watchlist Matches", "Suspicious Activity Reports"],
              typicalSourceSystems: ["Core Banking Platform", "AML/KYC Platform", "Identity Verification Services"],
            },
            {
              name: "Regulatory Reporting Automation",
              description:
                "Streamline regulatory reporting processes with automated data pipelines, ensuring accuracy and timeliness of submissions.",
              typicalDataEntities: ["Regulatory Data", "General Ledger", "Risk Exposures", "Transaction Summaries"],
              typicalSourceSystems: ["Core Banking Platform", "ERP", "Regulatory Reporting System"],
            },
            {
              name: "Compliance Monitoring",
              description:
                "Implement real-time compliance monitoring systems that detect potential violations before they escalate.",
              typicalDataEntities: ["Transaction Logs", "Policy Rules", "Employee Actions", "Exception Reports"],
              typicalSourceSystems: ["Core Banking Platform", "Compliance Management System", "Audit Logs"],
            },
          ],
          kpis: [
            "False positive rate reduction",
            "Regulatory submission timeliness",
            "Compliance cost reduction",
          ],
          personas: [
            "Chief Compliance Officer",
            "Head of Regulatory Affairs",
            "Head of AML",
          ],
        },
        {
          name: "Fraud Prevention",
          useCases: [
            {
              name: "Real-Time Transaction Monitoring",
              description:
                "Monitor transactions in real-time to detect fraud and anomalies using AI models, reducing financial losses.",
              typicalDataEntities: ["Transaction Stream", "Customer Profiles", "Device Data", "Historical Patterns"],
              typicalSourceSystems: ["Core Banking Platform", "Fraud Detection Engine", "Card Network"],
            },
            {
              name: "Identity Fraud Detection",
              description:
                "Use ML to detect identity fraud and synthetic identities during account opening and transactions.",
              typicalDataEntities: ["Identity Documents", "Application Data", "Device Fingerprints", "Behavioral Biometrics"],
              typicalSourceSystems: ["Core Banking Platform", "Identity Verification Services", "Fraud Detection Engine"],
            },
            {
              name: "Network Fraud Analysis",
              description:
                "Apply graph analytics to uncover fraud rings and complex fraud networks across customer relationships.",
              typicalDataEntities: ["Customer Relationships", "Transaction Networks", "Account Linkages", "Shared Attributes"],
              typicalSourceSystems: ["Core Banking Platform", "Fraud Detection Engine", "Graph Analytics Platform"],
            },
          ],
          kpis: [
            "Fraud detection rate",
            "False positive reduction",
            "Loss prevention amount",
          ],
          personas: [
            "Head of Fraud Prevention",
            "Chief Risk Officer",
            "Chief Information Security Officer",
          ],
        },
      ],
    },
    {
      name: "Operate Efficiently",
      whyChange:
        "Banks face pressure to reduce costs while improving service quality. Automation, AI-powered analytics, and channel optimization are essential to maintaining competitiveness in an increasingly digital landscape.",
      priorities: [
        {
          name: "CFO & Treasury",
          useCases: [
            {
              name: "Financial Reporting Automation",
              description:
                "Automate financial reporting with real-time data pipelines, improving accuracy and reducing manual effort.",
              typicalDataEntities: ["General Ledger", "Trial Balance", "Chart of Accounts", "Reconciliation Data"],
              typicalSourceSystems: ["Core Banking Platform", "ERP", "Financial Consolidation System"],
            },
            {
              name: "Liquidity Management",
              description:
                "Use predictive models to optimize liquidity management and cash flow forecasting across the organization.",
              typicalDataEntities: ["Cash Positions", "Funding Sources", "Liquidity Buffers", "Stress Scenarios"],
              typicalSourceSystems: ["Core Banking Platform", "Treasury Management System", "ALM Platform"],
            },
          ],
          kpis: [
            "Reporting cycle time",
            "Forecast accuracy",
            "Cost-to-income ratio",
          ],
          personas: [
            "Chief Financial Officer",
            "Head of Treasury",
            "Head of Finance Operations",
          ],
        },
        {
          name: "Back/Middle Office Automation",
          useCases: [
            {
              name: "Intelligent Document Processing",
              description:
                "Use AI to extract, classify, and process information from unstructured documents like contracts, applications, and correspondence.",
              typicalDataEntities: ["Document Metadata", "Extracted Fields", "Classification Labels", "Workflow State"],
              typicalSourceSystems: ["Document Management System", "Core Banking Platform", "Content Repository"],
            },
            {
              name: "Process Mining and Optimization",
              description:
                "Analyze operational processes to identify bottlenecks and optimize workflows across back and middle office functions.",
              typicalDataEntities: ["Process Event Logs", "Workflow State", "Task Durations", "Resource Utilization"],
              typicalSourceSystems: ["Core Banking Platform", "BPM/Workflow System", "ERP"],
            },
          ],
          kpis: [
            "Process automation rate",
            "Cost per transaction",
            "Error rate reduction",
          ],
          personas: [
            "Chief Operating Officer",
            "Head of Operations",
            "Head of Transformation",
          ],
        },
        {
          name: "Call Center & Channel Optimization",
          useCases: [
            {
              name: "Customer Service AI Agent",
              description:
                "Deploy AI agents to handle routine customer inquiries, reducing wait times and freeing human agents for complex issues.",
              typicalDataEntities: ["Customer Profiles", "Account Data", "Interaction History", "Knowledge Base"],
              typicalSourceSystems: ["Core Banking Platform", "CRM", "Contact Center Platform"],
            },
            {
              name: "Channel Performance Analytics",
              description:
                "Analyze performance across digital and physical channels to optimize resource allocation and customer experience.",
              typicalDataEntities: ["Channel Interactions", "Transaction Volumes", "Customer Journeys", "Conversion Funnels"],
              typicalSourceSystems: ["Digital Banking Platform", "Branch Systems", "CRM"],
            },
          ],
          kpis: [
            "First contact resolution rate",
            "Average handling time",
            "Customer satisfaction score",
          ],
          personas: [
            "Head of Customer Service",
            "Head of Digital Channels",
            "Chief Operating Officer",
          ],
        },
      ],
    },
  ],
};

const INSURANCE: IndustryOutcome = {
  id: "insurance",
  name: "Insurance",
  subVerticals: [
    "Life Insurance",
    "Property & Casualty",
    "Health Insurance",
    "Reinsurance",
    "InsurTech",
  ],
  suggestedDomains: [
    "Underwriting",
    "Claims",
    "Risk & Compliance",
    "Marketing",
    "Customer Experience",
    "Operations",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Mitigate Risk",
    "Reduce Cost",
    "Enhance Experience",
    "Optimize Operations",
  ],
  objectives: [
    {
      name: "Drive Growth",
      whyChange:
        "Insurers must accelerate data transformation driven by rising consumer expectations, competition from insurtechs, and new data sources like IoT sensors and telematics. Cloud technology and advanced analytics are imperative for improving underwriting, pricing, and customer satisfaction.",
      priorities: [
        {
          name: "Distribution Optimization",
          useCases: [
            {
              name: "Distribution Data Model",
              description:
                "Consolidate data from multiple brokerage systems into a common data model for unified reporting and insights.",
              typicalDataEntities: ["Producer Data", "Commission Records", "Policy Placements", "Channel Performance"],
              typicalSourceSystems: ["Agency Management System", "Broker Portals", "Policy Admin System"],
            },
            {
              name: "Producer Analysis",
              description:
                "Analyze broker and agent performance to optimize sales channel effectiveness and commission structures.",
              typicalDataEntities: ["Producer Profiles", "Sales Metrics", "Commission Data", "Policy Production"],
              typicalSourceSystems: ["Agency Management System", "Policy Admin System", "Commission System"],
            },
            {
              name: "Client New/Lost Business Analysis",
              description:
                "Track and analyze new business acquisition and client attrition patterns across distribution channels.",
              typicalDataEntities: ["Policy Inforce", "New Business", "Lapse Data", "Renewal History"],
              typicalSourceSystems: ["Policy Admin System", "Agency Management System", "CRM"],
            },
          ],
          kpis: [
            "Active clients",
            "Average premium",
            "New vs lost business by industry and carrier",
          ],
          personas: [
            "Chief Distribution Officer",
            "Chief Transformation Officer",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Underwriting & Actuarial",
          useCases: [
            {
              name: "Smart Underwriting Triage",
              description:
                "Automate submission review and triage using AI to speed up underwriting decisions and improve risk selection.",
              businessValue:
                "33% increase in policy origination, 25% increase in productivity.",
              typicalDataEntities: ["Submission Data", "Risk Attributes", "Historical Decisions", "Loss History"],
              typicalSourceSystems: ["Policy Admin System", "Underwriting Workstation", "External Data Providers"],
            },
            {
              name: "Touchless Underwriting",
              description:
                "Enable end-to-end digital underwriting for standard risks, reducing manual intervention by over 25%.",
              typicalDataEntities: ["Application Data", "Risk Scores", "Product Rules", "Automated Decisions"],
              typicalSourceSystems: ["Policy Admin System", "Underwriting Engine", "External Data Providers"],
            },
            {
              name: "Telematics-Based Pricing",
              description:
                "Leverage IoT and telematics data for usage-based insurance pricing that rewards good behavior.",
              typicalDataEntities: ["Driving Behavior Data", "Mileage", "Trip Patterns", "Risk Scores"],
              typicalSourceSystems: ["Telematics Platform", "Policy Admin System", "Claims Management System"],
            },
            {
              name: "Actuarial Modeling Automation",
              description:
                "Accelerate actuarial modeling with ML to improve pricing accuracy and reduce time to market for new products.",
              typicalDataEntities: ["Loss Triangles", "Exposure Data", "Rating Factors", "Model Outputs"],
              typicalSourceSystems: ["Policy Admin System", "Actuarial Platform", "Claims Management System"],
            },
          ],
          kpis: [
            "Combined ratio improvement",
            "Underwriting efficiency (15% target)",
            "Policy origination rate",
          ],
          personas: [
            "Chief Underwriting Officer",
            "Chief Actuary",
            "Head of Underwriting Experience",
          ],
        },
        {
          name: "Hyper Personalization & Lead Management",
          useCases: [
            {
              name: "Customer 360 for Insurance",
              description:
                "Build unified customer profiles across all lines of business to enable personalized product recommendations and next-best-action.",
              typicalDataEntities: ["Customer Profiles", "Policy Holdings", "Interaction History", "Product Affinity"],
              typicalSourceSystems: ["Policy Admin System", "CRM", "Claims Management System"],
            },
            {
              name: "Churn Prediction and Retention",
              description:
                "Use ML models to predict policy churn and implement proactive retention strategies.",
              typicalDataEntities: ["Policy Inforce", "Renewal History", "Engagement Metrics", "Churn Risk Scores"],
              typicalSourceSystems: ["Policy Admin System", "CRM", "Customer Portal"],
            },
            {
              name: "Cross-Sell and Upsell",
              description:
                "Identify cross-sell and upsell opportunities across insurance product lines using behavioral analytics.",
              typicalDataEntities: ["Policy Holdings", "Customer Demographics", "Propensity Scores", "Product Catalog"],
              typicalSourceSystems: ["Policy Admin System", "CRM", "Product Management System"],
            },
          ],
          kpis: [
            "Customer lifetime value",
            "Cross-sell rate",
            "Customer retention rate",
          ],
          personas: [
            "Chief Marketing Officer",
            "Head of Customer Experience",
            "Head of Digital",
          ],
        },
      ],
    },
    {
      name: "Protect the Firm",
      whyChange:
        "Insurers face rising fraud costs, evolving regulatory requirements, and increasing cyber threats. AI-powered detection, automated compliance, and robust cybersecurity are essential to protect revenue and maintain customer trust.",
      priorities: [
        {
          name: "Claims & Fraud Prevention",
          useCases: [
            {
              name: "Claims Fraud Detection",
              description:
                "Use ML and network analytics to detect fraudulent claims patterns and reduce loss ratios.",
              typicalDataEntities: ["Claims History", "Policy Details", "Customer Profiles", "Provider Networks"],
              typicalSourceSystems: ["Claims Management System", "Policy Admin System", "Fraud Detection Engine"],
            },
            {
              name: "Automated Claims Processing",
              description:
                "Automate claims intake, assessment, and settlement using AI to reduce processing time and improve accuracy.",
              typicalDataEntities: ["Claims Data", "Policy Coverage", "Damage Assessments", "Settlement History"],
              typicalSourceSystems: ["Claims Management System", "Policy Admin System", "Document Management"],
            },
            {
              name: "Subrogation Recovery Optimization",
              description:
                "Identify subrogation opportunities using analytics to recover costs from third parties.",
            },
          ],
          kpis: [
            "Fraud detection rate",
            "Claims processing time",
            "Loss ratio improvement",
          ],
          personas: [
            "Head of Claims",
            "Head of Fraud Prevention",
            "Chief Risk Officer",
          ],
        },
        {
          name: "Regulatory Compliance",
          useCases: [
            {
              name: "Regulatory Reporting Automation",
              description:
                "Automate regulatory submissions and reporting processes across multiple jurisdictions.",
              typicalDataEntities: ["Regulatory Data", "Policy Summaries", "Claims Data", "Financial Reports"],
              typicalSourceSystems: ["Policy Admin System", "Claims Management System", "Financial Consolidation"],
            },
            {
              name: "Solvency Monitoring",
              description:
                "Monitor solvency ratios and capital adequacy in real-time to ensure compliance with Solvency II and local regulations.",
              typicalDataEntities: ["Capital Positions", "Risk Exposures", "Asset Liability Data", "Regulatory Ratios"],
              typicalSourceSystems: ["General Ledger", "Asset Management", "Risk Management Platform"],
            },
          ],
          kpis: [
            "Regulatory compliance rate",
            "Reporting timeliness",
            "Audit findings reduction",
          ],
          personas: [
            "Chief Compliance Officer",
            "Chief Risk Officer",
            "Chief Financial Officer",
          ],
        },
      ],
    },
    {
      name: "Operate Efficiently",
      whyChange:
        "Operational efficiency is critical for insurers facing margin pressure. Automation of back-office processes, intelligent channel optimization, and AI-powered analytics drive cost reduction and improved service delivery.",
      priorities: [
        {
          name: "Back/Middle Office Automation",
          useCases: [
            {
              name: "Document Intelligence",
              description:
                "Extract and classify information from policy documents, claims forms, and correspondence using AI.",
            },
            {
              name: "Policy Administration Automation",
              description:
                "Automate policy lifecycle management from issuance through renewal and cancellation.",
            },
          ],
          kpis: [
            "Straight-through processing rate",
            "Cost per policy",
            "Processing time reduction",
          ],
          personas: [
            "Chief Operating Officer",
            "Head of Operations",
            "Head of IT",
          ],
        },
      ],
    },
  ],
};

const HLS: IndustryOutcome = {
  id: "hls",
  name: "Healthcare & Life Sciences",
  subVerticals: [
    "Pharmaceuticals",
    "Biotechnology",
    "Medical Devices",
    "Healthcare Providers",
    "Health Insurance / Payers",
  ],
  suggestedDomains: [
    "R&D",
    "Clinical Development",
    "Supply Chain",
    "Manufacturing",
    "Commercial",
    "Patient Services",
  ],
  suggestedPriorities: [
    "Drive Innovation",
    "Reduce Cost",
    "Optimize Operations",
    "Enhance Experience",
    "Mitigate Risk",
  ],
  objectives: [
    {
      name: "Increase R&D Productivity",
      whyChange:
        "Despite tremendous growth in R&D investments, success rates of new drugs have remained flat. Time-to-market averages 12+ years and $2B+ in spend. Delays in launch erode lifetime revenues.",
      priorities: [
        {
          name: "Accelerate Drug Discovery",
          useCases: [
            {
              name: "Genetic Target Identification",
              description:
                "Use genomics data and computational biology to identify promising drug targets with higher probability of clinical success.",
              businessValue:
                "$75.5M value attributed to accelerated genomics access and population-scale analytics.",
              typicalDataEntities: ["Genomic Data", "Target Pathways", "Literature Evidence", "Experimental Results"],
              typicalSourceSystems: ["Genomics Platform", "Research Data Lake", "Scientific Literature DB"],
            },
            {
              name: "QSAR Modeling",
              description:
                "Quantitative Structure-Activity Relationship modeling to predict molecular properties and optimize drug candidates.",
              typicalDataEntities: ["Molecular Structures", "Activity Data", "Chemical Properties", "ADMET Profiles"],
              typicalSourceSystems: ["ELN", "Compound Management", "Research Data Lake"],
            },
            {
              name: "Digital Pathology Image Classification",
              description:
                "Apply computer vision to classify pathology images for disease diagnosis and drug response prediction.",
              typicalDataEntities: ["Pathology Images", "Annotations", "Clinical Outcomes", "Biomarker Data"],
              typicalSourceSystems: ["PACS", "LIMS", "Electronic Health Records"],
            },
          ],
          kpis: [
            "Drug pipeline candidates",
            "Target identification speed",
            "Preclinical success rate",
          ],
          personas: [
            "Head of Research",
            "Chief Scientific Officer",
            "Head of Computational Biology",
          ],
        },
        {
          name: "Streamline Clinical Development",
          useCases: [
            {
              name: "Clinical Trial Protocol Design",
              description:
                "Use AI to optimize clinical trial protocols, improving patient recruitment and reducing trial duration.",
              typicalDataEntities: ["Clinical Trial Data", "Patient Demographics", "Historical Protocols", "Site Data"],
              typicalSourceSystems: ["CTMS", "Electronic Health Records", "Clinical Data Warehouse"],
            },
            {
              name: "Clinical Trial Site Selection",
              description:
                "Leverage analytics to identify optimal trial sites based on patient populations, investigator experience, and historical performance.",
              typicalDataEntities: ["Site Performance", "Patient Populations", "Investigator Profiles", "Enrollment History"],
              typicalSourceSystems: ["CTMS", "Site Feasibility Platform", "Electronic Health Records"],
            },
            {
              name: "Drug Repurposing",
              description:
                "Use AI to identify new therapeutic applications for existing approved drugs, reducing development time and cost.",
              typicalDataEntities: ["Drug Profiles", "Disease Ontologies", "Clinical Outcomes", "Literature Evidence"],
              typicalSourceSystems: ["Clinical Data Warehouse", "Scientific Literature DB", "Pharmacovigilance DB"],
            },
            {
              name: "Clinical Data Quality Assurance",
              description:
                "Automate QA of clinical data pipelines using AI to ensure data integrity and regulatory compliance.",
              typicalDataEntities: ["Clinical Trial Data", "Edit Checks", "Source Data", "Reconciliation Logs"],
              typicalSourceSystems: ["EDC", "CTMS", "Clinical Data Warehouse"],
            },
          ],
          kpis: [
            "Trial enrollment velocity",
            "Protocol amendment rate",
            "Data quality score",
          ],
          personas: [
            "Head of Clinical Development",
            "Chief Medical Officer",
            "VP Clinical Operations",
          ],
        },
        {
          name: "Build a FAIR Data Platform",
          useCases: [
            {
              name: "R&D Knowledge Graph",
              description:
                "Build knowledge graphs connecting research data, literature, and experimental results to accelerate scientific discovery.",
              typicalDataEntities: ["Research Data", "Literature", "Experimental Results", "Entity Relationships"],
              typicalSourceSystems: ["ELN", "Research Data Lake", "Scientific Literature DB"],
            },
            {
              name: "Research Assistant AI",
              description:
                "Deploy AI assistants to help researchers navigate scientific literature and internal research data.",
              typicalDataEntities: ["Scientific Literature", "Research Data", "Patent Data", "Internal Reports"],
              typicalSourceSystems: ["Scientific Literature DB", "Research Data Lake", "ELN"],
            },
          ],
          kpis: [
            "Data findability score",
            "Research collaboration efficiency",
            "Data reuse rate",
          ],
          personas: [
            "Chief Data Officer",
            "Head of Research Informatics",
            "Chief Scientific Officer",
          ],
        },
      ],
    },
    {
      name: "Optimize Supply Chain & Manufacturing",
      whyChange:
        "Life sciences supply chains face unique challenges including cold chain management, regulatory traceability, and demand variability. Smart manufacturing and supply chain visibility are critical for compliance and cost control.",
      priorities: [
        {
          name: "E2E Supply Chain Visibility",
          useCases: [
            {
              name: "Demand Forecasting for Pharmaceuticals",
              description:
                "Predict drug demand across markets using ML models accounting for seasonality, epidemiology, and market dynamics.",
              typicalDataEntities: ["Sales History", "Epidemiology Data", "Market Data", "Inventory Levels"],
              typicalSourceSystems: ["ERP", "Demand Planning", "Market Intelligence"],
            },
            {
              name: "Inventory Optimization",
              description:
                "Optimize inventory levels across the distribution network balancing service levels with expiration risk.",
              typicalDataEntities: ["Inventory Levels", "Demand Forecasts", "Expiration Dates", "Distribution Network"],
              typicalSourceSystems: ["ERP", "WMS", "Demand Planning"],
            },
          ],
          kpis: [
            "Forecast accuracy",
            "OTIF delivery rate",
            "Inventory carrying cost",
          ],
          personas: [
            "VP Supply Chain",
            "Head of Manufacturing",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Smart Manufacturing",
          useCases: [
            {
              name: "Predictive Maintenance for Pharma Equipment",
              description:
                "Predict equipment failures in manufacturing facilities to minimize downtime and maintain GMP compliance.",
              typicalDataEntities: ["Sensor Data", "Maintenance History", "Equipment Metadata", "Batch Records"],
              typicalSourceSystems: ["MES", "CMMS", "SCADA"],
            },
            {
              name: "Overall Equipment Effectiveness (OEE)",
              description:
                "Monitor and optimize manufacturing equipment effectiveness using real-time analytics.",
              typicalDataEntities: ["Equipment Runtime", "Production Output", "Quality Metrics", "Downtime Events"],
              typicalSourceSystems: ["MES", "SCADA", "Quality Management System"],
            },
            {
              name: "Digital Twins for Manufacturing",
              description:
                "Create digital twins of manufacturing processes for simulation, optimization, and quality assurance.",
              typicalDataEntities: ["Process Parameters", "Equipment State", "Batch Data", "Quality Attributes"],
              typicalSourceSystems: ["MES", "SCADA", "LIMS"],
            },
          ],
          kpis: [
            "Equipment uptime",
            "OEE improvement",
            "Batch rejection rate",
          ],
          personas: [
            "Head of Manufacturing",
            "Head of Quality",
            "VP Operations",
          ],
        },
      ],
    },
    {
      name: "Improve Commercial Effectiveness",
      whyChange:
        "Life sciences companies need to generate real-world evidence, deliver personalized engagement to healthcare providers, and improve patient outcomes through data-driven commercial strategies.",
      priorities: [
        {
          name: "Real World Evidence",
          useCases: [
            {
              name: "Data Standardization with OMOP",
              description:
                "Standardize clinical data using OMOP common data model to enable cross-institutional analysis and real-world evidence generation.",
              typicalDataEntities: ["Clinical Data", "EHR Data", "Claims Data", "OMOP Mappings"],
              typicalSourceSystems: ["Electronic Health Records", "Claims Adjudication", "Clinical Data Warehouse"],
            },
            {
              name: "Pharmacovigilance & Adverse Event Detection",
              description:
                "Monitor drug safety using AI to detect adverse events from multiple data sources including social media and EHR data.",
              typicalDataEntities: ["Adverse Event Reports", "Safety Signals", "Patient Data", "Product Labels"],
              typicalSourceSystems: ["Safety Database", "Electronic Health Records", "Social Listening Platform"],
            },
            {
              name: "Patient Cohorting & Propensity Matching",
              description:
                "Identify and match patient cohorts for comparative effectiveness studies using advanced analytics.",
            },
          ],
          kpis: [
            "Evidence generation speed",
            "Safety signal detection rate",
            "Regulatory submission quality",
          ],
          personas: [
            "Head of Medical Affairs",
            "Chief Medical Officer",
            "Head of Pharmacovigilance",
          ],
        },
        {
          name: "Provider Next Best Action",
          useCases: [
            {
              name: "Provider Segmentation & Analytics",
              description:
                "Segment healthcare providers by prescribing behavior, influence, and responsiveness to optimize engagement strategies.",
              typicalDataEntities: ["Prescribing Data", "Provider Profiles", "Engagement History", "Market Share"],
              typicalSourceSystems: ["Sales Force Automation", "Claims Data", "CRM"],
            },
            {
              name: "Next-Best-Action Recommendations",
              description:
                "Use ML to recommend the optimal next interaction with each provider across omnichannel touchpoints.",
              typicalDataEntities: ["Provider Profiles", "Interaction History", "Propensity Scores", "Channel Preferences"],
              typicalSourceSystems: ["Sales Force Automation", "CRM", "Marketing Automation"],
            },
            {
              name: "Sales Rep AI Assistant",
              description:
                "Deploy AI assistants for field sales teams to prepare for provider interactions with relevant insights and talking points.",
              typicalDataEntities: ["Provider Profiles", "Prescribing Data", "Product Information", "Call History"],
              typicalSourceSystems: ["Sales Force Automation", "CRM", "Medical Information System"],
            },
          ],
          kpis: [
            "Provider engagement rate",
            "Prescription growth",
            "Sales rep productivity",
          ],
          personas: [
            "Head of Commercial",
            "VP Sales",
            "Head of Marketing",
          ],
        },
      ],
    },
  ],
};

const RCG: IndustryOutcome = {
  id: "rcg",
  name: "Retail & Consumer Goods",
  subVerticals: [
    "Consumer Goods / CPG",
    "Grocery Retail",
    "Fashion & Apparel",
    "Specialty & Multi-Brand Retail",
    "E-Commerce",
    "Travel & Hospitality",
  ],
  suggestedDomains: [
    "Supply Chain",
    "Marketing",
    "Customer Experience",
    "Omni-Channel",
    "Store Operations",
    "Operations",
    "Sales",
    "Sustainability",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Reduce Cost",
    "Optimize Operations",
    "Enhance Experience",
    "Achieve ESG",
  ],
  objectives: [
    {
      name: "Build Supply Chain Resiliency",
      whyChange:
        "The $8.6 trillion consumer goods industry faces unprecedented disruptions. Organizations lose 6-10% of annual revenue to supply chain failures. Stockouts alone drive $1.5 trillion in lost sales annually. Companies need AI-driven supply chain intelligence.",
      priorities: [
        {
          name: "Supplier Risk Management",
          useCases: [
            {
              name: "Multi-Tier Supplier Risk Monitoring",
              description:
                "Monitor supplier risk across multiple tiers in real-time using financial, geopolitical, and ESG data to identify vulnerabilities before disruptions occur.",
              businessValue:
                "40% fewer supply chain disruptions, 65% faster risk response times.",
              typicalDataEntities: ["Supplier Master Data", "Financial Health Indicators", "Geopolitical Risk Index", "ESG Compliance Scores"],
              typicalSourceSystems: ["ERP", "Supplier Risk Platforms", "Third-Party Risk Data Providers"],
            },
            {
              name: "Supplier Performance Scoring",
              description:
                "Score and rank suppliers on quality, delivery, cost, and sustainability metrics to optimize sourcing decisions.",
              typicalDataEntities: ["Purchase Orders", "Goods Receipt Records", "Quality Inspections", "Supplier Master"],
              typicalSourceSystems: ["ERP", "SRM", "Quality Management System"],
            },
            {
              name: "Product & Supplier ESG Analytics",
              description:
                "Measure and report sustainability attributes such as materials provenance, recyclability, and ethical sourcing at product, category, and supplier level to support sustainability frameworks and UNGC commitments.",
              businessValue:
                "Improved ESG reporting accuracy, reduced reputational risk, stronger supplier accountability.",
              typicalDataEntities: ["Product BOM", "Materials Provenance", "Supplier Sustainability Certifications", "Recyclability Attributes"],
              typicalSourceSystems: ["PLM", "ERP", "Supplier Sustainability Platforms"],
            },
          ],
          kpis: [
            "Supplier risk score",
            "Disruption response time",
            "Supplier diversification index",
            "Supplier ESG compliance rate",
          ],
          personas: [
            "Chief Supply Chain Officer",
            "VP Procurement",
            "Head of Risk Management",
          ],
        },
        {
          name: "Demand Forecasting & Inventory Optimization",
          useCases: [
            {
              name: "AI-Driven Demand Forecasting",
              description:
                "Use ML models incorporating weather, events, social media, and economic indicators to forecast demand with 30-50% higher accuracy.",
              businessValue:
                "20-30% reduction in carrying costs, 18% reduction in stockouts.",
              typicalDataEntities: ["Sales Transactions", "Inventory Levels", "Promotional Calendar", "Weather Data"],
              typicalSourceSystems: ["POS System", "ERP", "Demand Planning System"],
            },
            {
              name: "Inventory Optimization",
              description:
                "Optimize inventory levels across the supply network using AI to balance service levels with carrying costs.",
              typicalDataEntities: ["Inventory Positions", "Demand Forecasts", "Lead Times", "Safety Stock Parameters"],
              typicalSourceSystems: ["ERP", "WMS", "Demand Planning System"],
            },
            {
              name: "Markdown and Pricing Optimization",
              description:
                "Use ML to optimize markdown timing and pricing strategies across multi-channel promotional calendars and gross-margin targets for distinct retail formats, maximizing revenue recovery on slow-moving inventory.",
              typicalDataEntities: ["Inventory Positions", "Sales History", "Promotional Calendar", "Margin Targets"],
              typicalSourceSystems: ["ERP", "POS System", "Merchandising System"],
            },
            {
              name: "Category & Pricing Architecture Analytics",
              description:
                "Identify Key Value Items, analyse traffic drivers and cross-seller relationships, and measure promotional effectiveness across categories and brands to inform assortment and pricing decisions.",
              businessValue:
                "Improved promotional ROI, better category margin mix, reduced cannibalisation.",
              typicalDataEntities: ["Category Sales", "Product Assortment", "Promotional Events", "Cross-Sell Matrices"],
              typicalSourceSystems: ["POS System", "ERP", "Merchandising System"],
            },
          ],
          kpis: [
            "Forecast accuracy",
            "Inventory turnover",
            "Stockout rate",
            "Carrying cost reduction",
          ],
          personas: [
            "VP Demand Planning",
            "Head of Merchandising",
            "Chief Supply Chain Officer",
          ],
        },
        {
          name: "Retailer-Supplier Collaboration",
          useCases: [
            {
              name: "Collaborative Planning and Replenishment",
              description:
                "Enable real-time data sharing between retailers and suppliers for coordinated demand planning and replenishment.",
              typicalDataEntities: ["Demand Forecasts", "Inventory Positions", "Purchase Orders", "Shipment Schedules"],
              typicalSourceSystems: ["ERP", "EDI/VAN", "Demand Planning System"],
            },
            {
              name: "Category Performance Analytics",
              description:
                "Analyze category performance collaboratively with trading partners to optimize assortment and promotions.",
              businessValue:
                "72-hour category review cycles versus six weeks with manual methods.",
              typicalDataEntities: ["Category Sales", "Market Share", "Assortment Mix", "Promotional Performance"],
              typicalSourceSystems: ["POS System", "Retail Data Syndication", "ERP"],
            },
          ],
          kpis: [
            "OTIF delivery rate",
            "Collaborative forecast accuracy",
            "Category growth rate",
          ],
          personas: [
            "VP Category Management",
            "Head of Trade Marketing",
            "VP Supply Chain",
          ],
        },
        {
          name: "Omni-Channel Fulfilment Optimization",
          useCases: [
            {
              name: "Unified Inventory Visibility & Order Routing",
              description:
                "Optimize order routing across DCs, stores, ship-from-store, and click-and-collect channels using real-time inventory positions to minimise fulfilment cost and meet delivery promise times.",
              businessValue:
                "15-25% reduction in fulfilment cost, improved on-time delivery rates.",
              typicalDataEntities: ["Inventory Positions", "Order Events", "Store Capacity", "Delivery Zones"],
              typicalSourceSystems: ["WMS", "OMS", "Store Inventory System"],
            },
            {
              name: "DC-to-Store Replenishment Optimization",
              description:
                "Optimise slotting and DC-to-store replenishment cycles for promotional and seasonal peaks such as Black Friday, Christmas, and key sporting seasons.",
              typicalDataEntities: ["Demand Forecasts", "DC Inventory", "Store Sales", "Promotional Calendar"],
              typicalSourceSystems: ["WMS", "ERP", "Demand Planning System"],
            },
          ],
          kpis: [
            "Fulfilment cost per order",
            "Click-and-collect SLA attainment",
            "Ship-from-store utilisation",
            "Order promise accuracy",
          ],
          personas: [
            "Head of Omni Fulfilment",
            "GM DC Operations",
            "Head of Transport",
          ],
        },
      ],
    },
    {
      name: "Personalize & Monetize Customer Experience",
      whyChange:
        "Consumers expect personalized, seamless experiences across channels. Companies leveraging customer data effectively see significantly higher engagement, loyalty, and lifetime value.",
      priorities: [
        {
          name: "Customer 360 & Personalization",
          useCases: [
            {
              name: "Customer Data Platform",
              description:
                "Build a group-wide CDP with cross-brand identity resolution across multiple retail banners, unifying transactional, behavioural, and demographic data into a single customer view.",
              typicalDataEntities: ["Customer Profiles", "Transaction History", "Behavioural Events", "Demographic Attributes"],
              typicalSourceSystems: ["POS System", "E-Commerce Platform", "CRM", "Loyalty Platform"],
            },
            {
              name: "Real-Time Personalization",
              description:
                "Deliver personalized product recommendations, offers, and content in real-time across digital and physical channels.",
              typicalDataEntities: ["Customer Profiles", "Real-Time Behavioural Events", "Product Catalog", "Recommendation Models"],
              typicalSourceSystems: ["CDP", "E-Commerce Platform", "POS System"],
            },
            {
              name: "Loyalty Program Optimization",
              description:
                "Optimize loyalty program design and rewards using data analytics to maximize customer retention and lifetime value.",
              typicalDataEntities: ["Loyalty Transactions", "Member Profiles", "Redemption History", "Segment Performance"],
              typicalSourceSystems: ["Loyalty Platform", "POS System", "CRM"],
            },
            {
              name: "Multi-Brand Loyalty & Offer Optimization",
              description:
                "Design offers and benefits that optimise engagement and value across multiple retail brands, targeting cross-brand shoppers to increase share of wallet and program ROI.",
              businessValue:
                "Higher cross-brand conversion, increased loyalty member spend, improved offer redemption rates.",
              typicalDataEntities: ["Loyalty Transactions", "Cross-Brand Purchase History", "Offer Redemptions", "Member Segments"],
              typicalSourceSystems: ["Loyalty Platform", "POS System", "E-Commerce Platform"],
            },
          ],
          kpis: [
            "Customer lifetime value",
            "Personalization engagement rate",
            "Loyalty program ROI",
            "Cross-brand engagement rate",
          ],
          personas: [
            "Chief Marketing Officer",
            "Head of CRM",
            "Head of Loyalty",
            "Head of E-Commerce",
          ],
        },
        {
          name: "Market Intelligence",
          useCases: [
            {
              name: "Competitive Intelligence Analytics",
              description:
                "Monitor competitor pricing, promotions, and market share using AI to inform strategic decisions.",
              typicalDataEntities: ["Competitor Pricing", "Market Share Data", "Promotional Activity", "Category Benchmarks"],
              typicalSourceSystems: ["Retail Data Syndication", "Web Scraping", "Third-Party Market Data"],
            },
            {
              name: "Consumer Sentiment Analysis",
              description:
                "Analyze social media, reviews, and surveys to understand consumer sentiment and emerging trends.",
              typicalDataEntities: ["Social Media Posts", "Product Reviews", "Survey Responses", "Brand Mentions"],
              typicalSourceSystems: ["Social Listening Platform", "E-Commerce Platform", "Survey Tool"],
            },
          ],
          kpis: [
            "Market share",
            "Brand sentiment score",
            "Competitive price index",
          ],
          personas: [
            "Chief Marketing Officer",
            "VP Strategy",
            "Head of Consumer Insights",
          ],
        },
      ],
    },
    {
      name: "Improve Employee Productivity",
      whyChange:
        "Consumer goods firms face rising labor costs and talent shortages. AI-powered tools can dramatically improve employee productivity across functions from supply chain to field operations.",
      priorities: [
        {
          name: "Employee Productivity with AI",
          useCases: [
            {
              name: "AI-Powered Field Operations",
              description:
                "Equip field sales and merchandising teams with AI tools for route optimization, shelf compliance monitoring, and automated reporting.",
            },
            {
              name: "Knowledge Management AI",
              description:
                "Deploy AI assistants to help employees find and apply organizational knowledge quickly across departments.",
            },
          ],
          kpis: [
            "Employee productivity index",
            "Field visit effectiveness",
            "Knowledge retrieval time",
          ],
          personas: [
            "Chief Human Resources Officer",
            "VP Field Operations",
            "Head of IT",
          ],
        },
        {
          name: "Store Operations & Workforce Optimization",
          useCases: [
            {
              name: "Store Labour Forecasting & Rostering",
              description:
                "Forecast and optimise store staffing levels using foot traffic, sales patterns, seasonality, local events, and promotional calendars to reduce labour cost while maintaining service levels.",
              businessValue:
                "5-10% reduction in labour cost as a percentage of sales, improved roster accuracy.",
              typicalDataEntities: ["Foot Traffic", "Sales History", "Promotional Calendar", "Employee Availability"],
              typicalSourceSystems: ["POS System", "Workforce Management", "Store Traffic Sensors"],
            },
            {
              name: "In-Store Execution Analytics",
              description:
                "Monitor planogram compliance, click-and-collect pick efficiency, and service queue wait times to drive consistent execution across the store network.",
              typicalDataEntities: ["Planogram Definitions", "Shelf Images", "Pick Times", "Queue Metrics"],
              typicalSourceSystems: ["Merchandising System", "OMS", "Store Operations App"],
            },
          ],
          kpis: [
            "Labour cost as % of sales",
            "Roster accuracy",
            "Task completion rate",
            "Click-and-collect pick efficiency",
          ],
          personas: [
            "Head of Retail Operations",
            "Regional Manager",
            "Workforce Planning Manager",
          ],
        },
      ],
    },
  ],
};

const MANUFACTURING: IndustryOutcome = {
  id: "manufacturing",
  name: "Manufacturing & Automotive",
  subVerticals: [
    "Automotive & Mobility",
    "Industrial Machinery",
    "Semiconductors & High-Tech",
    "Chemicals & Materials",
    "Aerospace & Defense",
  ],
  suggestedDomains: [
    "Manufacturing",
    "Supply Chain",
    "Engineering",
    "Operations",
    "Customer Experience",
    "Finance",
  ],
  suggestedPriorities: [
    "Optimize Operations",
    "Reduce Cost",
    "Drive Innovation",
    "Increase Revenue",
    "Achieve ESG",
  ],
  objectives: [
    {
      name: "Connected Products",
      whyChange:
        "Service-based offerings contribute over 60% of manufacturing operating profits while accounting for only 30% of offerings. Connected products generate vast data that can be monetized through outcome-based offerings, with 4x higher enterprise value per dollar of revenue.",
      priorities: [
        {
          name: "Connected Product Analytics",
          useCases: [
            {
              name: "Predictive Maintenance",
              description:
                "Use sensor data to predict equipment failures and schedule proactive maintenance, reducing downtime and extending asset life.",
              businessValue:
                "$30-35M bottom line impact through real-time machine data access for predicting issues.",
              typicalDataEntities: ["IoT Sensor Readings", "Equipment Maintenance History", "Asset Registry"],
              typicalSourceSystems: ["SCADA/Historian", "CMMS", "ERP"],
            },
            {
              name: "Remote Monitoring and Diagnostics",
              description:
                "Enable real-time monitoring and diagnostics of products in the field, reducing service costs and improving uptime.",
              typicalDataEntities: ["Telemetry Data", "Fault Codes", "Asset Configuration", "Service History"],
              typicalSourceSystems: ["IoT Platform", "Product Cloud", "CMMS"],
            },
            {
              name: "Product Feature Usage Analytics",
              description:
                "Analyze how customers use products to inform design improvements and tailor offerings.",
              typicalDataEntities: ["Feature Usage Events", "Product Configuration", "Customer Segments", "Usage Aggregates"],
              typicalSourceSystems: ["Product Cloud", "IoT Platform", "CRM"],
            },
            {
              name: "Warranty Cost Optimization",
              description:
                "Optimize warranty claims by analyzing product performance data to identify patterns leading to high warranty expenses.",
            },
          ],
          kpis: [
            "Downtime reduction (%)",
            "Service response time",
            "First-time fix rate (%)",
            "Customer satisfaction (CSAT)",
          ],
          personas: [
            "Chief Digital Officer",
            "VP Connected Products/Services",
            "Head of Product Innovation",
          ],
        },
      ],
    },
    {
      name: "Industrial AI",
      whyChange:
        "Industrial productivity has plateaued while costs increase. 99% of industrial data is wasted. 65% of manufacturing leaders see data issues as the main challenge for AI adoption. The role of data and AI is to increase automation and make the workforce more efficient.",
      priorities: [
        {
          name: "Manufacturing Intelligence",
          useCases: [
            {
              name: "Predictive Quality Control",
              description:
                "Detect and mitigate product defects in real-time during manufacturing using advanced analytics and computer vision.",
              businessValue:
                "20-40% reduction in defect rate.",
              typicalDataEntities: ["In-Line Sensor Data", "Quality Inspections", "Process Parameters", "Defect Classifications"],
              typicalSourceSystems: ["MES", "SCADA", "Quality Management System"],
            },
            {
              name: "Root Cause Analysis",
              description:
                "Identify complex, non-local factors contributing to sub-optimal performance through multi-dimensional data correlation.",
            },
            {
              name: "Production Scheduling Optimization",
              description:
                "Dynamically optimize manufacturing workflows by balancing demand forecasts, resource availability, and operational constraints.",
            },
            {
              name: "Digital Twins for Manufacturing",
              description:
                "Create high-fidelity digital simulations to model and analyze performance variations across production scenarios.",
            },
            {
              name: "Energy Use Efficiency",
              description:
                "Optimize energy consumption through granular metering, benchmarking, and identification of inefficiencies.",
              businessValue: "15-25% reduction in energy costs.",
            },
          ],
          kpis: [
            "Downtime reduction (30-50%)",
            "Defect rate reduction (20-40%)",
            "Production throughput increase (10-20%)",
            "Energy savings (15-25%)",
          ],
          personas: [
            "VP Manufacturing",
            "Head of Quality",
            "Industrial AI Leader",
            "Smart Factory Leader",
          ],
        },
      ],
    },
    {
      name: "Digital Supply Chain",
      whyChange:
        "Supply chains are responsible for 50-70% of manufacturing operating costs. Manual processes increase supply chain costs by up to 15% and account for 71% of supply chain errors. Real-time AI-driven optimization is essential.",
      priorities: [
        {
          name: "Supply Chain Optimization",
          useCases: [
            {
              name: "Demand Forecasting",
              description:
                "Analyze historical data and market trends to accurately predict future product demand using ML models.",
              businessValue:
                "30-50% improvement in forecast accuracy.",
              typicalDataEntities: ["Sales History", "Order Book", "Market Indicators", "Seasonality"],
              typicalSourceSystems: ["ERP", "Demand Planning System", "CRM"],
            },
            {
              name: "Inventory Optimization",
              description:
                "Automate inventory replenishment based on AI-driven safety level calculations and demand sensing.",
              businessValue: "25% reduction in inventory carrying costs.",
            },
            {
              name: "Order Processing Automation",
              description:
                "Deploy AI agents to automate order processing, reducing administrative costs and improving accuracy.",
              businessValue: "80%+ cost savings in order entry.",
            },
            {
              name: "Supplier Risk Monitoring",
              description:
                "Develop n-tier supplier maps using internal and external data to assess and mitigate supply chain risks.",
            },
            {
              name: "Logistics Optimization",
              description:
                "Optimize transportation routes, carrier selection, and load planning for improved efficiency and reduced costs.",
              businessValue:
                "15% reduction in logistics costs, 42% improvement in logistics costs through ML-optimized routing.",
            },
          ],
          kpis: [
            "OTD/OTIF performance (7-10% improvement)",
            "Inventory carrying costs (25% reduction)",
            "Order cycle time (50% reduction)",
            "Demand forecast accuracy (30-50% improvement)",
          ],
          personas: [
            "Chief Supply Chain Officer",
            "VP Demand Planning",
            "VP Procurement",
          ],
        },
      ],
    },
    {
      name: "Engineering & R&D Transformation",
      whyChange:
        "Companies must rapidly develop and iterate on new products. Emerging technologies like GenAI, digital twins, and simulation tools enable smarter design, testing, and iteration.",
      priorities: [
        {
          name: "R&D Innovation",
          useCases: [
            {
              name: "Design Space Exploration",
              description:
                "Optimize product design by evaluating multiple parameters and constraints using simulations, generative design, and predictive analytics.",
              typicalDataEntities: ["Design Parameters", "Simulation Results", "Material Properties", "Constraints"],
              typicalSourceSystems: ["PLM", "CAD", "Simulation Platform"],
            },
            {
              name: "Product Testing Optimization",
              description:
                "Use ML to optimize testing strategies, reduce test cycles, and predict product performance from simulated data.",
              typicalDataEntities: ["Test Results", "Test Plans", "Simulation Outputs", "Performance Specs"],
              typicalSourceSystems: ["PLM", "Test Management System", "Simulation Platform"],
            },
            {
              name: "Proprietary Coding Assistants",
              description:
                "Deploy AI-powered tools to assist R&D teams in coding tasks, improving developer productivity.",
            },
          ],
          kpis: [
            "Time to market",
            "R&D cost efficiency",
            "Design iteration speed",
          ],
          personas: [
            "VP Engineering",
            "Head of R&D",
            "Chief Technology Officer",
          ],
        },
      ],
    },
    {
      name: "Customer Experience",
      whyChange:
        "Manufacturers are realizing how critical seamless, personalized, proactive experiences are for building loyalty and boosting sales. Common data silos between product, manufacturing, supply chain, and customer must be unified.",
      priorities: [
        {
          name: "Customer Experience Optimization",
          useCases: [
            {
              name: "Customer 360 for Manufacturing",
              description:
                "Build unified customer profiles combining product, transaction, service, and engagement data beyond just CRM.",
              typicalDataEntities: ["Customer Profiles", "Order History", "Service Records", "Product Usage"],
              typicalSourceSystems: ["CRM", "ERP", "Service Management", "IoT Platform"],
            },
            {
              name: "Next Best Commercial Offer",
              description:
                "Use AI to identify the optimal offer for each customer based on purchase history, product usage, and lifecycle stage.",
              typicalDataEntities: ["Customer Profiles", "Purchase History", "Product Catalog", "Propensity Scores"],
              typicalSourceSystems: ["CRM", "ERP", "Product Cloud"],
            },
            {
              name: "Churn Modeling",
              description:
                "Predict customer churn and implement proactive retention strategies based on engagement patterns.",
              typicalDataEntities: ["Customer Profiles", "Engagement Metrics", "Contract Data", "Churn Risk Scores"],
              typicalSourceSystems: ["CRM", "ERP", "Service Management"],
            },
          ],
          kpis: [
            "Customer satisfaction (NPS)",
            "Customer retention rate",
            "Cross-sell revenue",
          ],
          personas: [
            "VP Sales",
            "Head of Customer Experience",
            "Chief Marketing Officer",
          ],
        },
      ],
    },
  ],
};

const ENERGY_UTILITIES: IndustryOutcome = {
  id: "energy-utilities",
  name: "Energy & Utilities",
  subVerticals: [
    "Oil & Gas (Upstream/Midstream/Downstream)",
    "Renewables (Solar, Wind, Hydro)",
    "Electric Utilities",
    "Gas & Water Utilities",
    "Mining",
    "Energy Trading",
  ],
  suggestedDomains: [
    "Operations",
    "Supply Chain",
    "Sustainability",
    "Finance",
    "Customer Experience",
    "Cybersecurity",
  ],
  suggestedPriorities: [
    "Optimize Operations",
    "Reduce Cost",
    "Achieve ESG",
    "Mitigate Risk",
    "Increase Revenue",
  ],
  objectives: [
    {
      name: "Optimize Operations",
      whyChange:
        "Energy and utilities companies must optimize operations through data-driven innovation for efficient production and smart consumption. Asset management and safety use cases deliver substantial business value through improved reliability and reduced downtime.",
      priorities: [
        {
          name: "Process & Operations Efficiency",
          useCases: [
            {
              name: "Production Optimization",
              description:
                "Optimize energy production processes using real-time analytics and AI to maximize output and minimize waste.",
              typicalDataEntities: ["Production Output", "Process Parameters", "Fuel Consumption", "Efficiency Metrics"],
              typicalSourceSystems: ["SCADA", "Historian", "DCS"],
            },
            {
              name: "Predictive Maintenance for Energy Assets",
              description:
                "Predict equipment failures across generation, transmission, and distribution assets to reduce unplanned downtime.",
              businessValue: "$6M infrastructure cost savings (Viessmann case).",
              typicalDataEntities: ["IoT Sensor Readings", "Equipment Maintenance History", "Asset Registry"],
              typicalSourceSystems: ["SCADA", "CMMS", "Asset Management System"],
            },
            {
              name: "Grid Optimization",
              description:
                "Optimize electricity transmission and distribution networks for efficiency, reliability, and renewable integration.",
              typicalDataEntities: ["Smart Meter Data", "Grid Topology", "Weather Forecasts"],
              typicalSourceSystems: ["ADMS", "Smart Meter Infrastructure", "SCADA"],
            },
            {
              name: "Well Performance Optimization",
              description:
                "Use subsurface data interpretation and ML to optimize oil and gas well performance and production rates.",
              typicalDataEntities: ["Well Production Data", "Subsurface Logs", "Reservoir Models", "Completion Data"],
              typicalSourceSystems: ["Historian", "Petroleum Data Management", "Reservoir Simulation"],
            },
          ],
          kpis: [
            "Asset uptime (%)",
            "Production efficiency",
            "Energy loss reduction",
            "Maintenance cost savings",
          ],
          personas: [
            "VP Operations",
            "Head of Asset Management",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Asset Management & Safety",
          useCases: [
            {
              name: "Asset Health Monitoring",
              description:
                "Monitor the condition of critical assets in real-time using IoT sensors and AI to prevent failures.",
              typicalDataEntities: ["Sensor Readings", "Asset Configuration", "Condition Indicators", "Alarm History"],
              typicalSourceSystems: ["SCADA", "IoT Platform", "Asset Management System"],
            },
            {
              name: "Safety Event Prediction",
              description:
                "Use ML models to predict safety incidents and enable preventive interventions.",
              businessValue:
                "Predict dangerous well-bore influxes 45 minutes before they occur (NOV case).",
              typicalDataEntities: ["Sensor Readings", "Operational Parameters", "Historical Incidents", "Risk Indicators"],
              typicalSourceSystems: ["SCADA", "DCS", "HSE System"],
            },
            {
              name: "Environmental Monitoring",
              description:
                "Monitor emissions, leaks, and environmental impact in real-time for compliance and sustainability.",
              typicalDataEntities: ["Emissions Readings", "Leak Detection Data", "Environmental Sensors", "Compliance Thresholds"],
              typicalSourceSystems: ["CEMS", "SCADA", "Environmental Management System"],
            },
          ],
          kpis: [
            "Safety incident reduction",
            "Asset reliability",
            "Environmental compliance",
          ],
          personas: [
            "Head of HSE",
            "VP Asset Integrity",
            "Chief Safety Officer",
          ],
        },
      ],
    },
    {
      name: "Streamline Business Functions",
      whyChange:
        "Energy companies need to reduce cost, increase accuracy, and improve efficiency across internal operations. AI-powered compliance management and enterprise BI enable faster, data-driven decision making.",
      priorities: [
        {
          name: "Compliance Management & Reporting",
          useCases: [
            {
              name: "ESG & Emissions Reporting",
              description:
                "Automate Scope 1, 2, and 3 emissions tracking and ESG reporting using integrated data pipelines.",
              typicalDataEntities: ["Emissions Data", "Energy Consumption", "Supply Chain Footprint", "ESG Metrics"],
              typicalSourceSystems: ["CEMS", "ERP", "Sustainability Platform"],
            },
            {
              name: "Regulatory Compliance Automation",
              description:
                "Automate compliance with energy regulations across jurisdictions, reducing manual effort and risk.",
              typicalDataEntities: ["Regulatory Requirements", "Compliance Evidence", "Audit Logs", "Reporting Schedules"],
              typicalSourceSystems: ["ERP", "GRC Platform", "Regulatory Data Sources"],
            },
          ],
          kpis: [
            "Reporting accuracy",
            "Compliance cost reduction",
            "Emissions reduction tracking",
          ],
          personas: [
            "Chief Sustainability Officer",
            "VP Compliance",
            "Chief Financial Officer",
          ],
        },
        {
          name: "Enterprise Business Intelligence",
          useCases: [
            {
              name: "Energy Trading Analytics",
              description:
                "Provide real-time analytics for energy trading decisions, incorporating market data, weather, and demand forecasts.",
              typicalDataEntities: ["Market Prices", "Position Data", "Weather Forecasts", "Demand Forecasts"],
              typicalSourceSystems: ["Trading Platform", "Market Data Feeds", "EMS"],
            },
            {
              name: "Financial Planning & Forecasting",
              description:
                "Improve financial planning accuracy with AI-driven forecasting incorporating operational and market data.",
              typicalDataEntities: ["Financial Actuals", "Operational Metrics", "Market Indicators", "Budget Plans"],
              typicalSourceSystems: ["ERP", "Trading Platform", "Planning System"],
            },
          ],
          kpis: [
            "Forecast accuracy",
            "Decision speed",
            "Cost-to-serve optimization",
          ],
          personas: [
            "Chief Financial Officer",
            "VP Trading",
            "Head of Analytics",
          ],
        },
      ],
    },
    {
      name: "Collaborate & Protect Data/IP",
      whyChange:
        "Energy companies must balance data collaboration with protection of intellectual property and critical infrastructure cybersecurity. Customer experience enhancement must coexist with robust data sovereignty measures.",
      priorities: [
        {
          name: "Customer Experience",
          useCases: [
            {
              name: "Customer Demand Response",
              description:
                "Optimize demand response programs using smart meter data and AI to balance grid load and reward customers.",
              typicalDataEntities: ["Smart Meter Data", "Demand Response Events", "Customer Participation", "Grid Load"],
              typicalSourceSystems: ["MDM", "Demand Response Platform", "SCADA"],
            },
            {
              name: "Personalized Energy Recommendations",
              description:
                "Provide personalized energy-saving recommendations to customers based on consumption patterns and building data.",
              typicalDataEntities: ["Consumption History", "Building Attributes", "Weather Data", "Benchmark Comparisons"],
              typicalSourceSystems: ["MDM", "CRM", "Billing System"],
            },
          ],
          kpis: [
            "Customer satisfaction",
            "Demand response participation",
            "Energy savings per customer",
          ],
          personas: [
            "VP Customer Experience",
            "Head of Retail Energy",
            "Chief Digital Officer",
          ],
        },
      ],
    },
  ],
};

const WATER_UTILITIES: IndustryOutcome = {
  id: "water-utilities",
  name: "Water Utilities",
  subVerticals: [
    "Clean Water Supply",
    "Wastewater & Sewerage",
    "Water Retail",
    "Water Wholesale",
    "Integrated Water (Supply + Wastewater)",
    "Bulk Water & Dam Operations",
    "Irrigation & Scheme Water",
    "Recycled Water & Resource Recovery",
  ],
  suggestedDomains: [
    "Network Operations",
    "Asset Management",
    "Customer Experience",
    "Environmental Compliance",
    "Water Quality",
    "Finance",
    "Water Security & Climate Resilience",
    "Bulk Water Operations",
    "Circular Economy",
  ],
  suggestedPriorities: [
    "Optimize Operations",
    "Reduce Leakage",
    "Improve Water Quality",
    "Mitigate Risk",
    "Achieve ESG",
    "Ensure Water Security",
    "Enable Digital & Smart Networks",
    "Support Community Liveability",
  ],
  objectives: [
    // ------------------------------------------------------------------
    // Objective 1 -- Network & Bulk Water Operations
    // ------------------------------------------------------------------
    {
      name: "Optimize Network & Bulk Water Operations",
      whyChange:
        "Water utilities lose an average of 20-30% of treated water to leakage and inefficiency in distribution networks, while bulk water providers face growing pressure to optimise dam, pipeline, and scheme operations under climate variability. Data-driven network management, predictive asset maintenance, demand forecasting, and scheme optimisation deliver substantial cost savings, improve service reliability, and reduce supply interruptions.",
      priorities: [
        {
          name: "Leakage Reduction & Network Efficiency",
          useCases: [
            {
              name: "Non-Revenue Water Detection",
              description:
                "Classify and locate leakage using sensor, DMA flow, and pressure data to prioritise repair and pressure management interventions.",
              businessValue:
                "Typical 10-15% reduction in leakage volumes, saving millions in treatment and pumping costs.",
              typicalDataEntities: ["Pressure Sensor Data", "Flow Meter Readings", "DMA Flow Data", "Pipe Network GIS"],
              typicalSourceSystems: ["SCADA", "GIS Platform", "Asset Management System"],
            },
            {
              name: "Pipe Burst Prediction",
              description:
                "Predict burst risk from pipe age, material, soil conditions, weather, and historical failure patterns to enable proactive intervention.",
              typicalDataEntities: ["Pipe Asset Register", "Soil Condition Data", "Weather Records", "Historical Failure Logs"],
              typicalSourceSystems: ["Asset Management System", "GIS Platform", "CMMS"],
            },
            {
              name: "Demand Forecasting",
              description:
                "Forecast water demand by DMA using weather, seasonality, population, and consumption patterns to optimise pumping schedules and reservoir levels.",
              typicalDataEntities: ["Historical Consumption by DMA", "Weather Forecasts", "Population Data", "Reservoir Levels"],
              typicalSourceSystems: ["SCADA", "Billing System", "Meter Data Management"],
            },
          ],
          kpis: [
            "Leakage (Ml/d)",
            "Supply interruptions (customer minutes lost)",
            "Burst rate per km of mains",
            "Non-revenue water (%)",
          ],
          personas: [
            "Head of Leakage",
            "VP Network Operations",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Asset Management & Investment Planning",
          useCases: [
            {
              name: "Asset Deterioration Modelling",
              description:
                "Model remaining useful life of pipes, pumps, and treatment assets using age, material, condition, and operational history.",
              typicalDataEntities: ["Asset Register", "Condition Assessment Records", "Operational History", "Maintenance Logs"],
              typicalSourceSystems: ["Asset Management System", "CMMS", "SCADA"],
            },
            {
              name: "Capital Investment Optimisation",
              description:
                "Prioritise mains renewal and asset replacement programmes to maximise risk reduction per dollar of capital investment.",
              businessValue:
                "Improved capital efficiency by targeting highest-risk assets first across regulatory and planning cycles.",
            },
            {
              name: "Predictive Maintenance for Pumping Stations",
              description:
                "Predict pump and motor failures from SCADA telemetry, vibration data, and energy consumption patterns to reduce unplanned outages.",
            },
          ],
          kpis: [
            "Asset health grade",
            "Cost per property",
            "Unplanned outage rate",
            "Capital efficiency ratio",
          ],
          personas: [
            "Head of Asset Strategy",
            "VP Engineering",
            "Chief Asset Officer",
          ],
        },
        {
          name: "Bulk Water & Scheme Operations",
          useCases: [
            {
              name: "Dam Operations Optimisation",
              description:
                "Optimise dam release schedules, storage levels, and transfer operations across interconnected schemes using inflow forecasts, demand projections, and environmental flow requirements.",
              businessValue:
                "Maximise water availability while meeting environmental obligations and minimising spill losses.",
            },
            {
              name: "Channel Loss & Scheme Efficiency Monitoring",
              description:
                "Monitor and model conveyance losses across irrigation channels, pipelines, and open waterways to identify seepage, evaporation hotspots, and infrastructure upgrade priorities.",
            },
            {
              name: "Regional Water Grid Optimisation",
              description:
                "Model inter-connected bulk water transfers across dams, treatment plants, and desalination assets to optimise whole-of-grid supply reliability and cost.",
            },
          ],
          kpis: [
            "Scheme delivery efficiency (%)",
            "Conveyance loss (Ml/d)",
            "Allocation reliability (%)",
            "Storage utilisation vs capacity",
          ],
          personas: [
            "Head of Water Resources",
            "Bulk Water Operations Manager",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Dam Safety & Major Infrastructure Risk",
          useCases: [
            {
              name: "Dam Safety Risk & Consequence-of-Failure Modelling",
              description:
                "Integrate structural condition, hydrology, seismicity, and downstream population data to model dam failure consequences and prioritise safety upgrade investments.",
              businessValue:
                "Proactive risk-based capital allocation for dam safety programmes, meeting regulatory guidelines and reducing residual risk.",
            },
            {
              name: "Spillway & Major Asset Condition Assessment",
              description:
                "Combine inspection data, sensor telemetry, and environmental loading to assess spillway, embankment, and outlet condition and predict intervention timing.",
            },
          ],
          kpis: [
            "Dam safety compliance (%)",
            "Overdue safety actions count",
            "Consequence category rating",
            "Major asset condition score",
          ],
          personas: [
            "Head of Dam Safety",
            "Chief Risk Officer",
            "VP Engineering",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 2 -- Water Quality & Environmental Resilience
    // ------------------------------------------------------------------
    {
      name: "Protect Water Quality & Environmental Resilience",
      whyChange:
        "Regulatory scrutiny on water quality, pollution incidents, and environmental performance is intensifying globally. Climate variability increases source water risk and extreme weather events. Data-driven monitoring, catchment management, and predictive analytics enable proactive compliance, reduce pollution events, and support net-zero carbon targets.",
      priorities: [
        {
          name: "Water Quality Compliance",
          useCases: [
            {
              name: "Water Quality Anomaly Detection",
              description:
                "Detect quality exceedances at treatment works and in-network using continuous monitoring data, triggering early intervention before compliance breaches.",
              typicalDataEntities: ["Continuous Monitoring Data", "Quality Thresholds", "Treatment Works Parameters", "Compliance Limits"],
              typicalSourceSystems: ["SCADA", "Laboratory Information System", "Water Quality Monitoring"],
            },
            {
              name: "Chemical Dosing Optimisation",
              description:
                "Optimise coagulant, chlorine, and pH dosing using source water quality and flow data to reduce chemical costs while maintaining compliance.",
              typicalDataEntities: ["Source Water Quality", "Flow Rates", "Chemical Dosage Records", "Compliance Results"],
              typicalSourceSystems: ["SCADA", "Laboratory Information System", "Treatment Plant DCS"],
            },
            {
              name: "Catchment Risk Assessment",
              description:
                "Assess raw water quality risk from agricultural run-off, industrial discharges, and climate factors to inform catchment management programmes.",
              typicalDataEntities: ["Land Use Data", "Discharge Permits", "Rainfall Patterns", "Raw Water Quality Trends"],
              typicalSourceSystems: ["GIS Platform", "Environmental Compliance System", "Laboratory Information System"],
            },
          ],
          kpis: [
            "Drinking water compliance (%)",
            "Coliform detection failures",
            "Taste and odour complaints",
            "Treatment cost per Ml",
          ],
          personas: [
            "Head of Water Quality",
            "Chief Scientist",
            "Regulatory Director",
          ],
        },
        {
          name: "Integrated Catchment & Source Management",
          useCases: [
            {
              name: "Catchment Health Monitoring & Intervention Planning",
              description:
                "Integrate satellite imagery, land-use data, rainfall patterns, and water quality trends to monitor catchment health and prioritise intervention programmes across source water areas.",
              businessValue:
                "Proactive source protection reduces treatment complexity and cost while safeguarding long-term water quality.",
              typicalDataEntities: ["Satellite Imagery", "Land Use Data", "Rainfall Records", "Water Quality Trends"],
              typicalSourceSystems: ["GIS Platform", "Environmental Monitoring", "Laboratory Information System"],
            },
            {
              name: "Source Water Quality Trend Analysis",
              description:
                "Analyse long-term trends in raw water quality across reservoirs and river abstractions, correlating with land-use change, climate patterns, and upstream activity to anticipate emerging risks.",
              typicalDataEntities: ["Raw Water Quality Records", "Land Use Change Data", "Climate Patterns", "Upstream Discharge Records"],
              typicalSourceSystems: ["Laboratory Information System", "GIS Platform", "Environmental Monitoring"],
            },
          ],
          kpis: [
            "Catchment health index",
            "Source water quality trend (improving/stable/declining)",
            "Intervention programme completion (%)",
          ],
          personas: [
            "Head of Catchment Management",
            "Head of Water Quality",
            "Environmental Scientist",
          ],
        },
        {
          name: "Climate, Environment & Sustainability Performance",
          useCases: [
            {
              name: "Sewer Overflow Prediction",
              description:
                "Predict sewer overflow events from rainfall forecasts, network level sensors, and flow data to enable proactive spill prevention.",
              businessValue:
                "Reduce overflow spill frequency and duration, directly impacting regulatory performance commitments.",
              typicalDataEntities: ["Rainfall Forecasts", "Network Level Sensors", "Flow Data", "CSO Event History"],
              typicalSourceSystems: ["SCADA", "Weather Services", "Wastewater Management System"],
            },
            {
              name: "Carbon Emissions Tracking",
              description:
                "Automate Scope 1, 2, and 3 emissions reporting across pumping, treatment, transport, and fleet operations.",
              typicalDataEntities: ["Energy Consumption", "Fleet Fuel Records", "Treatment Process Data", "Supply Chain Emissions"],
              typicalSourceSystems: ["SCADA", "Fleet Management System", "ERP", "Energy Management System"],
            },
            {
              name: "Pollution Incident Prevention",
              description:
                "Identify high-risk discharge points using telemetry, event history, and network hydraulic models to prevent significant pollution incidents.",
              typicalDataEntities: ["Discharge Telemetry", "Event History", "Network Hydraulic Model", "Risk Assessments"],
              typicalSourceSystems: ["SCADA", "Wastewater Management System", "GIS Platform"],
            },
            {
              name: "Climate Variability & Drought Scenario Modelling",
              description:
                "Model the impact of climate change scenarios on rainfall patterns, inflow projections, and demand to inform long-term infrastructure planning and drought response strategies.",
              typicalDataEntities: ["Climate Scenarios", "Rainfall Projections", "Inflow Forecasts", "Demand Projections"],
              typicalSourceSystems: ["Climate Modelling", "Hydrological Modelling", "Billing System", "Bulk Water Planning"],
            },
            {
              name: "Emissions Reduction & Net-Zero Pathway Analytics",
              description:
                "Track progress toward net-zero targets by modelling abatement options across energy use, process emissions, biogas capture, and renewable energy generation.",
            },
          ],
          kpis: [
            "Pollution incidents (by severity)",
            "Sewer overflow frequency and duration",
            "Carbon intensity (kgCO2e/Ml)",
            "Recreational water quality compliance",
            "Net-zero pathway progress (%)",
          ],
          personas: [
            "Head of Environment",
            "Chief Sustainability Officer",
            "Head of Climate & Resilience",
            "VP Wastewater",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 3 -- Customer, Commercial & Wholesale Performance
    // ------------------------------------------------------------------
    {
      name: "Improve Customer, Commercial & Wholesale Performance",
      whyChange:
        "Water utilities serve diverse customer bases -- from residential end-consumers to wholesale retailer utilities, irrigators, and industrial users. Growing expectations around experience, affordability, transparency, and service reliability require analytics that span retail billing, wholesale joint planning, and irrigation scheme delivery.",
      priorities: [
        {
          name: "Retail Customer Experience & Billing",
          useCases: [
            {
              name: "Smart Meter Consumption Analytics",
              description:
                "Segment customers by usage pattern, identify leaks on customer supply pipes, and detect meter under-registration using high-frequency smart meter data.",
            },
            {
              name: "Customer Vulnerability Identification",
              description:
                "Classify customers at risk of water poverty or requiring priority services using billing, demographic, and contact data to ensure targeted support.",
              businessValue:
                "Improved customer satisfaction scores and reduced bad debt through proactive vulnerability management.",
            },
            {
              name: "Meter-to-Cash Accuracy",
              description:
                "Detect billing anomalies, estimated-read drift, and unbilled consumption to improve revenue assurance and customer trust.",
            },
          ],
          kpis: [
            "Customer satisfaction score",
            "Per capita consumption (PCC)",
            "Billing accuracy (%)",
            "Customer contacts per 1000 connections",
          ],
          personas: [
            "VP Customer Experience",
            "Head of Retail",
            "Chief Commercial Officer",
          ],
        },
        {
          name: "Wholesale & Irrigation Customer Outcomes",
          useCases: [
            {
              name: "Wholesale Customer Portal & Joint Planning Analytics",
              description:
                "Provide retailer utilities with shared demand forecasts, outage coordination dashboards, incident lessons-learnt reporting, and joint capital planning analytics through a collaborative portal.",
              businessValue:
                "Strengthened wholesale relationships, improved joint demand planning accuracy, and faster coordinated incident response.",
            },
            {
              name: "Allocation Forecasting & Delivery Reliability Reporting",
              description:
                "Forecast seasonal water allocations per scheme using storage, inflow, and demand data, and report delivery reliability against announced allocations for irrigation and industrial customers.",
            },
            {
              name: "Irrigator Self-Service & Scheme Performance Dashboards",
              description:
                "Give irrigators real-time visibility into their allocation balance, ordering status, channel delivery schedules, and historical usage via self-service dashboards.",
            },
          ],
          kpis: [
            "Allocation reliability (%)",
            "Delivery reliability (%)",
            "Wholesale customer satisfaction",
            "Irrigator portal adoption rate",
          ],
          personas: [
            "Irrigation Customer Manager",
            "Head of Wholesale Partnerships",
            "Chief Commercial Officer",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 4 -- Regional Water Security & Drought Resilience
    // ------------------------------------------------------------------
    {
      name: "Ensure Regional Water Security & Drought Resilience",
      whyChange:
        "Climate change is increasing the frequency and severity of drought events, threatening water supply security for communities, agriculture, and industry. Bulk water providers and regional utilities must plan across interconnected schemes, optimise diverse supply sources (dams, desalination, groundwater, recycled water), and coordinate drought response to maintain reliable supply.",
      priorities: [
        {
          name: "Water Security Planning & Grid Operations",
          useCases: [
            {
              name: "Drought Scenario Planning & Restrictions Modelling",
              description:
                "Model drought scenarios against storage trajectories, demand forecasts, and supply augmentation options to inform restriction trigger levels and contingency planning.",
              businessValue:
                "Earlier, evidence-based restriction decisions that balance community impact with supply security.",
              typicalDataEntities: ["Storage Trajectories", "Demand Forecasts", "Supply Augmentation Options", "Restriction Triggers"],
              typicalSourceSystems: ["Bulk Water Planning", "SCADA", "Hydrological Modelling"],
            },
            {
              name: "Desalination Optimisation",
              description:
                "Optimise desalination plant dispatch, energy consumption, and maintenance scheduling based on grid demand, storage levels, and energy market conditions.",
              typicalDataEntities: ["Grid Demand", "Storage Levels", "Energy Market Prices", "Plant Capacity"],
              typicalSourceSystems: ["SCADA", "Desalination Plant DCS", "Energy Market Data"],
            },
            {
              name: "Inter-connected Scheme Optimisation",
              description:
                "Model transfers and balancing across multiple dams, treatment plants, and distribution zones within a regional water grid to maximise whole-of-system reliability.",
              typicalDataEntities: ["Transfer Capacity", "Treatment Output", "Storage Levels", "Zone Demand"],
              typicalSourceSystems: ["SCADA", "Bulk Water Planning", "Asset Management System"],
            },
            {
              name: "Water Security Index Forecasting",
              description:
                "Calculate and forecast a composite water security index per scheme incorporating storage, inflow trends, demand growth, climate outlook, and supply augmentation capacity.",
              typicalDataEntities: ["Storage Levels", "Inflow Trends", "Demand Growth", "Climate Outlook"],
              typicalSourceSystems: ["SCADA", "Bulk Water Planning", "Climate Modelling"],
            },
          ],
          kpis: [
            "Water security index / headroom by scheme",
            "Storage levels vs trigger thresholds",
            "Restrictions frequency and duration",
            "Supply augmentation readiness (%)",
          ],
          personas: [
            "Head of Water Resources",
            "Chief Water Security Officer",
            "Head of Climate & Resilience",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 5 -- Smart Networks & Regional Collaboration
    // ------------------------------------------------------------------
    {
      name: "Advance Smart Networks & Regional Collaboration",
      whyChange:
        "Digital metering, IoT sensor networks, and smart water platforms are transforming how utilities detect leaks, manage pressure, and engage customers. Leading utilities are also sharing platforms and data with smaller regional councils to lift capability across the sector.",
      priorities: [
        {
          name: "Digital & Smart Network Enablement",
          useCases: [
            {
              name: "AMI Rollout Analytics & Telemetry Quality",
              description:
                "Monitor smart meter deployment progress, communication reliability, and data quality to ensure the AMI programme delivers full network visibility on schedule.",
              businessValue:
                "Accelerated realisation of smart metering benefits through early detection of telemetry gaps and meter faults.",
              typicalDataEntities: ["Deployment Progress", "Communication Reliability", "Data Quality Metrics", "Meter Fault Records"],
              typicalSourceSystems: ["AMI Head-End", "Meter Data Management", "Asset Management System"],
            },
            {
              name: "Smart Network Event Correlation",
              description:
                "Correlate events across pressure, flow, acoustic, and meter telemetry to automatically detect, classify, and locate network anomalies such as bursts, leaks, and pressure transients.",
              typicalDataEntities: ["Pressure Telemetry", "Flow Data", "Acoustic Logs", "Meter Events"],
              typicalSourceSystems: ["SCADA", "AMI Head-End", "GIS Platform"],
            },
            {
              name: "Digital Twin for Network Simulation",
              description:
                "Build and maintain a hydraulic digital twin of the distribution or bulk water network to simulate operational scenarios, optimise pressure management, and plan capital interventions.",
            },
          ],
          kpis: [
            "Smart meter coverage (%)",
            "Telemetry data completeness (%)",
            "Digital event detection rate",
            "Digital twin model accuracy",
          ],
          personas: [
            "Head of Digital",
            "Smart Network Program Manager",
            "Chief Technology Officer",
          ],
        },
        {
          name: "Regional Shared Services & Collaboration",
          useCases: [
            {
              name: "Shared Services & Data Hub for Regional Utilities",
              description:
                "Operate a shared analytics platform and data hub that enables smaller regional councils and utilities to access smart water capabilities without building bespoke infrastructure.",
              businessValue:
                "Economies of scale for smaller utilities and consistent data standards across the region.",
              typicalDataEntities: ["Operational Metrics", "Asset Data", "Customer Data", "Quality Standards"],
              typicalSourceSystems: ["Data Hub", "Shared Analytics Platform", "Participating Utility Systems"],
            },
            {
              name: "Cross-utility Benchmarking Analytics",
              description:
                "Aggregate anonymised operational, financial, and customer metrics across participating utilities to enable peer benchmarking and identify best-practice improvement opportunities.",
              typicalDataEntities: ["Operational KPIs", "Financial Metrics", "Customer Satisfaction", "Asset Performance"],
              typicalSourceSystems: ["Data Hub", "Participating Utility Systems", "Regulatory Reporting"],
            },
          ],
          kpis: [
            "Participating utilities count",
            "Shared platform adoption rate",
            "Benchmarking insight actions implemented",
          ],
          personas: [
            "Head of Regional Partnerships",
            "Chief Information Officer",
            "VP Network Operations",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 6 -- Community Liveability & Circular Economy
    // ------------------------------------------------------------------
    {
      name: "Support Community Liveability & Circular Economy",
      whyChange:
        "Water utilities play a central role in community liveability, public health, and the transition to a circular economy. Recycled water, biosolids reuse, energy recovery, and precinct-scale innovation create new value streams while reducing environmental impact. Utilities with strong social mandates must also demonstrate measurable community and affordability outcomes.",
      priorities: [
        {
          name: "Recycled Water & Resource Recovery",
          useCases: [
            {
              name: "Recycled Water Demand & Distribution Optimisation",
              description:
                "Forecast recycled water demand by customer segment and optimise production, storage, and distribution to maximise reuse rates and minimise discharge to waterways.",
              businessValue:
                "Increased recycled water revenue and reduced environmental discharge volumes.",
            },
            {
              name: "Biosolids Reuse & Energy Recovery Analytics",
              description:
                "Track biosolids production, quality, and beneficial reuse pathways (agriculture, land rehabilitation, energy generation) to optimise resource recovery and regulatory compliance.",
              typicalDataEntities: ["Biosolids Production", "Quality Test Results", "Reuse Pathways", "Energy Recovery"],
              typicalSourceSystems: ["Treatment Plant DCS", "Laboratory Information System", "Waste Management System"],
            },
            {
              name: "Precinct-scale Water Recycling Feasibility",
              description:
                "Model the financial and environmental viability of decentralised water recycling schemes for new precincts, factoring in demand density, treatment costs, and regulatory requirements.",
            },
          ],
          kpis: [
            "Recycled water reuse rate (%)",
            "Biosolids beneficial reuse (%)",
            "Energy recovered (MWh)",
            "Resource recovery revenue ($)",
          ],
          personas: [
            "Head of Circular Economy",
            "Resource Recovery Manager",
            "Chief Sustainability Officer",
          ],
        },
        {
          name: "Community & Social Value",
          useCases: [
            {
              name: "Liveability Impact Assessment",
              description:
                "Measure and report the utility's contribution to community liveability through water quality, green space irrigation, recreational water, flood mitigation, and public amenity outcomes.",
            },
            {
              name: "Hardship & Affordability Analytics",
              description:
                "Identify customers experiencing financial hardship using billing patterns, payment history, and demographic data to proactively offer support programmes and flexible payment arrangements.",
              businessValue:
                "Reduced bad debt and improved social outcomes through early intervention in hardship cases.",
            },
            {
              name: "Emergent Market Identification",
              description:
                "Analyse trends in water reuse, waste-to-energy, nutrient recovery, and carbon markets to identify new revenue streams and circular economy business models.",
            },
          ],
          kpis: [
            "Community satisfaction score",
            "Hardship programme participation rate",
            "Social value generated ($)",
            "New circular economy revenue streams",
          ],
          personas: [
            "Head of Community & Social Impact",
            "Chief Customer Officer",
            "Head of Strategy",
          ],
        },
      ],
    },
  ],
};

const COMMUNICATIONS: IndustryOutcome = {
  id: "communications",
  name: "Communications & Telecom",
  subVerticals: [
    "Mobile Operators",
    "Fixed-Line Operators",
    "Cable & Broadband",
    "Internet Service Providers (ISPs)",
    "Wholesale & Aggregation Providers",
    "Fibre & Backbone Infrastructure",
    "MVNOs",
    "Satellite Communications",
  ],
  suggestedDomains: [
    "Customer Experience",
    "Network Operations",
    "Marketing",
    "Operations",
    "Risk & Compliance",
    "Wholesale & Partner Management",
    "Product & Pricing",
    "Infrastructure & Planning",
    "Finance",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Enhance Experience",
    "Reduce Cost",
    "Optimize Operations",
    "Mitigate Risk",
    "Grow Subscribers",
    "Scale Wholesale",
    "Optimise Infrastructure",
  ],
  objectives: [
    // ------------------------------------------------------------------
    // Objective 1 -- Grow Consumer & SMB Broadband Profitably
    // ------------------------------------------------------------------
    {
      name: "Grow Consumer & SMB Broadband Profitably",
      whyChange:
        "Broadband is a high-churn, low-switching-cost market where ISPs compete on speed, price, and digital experience. Customer acquisition costs are rising while ARPU is compressed. Data-driven targeting, digital-first acquisition funnels, churn prediction, and personalised speed-tier upsell are essential to grow net adds profitably and defend market share against incumbents and new entrants.",
      priorities: [
        {
          name: "Digital Acquisition & Conversion",
          useCases: [
            {
              name: "Address-Level Broadband Availability Targeting",
              description:
                "Use address-level NBN/fibre availability data, competitor pricing, and demographic propensity models to target high-value prospects with digital ads and landing pages. Marketing teams use this to maximise conversion per acquisition dollar.",
              businessValue:
                "Reduce cost per acquisition by 20-30% through precision targeting.",
            },
            {
              name: "Flip-to-Fibre Migration Campaigns",
              description:
                "Identify customers on fixed wireless or HFC who can upgrade to fibre (FTTP/FTTC) and trigger automated migration offers with speed-tier upsell. Product and marketing teams use this to shift mix toward higher-ARPU fibre plans.",
              businessValue:
                "Increase ARPU by $5-10/month per migrated customer.",
            },
            {
              name: "Digital Funnel Conversion Analytics",
              description:
                "Track end-to-end digital acquisition funnel (ad click to activation) with attribution modelling, A/B test analysis, and drop-off prediction. Growth and digital teams use this to optimise landing pages, checkout flows, and offer presentation.",
              businessValue: "Improve online conversion rate by 15-25%.",
            },
            {
              name: "Competitive Pricing Intelligence",
              description:
                "Monitor competitor plan pricing, speed tiers, and promotional offers across the broadband market. Product and pricing teams use this to position plans competitively and respond to market moves within hours.",
              businessValue:
                "Maintain competitive pricing position while protecting margin.",
            },
          ],
          kpis: [
            "Net subscriber adds (monthly)",
            "Cost per acquisition ($)",
            "Digital conversion rate (%)",
            "Fibre mix (% of base on FTTP/FTTC)",
            "Ad spend ROI",
          ],
          personas: [
            "Head of Consumer Broadband",
            "Head of Growth & Digital",
            "Head of Marketing",
            "Head of Product",
          ],
        },
        {
          name: "Churn Prevention & ARPU Expansion",
          useCases: [
            {
              name: "Broadband Churn & Save-Offer Analytics",
              description:
                "Predict churn risk at the subscriber level using billing, usage, speed-test, complaint, and NPS data, then trigger personalised save offers (speed upgrade, price lock, bundle) through the optimal channel. Retention teams use this to intercept at-risk customers before they port out.",
              businessValue:
                "Reduce monthly churn by 15-25% in high-risk segments.",
            },
            {
              name: "Speed-Tier Upsell Propensity",
              description:
                "Identify customers consistently using capacity close to their plan limit and recommend speed-tier upgrades via app notification or email. Product teams use this to drive ARPU growth organically.",
              businessValue:
                "Drive 5-10% ARPU uplift through targeted upsell.",
            },
            {
              name: "Customer Lifetime Value Segmentation",
              description:
                "Calculate and segment customers by predicted CLV using tenure, ARPU, product mix, and engagement data. Finance and marketing teams use this to allocate retention spend and tailor service levels.",
              businessValue:
                "Optimise retention investment by focusing on highest-CLV segments.",
              typicalDataEntities: ["Tenure Data", "ARPU History", "Product Mix", "Engagement Metrics"],
              typicalSourceSystems: ["BSS/OSS", "Billing Platform", "CRM", "Product Analytics"],
            },
            {
              name: "Win-Back & Re-Acquisition Targeting",
              description:
                "Score churned customers for win-back probability based on reason-for-leaving, tenure, and competitive landscape, then trigger timed re-acquisition campaigns. Marketing teams use this to recover high-value customers at lower cost than new acquisition.",
              businessValue:
                "Recover 8-12% of churned high-value customers within 90 days.",
            },
          ],
          kpis: [
            "Churn rate (monthly %)",
            "ARPU ($)",
            "Customer lifetime value ($)",
            "Save-offer acceptance rate (%)",
            "Win-back conversion rate (%)",
          ],
          personas: [
            "Head of Consumer Broadband",
            "Head of Retention",
            "CFO",
            "Head of Product",
          ],
        },
        {
          name: "SMB Growth & Bundling",
          useCases: [
            {
              name: "SMB Propensity-to-Buy Scoring",
              description:
                "Score small business prospects by industry, size, location, and broadband needs to prioritise outbound sales and digital targeting. SMB sales teams use this to focus effort on highest-conversion opportunities.",
              businessValue: "Increase SMB new logo rate by 15-20%.",
            },
            {
              name: "Business Bundle Recommendation Engine",
              description:
                "Recommend optimal product bundles (broadband + security + VoIP + static IP) to SMB customers based on usage patterns and industry benchmarks. Self-service portal and account managers use this to increase attach rates.",
              businessValue:
                "Improve bundle attach rate by 20-30%, lifting SMB ARPU.",
            },
            {
              name: "SMB Onboarding & Activation Analytics",
              description:
                "Track time-to-activate and early-life experience for SMB customers, flagging delayed activations and poor early experiences for proactive outreach. Operations and CX teams use this to reduce early-life churn.",
              businessValue:
                "Reduce SMB early-life churn by 10-15% through proactive intervention.",
            },
          ],
          kpis: [
            "SMB net adds (monthly)",
            "Bundle attach rate (%)",
            "SMB ARPU ($)",
            "Time to activate (days)",
            "SMB early-life churn (%)",
          ],
          personas: [
            "Head of SMB",
            "Head of Product",
            "Head of Growth & Digital",
            "CEO",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 2 -- Enhance Customer Experience
    // ------------------------------------------------------------------
    {
      name: "Enhance Customer Experience",
      whyChange:
        "Telecoms face poor customer satisfaction (consumer NPS -65 to -1), flat-to-negative revenue growth, and rising costs. Customer acquisition costs are at all-time highs. AI-driven customer experience transformation -- including self-service diagnostics, proactive outage comms, and closed-loop NPS management -- is critical for survival and differentiation.",
      priorities: [
        {
          name: "Consumer Experience & Self-Service",
          useCases: [
            {
              name: "Predictive Scripts for Contact Center",
              description:
                "Use AI to analyze customer communications, understand context and sentiment, and prepare tailored responses for first-point resolution.",
              businessValue:
                "20%+ reduction in care call volume, 10%+ reduction in handling time.",
              typicalDataEntities: ["Customer Communications", "Interaction History", "Product Holdings", "Resolution Scripts"],
              typicalSourceSystems: ["Contact Center Platform", "CRM", "BSS/OSS"],
            },
            {
              name: "Churn Prediction and Retention",
              description:
                "Advanced ML models to predict churn by analyzing behavior, complaints, billing issues, renewal dates, and NPS scores.",
              businessValue:
                "1% churn reduction can increase profits by tens of millions annually.",
              typicalDataEntities: ["Usage Records", "Billing History", "Customer Interactions", "Service Tickets"],
              typicalSourceSystems: ["BSS/OSS", "CRM", "Billing Platform"],
            },
            {
              name: "Intelligent Bill Analysis",
              description:
                "AI compares bills over time, explaining variations to customers and automating credit adjustments within designated limits.",
              businessValue:
                "Reduce billing-related support contacts by 25-35%.",
              typicalDataEntities: ["Bill History", "Usage Records", "Rate Plans", "Credit Rules"],
              typicalSourceSystems: ["Billing Platform", "BSS/OSS", "CRM"],
            },
            {
              name: "Hyper Personalized Offers",
              description:
                "Create hyper-personalized offers including cybersecurity products, network slicing, and additional bandwidth based on usage insights.",
              businessValue:
                "Increase offer acceptance rates by 20-30% compared to untargeted campaigns.",
              typicalDataEntities: ["Usage Patterns", "Product Holdings", "Customer Segments", "Offer Catalog"],
              typicalSourceSystems: ["BSS/OSS", "CRM", "Product Catalog", "Marketing Platform"],
            },
            {
              name: "Self-Service Diagnostics & Speed-Test Intelligence",
              description:
                "Enable customers to run in-app diagnostics (speed test, latency check, WiFi optimisation) with AI-driven root cause analysis and automated remediation suggestions. Reduces inbound support contacts and improves perceived control.",
              businessValue:
                "Deflect 15-20% of support contacts through self-service resolution.",
              typicalDataEntities: ["Speed Test Results", "Network Diagnostics", "CPE Data", "Service Configuration"],
              typicalSourceSystems: ["Network Analytics", "BSS/OSS", "CPE Management", "Customer App"],
            },
            {
              name: "Proactive Outage Detection & Customer Comms",
              description:
                "Detect localised outages from network telemetry and customer-reported symptoms, automatically notify affected customers with ETA and status updates via app/SMS. CX teams use this to get ahead of complaint spikes.",
              businessValue:
                "Reduce inbound outage calls by 30-40% and improve NPS during incidents.",
              typicalDataEntities: ["Network Telemetry", "Fault Records", "Customer Service Links", "Outage Status"],
              typicalSourceSystems: ["NOC/Network OSS", "Fault Management", "CRM", "Notification Platform"],
            },
            {
              name: "Agent Support Copilot",
              description:
                "Equip contact centre agents with an AI copilot that surfaces customer history, diagnoses issues from network data, recommends next-best-action, and drafts responses. Support teams use this to improve first-call resolution and reduce handle time.",
              businessValue:
                "Improve first-call resolution by 20% and reduce average handle time by 25%.",
              typicalDataEntities: ["Customer History", "Network Diagnostics", "Product Configuration", "Resolution Knowledge"],
              typicalSourceSystems: ["Contact Center Platform", "CRM", "BSS/OSS", "Network OSS"],
            },
          ],
          kpis: [
            "NPS improvement (20% YoY)",
            "Churn rate reduction (1-2%)",
            "First-call resolution (%)",
            "Average handle time (mins)",
            "Self-service resolution rate (%)",
            "ARPU growth (15%)",
          ],
          personas: [
            "Head of Customer Experience",
            "Head of Consumer Broadband",
            "Head of Contact Centre",
            "Head of Digital & Self-Service",
          ],
        },
        {
          name: "NPS & Closed-Loop Feedback",
          useCases: [
            {
              name: "NPS Driver Analysis & Action Engine",
              description:
                "Analyse NPS survey responses with NLP to identify key satisfaction drivers and detractors, then route actionable insights to responsible teams with SLA for follow-up. CX leadership uses this to close the loop on experience issues systematically.",
              businessValue:
                "Improve NPS by 10-15 points through systematic driver resolution.",
              typicalDataEntities: ["NPS Survey Responses", "Driver Themes", "Action Items", "Follow-up Status"],
              typicalSourceSystems: ["Survey Platform", "CRM", "Contact Center Platform"],
            },
            {
              name: "Customer Journey Analytics",
              description:
                "Map end-to-end customer journeys (sign-up, activation, first bill, first support contact) and identify friction points using event data. Product and CX teams use this to prioritise UX improvements with highest retention impact.",
              businessValue:
                "Reduce journey drop-off by 15-20% at key friction points.",
            },
            {
              name: "Voice of Customer Text Mining",
              description:
                "Apply NLP to support tickets, chat logs, social media mentions, and app reviews to surface emerging themes, product issues, and competitive mentions. Product and CX teams use this for early warning on experience degradation.",
              businessValue:
                "Detect emerging experience issues 2-4 weeks earlier than traditional reporting.",
            },
          ],
          kpis: [
            "NPS (consumer and enterprise)",
            "Closed-loop action completion rate (%)",
            "Customer effort score",
            "App engagement (MAU)",
            "Support contact rate per 1,000 customers",
          ],
          personas: [
            "Head of Customer Experience",
            "Head of Product",
            "CEO",
            "Head of Digital & Self-Service",
          ],
        },
        {
          name: "B2B & Enterprise",
          useCases: [
            {
              name: "AI-Powered Pricing and Quoting",
              description:
                "Integrate maps, fiber network data, and customer insights to generate accurate quotes in seconds rather than days.",
              businessValue:
                "Reduce quote turnaround from days to minutes, improving win rates by 15-20%.",
            },
            {
              name: "Automated MACs Processing",
              description:
                "AI monitors and automates Moves, Adds, and Changes requests (25-35% of B2B service requests) across channels.",
              businessValue:
                "Reduce MACs processing time by 60% and error rates by 80%.",
            },
            {
              name: "Proactive SMB Offers",
              description:
                "Identify high-LTV SMB customers and proactively offer tailored packages for IoT, network slicing, and 5G solutions.",
              businessValue: "20% increase in new logo sales.",
            },
          ],
          kpis: [
            "Quote-to-cash cycle time (40% improvement)",
            "SLA compliance (99.9%)",
            "Cross-sell revenue (20% increase)",
            "Enterprise NPS",
          ],
          personas: [
            "Head of Enterprise Sales",
            "Head of SMB",
            "Head of Service Delivery",
            "Head of Product",
          ],
        },
        {
          name: "Service Delivery",
          useCases: [
            {
              name: "Automated Order Entry & Activation",
              description:
                "Use AI to automate order entry across systems, reducing error rates from 40% to near-zero and enabling 24/7 activation.",
              businessValue:
                "Reduce order errors by 90% and enable 24/7 self-service activation.",
            },
            {
              name: "Intelligent Provisioning",
              description:
                "AI-driven provisioning with predictive analytics to anticipate network needs and optimize resource allocation.",
              businessValue:
                "Reduce provisioning time by 40-50% through automation and prediction.",
            },
            {
              name: "Proactive Service Assurance",
              description:
                "AI-driven monitoring for proactive identification and resolution of service issues before they impact customers.",
              businessValue:
                "Reduce customer-affecting incidents by 25-30% through proactive detection.",
            },
          ],
          kpis: [
            "Order accuracy (99.9%)",
            "Service activation time (50% reduction)",
            "Order-to-cash cycle (20% reduction)",
            "Provisioning time (hours)",
          ],
          personas: [
            "Head of Service Delivery",
            "VP Operations",
            "Chief Information Officer",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 3 -- Scale Enterprise & Wholesale Connectivity
    // ------------------------------------------------------------------
    {
      name: "Scale Enterprise & Wholesale Connectivity",
      whyChange:
        "Enterprise and wholesale connectivity is a high-margin, relationship-driven business where fibre-first providers compete on provisioning speed, SLA reliability, and partner portal experience. Data-driven wholesale partner management, automated quoting, and real-time SLA dashboards are critical to scale revenue without proportional headcount growth.",
      priorities: [
        {
          name: "Enterprise Connectivity Portfolio",
          useCases: [
            {
              name: "Fibre & SD-WAN Quote-to-Activate Acceleration",
              description:
                "Automate feasibility, pricing, and provisioning for enterprise fibre and SD-WAN orders using address-level network data, cost models, and capacity checks. Sales and pre-sales teams use this to reduce quote turnaround from days to minutes.",
              businessValue:
                "Reduce enterprise quote-to-activate cycle by 50-60%.",
            },
            {
              name: "Cloud Interconnect Demand Forecasting",
              description:
                "Predict enterprise demand for cloud interconnect (AWS, Azure, GCP) by region and capacity tier to pre-provision capacity and reduce lead times. Network planning and enterprise sales teams use this to stay ahead of demand.",
              businessValue:
                "Reduce cloud interconnect provisioning time by 40%.",
            },
            {
              name: "Enterprise SLA Performance Dashboard",
              description:
                "Real-time monitoring of SLA metrics (uptime, latency, jitter, packet loss) per enterprise customer with automated breach alerting and root cause analysis. Account managers and NOC teams use this to maintain trust and reduce penalties.",
              businessValue:
                "Achieve 99.95%+ SLA attainment across enterprise portfolio.",
            },
            {
              name: "Managed Security Attach Analytics",
              description:
                "Identify enterprise and SMB customers most likely to purchase managed security services (DDoS protection, firewall, threat monitoring) based on industry, traffic patterns, and risk profile. Sales teams use this to grow the security revenue stream.",
              businessValue:
                "Increase managed security attach rate by 25-35%.",
            },
          ],
          kpis: [
            "Enterprise revenue growth (%)",
            "Quote-to-activate time (days)",
            "SLA attainment (%)",
            "Managed security attach rate (%)",
            "Cloud interconnect revenue ($)",
          ],
          personas: [
            "Head of Enterprise & Wholesale",
            "Head of Enterprise Sales",
            "Head of Product",
            "CFO",
          ],
        },
        {
          name: "Wholesale & Partner Experience",
          useCases: [
            {
              name: "Wholesale Partner Performance Cockpit",
              description:
                "Provide RSPs and wholesale partners with self-service analytics on order volumes, provisioning times, fault rates, and SLA performance across their customer base. Head of Wholesale uses this to drive partner satisfaction and retention.",
              businessValue:
                "Improve wholesale partner NPS by 20+ points.",
            },
            {
              name: "NBN Aggregation Utilisation & Margin Analytics",
              description:
                "Track bandwidth utilisation, CVC costs, and margin per POI across the NBN aggregation portfolio. Finance and wholesale teams use this to optimise CVC provisioning and identify under/over-provisioned POIs.",
              businessValue:
                "Improve NBN aggregation margin by 5-10% through CVC optimisation.",
            },
            {
              name: "Automated Wholesale Provisioning & Fault Triage",
              description:
                "Automate order processing, provisioning, and fault triage for wholesale services, reducing manual intervention and improving turnaround times. Operations teams use this to scale wholesale without proportional headcount.",
              businessValue:
                "Reduce wholesale provisioning time by 40% and fault resolution by 30%.",
            },
            {
              name: "Partner Revenue & Growth Analytics",
              description:
                "Track revenue, growth trajectory, and product mix per wholesale partner to identify upsell opportunities, at-risk partners, and whitespace. Wholesale account managers use this for data-driven partner engagement.",
              businessValue:
                "Identify 15-20% more upsell opportunities across the partner base.",
            },
          ],
          kpis: [
            "Wholesale revenue ($)",
            "Partner NPS",
            "Provisioning time (hours)",
            "CVC cost per Mbps ($)",
            "Partner churn rate (%)",
          ],
          personas: [
            "Head of Wholesale",
            "Head of Enterprise & Wholesale",
            "CFO",
            "Head of Service Delivery",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 4 -- Optimise Network & Infrastructure Performance
    // ------------------------------------------------------------------
    {
      name: "Optimise Network & Infrastructure Performance",
      whyChange:
        "Network complexity is increasing with fibre rollouts, backbone expansion, and growing bandwidth demand. AI-driven network optimisation, predictive fault detection, and infrastructure capacity planning are essential for maintaining service quality, maximising asset utilisation, and controlling costs across backbone, subsea, metro fibre, and access networks.",
      priorities: [
        {
          name: "Network Operations",
          useCases: [
            {
              name: "Network Performance Monitoring",
              description:
                "Monitor network and service performance in real-time using AI to detect anomalies and predict capacity needs across access, metro, and backbone layers.",
              businessValue:
                "Reduce network-related customer complaints by 20-30%.",
            },
            {
              name: "Predictive Network Demand",
              description:
                "Predict network demand changes to proactively optimize capacity and avoid congestion across POIs, backbone links, and peering points.",
              businessValue:
                "Avoid 80-90% of congestion events through proactive capacity adjustment.",
            },
            {
              name: "Network Capacity Planning",
              description:
                "Track network capacity in real-time with proactive planning based on usage patterns, subscriber growth projections, and traffic trends.",
              businessValue:
                "Reduce over-provisioning costs by 10-15% while maintaining headroom.",
            },
            {
              name: "Backbone & Subsea Link Utilisation Optimisation",
              description:
                "Monitor utilisation, latency, and error rates across backbone and subsea cable segments to optimise traffic routing, plan capacity augments, and avoid congestion. Network planning teams use this for strategic capacity decisions.",
              businessValue:
                "Improve backbone utilisation by 10-15% while maintaining latency SLAs.",
            },
            {
              name: "NBN POI Capacity & Cost Management",
              description:
                "Track bandwidth utilisation and cost per Mbps at each NBN Point of Interconnect, flagging POIs approaching congestion thresholds and optimising CVC purchases. Network and finance teams use this to balance cost and quality.",
              businessValue:
                "Reduce cost per Mbps by 8-12% through proactive POI capacity management.",
            },
            {
              name: "Fibre Network Route Planning & Expansion",
              description:
                "Use demand heatmaps, competitor presence, and construction cost models to prioritise metro fibre build and duct extensions. Network planning teams use this to maximise ROI on infrastructure capital.",
              businessValue:
                "Improve fibre build ROI by 15-25% through data-driven route prioritisation.",
            },
          ],
          kpis: [
            "Network availability (%)",
            "Backbone utilisation (%)",
            "POI utilisation per link (%)",
            "Cost per Mbps ($)",
            "Mean time to repair (hours)",
            "Capacity headroom (%)",
          ],
          personas: [
            "Chief Network Officer",
            "Head of Network Planning",
            "Head of NOC",
            "VP Engineering",
            "Chief Technology Officer",
          ],
        },
        {
          name: "Incident & Fault Management",
          useCases: [
            {
              name: "Predictive Fault Detection & Auto-Remediation",
              description:
                "Detect emerging faults from network telemetry (optical power, error rates, temperature) before service impact, and trigger automated remediation (route failover, port reset) where possible. NOC teams use this to reduce MTTR and customer-affecting incidents.",
              businessValue: "Reduce mean time to repair by 30-40%.",
            },
            {
              name: "Outage Impact Radius & Customer Notification",
              description:
                "When a fault occurs, automatically map the blast radius to affected services and customers, prioritise restoration by customer impact, and trigger proactive communications. NOC and CX teams use this to manage incidents transparently.",
              businessValue:
                "Reduce inbound fault calls by 30% through proactive notification.",
            },
            {
              name: "Network Resilience & Redundancy Analysis",
              description:
                "Model single points of failure across the fibre, backbone, and subsea network to prioritise redundancy investments and validate failover paths. Chief Network Officer uses this for strategic resilience planning.",
              businessValue:
                "Eliminate critical single points of failure and reduce major outage frequency by 40-50%.",
            },
          ],
          kpis: [
            "MTTR (hours)",
            "Incidents per 1,000 customers",
            "Proactive notification coverage (%)",
            "Subsea link availability (%)",
            "Single points of failure count",
          ],
          personas: [
            "Head of NOC",
            "Chief Network Officer",
            "Head of Customer Experience",
            "VP Engineering",
          ],
        },
        {
          name: "Field Operations",
          useCases: [
            {
              name: "AI-Powered Field Tech Support",
              description:
                "Equip field technicians with AI assistants for real-time troubleshooting guidance and knowledge access during fibre installs, repairs, and network builds.",
              businessValue:
                "Improve first-time fix rate by 15-20% and reduce repeat visits.",
            },
            {
              name: "Predictive Field Service",
              description:
                "Predict equipment failures and dispatch field technicians proactively before service is affected, using telemetry from CPE, ONTs, and network equipment.",
              businessValue:
                "Reduce truck rolls by 20-25% through predictive dispatch.",
              typicalDataEntities: ["CPE Telemetry", "ONT Data", "Equipment Health", "Failure Predictions"],
              typicalSourceSystems: ["Network OSS", "CPE Management", "Field Service Management"],
            },
          ],
          kpis: [
            "First-time fix rate (%)",
            "Average repair time (hours)",
            "Truck roll reduction (%)",
            "Field technician utilisation (%)",
          ],
          personas: [
            "Head of Field Operations",
            "VP Engineering",
            "Chief Operating Officer",
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Objective 5 -- Security & Compliance
    // ------------------------------------------------------------------
    {
      name: "Security & Compliance",
      whyChange:
        "Telecoms face sophisticated fraud, evolving privacy regulations, increasing cybersecurity threats, and growing demand for managed security services. AI-powered detection, automated compliance, and proactive security posture management are essential for protecting revenue, customer trust, and regulatory standing.",
      priorities: [
        {
          name: "Fraud Prevention",
          useCases: [
            {
              name: "Fraud Detection & Prevention",
              description:
                "Detect and prevent fraud including subscription fraud, international revenue share fraud, and account takeover using ML pattern detection across billing, usage, and identity data.",
              businessValue:
                "Reduce fraud losses by 40-60% through real-time detection.",
              typicalDataEntities: ["Usage Records", "Billing History", "Identity Data", "Fraud Patterns"],
              typicalSourceSystems: ["BSS/OSS", "Billing Platform", "Identity Verification", "Fraud Detection Engine"],
            },
            {
              name: "Robo-calling & Bot Detection",
              description:
                "Use AI to monitor and detect robocalling, bot activities, and SIM swap attempts in real-time, protecting customers and network integrity.",
              businessValue:
                "Block 95%+ of automated fraud attempts in real-time.",
            },
          ],
          kpis: [
            "Fraud loss reduction ($)",
            "Detection accuracy (%)",
            "False positive rate (%)",
            "Time to detect (minutes)",
          ],
          personas: [
            "Head of Fraud Prevention",
            "Chief Information Security Officer",
            "VP Revenue Assurance",
          ],
        },
        {
          name: "Cybersecurity & Managed Security",
          useCases: [
            {
              name: "Network Security Posture Monitoring",
              description:
                "Continuously assess the security posture of network infrastructure (DDoS exposure, misconfiguration, vulnerability scanning) using AI-driven analysis of logs and threat intelligence feeds. CISO and security operations teams use this to maintain a hardened network perimeter.",
              businessValue:
                "Reduce critical vulnerability exposure window by 60-70%.",
            },
            {
              name: "Customer-Facing Threat Intelligence",
              description:
                "Aggregate threat data across the customer base to identify emerging attack patterns, compromised endpoints, and botnet participation, feeding into managed security service offerings. Security product teams use this to differentiate the managed security portfolio.",
              businessValue:
                "Enhance managed security value proposition, supporting 15-20% price premium.",
            },
            {
              name: "Regulatory Compliance Automation",
              description:
                "Automate compliance monitoring and reporting for telecommunications obligations, privacy regulations, and critical infrastructure requirements. Compliance and legal teams use this to reduce manual audit burden and ensure continuous compliance.",
              businessValue:
                "Reduce compliance reporting effort by 50-60% and eliminate overdue findings.",
              typicalDataEntities: ["Compliance Obligations", "Audit Evidence", "Policy State", "Finding Records"],
              typicalSourceSystems: ["GRC Platform", "BSS/OSS", "Network OSS", "Document Management"],
            },
          ],
          kpis: [
            "Security incident count",
            "Compliance audit pass rate (%)",
            "Time to patch critical vulnerabilities (hours)",
            "Managed security revenue ($)",
            "DDoS mitigation response time (seconds)",
          ],
          personas: [
            "Chief Information Security Officer",
            "Head of Compliance",
            "Head of Security Product",
            "Chief Technology Officer",
          ],
        },
      ],
    },
  ],
};

const MEDIA_ADVERTISING: IndustryOutcome = {
  id: "media-advertising",
  name: "Media & Advertising",
  subVerticals: [
    "Streaming & OTT",
    "Broadcasting",
    "Publishing",
    "Advertising Technology",
    "Digital Media",
  ],
  suggestedDomains: [
    "Marketing",
    "Customer Experience",
    "Operations",
    "Sales",
    "Cybersecurity",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Enhance Experience",
    "Protect Revenue",
    "Drive Innovation",
    "Reduce Cost",
  ],
  objectives: [
    {
      name: "Know Your Audience",
      whyChange:
        "Media companies must compete with tech giants (Google, Meta, Amazon) who own 60%+ of the advertising market. Identity is the foundation of any M&A business. Companies need to leverage first-party data for audience understanding, targeting, and monetization.",
      priorities: [
        {
          name: "Identity & Customer 360",
          useCases: [
            {
              name: "First-Party Identity Spine",
              description:
                "Build a unified first-party identity framework storing and organizing PII data at household, person, and device levels.",
              typicalDataEntities: ["Household Profiles", "Person Identity Records", "Device Identifiers", "Identity Link Graph"],
              typicalSourceSystems: ["CDP", "Website Analytics", "App Analytics", "CRM"],
            },
            {
              name: "Household Device Graphing",
              description:
                "Link multiple devices to individual households using first-party signals to dramatically augment identity coverage.",
              typicalDataEntities: ["Device Fingerprints", "Household Clusters", "Cross-Device Signals", "Login Graph"],
              typicalSourceSystems: ["CDP", "Ad Server", "Streaming Platform", "Analytics Platform"],
            },
            {
              name: "Customer Profile Enrichment",
              description:
                "Aggregate data from multiple touchpoints to create rich profiles of audience interests, preferences, demographics, and psychographics.",
              typicalDataEntities: ["Customer Profiles", "Engagement History", "Demographic Attributes", "Interest Signals"],
              typicalSourceSystems: ["CDP", "Content CMS", "Analytics Platform", "CRM"],
            },
            {
              name: "Audience Segmentation",
              description:
                "ML-driven algorithms to create dynamic audience segments based on behavioral patterns, content preferences, and demographics.",
              typicalDataEntities: ["Audience Segments", "Behavioral Events", "Content Preferences", "Demographic Attributes"],
              typicalSourceSystems: ["CDP", "Content CMS", "Analytics Platform", "Ad Server"],
            },
          ],
          kpis: [
            "Identity resolution rate (%)",
            "Cross-device match rate",
            "Customer profile completeness",
          ],
          personas: [
            "Chief Data Officer",
            "Head of Ad Sales",
            "Head of Audience Insights",
          ],
        },
      ],
    },
    {
      name: "Grow & Retain Your Audience",
      whyChange:
        "Subscriber churn in streaming is a major problem. Content competition is intense. Companies must use AI for personalization, targeted marketing, and superior customer experiences to retain audiences.",
      priorities: [
        {
          name: "Marketing & Acquisition",
          useCases: [
            {
              name: "Subscriber Churn Prediction",
              description:
                "Use ML to predict subscriber churn based on viewing patterns, engagement, and account behavior to trigger proactive retention.",
            },
            {
              name: "Content Recommendation Engine",
              description:
                "Build personalized content recommendation systems using collaborative filtering and deep learning.",
            },
            {
              name: "Campaign Attribution & Optimization",
              description:
                "Measure marketing campaign effectiveness across channels with multi-touch attribution modeling.",
              typicalDataEntities: ["Campaign Events", "Touchpoint Data", "Conversion Events", "Channel Performance"],
              typicalSourceSystems: ["Marketing Platform", "Ad Server", "Analytics Platform", "CRM"],
            },
          ],
          kpis: [
            "Subscriber retention rate",
            "Content engagement time",
            "Marketing ROI",
          ],
          personas: [
            "Chief Marketing Officer",
            "Head of Growth",
            "VP Content Strategy",
          ],
        },
      ],
    },
    {
      name: "Monetize Your Audience & Content",
      whyChange:
        "With cord-cutting reducing distribution revenue, media companies must find new monetization strategies through targeted advertising, data monetization, and content optimization.",
      priorities: [
        {
          name: "Advertising Monetization",
          useCases: [
            {
              name: "Programmatic Ad Targeting",
              description:
                "Enable precise, privacy-compliant ad targeting using first-party audience data and ML-driven lookalike modeling.",
              typicalDataEntities: ["Audience Segments", "Ad Inventory", "Bid Data", "Conversion Events"],
              typicalSourceSystems: ["CDP", "Ad Server", "DSP", "Analytics Platform"],
            },
            {
              name: "Yield Optimization",
              description:
                "Optimize ad inventory yield by predicting CPMs and dynamically adjusting pricing and placement strategies.",
              typicalDataEntities: ["Ad Inventory", "CPM Forecasts", "Placement Performance", "Fill Rates"],
              typicalSourceSystems: ["Ad Server", "SSP", "Analytics Platform", "Programmatic Platform"],
            },
            {
              name: "Ad Measurement & Attribution",
              description:
                "Provide advertisers with accurate cross-platform measurement and attribution to prove ad effectiveness.",
              typicalDataEntities: ["Ad Impressions", "Viewability Data", "Conversion Events", "Attribution Models"],
              typicalSourceSystems: ["Ad Server", "Analytics Platform", "DMP", "CRM"],
            },
          ],
          kpis: [
            "CPM growth",
            "Ad fill rate",
            "Ad revenue per user",
          ],
          personas: [
            "Head of Ad Sales",
            "VP Ad Operations",
            "Chief Revenue Officer",
          ],
        },
        {
          name: "Content Supply Chain",
          useCases: [
            {
              name: "Content Performance Analytics",
              description:
                "Analyze content performance across platforms to optimize content investment, scheduling, and licensing decisions.",
              typicalDataEntities: ["Content Catalog", "Viewership Metrics", "Platform Performance", "Licensing Data"],
              typicalSourceSystems: ["Content CMS", "Streaming Platform", "Analytics Platform", "Rights Management"],
            },
            {
              name: "AI-Powered Content Metadata",
              description:
                "Use AI to automatically tag, classify, and enrich content metadata for improved discoverability and recommendations.",
              typicalDataEntities: ["Content Catalog", "Raw Media Assets", "Tag Taxonomy", "Enriched Metadata"],
              typicalSourceSystems: ["Content CMS", "MAM", "Transcription Service", "Analytics Platform"],
            },
          ],
          kpis: [
            "Content ROI",
            "Content discovery rate",
            "Production efficiency",
          ],
          personas: [
            "VP Content Strategy",
            "Head of Programming",
            "Chief Content Officer",
          ],
        },
      ],
    },
  ],
};

const DIGITAL_NATIVES: IndustryOutcome = {
  id: "digital-natives",
  name: "Digital Natives & Technology",
  subVerticals: [
    "B2B SaaS",
    "B2C Platforms",
    "FinTech",
    "E-Commerce Platforms",
    "Cloud & Infrastructure",
  ],
  suggestedDomains: [
    "Engineering",
    "Operations",
    "Customer Experience",
    "Finance",
    "Cybersecurity",
  ],
  suggestedPriorities: [
    "Drive Innovation",
    "Optimize Operations",
    "Increase Revenue",
    "Reduce Cost",
    "Enhance Experience",
  ],
  objectives: [
    {
      name: "Unified Data & AI",
      whyChange:
        "Digital natives face unprecedented challenges at scale. Disparate data silos, fragmented toolchains, and infrastructure bottlenecks hinder innovation. Teams encounter delays managing complex infrastructure instead of focusing on product innovation.",
      priorities: [
        {
          name: "Low Latency Real-Time Apps & Analytics",
          useCases: [
            {
              name: "Customer Data Enrichment",
              description:
                "Continuously update and enhance customer profiles with real-time behavioral and transactional data.",
              typicalDataEntities: ["Customer Profiles", "Behavioral Events", "Transaction History", "Enrichment Attributes"],
              typicalSourceSystems: ["CDP", "Product Analytics", "Billing System", "CRM"],
            },
            {
              name: "Identity Resolution",
              description:
                "Recognize users across multiple platforms and touchpoints to create a unified customer view.",
              typicalDataEntities: ["Identity Graph", "Device Identifiers", "Cross-Platform Events", "User Profiles"],
              typicalSourceSystems: ["CDP", "Product Analytics", "Auth System", "Marketing Platform"],
            },
            {
              name: "Real-Time Personalization",
              description:
                "Deliver tailored content, recommendations, or offers in milliseconds to enhance user engagement.",
            },
            {
              name: "Resource Optimization",
              description:
                "Dynamically allocate resources based on real-time demand patterns to improve operational efficiency.",
            },
          ],
          kpis: [
            "Data processing latency",
            "Engineering team productivity",
            "Data processing cost reduction",
          ],
          personas: [
            "Chief Technology Officer",
            "VP Engineering",
            "Data Platform Owner",
          ],
        },
        {
          name: "Accelerate Production ML/AI",
          useCases: [
            {
              name: "ML Model Lifecycle Management",
              description:
                "Streamline ML model development, deployment, and monitoring at scale with unified MLOps tooling.",
            },
            {
              name: "Feature Store & Feature Engineering",
              description:
                "Build centralized feature stores to enable feature reuse across teams and reduce time to production.",
            },
            {
              name: "A/B Testing & Experimentation Platform",
              description:
                "Build robust experimentation platforms for data-driven product decisions at scale.",
            },
          ],
          kpis: [
            "Model deployment frequency",
            "Experiment velocity",
            "ML infrastructure cost",
          ],
          personas: [
            "Head of Data Science",
            "VP Engineering",
            "Chief AI Officer",
          ],
        },
      ],
    },
  ],
};

const GAMES: IndustryOutcome = {
  id: "games",
  name: "Gaming",
  subVerticals: [
    "Mobile Games",
    "Console & PC Games",
    "MMO & Live Service",
    "Game Publishing",
    "Esports",
  ],
  suggestedDomains: [
    "Marketing",
    "Customer Experience",
    "Operations",
    "Finance",
    "Engineering",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Enhance Experience",
    "Protect Revenue",
    "Reduce Cost",
    "Drive Innovation",
  ],
  objectives: [
    {
      name: "Player Centric Experience",
      whyChange:
        "The industry is exploding with content but player acquisition costs have doubled to quadrupled. Monetization is directly correlated to time spent in game. Companies must innovate and personalize experiences to maximize engagement.",
      priorities: [
        {
          name: "Know Your Player",
          useCases: [
            {
              name: "Player 360",
              description:
                "Create a unified view of the player spanning multiple games, studios, and ecosystems including play sessions, efficacy, preferences, and purchase propensity.",
              businessValue:
                "Foundational for all engagement, acquisition, and monetization use cases.",
              typicalDataEntities: ["Player Profiles", "Session Data", "Purchase History", "Cross-Game Activity"],
              typicalSourceSystems: ["Game Telemetry System", "Player Database", "Payment Platform", "Analytics Platform"],
            },
            {
              name: "Churn Mitigation",
              description:
                "Understand and mitigate player churn across the player lifecycle using behavioral analytics and ML models.",
              typicalDataEntities: ["Player Session Data", "In-Game Events", "Engagement Metrics", "Churn Risk Scores"],
              typicalSourceSystems: ["Game Telemetry System", "Player Database", "Analytics Platform", "CRM"],
            },
            {
              name: "Player Segmentation",
              description:
                "Better understand player behavior through ML-driven clustering to drive more impactful engagement and retention strategies.",
              typicalDataEntities: ["Player Clusters", "Behavioral Attributes", "Engagement Scores", "Segment Definitions"],
              typicalSourceSystems: ["Game Telemetry System", "Player Database", "Analytics Platform", "Marketing Platform"],
            },
            {
              name: "Player Identity Resolution",
              description:
                "Identify players across their entire engagement journey from web to ad targeting to in-game across multiple platforms and titles.",
              typicalDataEntities: ["Identity Graph", "Device Identifiers", "Cross-Platform Events", "Login Records"],
              typicalSourceSystems: ["Auth System", "Game Telemetry System", "Ad Platform", "Analytics Platform"],
            },
          ],
          kpis: [
            "Lifetime Value (LTV)",
            "Retention (D1, D7, D30)",
            "Session length",
            "Daily/Monthly Active Users",
          ],
          personas: [
            "VP of Data / Analytics",
            "Studio General Manager",
            "Head of Player Insights",
          ],
        },
        {
          name: "Grow Your Revenue",
          useCases: [
            {
              name: "Dynamic Offer Optimization",
              description:
                "Use ML to optimize in-game offers, pricing, and bundles for each player segment to maximize monetization.",
            },
            {
              name: "Ad Monetization Optimization",
              description:
                "Optimize ad placement, frequency, and targeting within games to maximize ad revenue without hurting player experience.",
            },
            {
              name: "User Acquisition Optimization",
              description:
                "Optimize marketing spend across channels by predicting lifetime value of acquired players and adjusting bids accordingly.",
            },
          ],
          kpis: [
            "ARPU/ARPPU",
            "Conversion rate",
            "Customer acquisition cost (CAC)",
            "Marketing ROI",
          ],
          personas: [
            "Chief Revenue Officer",
            "Head of Monetization",
            "Head of User Acquisition",
          ],
        },
      ],
    },
    {
      name: "Build Great Games",
      whyChange:
        "With massive investments in game development, studios cannot afford failures. Data-driven decision-making throughout the development lifecycle and effective live operations are essential for success.",
      priorities: [
        {
          name: "De-Risk Game Development",
          useCases: [
            {
              name: "Playtesting Analytics",
              description:
                "Analyze playtest data to identify design issues, balance problems, and player experience friction points before launch.",
            },
            {
              name: "Market Opportunity Analysis",
              description:
                "Use data analytics to assess market opportunities, competitive positioning, and target audience for new game concepts.",
            },
          ],
          kpis: [
            "Playtest completion rate",
            "Pre-launch sentiment score",
            "Development milestone accuracy",
          ],
          personas: [
            "Studio General Manager",
            "Game Director",
            "Head of Product",
          ],
        },
        {
          name: "Effective Live Operations",
          useCases: [
            {
              name: "Live Event Performance Analytics",
              description:
                "Monitor and optimize live events, seasonal content, and game updates in real-time to maximize player engagement.",
              typicalDataEntities: ["Event Definitions", "Participation Metrics", "Engagement Rates", "Revenue per Event"],
              typicalSourceSystems: ["Game Telemetry System", "Live Ops Platform", "Analytics Platform", "Content CMS"],
            },
            {
              name: "Game Balance Optimization",
              description:
                "Use analytics to continuously monitor and adjust game balance, economy, and difficulty to maintain player satisfaction.",
              typicalDataEntities: ["Economy Metrics", "Win Rates", "Item Usage", "Difficulty Progression"],
              typicalSourceSystems: ["Game Telemetry System", "Economy Config", "Analytics Platform", "A/B Testing Platform"],
            },
            {
              name: "Content Pipeline Optimization",
              description:
                "Optimize content delivery scheduling based on player engagement patterns and seasonal trends.",
              typicalDataEntities: ["Content Calendar", "Engagement Patterns", "Release Metrics", "Seasonal Trends"],
              typicalSourceSystems: ["Content CMS", "Game Telemetry System", "Analytics Platform", "Live Ops Platform"],
            },
          ],
          kpis: [
            "Event participation rate",
            "Player satisfaction post-update",
            "Content engagement metrics",
          ],
          personas: [
            "Head of Live Operations",
            "Game Producer",
            "Head of Analytics",
          ],
        },
      ],
    },
    {
      name: "Efficient Business Operations",
      whyChange:
        "Game companies need to optimize operations and democratize data access across the organization to enable data-driven decision-making at all levels.",
      priorities: [
        {
          name: "Operational Excellence",
          useCases: [
            {
              name: "Infrastructure Cost Optimization",
              description:
                "Optimize cloud and backend infrastructure costs using analytics to rightsize resources and reduce waste.",
              typicalDataEntities: ["Resource Utilization", "Cost by Service", "DAU/MAU Metrics", "Peak Load Patterns"],
              typicalSourceSystems: ["Cloud Platform", "APM", "Billing System", "Game Telemetry System"],
            },
            {
              name: "Data Democratization",
              description:
                "Enable self-service analytics and AI-powered data exploration for non-technical stakeholders across the organization.",
            },
          ],
          kpis: [
            "Infrastructure cost per DAU",
            "Data access time",
            "Self-service adoption rate",
          ],
          personas: [
            "Chief Technology Officer",
            "VP Engineering",
            "Head of Data Platform",
          ],
        },
      ],
    },
  ],
};

const RAIL_TRANSPORT: IndustryOutcome = {
  id: "rail-transport",
  name: "Rail Transport & Logistics",
  subVerticals: [
    "Freight Rail",
    "Heavy Haul & Bulk Freight",
    "Passenger Rail",
    "Rail Infrastructure & Signalling",
    "Intermodal Logistics",
    "Network Access & Regulation",
  ],
  suggestedDomains: [
    "Network Operations",
    "Asset Management",
    "Customer Experience",
    "Safety & Compliance",
    "Supply Chain",
    "Finance",
    "ESG & Sustainability",
    "Workforce & Remote Operations",
  ],
  suggestedPriorities: [
    "Optimize Operations",
    "Reduce Cost",
    "Increase Revenue",
    "Mitigate Risk",
    "Achieve ESG",
    "Enhance Customer Experience",
  ],
  objectives: [
    {
      name: "Optimize Network & Train Operations",
      whyChange:
        "Heavy-haul and freight rail networks manage complex, interdependent train plans across export corridors (e.g., CQCN coal systems, Tarcoola–Darwin) and multi-user regulated infrastructure. A single delay cascades into reduced throughput, port berthing misses, and contractual penalties. AI-driven scheduling, real-time operations management, capacity optimization, and workforce planning are essential to improve punctuality, throughput, energy efficiency, and regulatory access compliance.",
      priorities: [
        {
          name: "Train Performance & Scheduling",
          useCases: [
            {
              name: "Timetable Optimization",
              description:
                "Use ML-based conflict resolution to generate optimised timetables that maximise path utilisation across complex network topologies while respecting infrastructure and rolling stock constraints.",
              businessValue:
                "5-10% increase in train paths utilised per hour on constrained corridors.",
              typicalDataEntities: ["Network Topology", "Path Constraints", "Rolling Stock Availability", "Conflict Matrix"],
              typicalSourceSystems: ["Timetabling System", "Asset Management System", "SCADA", "ERP"],
            },
            {
              name: "Real-Time Delay Prediction & Management",
              description:
                "Predict knock-on delays across the network using real-time train positions, infrastructure status, and historical delay propagation patterns, recommending recovery actions to controllers.",
              businessValue:
                "20-30% reduction in secondary delay minutes through proactive intervention.",
              typicalDataEntities: ["Train Positions", "Infrastructure Status", "Delay History", "Recovery Actions"],
              typicalSourceSystems: ["SCADA", "TMS", "Signalling System", "Asset Management System"],
            },
            {
              name: "Heavy-Haul Train Dynamics & Pathing",
              description:
                "Optimise consist length, distributed power configuration, and speed profiles for long heavy-haul coal and bulk routes using gradient data, axle load limits, and corridor capacity models.",
              businessValue:
                "3-5% improvement in gross tonnage per train path through optimised consist planning.",
              typicalDataEntities: ["Gradient Data", "Axle Load Limits", "Corridor Capacity", "Consist Configuration"],
              typicalSourceSystems: ["Asset Management System", "TMS", "Track Database", "SCADA"],
            },
            {
              name: "Energy-Efficient Driving Advisory",
              description:
                "Optimise speed profiles using gradient data, timetable slack, and rolling stock characteristics to reduce traction energy consumption while maintaining punctuality.",
              businessValue:
                "10-15% traction energy savings through optimised coasting and braking strategies.",
              typicalDataEntities: ["Gradient Profiles", "Timetable Slack", "Rolling Stock Specs", "Energy Consumption"],
              typicalSourceSystems: ["TMS", "Track Database", "Asset Management System", "Energy Management System"],
            },
            {
              name: "Port Interface & Terminal Coordination",
              description:
                "Integrate ship schedules, stockpile levels, and corridor train plans to optimise the handoff between rail network and export terminals, reducing demurrage and improving port throughput.",
              businessValue:
                "10-20% reduction in port demurrage costs through coordinated rail-terminal scheduling.",
              typicalDataEntities: ["Ship Schedules", "Stockpile Levels", "Train Plans", "Berth Availability"],
              typicalSourceSystems: ["Port Management System", "TMS", "Terminal SCADA", "ERP"],
            },
          ],
          kpis: [
            "PPM / on-time performance (%)",
            "Minutes of delay per incident",
            "Train paths utilised per hour",
            "Energy consumption per train-km",
          ],
          personas: [
            "Head of Operations",
            "VP Train Planning",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Freight Operations & Yard Management",
          useCases: [
            {
              name: "Freight Train Scheduling Optimization",
              description:
                "Balance freight and passenger train paths across capacity-constrained corridors using AI to maximise freight throughput without degrading passenger performance.",
              typicalDataEntities: ["Path Allocations", "Corridor Capacity", "Freight Demand", "Passenger Timetables"],
              typicalSourceSystems: ["TMS", "Timetabling System", "Freight Management System", "SCADA"],
            },
            {
              name: "Yard Operations Automation",
              description:
                "Optimise shunting movements, marshalling sequences, and wagon sorting using real-time yard telemetry and ML to reduce dwell time and increase throughput.",
            },
            {
              name: "Wagon Utilisation Analytics",
              description:
                "Track empty running, dwell time, and turnaround cycles to identify underutilised assets and maximise wagon productivity across the fleet.",
            },
            {
              name: "Intermodal Terminal Optimization",
              description:
                "Optimise crane scheduling, container stacking, and truck slot allocation at intermodal terminals using real-time data to reduce terminal dwell time and improve throughput.",
            },
            {
              name: "Contract-Aware Scheduling",
              description:
                "Build freight train paths that respect take-or-pay obligations, slot rights, and access undertaking constraints, ensuring contractual commitments are met while maximising network utilisation.",
              businessValue:
                "Reduce contractual penalty exposure and improve take-or-pay volume compliance by 5-10%.",
            },
          ],
          kpis: [
            "Freight train reliability (%)",
            "Yard dwell time (hours)",
            "Wagon utilisation rate (%)",
            "Terminal throughput (lifts per hour)",
            "Take-or-pay compliance (%)",
          ],
          personas: [
            "Head of Freight",
            "VP Terminal Operations",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Regulated Network Capacity & Access Management",
          useCases: [
            {
              name: "Capacity Assessment & Queuing Analytics",
              description:
                "Model multi-user capacity on regulated corridors, queue and prioritise access requests, and report utilisation transparently to access holders and regulators.",
              businessValue:
                "Improved access request turnaround and 10-15% better capacity utilisation on constrained coal systems.",
              typicalDataEntities: ["Corridor Capacity", "Access Requests", "Utilisation Reports", "Queue Priorities"],
              typicalSourceSystems: ["TMS", "Access Management System", "SCADA", "Regulatory Reporting"],
            },
            {
              name: "Performance Rebate & Access Charge Optimization",
              description:
                "Track corridor performance against access undertaking benchmarks, calculate rebate and penalty exposure in real time, and identify operational levers to optimise outcomes for network and above-rail operators.",
              typicalDataEntities: ["Performance Benchmarks", "Rebate Calculations", "Penalty Exposure", "Access Charges"],
              typicalSourceSystems: ["TMS", "Access Management System", "ERP", "Regulatory Reporting"],
            },
            {
              name: "Maintenance Window vs Throughput Scenario Planning",
              description:
                "Simulate the throughput impact of planned possessions and maintenance windows across coal systems and port interfaces, balancing asset renewal needs with contractual throughput obligations.",
              businessValue:
                "5-8% reduction in throughput loss during planned maintenance through optimised possession scheduling.",
              typicalDataEntities: ["Possession Schedule", "Throughput Models", "Contract Obligations", "Asset Renewal Plan"],
              typicalSourceSystems: ["Asset Management System", "TMS", "Maintenance Planning", "ERP"],
            },
          ],
          kpis: [
            "System throughput (NTK)",
            "Capacity utilisation (%)",
            "Access request lead time (days)",
            "Rebate / penalty exposure ($)",
          ],
          personas: [
            "Head of Network",
            "VP Regulatory & Access",
            "Network Capacity Manager",
          ],
        },
        {
          name: "Workforce & Remote Operations",
          useCases: [
            {
              name: "Crew Rostering & Fatigue Risk Optimization",
              description:
                "Optimise crew rosters for long-distance heavy-haul corridors, modelling fatigue risk, remote changeover logistics, and regulatory hours-of-work limits to maintain safety and crew wellbeing.",
              businessValue:
                "15-20% reduction in fatigue-related risk events through data-driven roster optimisation.",
              typicalDataEntities: ["Crew Rosters", "Fatigue Risk Scores", "Hours of Work", "Changeover Locations"],
              typicalSourceSystems: ["Crew Management System", "HR System", "TMS", "Safety Management System"],
            },
            {
              name: "Remote Operations Centre Decision Support",
              description:
                "Provide AI copilots for train controllers and dispatchers managing remote corridors, surfacing real-time alerts, recommending recovery plans, and reducing cognitive load during complex operational scenarios.",
              typicalDataEntities: ["Real-Time Alerts", "Recovery Plans", "Network State", "Incident History"],
              typicalSourceSystems: ["SCADA", "TMS", "Signalling System", "Asset Management System"],
            },
          ],
          kpis: [
            "Fatigue risk incidents",
            "Crew utilisation (%)",
            "Remote corridor response time",
            "Controller decision latency",
          ],
          personas: [
            "Head of Workforce Planning",
            "Remote Operations Manager",
            "Chief Operating Officer",
          ],
        },
      ],
    },
    {
      name: "Transform Asset Management & Maintenance",
      whyChange:
        "Rail operators manage billions in infrastructure — track, signalling, bridges, tunnels — and rolling stock, often across remote linear corridors subject to heavy axle loads and extreme environmental conditions. Unplanned failures cause major disruptions, safety risks, and contractual penalties. 30-40% of maintenance budgets are spent on time-based rather than condition-based interventions. Predictive analytics can cut maintenance costs by 20-30% while improving asset reliability and network availability.",
      priorities: [
        {
          name: "Rolling Stock Health",
          useCases: [
            {
              name: "Predictive Maintenance for Fleet",
              description:
                "Predict component failures from onboard sensors, SCADA telemetry, and maintenance history using ML models, shifting from time-based to condition-based maintenance regimes.",
              businessValue:
                "$30-50M annual savings for major operators through reduced unplanned maintenance and improved fleet availability.",
              typicalDataEntities: ["Asset Condition Data", "Maintenance History", "IoT Sensor Feeds", "Failure Predictions"],
              typicalSourceSystems: ["Asset Management System", "SCADA", "ERP", "Onboard Telemetry"],
            },
            {
              name: "Wheel & Bogie Condition Monitoring",
              description:
                "Detect wheel flats, bearing degradation, and bogie faults using wayside acoustic and vibration monitoring systems, triggering maintenance before failures cause service disruption.",
              typicalDataEntities: ["Wayside Sensor Data", "Acoustic Signatures", "Vibration Patterns", "Bearing Condition"],
              typicalSourceSystems: ["Wayside Monitoring Systems", "Asset Management System", "SCADA", "ERP"],
            },
            {
              name: "Fleet Availability Optimization",
              description:
                "Optimise maintenance rostering, depot scheduling, and spare parts allocation to maximise the number of trains available for service each day.",
            },
          ],
          kpis: [
            "Miles per technical incident (MTIN)",
            "Fleet availability (%)",
            "Unplanned maintenance ratio",
            "Mean distance between failures",
          ],
          personas: [
            "Head of Fleet Engineering",
            "VP Rolling Stock",
            "Chief Mechanical Officer",
          ],
        },
        {
          name: "Infrastructure & Track",
          useCases: [
            {
              name: "Track Geometry Deterioration Prediction",
              description:
                "Predict track geometry degradation from measurement train data, traffic tonnage, subgrade conditions, and environmental factors to optimise tamping and renewal schedules.",
            },
            {
              name: "Signalling System Health Monitoring",
              description:
                "Detect signalling equipment degradation before failure using equipment telemetry, event logs, and environmental data to prevent service-affecting faults.",
            },
            {
              name: "Bridge & Tunnel Structural Health Monitoring",
              description:
                "Continuously assess structural condition using sensor data, inspection records, and environmental loading models to prioritise maintenance and avoid costly emergency interventions.",
            },
            {
              name: "Vegetation & Lineside Management",
              description:
                "Prioritise vegetation clearance using satellite imagery, growth rate models, and leaf-fall incident history to reduce adhesion delays and lineside encroachment.",
            },
          ],
          kpis: [
            "Track quality index",
            "Signalling failure rate",
            "Temporary speed restrictions (count)",
            "Infrastructure cost per track-km",
          ],
          personas: [
            "Head of Infrastructure",
            "VP Asset Strategy",
            "Chief Engineer",
          ],
        },
      ],
    },
    {
      name: "Enhance Freight Customer Experience & Commercial Performance",
      whyChange:
        "Freight customers — miners, agribusiness, and logistics providers — demand reliable train slots, transparent performance data, ESG metrics per shipment, and simple digital access to information. Heavy-haul operators competing for modal share against road must deliver a B2B experience rivalling trucking on visibility, reliability, and cost transparency. Take-or-pay contract models and long-term haulage agreements require sophisticated commercial analytics to optimise revenue and customer retention.",
      priorities: [
        {
          name: "Shipper Portal & Digital Services",
          useCases: [
            {
              name: "Real-Time Train & Consignment Tracking",
              description:
                "Provide shipper-facing dashboards with live train position, consignment status, and corridor disruption alerts via API and web portal, giving freight customers full visibility of their shipments.",
              businessValue:
                "30-40% reduction in shipper enquiries through self-service tracking and proactive notifications.",
              typicalDataEntities: ["Train Positions", "Consignment Status", "Disruption Alerts", "ETA History"],
              typicalSourceSystems: ["TMS", "Freight Management System", "SCADA", "Shipper Portal"],
            },
            {
              name: "Self-Service Quoting & Lane Comparison",
              description:
                "Enable shippers to compare rail vs road options by cost, transit time, and carbon emissions per lane, driving modal shift to rail through transparent, data-backed decision support.",
            },
            {
              name: "Disruption Alerting & Recovery Communication",
              description:
                "Deliver proactive, automated notifications to freight customers with ETA revisions, alternative routing options, and recovery timelines when corridor disruptions occur.",
              businessValue:
                "50%+ improvement in average disruption notification lead time.",
              typicalDataEntities: ["Disruption Events", "ETA Revisions", "Alternative Routes", "Recovery Timelines"],
              typicalSourceSystems: ["TMS", "SCADA", "Freight Management System", "Notification Service"],
            },
            {
              name: "Shipper Performance Dashboard",
              description:
                "Provide per-customer views of on-time delivery, volume trends, SLA compliance, and ESG metrics, enabling shippers to monitor and report on their rail freight performance.",
              typicalDataEntities: ["Delivery Performance", "Volume Trends", "SLA Metrics", "ESG Data"],
              typicalSourceSystems: ["Freight Management System", "TMS", "CRM", "Carbon Calculator"],
            },
          ],
          kpis: [
            "Shipper NPS",
            "Digital channel adoption (%)",
            "Quote-to-book conversion rate",
            "Average notification lead time (minutes)",
          ],
          personas: [
            "Head of Customer Experience",
            "VP Freight Commercial",
            "Digital Product Manager",
          ],
        },
        {
          name: "Contract & Commercial Performance",
          useCases: [
            {
              name: "Take-or-Pay & Contract Utilisation Analytics",
              description:
                "Track contracted vs actual volumes across long-term haulage agreements, flag under/over-utilisation risks, and model rebate and penalty scenarios to optimise contract performance.",
              businessValue:
                "5-10% improvement in contract utilisation through proactive volume management.",
              typicalDataEntities: ["Contract Volumes", "Actual Volumes", "Rebate Models", "Penalty Scenarios"],
              typicalSourceSystems: ["Freight Management System", "CRM", "ERP", "TMS"],
            },
            {
              name: "SLA & On-Time Performance Cockpit",
              description:
                "Provide real-time contract performance by lane with drill-down to root-cause delays, enabling proactive account management and data-driven SLA negotiations.",
              typicalDataEntities: ["Lane Performance", "Root-Cause Delays", "SLA Status", "Contract Benchmarks"],
              typicalSourceSystems: ["TMS", "Freight Management System", "CRM", "Incident Database"],
            },
            {
              name: "Modal Shift & Revenue Growth Analytics",
              description:
                "Identify road-to-rail conversion opportunities by corridor, commodity, and customer segment using freight market data, emissions comparisons, and capacity availability.",
              businessValue:
                "Target 2-5% incremental modal shift to rail through data-driven commercial targeting.",
              typicalDataEntities: ["Market Data", "Emissions Comparisons", "Capacity Availability", "Customer Segments"],
              typicalSourceSystems: ["Freight Management System", "Market Data", "Carbon Calculator", "TMS"],
            },
          ],
          kpis: [
            "Contract utilisation (%)",
            "SLA compliance (%)",
            "Revenue per NTK",
            "Modal shift conversion rate (%)",
          ],
          personas: [
            "Chief Commercial Officer",
            "Head of Freight Sales",
            "VP Customer Success",
          ],
        },
      ],
    },
    {
      name: "Strengthen Safety, Security & Compliance",
      whyChange:
        "Rail safety is heavily regulated and public confidence is paramount. Signal Passed at Danger (SPAD) incidents, level crossing collisions, and infrastructure failures carry catastrophic consequences. In heavy-haul freight operations, road fleet and crew transport across remote regions add multi-modal safety risk. Predictive risk modelling, automated compliance reporting, and community safety analytics reduce incidents by 20-40% and streamline regulatory obligations.",
      priorities: [
        {
          name: "Safety Analytics",
          useCases: [
            {
              name: "SPAD Risk Prediction",
              description:
                "Predict Signal Passed at Danger likelihood from driver behaviour patterns, route geometry, signalling layout, and environmental conditions to target interventions at highest-risk locations.",
              typicalDataEntities: ["Driver Behaviour", "Route Geometry", "Signalling Layout", "Environmental Data"],
              typicalSourceSystems: ["Signalling System", "Driver Monitoring", "Track Database", "Weather Service"],
            },
            {
              name: "Level Crossing Risk Assessment",
              description:
                "Score level crossing risk using road traffic volumes, sighting distances, near-miss history, and population density to prioritise upgrades and closures.",
              typicalDataEntities: ["Traffic Volumes", "Sighting Distances", "Near-Miss History", "Population Data"],
              typicalSourceSystems: ["Asset Management System", "Incident Database", "Traffic Data", "GIS Platform"],
            },
            {
              name: "Worker Safety & Track Access Monitoring",
              description:
                "Track possessions, safe systems of work compliance, and near-miss events to prevent workforce injuries and improve track access planning.",
              typicalDataEntities: ["Possession Records", "Safe Work Compliance", "Near-Miss Events", "Track Access Plans"],
              typicalSourceSystems: ["Possession Management", "Safety Management System", "TMS", "HR System"],
            },
            {
              name: "Fatigue & Human Factors Analytics",
              description:
                "Analyse driver rosters, hours worked, shift patterns, and physiological indicators to identify and mitigate fatigue-related safety risk.",
            },
            {
              name: "Road Fleet Safety & Fatigue Analytics",
              description:
                "Monitor vehicle telematics, driving hours, and remote travel risk for road fleet and crew transport vehicles, aligned with multi-modal safety obligations in regions where rail crews drive long distances to reach worksites.",
              businessValue:
                "20-30% reduction in road-related safety incidents through telematics-driven intervention.",
            },
            {
              name: "Corridor Community Risk Analytics",
              description:
                "Assess trespass and level-crossing risk across remote communities along heavy-haul freight corridors, prioritising engineering controls, community engagement programs, and education campaigns.",
            },
          ],
          kpis: [
            "SPAD rate per million train-miles",
            "Workforce lost-time injuries",
            "Level crossing incidents",
            "Safety critical event rate",
            "Road fleet incident rate",
            "Community safety engagement score",
          ],
          personas: [
            "Head of Safety",
            "Chief Safety Officer",
            "VP Operations Risk",
            "Head of Network Safety",
            "Road Transport Safety Manager",
          ],
        },
        {
          name: "Regulatory Compliance & ESG",
          useCases: [
            {
              name: "Automated Safety Reporting",
              description:
                "Generate ORR/ERA and national safety authority reports from operational data pipelines with minimal manual effort, ensuring accuracy and timeliness.",
            },
            {
              name: "Carbon Emissions & Energy Reporting",
              description:
                "Automate Scope 1, 2, and 3 emissions tracking across traction energy, stations, depots, and fleet operations for net-zero target monitoring.",
            },
            {
              name: "Noise & Environmental Impact Monitoring",
              description:
                "Monitor and report noise levels, vibration, and environmental impacts along rail corridors for regulatory compliance and community engagement.",
            },
            {
              name: "Shipper Emissions Reporting & Modal Shift Analytics",
              description:
                "Provide per-customer GHG reporting showing rail vs road carbon savings per lane, powering customer-facing emissions calculators and supporting shipper sustainability targets.",
              businessValue:
                "Enable shippers to report 60-80% lower emissions per tonne-km vs road, driving modal shift.",
            },
            {
              name: "Corridor Decarbonisation Planning",
              description:
                "Model traction energy mix, renewable sourcing, locomotive idling reduction, and electrification or hydrogen scenarios at the corridor level to support net-zero operational emissions targets.",
              typicalDataEntities: ["Energy Mix", "Renewable Sourcing", "Idling Data", "Electrification Scenarios"],
              typicalSourceSystems: ["Energy Management System", "TMS", "Asset Management System", "ERP"],
            },
            {
              name: "Climate Resilience Analytics",
              description:
                "Assess flood, extreme heat, and cyclone exposure across network sections using climate projection models and historical event data, prioritising adaptation capex for long linear assets.",
              businessValue:
                "Reduce climate-related disruption costs by 15-25% through targeted infrastructure hardening.",
              typicalDataEntities: ["Climate Projections", "Historical Events", "Network Sections", "Asset Exposure"],
              typicalSourceSystems: ["Climate Data Service", "Asset Management System", "Incident Database", "GIS Platform"],
            },
          ],
          kpis: [
            "Regulatory submission timeliness",
            "Carbon intensity per NTK",
            "Environmental incident rate",
            "Shipper emissions reports generated",
            "Climate adaptation capex prioritisation score",
          ],
          personas: [
            "Head of Regulatory Affairs",
            "Chief Sustainability Officer",
            "VP Compliance",
            "Head of Climate & Environment",
          ],
        },
      ],
    },
    {
      name: "Drive Freight & Supply Chain Intelligence",
      whyChange:
        "Rail freight — particularly bulk commodities such as coal, minerals, and agricultural products across long-distance corridors like CQCN and Tarcoola–Darwin — competes with road on reliability, visibility, and flexibility. Shippers demand real-time tracking, accurate ETAs, and seamless intermodal connectivity. Data-driven freight intelligence can increase rail modal share by 5-10% and improve operator margins by 10-20%.",
      priorities: [
        {
          name: "Freight Visibility & Planning",
          useCases: [
            {
              name: "End-to-End Shipment Tracking",
              description:
                "Provide real-time consignment visibility from origin to destination across rail and intermodal legs using GPS, RFID, and network event data.",
              typicalDataEntities: ["Consignment Events", "GPS Positions", "RFID Reads", "Network Events"],
              typicalSourceSystems: ["TMS", "Freight Management System", "Terminal Operating System", "Port Management System"],
            },
            {
              name: "ETA Prediction for Freight",
              description:
                "Predict freight train arrival times using current network state, weather conditions, and historical performance data to provide shippers with reliable delivery windows.",
              businessValue:
                "90%+ ETA accuracy, reducing shipper buffer stock and improving supply chain planning.",
              typicalDataEntities: ["Network State", "Weather Data", "Historical Performance", "Train Positions"],
              typicalSourceSystems: ["TMS", "SCADA", "Weather Service", "Freight Management System"],
            },
            {
              name: "Route & Mode Optimization",
              description:
                "Recommend optimal rail, road, or intermodal routing for each shipment based on cost, transit time, carbon impact, and real-time capacity availability.",
            },
            {
              name: "Freight Demand Forecasting",
              description:
                "Forecast commodity and lane-level freight demand using economic indicators, trade flows, and seasonal patterns to optimise capacity allocation and pricing.",
              typicalDataEntities: ["Economic Indicators", "Trade Flows", "Historical Demand", "Seasonal Patterns"],
              typicalSourceSystems: ["Freight Management System", "ERP", "Market Data", "TMS"],
            },
            {
              name: "Heavy-Haul Corridor Throughput Analytics",
              description:
                "Monitor NTK throughput, train cycle times, and bottleneck dwell by corridor to optimise end-to-end coal and bulk supply chain velocity from mine to port.",
              businessValue:
                "5-10% improvement in corridor throughput through data-driven bottleneck identification and resolution.",
              typicalDataEntities: ["NTK Throughput", "Cycle Times", "Bottleneck Dwell", "Corridor Metrics"],
              typicalSourceSystems: ["TMS", "Freight Management System", "SCADA", "ERP"],
            },
          ],
          kpis: [
            "Freight reliability (%)",
            "ETA accuracy (%)",
            "Rail modal share (%)",
            "Freight revenue per train-km",
            "Corridor NTK throughput",
          ],
          personas: [
            "Head of Freight Commercial",
            "VP Logistics",
            "Chief Operating Officer",
          ],
        },
        {
          name: "Customer & Commercial Analytics",
          useCases: [
            {
              name: "Freight Customer Segmentation",
              description:
                "Segment shippers by volume, profitability, modal shift potential, and service requirements to tailor commercial strategies and account management.",
              typicalDataEntities: ["Customer Profiles", "Volume History", "Profitability", "Service Requirements"],
              typicalSourceSystems: ["Freight Management System", "CRM", "ERP", "Billing System"],
            },
            {
              name: "Dynamic Freight Pricing",
              description:
                "Optimise freight rates by corridor, commodity type, and demand intensity using ML-driven pricing models that respond to market conditions in real time.",
              typicalDataEntities: ["Pricing History", "Demand Intensity", "Capacity", "Market Rates"],
              typicalSourceSystems: ["Freight Management System", "ERP", "TMS", "Market Data"],
            },
            {
              name: "Contract & SLA Performance Analytics",
              description:
                "Track contract performance, SLA compliance, and penalty exposure across the freight customer portfolio to improve commercial outcomes and retention.",
              typicalDataEntities: ["Contract Terms", "SLA Metrics", "Penalty Exposure", "Performance History"],
              typicalSourceSystems: ["Freight Management System", "CRM", "TMS", "ERP"],
            },
          ],
          kpis: [
            "Customer retention rate (%)",
            "Contract profitability",
            "SLA compliance rate (%)",
            "Revenue growth per account",
          ],
          personas: [
            "Head of Freight Sales",
            "Chief Commercial Officer",
            "VP Customer Success",
          ],
        },
      ],
    },
  ],
};

const AUTOMOTIVE_MOBILITY: IndustryOutcome = {
  id: "automotive-mobility",
  name: "Automotive & Mobility",
  subVerticals: [
    "OEMs & Vehicle Manufacturers",
    "Importers & Distributors",
    "Dealer Groups & Retail",
    "Fleet & Leasing",
    "Mobility Services (Car Share, Subscription)",
    "Aftermarket & Service",
  ],
  suggestedDomains: [
    "Sales & Marketing",
    "Retail Operations",
    "Aftersales & Service",
    "Connected Vehicle & Telematics",
    "Supply Chain & Manufacturing",
    "Finance & Risk",
    "Customer Experience",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Enhance Customer Experience",
    "Optimize Retail Operations",
    "Grow Aftersales Profitability",
    "Accelerate Digital & Direct-to-Consumer",
    "Improve Asset Utilization",
    "Achieve ESG Targets",
  ],
  objectives: [
    {
      name: "Transform Retail & Omnichannel Sales",
      whyChange:
        "Vehicle sales are shifting online faster than most OEMs and dealer groups anticipated. Customers now research, configure, and finance vehicles digitally before visiting a showroom — if they visit at all. Agency and direct-to-consumer models are reshaping the OEM–dealer relationship, compressing margins and demanding seamless omnichannel journeys. Retailers that cannot unify online and in-store experiences risk losing buyers to competitors or new entrants who can.",
      priorities: [
        {
          name: "Omnichannel Retail & E-Commerce",
          useCases: [
            {
              name: "Digital Retail & Self-Serve Purchase Journeys",
              description:
                "Enable end-to-end online vehicle purchase including build-and-price configuration, finance pre-approval, trade-in valuation, and delivery scheduling. The platform unifies data from CRM, DMS, and inventory systems so the customer can start online and complete in-store — or vice versa — without losing context.",
              businessValue:
                "15–25% increase in online sales penetration; 30% reduction in showroom transaction time.",
            },
            {
              name: "Online-to-Offline Handoff Tracking",
              description:
                "Track every customer interaction across web, app, call centre, and showroom into a single journey timeline. Sales teams see exactly where a prospect dropped off online so they can resume the conversation without repetition.",
              businessValue:
                "10–15% improvement in lead-to-sale conversion through reduced journey friction.",
            },
            {
              name: "Dynamic Vehicle Pricing & Incentive Optimization",
              description:
                "Apply ML models to real-time inventory age, regional demand signals, competitor pricing, and OEM incentive programmes to recommend optimal transaction prices and discount allocation at a VIN level.",
              businessValue:
                "1–3% improvement in front-end gross margin per vehicle retailed.",
            },
            {
              name: "Trade-In Valuation & Instant Offer Engine",
              description:
                "Use auction data, condition-adjusted book values, and local demand models to generate accurate, real-time trade-in offers customers can receive online before visiting the dealership, increasing appraisal transparency and trust.",
              businessValue:
                "20% increase in trade-in capture rate; reduced customer negotiation time.",
            },
          ],
          kpis: [
            "Online sales penetration (%)",
            "Lead-to-sale conversion rate",
            "Average days to sell (new & used)",
            "Front-end gross profit per unit",
            "Digital journey completion rate",
          ],
          personas: [
            "Chief Commercial Officer",
            "Head of Retail Operations",
            "Dealer Principal",
            "Head of Digital Sales",
            "eCommerce Director",
          ],
        },
        {
          name: "Lead & Demand Management",
          useCases: [
            {
              name: "AI-Powered Lead Scoring & Routing",
              description:
                "Score inbound leads in real time using behavioural signals (web activity, configurator usage, finance calculator engagement) and route them to the best-matched sales consultant or digital channel, reducing response time and improving close rates.",
              businessValue:
                "20–30% improvement in lead response time; 10–15% uplift in conversion rate.",
            },
            {
              name: "Demand Sensing & Model-Mix Forecasting",
              description:
                "Combine order-bank data, web traffic, macro-economic indicators, and regional preference trends to forecast demand by model, derivative, and colour at a dealer or market level, feeding production planning and allocation decisions.",
              businessValue:
                "15–20% improvement in forecast accuracy; reduced stock imbalance across the network.",
            },
            {
              name: "Conquest & Retention Campaign Targeting",
              description:
                "Build lookalike and propensity models that identify high-value conquest prospects from competitor brands and flag existing customers approaching contract end or service milestones, enabling precision marketing spend.",
              businessValue:
                "15–25% improvement in marketing ROI; 5–8% increase in retention rate.",
            },
          ],
          kpis: [
            "Lead response time (minutes)",
            "Lead-to-appointment rate",
            "Marketing cost per sale",
            "Demand forecast accuracy (%)",
            "Conquest-to-total sales ratio",
          ],
          personas: [
            "Chief Marketing Officer",
            "Head of Sales Performance",
            "Regional Sales Director",
            "CRM Manager",
          ],
        },
        {
          name: "F&I Optimization",
          useCases: [
            {
              name: "Personalised Finance & Insurance Product Recommendation",
              description:
                "Use customer credit profile, vehicle selection, and behavioural data to recommend the optimal F&I product bundle (finance plan, GAP, service plan, tyre-and-rim) at the right moment in the purchase journey, whether online or in the business office.",
              businessValue:
                "10–20% increase in F&I income per unit; higher product penetration rates.",
              typicalDataEntities: ["Credit Profile", "Vehicle Selection", "F&I Product Catalog", "Penetration History"],
              typicalSourceSystems: ["DMS", "F&I Platform", "Credit Bureau", "CRM"],
            },
            {
              name: "Credit Risk Pre-Qualification & Decisioning",
              description:
                "Integrate credit bureau data and internal payment history to pre-qualify customers for financing before they arrive at the dealership, reducing deal fallout and accelerating the approval cycle.",
              businessValue:
                "25–35% reduction in finance approval cycle time; lower deal cancellation rate.",
              typicalDataEntities: ["Credit Bureau Data", "Payment History", "Pre-Qualification Results", "Approval Workflow"],
              typicalSourceSystems: ["Credit Bureau", "F&I Platform", "DMS", "Finance Company"],
            },
            {
              name: "F&I Compliance Monitoring",
              description:
                "Automatically audit every F&I transaction for regulatory compliance — rate mark-up limits, disclosure requirements, and fair-lending rules — flagging exceptions in real time to reduce legal and reputational risk.",
              businessValue:
                "Significant reduction in compliance-related fines and audit remediation costs.",
              typicalDataEntities: ["F&I Transactions", "Compliance Rules", "Audit Exceptions", "Disclosure Records"],
              typicalSourceSystems: ["F&I Platform", "DMS", "Compliance System", "Regulatory Database"],
            },
          ],
          kpis: [
            "F&I income per vehicle retailed",
            "Finance penetration rate (%)",
            "Product penetration rate (service plans, GAP, etc.)",
            "Deal cancellation / fallout rate",
            "Compliance exception rate",
          ],
          personas: [
            "Head of Financial Services",
            "F&I Director",
            "Dealer Principal",
            "Chief Risk Officer",
          ],
        },
      ],
    },
    {
      name: "Grow Aftersales & Lifetime Value",
      whyChange:
        "Aftersales contributes the majority of dealer group profits yet faces pressure from independent workshops, online parts retailers, and longer vehicle service intervals. At the same time, the shift to EVs reduces traditional service revenue streams (oil changes, exhaust, transmission). Growing lifetime value requires optimising service throughput, expanding accessory and parts revenue, and proactively managing warranty and recall processes.",
      priorities: [
        {
          name: "Service Lane Optimization",
          useCases: [
            {
              name: "Predictive Service Booking & Capacity Planning",
              description:
                "Forecast service demand by day, bay type, and technician skill using historical RO data, seasonal patterns, and connected-vehicle alerts to optimise appointment scheduling and reduce idle capacity.",
              businessValue:
                "10–15% improvement in service bay utilization; reduced customer wait times.",
              typicalDataEntities: ["Repair Order History", "Bay Capacity", "Technician Skills", "Connected Vehicle Alerts"],
              typicalSourceSystems: ["DMS", "Service Scheduling", "Connected Vehicle Platform", "CRM"],
            },
            {
              name: "Digital Check-In & Vehicle Health Inspection",
              description:
                "Enable customers to check in via mobile, pre-approve estimated work, and receive a digital multi-point inspection report with photos and video. Technicians use tablet-based workflows that auto-populate findings into the DMS.",
              businessValue:
                "20–30% increase in service upsell acceptance rate; improved CSI scores.",
            },
            {
              name: "Technician Productivity & Skill-Based Routing",
              description:
                "Match repair orders to technicians based on certification, proficiency, and current workload, while tracking effective labour rate and hours-per-RO to identify coaching opportunities.",
              businessValue:
                "5–10% increase in effective labour rate; improved technician retention.",
              typicalDataEntities: ["Technician Certifications", "Repair Order Complexity", "Workload", "Labour Metrics"],
              typicalSourceSystems: ["DMS", "HR System", "Service Scheduling", "Training Platform"],
            },
            {
              name: "Service Retention & Lifecycle Marketing",
              description:
                "Trigger personalised service reminders and offers based on vehicle age, mileage, warranty expiry, and past service history to retain customers beyond the warranty period and win back lapsed service customers.",
              businessValue:
                "8–12% improvement in service retention rate beyond year three.",
              typicalDataEntities: ["Vehicle Age", "Mileage", "Warranty Status", "Service History"],
              typicalSourceSystems: ["DMS", "CRM", "Marketing Platform", "Warranty System"],
            },
          ],
          kpis: [
            "Service retention rate (%)",
            "Hours per repair order",
            "Service bay utilization (%)",
            "Customer satisfaction index (CSI) — service",
            "Effective labour rate",
          ],
          personas: [
            "Head of Aftersales",
            "Service Manager",
            "Dealer Principal",
            "Customer Experience Director",
          ],
        },
        {
          name: "Parts & Accessories Revenue",
          useCases: [
            {
              name: "Parts Demand Forecasting & Inventory Optimization",
              description:
                "Use historical consumption, VIN parc data, seasonal trends, and service booking forecasts to set optimal stocking levels at each location, minimising lost sales from stock-outs while reducing obsolescence.",
              businessValue:
                "15–20% reduction in parts inventory carrying cost; 10% improvement in fill rate.",
              typicalDataEntities: ["Consumption History", "VIN Parc Data", "Service Forecasts", "Inventory Levels"],
              typicalSourceSystems: ["Parts System", "DMS", "OEM Parts Catalog", "ERP"],
            },
            {
              name: "Accessory Attachment & Bundling at Point of Sale",
              description:
                "Recommend accessories and protection products at vehicle handover using a propensity model trained on past attachment rates by model, trim, and customer segment, presenting bundles through the sales or online configurator workflow.",
              businessValue:
                "20–30% increase in accessory revenue per vehicle sold.",
              typicalDataEntities: ["Accessory Catalog", "Attachment Rates", "Model Trim Data", "Customer Segments"],
              typicalSourceSystems: ["DMS", "Configurator", "Parts System", "CRM"],
            },
            {
              name: "Competitive Parts Pricing Intelligence",
              description:
                "Monitor aftermarket and online competitor pricing for high-volume part numbers, enabling dynamic price adjustments that protect margin while remaining competitive against independent alternatives.",
              businessValue:
                "3–5% improvement in parts gross margin while maintaining market share.",
              typicalDataEntities: ["Part Numbers", "Competitor Prices", "Cost Data", "Margin Targets"],
              typicalSourceSystems: ["Parts System", "Pricing Intelligence", "ERP", "Competitor Scraping"],
            },
          ],
          kpis: [
            "Accessory penetration per vehicle sold",
            "Parts gross margin (%)",
            "Parts fill rate / first-pick availability (%)",
            "Inventory days of supply",
            "Obsolescence write-off as % of parts revenue",
          ],
          personas: [
            "Parts Director",
            "Head of Aftersales",
            "Supply Chain Manager",
            "Dealer Principal",
          ],
        },
        {
          name: "Warranty & Recall Management",
          useCases: [
            {
              name: "Warranty Claims Analytics & Fraud Detection",
              description:
                "Analyse warranty claim patterns across the dealer network to identify anomalous claim rates, repeat repairs, and potential fraud, enabling targeted audits and reducing warranty cost leakage.",
              businessValue:
                "5–10% reduction in warranty cost per vehicle; faster audit resolution.",
              typicalDataEntities: ["Warranty Claims", "Claim Patterns", "Repeat Repairs", "Dealer Metrics"],
              typicalSourceSystems: ["Warranty System", "DMS", "OEM Portal", "ERP"],
            },
            {
              name: "Early Warning Quality Feedback Loop",
              description:
                "Aggregate field failure data, connected-vehicle DTCs, and customer complaint text to detect emerging quality issues weeks before they trigger formal recalls, enabling proactive containment and engineering fixes.",
              businessValue:
                "30–50% faster defect detection; reduced recall scope and cost.",
              typicalDataEntities: ["Field Failures", "DTC Codes", "Complaint Text", "Component History"],
              typicalSourceSystems: ["Connected Vehicle Platform", "Warranty System", "CRM", "Quality System"],
            },
            {
              name: "Recall Completion Rate Optimization",
              description:
                "Use owner contact data, vehicle location, and communication preference models to maximise recall completion rates through targeted outreach campaigns across mail, email, SMS, and app notifications.",
              businessValue:
                "10–20% improvement in recall completion rate; reduced regulatory exposure.",
              typicalDataEntities: ["Owner Contact Data", "Vehicle Location", "Communication Preferences", "Recall Status"],
              typicalSourceSystems: ["CRM", "DMS", "Recall System", "Marketing Platform"],
            },
          ],
          kpis: [
            "Warranty cost per vehicle",
            "Claim rejection / adjustment rate (%)",
            "Recall completion rate (%)",
            "Time from defect detection to field action (days)",
            "Repeat repair rate (%)",
          ],
          personas: [
            "Head of Quality",
            "Warranty Manager",
            "VP Aftersales",
            "Chief Safety Officer",
          ],
        },
      ],
    },
    {
      name: "Monetize Connected Vehicles & Data",
      whyChange:
        "Modern vehicles generate terabytes of data per day from sensors, infotainment, and connectivity modules. This data represents a largely untapped revenue stream — from subscription services and usage-based insurance to predictive maintenance alerts and personalised in-car experiences. OEMs that build scalable data platforms and clear customer consent frameworks will unlock recurring revenue and deeper customer relationships well beyond the point of sale.",
      priorities: [
        {
          name: "Connected Vehicle Services & Subscriptions",
          useCases: [
            {
              name: "Over-the-Air Update Orchestration & Analytics",
              description:
                "Manage OTA software and firmware deployments across the fleet, tracking update success rates, rollback events, and feature adoption to optimise release cadence and reduce dealer workshop interventions.",
              businessValue:
                "40–60% reduction in recall-related workshop visits for software-fixable issues.",
            },
            {
              name: "Connected Vehicle Subscription Management",
              description:
                "Operate a subscription platform for in-car digital services — navigation, Wi-Fi hotspot, advanced driver assistance features — tracking attach rates, churn, and lifetime value by cohort to inform packaging and pricing decisions.",
              businessValue:
                "Incremental recurring revenue stream; target 20–30% subscription attach rate on eligible fleet.",
            },
            {
              name: "Remote Diagnostics & Proactive Service Alerts",
              description:
                "Ingest real-time DTC and telemetry data from connected vehicles to detect degradation, alert owners, and pre-schedule service appointments at their preferred dealer, converting reactive breakdowns into planned visits.",
              businessValue:
                "15–25% increase in service lane throughput from pre-diagnosed appointments.",
            },
            {
              name: "In-Vehicle Experience Personalisation",
              description:
                "Use driver preference data, location context, and usage patterns to personalise infotainment recommendations, cabin settings, and contextual offers (charging, parking, drive-through), building engagement and brand stickiness.",
              businessValue:
                "Improved NPS and brand loyalty; enabler for third-party partnership revenue.",
              typicalDataEntities: ["Driver Preferences", "Location Context", "Usage Patterns", "Offer Catalog"],
              typicalSourceSystems: ["Connected Vehicle Platform", "Infotainment System", "CRM", "Partner APIs"],
            },
          ],
          kpis: [
            "Connected vehicle subscription attach rate (%)",
            "Subscription churn rate (monthly/annual)",
            "OTA update success rate (%)",
            "Average revenue per connected vehicle per month",
            "Remote diagnostic conversion-to-service rate (%)",
          ],
          personas: [
            "Head of Connected Vehicle",
            "Chief Digital Officer",
            "VP Product (Software)",
            "Head of Customer Experience",
          ],
        },
        {
          name: "Usage-Based & Personalised Offerings",
          useCases: [
            {
              name: "Usage-Based Insurance Partnerships",
              description:
                "Share anonymised driving behaviour data (mileage, braking, time-of-day patterns) with insurance partners to enable pay-how-you-drive policies, creating value for safe drivers and generating data-partnership revenue for the OEM.",
              businessValue:
                "New revenue channel; 10–20% premium reduction for qualifying drivers increases brand value proposition.",
            },
            {
              name: "Fleet Telematics & Driver Behaviour Analytics",
              description:
                "Provide fleet operators with dashboards covering utilisation, fuel/energy efficiency, driver safety scores, and geofencing, enabling operational optimisation and duty-of-care compliance.",
              businessValue:
                "5–10% reduction in fleet operating costs; improved driver safety outcomes.",
              typicalDataEntities: ["Utilisation Metrics", "Fuel Efficiency", "Driver Safety Scores", "Geofence Events"],
              typicalSourceSystems: ["Fleet Telematics", "Connected Vehicle Platform", "Fleet Management System", "HR System"],
            },
            {
              name: "Vehicle Data Monetisation & Partner Ecosystem",
              description:
                "Build a consent-managed data marketplace that enables third-party developers, insurers, smart-city platforms, and energy providers to access anonymised, aggregated vehicle data for product innovation.",
              businessValue:
                "Opens new B2B revenue streams; strengthens ecosystem partnerships.",
            },
          ],
          kpis: [
            "Data partnership revenue",
            "Consent opt-in rate (%)",
            "Fleet telematics adoption rate (%)",
            "Driver safety score improvement (%)",
            "Third-party API transaction volume",
          ],
          personas: [
            "Chief Data Officer",
            "VP Business Development",
            "Fleet Operations Director",
            "Head of Partnerships",
          ],
        },
      ],
    },
    {
      name: "Optimize Fleet, Remarketing & Asset Utilization",
      whyChange:
        "Residual values, remarketing speed, and asset utilization rates directly impact profitability for OEM financial-services arms, leasing companies, fleet operators, and subscription providers. Volatile used-vehicle markets, rising EV depreciation uncertainty, and the growth of flexible-ownership models all demand better data-driven decision-making on when to acquire, hold, reprice, and dispose of vehicles.",
      priorities: [
        {
          name: "Fleet & Subscription Operations",
          useCases: [
            {
              name: "Fleet Utilization & Right-Sizing Analytics",
              description:
                "Analyse vehicle utilisation rates, idle time, and demand patterns across a rental, subscription, or corporate fleet to recommend optimal fleet size, mix, and rebalancing actions by location.",
              businessValue:
                "5–10% improvement in fleet utilization; reduced capital tied up in under-used assets.",
            },
            {
              name: "Subscription & Flexible-Ownership Lifecycle Management",
              description:
                "Track each vehicle through its subscription lifecycle — onboarding, swap, extension, return — using data to optimise swap timing, minimise damage charges, and predict subscriber churn.",
              businessValue:
                "15–20% reduction in subscriber churn; improved vehicle residual at de-fleet.",
            },
            {
              name: "Total Cost of Ownership Modelling",
              description:
                "Build TCO models that factor in depreciation, maintenance, fuel/energy, insurance, and downtime for each vehicle class, enabling data-driven fleet procurement and contract pricing decisions.",
              businessValue:
                "More accurate lease and subscription pricing; reduced end-of-contract losses.",
            },
          ],
          kpis: [
            "Fleet utilization rate (%)",
            "Subscriber churn rate (monthly)",
            "Average revenue per vehicle per month",
            "Vehicle turnaround time (days between users)",
            "End-of-contract gain/loss per unit",
          ],
          personas: [
            "Fleet Operations Director",
            "Head of Mobility Services",
            "VP Financial Services",
            "Remarketing Manager",
          ],
        },
        {
          name: "Residual Value & Remarketing",
          useCases: [
            {
              name: "AI-Driven Residual Value Forecasting",
              description:
                "Predict future residual values at a VIN level using vehicle specification, mileage trajectory, condition data, regional market trends, and macro-economic indicators, feeding lease pricing, provisioning, and risk models.",
              businessValue:
                "20–30% improvement in residual value forecast accuracy; reduced book-to-market variance.",
            },
            {
              name: "Used Vehicle Sourcing & Pricing Intelligence",
              description:
                "Scan auction, trade-in, and wholesale market data in real time to identify acquisition opportunities that match retail demand profiles, recommending buy/pass decisions and optimal bid prices.",
              businessValue:
                "5–8% improvement in used-vehicle gross margin through smarter sourcing.",
            },
            {
              name: "Remarketing Channel Optimization",
              description:
                "Determine the highest-return disposition channel — retail, wholesale, auction, export, or certified pre-owned — for each returning vehicle based on condition, market demand, and holding cost, minimising time-to-sale.",
              businessValue:
                "10–15% reduction in average days to sell for de-fleeted vehicles.",
            },
            {
              name: "Certified Pre-Owned Programme Analytics",
              description:
                "Identify returning lease and fleet vehicles that meet CPO criteria, forecast reconditioning cost versus retail uplift, and target marketing to high-propensity CPO buyers to maximise programme volume and margin.",
              businessValue:
                "Higher CPO volume and penetration; improved customer retention into the brand ecosystem.",
            },
          ],
          kpis: [
            "Residual value forecast accuracy (% variance)",
            "Average days to sell (used/remarketed vehicles)",
            "Used vehicle gross profit per unit",
            "CPO penetration rate (%)",
            "Book-to-market value ratio",
          ],
          personas: [
            "Head of Remarketing",
            "VP Used Vehicles",
            "Chief Financial Officer",
            "Dealer Principal",
            "Pricing Analytics Manager",
          ],
        },
      ],
    },
    {
      name: "Lead in Sustainable Mobility",
      whyChange:
        "Regulatory mandates on fleet-average CO2 emissions, rising consumer demand for electric vehicles, and investor focus on ESG performance are making sustainability a board-level priority. OEMs face ZEV-sales quotas, dealers must build EV-ready showrooms and service capabilities, and the entire value chain needs transparent emissions and circularity reporting. Those who move early will capture EV-intender demand, qualify for green financing, and avoid non-compliance penalties.",
      priorities: [
        {
          name: "EV Adoption & Charging",
          useCases: [
            {
              name: "EV Demand Forecasting & Network Readiness",
              description:
                "Model EV adoption curves by region using registration data, incentive structures, charging infrastructure density, and demographic profiles to align production allocation, dealer stock, and training investment with anticipated demand.",
              businessValue:
                "Reduced EV stock imbalance; faster dealer readiness in high-growth markets.",
            },
            {
              name: "Charging Network Analytics & Site Selection",
              description:
                "Analyse connected-vehicle trip data, energy consumption patterns, and third-party POI data to identify optimal locations for branded or partner charging stations and forecast utilisation rates.",
              businessValue:
                "Higher charger utilization; improved owner charging satisfaction and brand loyalty.",
            },
            {
              name: "EV Battery Health Monitoring & Second-Life Assessment",
              description:
                "Track battery state-of-health over time using BMS telemetry, predicting remaining useful life for warranty, residual-value, and second-life repurposing decisions.",
              businessValue:
                "More accurate EV residual values; new revenue from battery second-life programmes.",
            },
            {
              name: "EV Owner Experience & Range Confidence",
              description:
                "Provide personalised range predictions, smart charging schedules, and route planning that factor in driving style, weather, payload, and real-time charger availability, reducing range anxiety and improving EV ownership satisfaction.",
              businessValue:
                "Improved EV NPS; higher EV re-purchase intent.",
            },
          ],
          kpis: [
            "EV sales mix (%)",
            "Charger utilization rate (%)",
            "EV customer satisfaction / NPS",
            "Battery state-of-health at lease return (%)",
            "EV stock turn vs. ICE stock turn",
          ],
          personas: [
            "Chief Sustainability Officer",
            "Head of EV Strategy",
            "VP Product Planning",
            "Charging Infrastructure Manager",
            "Dealer Principal",
          ],
        },
        {
          name: "Emissions & Circularity Reporting",
          useCases: [
            {
              name: "Fleet CO2 & Emissions Compliance Dashboard",
              description:
                "Aggregate production, registration, and real-world emissions data to track fleet-average CO2 against regulatory targets (EU, CAFE), modelling the impact of sales-mix changes and credit-trading scenarios.",
              businessValue:
                "Avoid non-compliance penalties that can reach hundreds of millions; optimise credit trading strategy.",
            },
            {
              name: "Supply Chain Carbon Footprint Tracking",
              description:
                "Collect Scope 1-3 emissions data from tier-1 and tier-2 suppliers, mapping the carbon footprint of each vehicle programme and identifying reduction levers aligned with science-based targets.",
              businessValue:
                "Transparent ESG reporting; identification of decarbonisation savings opportunities.",
            },
            {
              name: "Circular Economy & End-of-Life Vehicle Analytics",
              description:
                "Track material composition, recycled content, and end-of-life recovery rates per vehicle to support EU Battery Regulation and ELV Directive reporting, and identify circular design improvements.",
              businessValue:
                "Regulatory compliance; reduced raw material costs through increased recycled content.",
            },
          ],
          kpis: [
            "Fleet-average CO2 (g/km) vs. regulatory target",
            "Scope 1-3 emissions (tonnes CO2e)",
            "Recycled content rate (%)",
            "End-of-life vehicle recovery rate (%)",
            "ESG rating / score improvement",
          ],
          personas: [
            "Chief Sustainability Officer",
            "VP Regulatory Affairs",
            "Head of Supply Chain",
            "ESG Reporting Manager",
            "Chief Financial Officer",
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry -- Built-in (static) outcome maps
// ---------------------------------------------------------------------------

/** Built-in industry outcome maps (curated from /docs/outcome maps/). */
export const INDUSTRY_OUTCOMES: IndustryOutcome[] = [
  BANKING,
  INSURANCE,
  HLS,
  RCG,
  MANUFACTURING,
  ENERGY_UTILITIES,
  WATER_UTILITIES,
  COMMUNICATIONS,
  MEDIA_ADVERTISING,
  DIGITAL_NATIVES,
  GAMES,
  RAIL_TRANSPORT,
  AUTOMOTIVE_MOBILITY,
];

/**
 * Look up an industry outcome by its id (built-in only, synchronous).
 * For server-side code that should also check custom maps, use
 * `getIndustryOutcomeAsync` instead.
 */
export function getIndustryOutcome(
  id: string
): IndustryOutcome | undefined {
  return INDUSTRY_OUTCOMES.find((i) => i.id === id);
}

/**
 * Get all industry ids and names for populating dropdowns (built-in only).
 * For a full list including custom maps, use `getAllIndustryOutcomes`.
 */
export function getIndustryOptions(): { id: string; name: string }[] {
  return INDUSTRY_OUTCOMES.map((i) => ({ id: i.id, name: i.name }));
}

// ---------------------------------------------------------------------------
// Server-only async functions (DB-aware, support custom maps)
// ---------------------------------------------------------------------------
// The async functions (getAllIndustryOutcomes, getIndustryOutcomeAsync,
// buildReferenceUseCasesPrompt, buildIndustryContextPrompt, buildIndustryKPIsPrompt)
// live in ./industry-outcomes-server.ts to avoid pulling Prisma/pg into
// client bundles. Import from there in server-side code (pipeline steps, API routes).
