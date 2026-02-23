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
            },
            {
              name: "Hyper Personalized Banking",
              description:
                "Leverage AI and customer data to deliver tailored banking experiences, improving customer satisfaction and loyalty through personalized insights and recommendations.",
            },
            {
              name: "Cross Sell and Upsell Products",
              description:
                "Implement targeted strategies to offer complementary or upgraded products to existing customers, boosting revenue and customer retention.",
            },
            {
              name: "Churn Prediction and Customer Segmentation",
              description:
                "Use ML models to predict customer churn and segment the customer base effectively, enabling proactive retention efforts and tailored service offerings.",
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
            },
            {
              name: "Transaction Enrichment",
              description:
                "Automate the classification of merchants from transaction data to deliver clearer insights into spending patterns.",
            },
            {
              name: "Open Banking Integration",
              description:
                "Create seamless data-sharing ecosystems between market participants and banking aggregators through APIs and data sharing.",
            },
            {
              name: "Data Monetization",
              description:
                "Generate new revenue streams by leveraging anonymized customer data to deliver insights and create value for third-party partners.",
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
            },
            {
              name: "SMB and Corporate Banking Innovation",
              description:
                "Leverage data and AI to provide tailored financial products and services for small and medium businesses.",
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
            },
            {
              name: "Credit Decisioning",
              description:
                "Utilize advanced analytics and ML to streamline credit decisioning, improving accuracy in assessing borrower risk.",
            },
            {
              name: "Credit Limit Management",
              description:
                "Leverage data-driven insights to proactively assess and adjust credit limits based on customer behavior and creditworthiness.",
            },
            {
              name: "Debt Collection Optimization",
              description:
                "Employ predictive analytics to optimize debt collection strategies, identifying the most effective approaches for different customer segments.",
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
            },
            {
              name: "Regulatory Reporting Automation",
              description:
                "Streamline regulatory reporting processes with automated data pipelines, ensuring accuracy and timeliness of submissions.",
            },
            {
              name: "Compliance Monitoring",
              description:
                "Implement real-time compliance monitoring systems that detect potential violations before they escalate.",
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
            },
            {
              name: "Identity Fraud Detection",
              description:
                "Use ML to detect identity fraud and synthetic identities during account opening and transactions.",
            },
            {
              name: "Network Fraud Analysis",
              description:
                "Apply graph analytics to uncover fraud rings and complex fraud networks across customer relationships.",
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
            },
            {
              name: "Liquidity Management",
              description:
                "Use predictive models to optimize liquidity management and cash flow forecasting across the organization.",
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
            },
            {
              name: "Process Mining and Optimization",
              description:
                "Analyze operational processes to identify bottlenecks and optimize workflows across back and middle office functions.",
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
            },
            {
              name: "Channel Performance Analytics",
              description:
                "Analyze performance across digital and physical channels to optimize resource allocation and customer experience.",
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
            },
            {
              name: "Producer Analysis",
              description:
                "Analyze broker and agent performance to optimize sales channel effectiveness and commission structures.",
            },
            {
              name: "Client New/Lost Business Analysis",
              description:
                "Track and analyze new business acquisition and client attrition patterns across distribution channels.",
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
            },
            {
              name: "Touchless Underwriting",
              description:
                "Enable end-to-end digital underwriting for standard risks, reducing manual intervention by over 25%.",
            },
            {
              name: "Telematics-Based Pricing",
              description:
                "Leverage IoT and telematics data for usage-based insurance pricing that rewards good behavior.",
            },
            {
              name: "Actuarial Modeling Automation",
              description:
                "Accelerate actuarial modeling with ML to improve pricing accuracy and reduce time to market for new products.",
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
            },
            {
              name: "Churn Prediction and Retention",
              description:
                "Use ML models to predict policy churn and implement proactive retention strategies.",
            },
            {
              name: "Cross-Sell and Upsell",
              description:
                "Identify cross-sell and upsell opportunities across insurance product lines using behavioral analytics.",
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
            },
            {
              name: "Automated Claims Processing",
              description:
                "Automate claims intake, assessment, and settlement using AI to reduce processing time and improve accuracy.",
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
            },
            {
              name: "Solvency Monitoring",
              description:
                "Monitor solvency ratios and capital adequacy in real-time to ensure compliance with Solvency II and local regulations.",
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
            },
            {
              name: "QSAR Modeling",
              description:
                "Quantitative Structure-Activity Relationship modeling to predict molecular properties and optimize drug candidates.",
            },
            {
              name: "Digital Pathology Image Classification",
              description:
                "Apply computer vision to classify pathology images for disease diagnosis and drug response prediction.",
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
            },
            {
              name: "Clinical Trial Site Selection",
              description:
                "Leverage analytics to identify optimal trial sites based on patient populations, investigator experience, and historical performance.",
            },
            {
              name: "Drug Repurposing",
              description:
                "Use AI to identify new therapeutic applications for existing approved drugs, reducing development time and cost.",
            },
            {
              name: "Clinical Data Quality Assurance",
              description:
                "Automate QA of clinical data pipelines using AI to ensure data integrity and regulatory compliance.",
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
            },
            {
              name: "Research Assistant AI",
              description:
                "Deploy AI assistants to help researchers navigate scientific literature and internal research data.",
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
            },
            {
              name: "Inventory Optimization",
              description:
                "Optimize inventory levels across the distribution network balancing service levels with expiration risk.",
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
            },
            {
              name: "Overall Equipment Effectiveness (OEE)",
              description:
                "Monitor and optimize manufacturing equipment effectiveness using real-time analytics.",
            },
            {
              name: "Digital Twins for Manufacturing",
              description:
                "Create digital twins of manufacturing processes for simulation, optimization, and quality assurance.",
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
            },
            {
              name: "Pharmacovigilance & Adverse Event Detection",
              description:
                "Monitor drug safety using AI to detect adverse events from multiple data sources including social media and EHR data.",
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
            },
            {
              name: "Next-Best-Action Recommendations",
              description:
                "Use ML to recommend the optimal next interaction with each provider across omnichannel touchpoints.",
            },
            {
              name: "Sales Rep AI Assistant",
              description:
                "Deploy AI assistants for field sales teams to prepare for provider interactions with relevant insights and talking points.",
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
    "E-Commerce",
    "Travel & Hospitality",
  ],
  suggestedDomains: [
    "Supply Chain",
    "Marketing",
    "Customer Experience",
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
            },
            {
              name: "Supplier Performance Scoring",
              description:
                "Score and rank suppliers on quality, delivery, cost, and sustainability metrics to optimize sourcing decisions.",
            },
          ],
          kpis: [
            "Supplier risk score",
            "Disruption response time",
            "Supplier diversification index",
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
            },
            {
              name: "Inventory Optimization",
              description:
                "Optimize inventory levels across the supply network using AI to balance service levels with carrying costs.",
            },
            {
              name: "Markdown and Pricing Optimization",
              description:
                "Use ML to optimize markdown timing and pricing strategies to maximize revenue recovery on slow-moving inventory.",
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
            },
            {
              name: "Category Performance Analytics",
              description:
                "Analyze category performance collaboratively with trading partners to optimize assortment and promotions.",
              businessValue:
                "72-hour category review cycles versus six weeks with manual methods.",
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
                "Build unified customer profiles from transactional, behavioral, and demographic data across all touchpoints.",
            },
            {
              name: "Real-Time Personalization",
              description:
                "Deliver personalized product recommendations, offers, and content in real-time across digital and physical channels.",
            },
            {
              name: "Loyalty Program Optimization",
              description:
                "Optimize loyalty program design and rewards using data analytics to maximize customer retention and lifetime value.",
            },
          ],
          kpis: [
            "Customer lifetime value",
            "Personalization engagement rate",
            "Loyalty program ROI",
          ],
          personas: [
            "Chief Marketing Officer",
            "Head of CRM",
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
            },
            {
              name: "Consumer Sentiment Analysis",
              description:
                "Analyze social media, reviews, and surveys to understand consumer sentiment and emerging trends.",
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
            },
            {
              name: "Remote Monitoring and Diagnostics",
              description:
                "Enable real-time monitoring and diagnostics of products in the field, reducing service costs and improving uptime.",
            },
            {
              name: "Product Feature Usage Analytics",
              description:
                "Analyze how customers use products to inform design improvements and tailor offerings.",
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
            },
            {
              name: "Product Testing Optimization",
              description:
                "Use ML to optimize testing strategies, reduce test cycles, and predict product performance from simulated data.",
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
            },
            {
              name: "Next Best Commercial Offer",
              description:
                "Use AI to identify the optimal offer for each customer based on purchase history, product usage, and lifecycle stage.",
            },
            {
              name: "Churn Modeling",
              description:
                "Predict customer churn and implement proactive retention strategies based on engagement patterns.",
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
            },
            {
              name: "Predictive Maintenance for Energy Assets",
              description:
                "Predict equipment failures across generation, transmission, and distribution assets to reduce unplanned downtime.",
              businessValue: "$6M infrastructure cost savings (Viessmann case).",
            },
            {
              name: "Grid Optimization",
              description:
                "Optimize electricity transmission and distribution networks for efficiency, reliability, and renewable integration.",
            },
            {
              name: "Well Performance Optimization",
              description:
                "Use subsurface data interpretation and ML to optimize oil and gas well performance and production rates.",
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
            },
            {
              name: "Safety Event Prediction",
              description:
                "Use ML models to predict safety incidents and enable preventive interventions.",
              businessValue:
                "Predict dangerous well-bore influxes 45 minutes before they occur (NOV case).",
            },
            {
              name: "Environmental Monitoring",
              description:
                "Monitor emissions, leaks, and environmental impact in real-time for compliance and sustainability.",
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
            },
            {
              name: "Regulatory Compliance Automation",
              description:
                "Automate compliance with energy regulations across jurisdictions, reducing manual effort and risk.",
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
            },
            {
              name: "Financial Planning & Forecasting",
              description:
                "Improve financial planning accuracy with AI-driven forecasting incorporating operational and market data.",
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
            },
            {
              name: "Personalized Energy Recommendations",
              description:
                "Provide personalized energy-saving recommendations to customers based on consumption patterns and building data.",
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
  ],
  suggestedDomains: [
    "Network Operations",
    "Asset Management",
    "Customer Experience",
    "Environmental Compliance",
    "Water Quality",
    "Finance",
  ],
  suggestedPriorities: [
    "Optimize Operations",
    "Reduce Leakage",
    "Improve Water Quality",
    "Mitigate Risk",
    "Achieve ESG",
  ],
  objectives: [
    {
      name: "Optimize Network Operations",
      whyChange:
        "Water utilities lose an average of 20-30% of treated water to leakage and inefficiency. Data-driven network management, predictive asset maintenance, and demand forecasting deliver substantial cost savings, improve service reliability, and reduce supply interruptions.",
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
            },
            {
              name: "Pipe Burst Prediction",
              description:
                "Predict burst risk from pipe age, material, soil conditions, weather, and historical failure patterns to enable proactive intervention.",
            },
            {
              name: "Demand Forecasting",
              description:
                "Forecast water demand by DMA using weather, seasonality, population, and consumption patterns to optimise pumping schedules and reservoir levels.",
            },
          ],
          kpis: [
            "Leakage (Ml/d)",
            "Supply interruptions (CML)",
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
            },
            {
              name: "Capital Investment Optimisation",
              description:
                "Prioritise mains renewal and asset replacement programmes to maximise risk reduction per pound of capital investment.",
              businessValue:
                "Improved capital efficiency by targeting highest-risk assets first across AMP planning cycles.",
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
      ],
    },
    {
      name: "Protect Water Quality & Environment",
      whyChange:
        "Regulatory scrutiny on water quality, pollution incidents, and environmental performance is intensifying. Data-driven monitoring and prediction enables proactive compliance, reduces pollution events, and supports net-zero carbon targets.",
      priorities: [
        {
          name: "Water Quality Compliance",
          useCases: [
            {
              name: "Water Quality Anomaly Detection",
              description:
                "Detect quality exceedances at treatment works and in-network using continuous monitoring data, triggering early intervention before compliance breaches.",
            },
            {
              name: "Chemical Dosing Optimisation",
              description:
                "Optimise coagulant, chlorine, and pH dosing using source water quality and flow data to reduce chemical costs while maintaining compliance.",
            },
            {
              name: "Catchment Risk Assessment",
              description:
                "Assess raw water quality risk from agricultural run-off, industrial discharges, and climate factors to inform catchment management programmes.",
            },
          ],
          kpis: [
            "DWI compliance (%)",
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
          name: "Environmental & Sustainability Performance",
          useCases: [
            {
              name: "Sewer Overflow (CSO) Prediction",
              description:
                "Predict combined sewer overflow events from rainfall forecasts, network level sensors, and flow data to enable proactive spill prevention.",
              businessValue:
                "Reduce CSO spill frequency and duration, directly impacting EPA/Ofwat performance commitments.",
            },
            {
              name: "Carbon Emissions Tracking",
              description:
                "Automate Scope 1, 2, and 3 emissions reporting across pumping, treatment, transport, and fleet operations.",
            },
            {
              name: "Pollution Incident Prevention",
              description:
                "Identify high-risk discharge points using telemetry, event history, and network hydraulic models to prevent category 1-3 pollution incidents.",
            },
          ],
          kpis: [
            "Pollution incidents (category 1-3)",
            "CSO spill frequency and duration",
            "Carbon intensity (kgCO2e/Ml)",
            "Bathing water compliance",
          ],
          personas: [
            "Head of Environment",
            "Chief Sustainability Officer",
            "VP Wastewater",
          ],
        },
      ],
    },
    {
      name: "Improve Customer & Commercial Performance",
      whyChange:
        "Water utilities face growing expectations around customer experience, affordability, and transparency. Smart metering and advanced analytics unlock personalised engagement, accurate billing, and identification of vulnerable customers who need additional support.",
      priorities: [
        {
          name: "Customer Experience & Billing",
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
                "Improved C-MeX scores and reduced bad debt through proactive vulnerability management.",
            },
            {
              name: "Meter-to-Cash Accuracy",
              description:
                "Detect billing anomalies, estimated-read drift, and unbilled consumption to improve revenue assurance and customer trust.",
            },
          ],
          kpis: [
            "C-MeX score",
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
    "Satellite Communications",
    "MVNOs",
  ],
  suggestedDomains: [
    "Customer Experience",
    "Network Operations",
    "Marketing",
    "Operations",
    "Risk & Compliance",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Enhance Experience",
    "Reduce Cost",
    "Optimize Operations",
    "Mitigate Risk",
  ],
  objectives: [
    {
      name: "Enhance Customer Experience",
      whyChange:
        "Telecoms face poor customer satisfaction (consumer NPS -65 to -1), flat-to-negative revenue growth, and rising costs. Customer acquisition costs are at all-time highs. AI-driven customer experience transformation is critical for survival.",
      priorities: [
        {
          name: "Consumer Business",
          useCases: [
            {
              name: "Predictive Scripts for Contact Center",
              description:
                "Use AI to analyze customer communications, understand context and sentiment, and prepare tailored responses for first-point resolution.",
              businessValue:
                "20%+ reduction in care call volume, 10%+ reduction in handling time ($670M cost savings at AT&T).",
            },
            {
              name: "Churn Prediction and Retention",
              description:
                "Advanced ML models to predict churn by analyzing behavior, complaints, billing issues, renewal dates, and NPS scores.",
              businessValue:
                "1% churn reduction can increase profits by tens of millions annually.",
            },
            {
              name: "Intelligent Bill Analysis",
              description:
                "AI compares bills over time, explaining variations to customers and automating credit adjustments within designated limits.",
            },
            {
              name: "Hyper Personalized Offers",
              description:
                "Create hyper-personalized offers including cybersecurity products, network slicing, and additional bandwidth based on usage insights.",
            },
          ],
          kpis: [
            "NPS improvement (20% YoY)",
            "Churn rate reduction (1-2%)",
            "First point resolution (30% improvement)",
            "ARPU growth (15%)",
          ],
          personas: [
            "Head of Consumer Business",
            "Head of Marketing",
            "Head of Customer Experience",
          ],
        },
        {
          name: "B2B & Enterprise",
          useCases: [
            {
              name: "AI-Powered Pricing and Quoting",
              description:
                "Integrate maps, fiber network data, and customer insights to generate accurate quotes in seconds rather than days.",
            },
            {
              name: "Automated MACs Processing",
              description:
                "AI monitors and automates Moves, Adds, and Changes requests (25-35% of B2B service requests) across channels.",
            },
            {
              name: "Proactive SMB Offers",
              description:
                "Identify high-LTV SMB customers and proactively offer tailored packages for IoT, network slicing, and 5G solutions.",
              businessValue:
                "20% increase in new logo sales (Frontier case).",
            },
          ],
          kpis: [
            "Quote-to-cash cycle time (40% improvement)",
            "SLA compliance (99.9%)",
            "Cross-sell revenue (20% increase)",
          ],
          personas: [
            "Head of Enterprise Business",
            "Head of SMB",
            "Head of Service Delivery",
          ],
        },
        {
          name: "Service Delivery",
          useCases: [
            {
              name: "Automated Order Entry & Activation",
              description:
                "Use AI to automate order entry across systems, reducing error rates from 40% to near-zero and enabling 24/7 activation.",
            },
            {
              name: "Intelligent Provisioning",
              description:
                "AI-driven provisioning with predictive analytics to anticipate network needs and optimize resource allocation.",
            },
            {
              name: "Proactive Service Assurance",
              description:
                "AI-driven monitoring for proactive identification and resolution of service issues before they impact customers.",
            },
          ],
          kpis: [
            "Order accuracy (99.9%)",
            "Service activation time (50% reduction)",
            "Order-to-cash cycle (20% reduction)",
          ],
          personas: [
            "Head of Service Delivery",
            "VP Operations",
            "Chief Information Officer",
          ],
        },
      ],
    },
    {
      name: "Optimize Network & Field Operations",
      whyChange:
        "Network complexity is increasing with 5G, IoT, and fiber deployments. AI-driven network optimization and field operations automation are essential for maintaining service quality while controlling costs.",
      priorities: [
        {
          name: "Network Operations",
          useCases: [
            {
              name: "Network Performance Monitoring",
              description:
                "Monitor network and service performance in real-time using AI to detect anomalies and predict capacity needs.",
            },
            {
              name: "Predictive Network Demand",
              description:
                "Predict network demand changes to proactively optimize capacity and avoid congestion.",
            },
            {
              name: "Network Capacity Planning",
              description:
                "Track network capacity in real-time with proactive offers based on usage patterns and growth projections.",
            },
          ],
          kpis: [
            "Network availability",
            "Mean time to repair",
            "Capacity utilization",
          ],
          personas: [
            "VP Network Operations",
            "Chief Technology Officer",
            "Head of Network Planning",
          ],
        },
        {
          name: "Field Operations",
          useCases: [
            {
              name: "AI-Powered Field Tech Support",
              description:
                "Equip field technicians with AI assistants for real-time troubleshooting guidance and knowledge access.",
            },
            {
              name: "Predictive Field Service",
              description:
                "Predict equipment failures and dispatch field technicians proactively before service is affected.",
            },
          ],
          kpis: [
            "First-time fix rate",
            "Average repair time",
            "Truck roll reduction",
          ],
          personas: [
            "Head of Field Operations",
            "VP Network Engineering",
            "Chief Operating Officer",
          ],
        },
      ],
    },
    {
      name: "Security & Compliance",
      whyChange:
        "Telecoms face sophisticated fraud, evolving privacy regulations, and increasing cybersecurity threats. AI-powered detection and automated compliance are essential for protecting revenue and customer trust.",
      priorities: [
        {
          name: "Fraud Prevention",
          useCases: [
            {
              name: "Fraud Detection & Prevention",
              description:
                "Detect and prevent fraud including subscription fraud, international revenue share fraud, and account takeover.",
            },
            {
              name: "Robo-calling & Bot Detection",
              description:
                "Use AI to monitor and detect robocalling, bot activities, and SIM swap attempts in real-time.",
            },
          ],
          kpis: [
            "Fraud loss reduction",
            "Detection accuracy",
            "False positive rate",
          ],
          personas: [
            "Head of Fraud Prevention",
            "Chief Information Security Officer",
            "VP Revenue Assurance",
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
            },
            {
              name: "Household Device Graphing",
              description:
                "Link multiple devices to individual households using first-party signals to dramatically augment identity coverage.",
            },
            {
              name: "Customer Profile Enrichment",
              description:
                "Aggregate data from multiple touchpoints to create rich profiles of audience interests, preferences, demographics, and psychographics.",
            },
            {
              name: "Audience Segmentation",
              description:
                "ML-driven algorithms to create dynamic audience segments based on behavioral patterns, content preferences, and demographics.",
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
            },
            {
              name: "Yield Optimization",
              description:
                "Optimize ad inventory yield by predicting CPMs and dynamically adjusting pricing and placement strategies.",
            },
            {
              name: "Ad Measurement & Attribution",
              description:
                "Provide advertisers with accurate cross-platform measurement and attribution to prove ad effectiveness.",
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
            },
            {
              name: "AI-Powered Content Metadata",
              description:
                "Use AI to automatically tag, classify, and enrich content metadata for improved discoverability and recommendations.",
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
            },
            {
              name: "Identity Resolution",
              description:
                "Recognize users across multiple platforms and touchpoints to create a unified customer view.",
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
            },
            {
              name: "Churn Mitigation",
              description:
                "Understand and mitigate player churn across the player lifecycle using behavioral analytics and ML models.",
            },
            {
              name: "Player Segmentation",
              description:
                "Better understand player behavior through ML-driven clustering to drive more impactful engagement and retention strategies.",
            },
            {
              name: "Player Identity Resolution",
              description:
                "Identify players across their entire engagement journey from web to ad targeting to in-game across multiple platforms and titles.",
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
            },
            {
              name: "Game Balance Optimization",
              description:
                "Use analytics to continuously monitor and adjust game balance, economy, and difficulty to maintain player satisfaction.",
            },
            {
              name: "Content Pipeline Optimization",
              description:
                "Optimize content delivery scheduling based on player engagement patterns and seasonal trends.",
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
    "Passenger Rail",
    "Rail Infrastructure & Signalling",
    "Intermodal Logistics",
    "Urban Transit & Metro",
  ],
  suggestedDomains: [
    "Network Operations",
    "Asset Management",
    "Customer Experience",
    "Safety & Compliance",
    "Supply Chain",
    "Finance",
  ],
  suggestedPriorities: [
    "Optimize Operations",
    "Reduce Cost",
    "Increase Revenue",
    "Mitigate Risk",
    "Achieve ESG",
  ],
  objectives: [
    {
      name: "Optimize Network & Train Operations",
      whyChange:
        "Rail networks handle millions of train movements annually across complex, interdependent timetables. A single 5-minute delay cascades into hundreds of disrupted services. AI-driven scheduling, real-time operations management, and capacity optimization are essential to improve punctuality, throughput, and energy efficiency.",
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
            },
            {
              name: "Real-Time Delay Prediction & Management",
              description:
                "Predict knock-on delays across the network using real-time train positions, infrastructure status, and historical delay propagation patterns, recommending recovery actions to controllers.",
              businessValue:
                "20-30% reduction in secondary delay minutes through proactive intervention.",
            },
            {
              name: "Platform & Station Capacity Optimization",
              description:
                "Model passenger flows through stations using ticketing, Wi-Fi, and sensor data to optimise dwell times, platform allocation, and crowd management during peak periods.",
            },
            {
              name: "Energy-Efficient Driving Advisory",
              description:
                "Optimise speed profiles using gradient data, timetable slack, and rolling stock characteristics to reduce traction energy consumption while maintaining punctuality.",
              businessValue:
                "10-15% traction energy savings through optimised coasting and braking strategies.",
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
          ],
          kpis: [
            "Freight train reliability (%)",
            "Yard dwell time (hours)",
            "Wagon utilisation rate (%)",
            "Terminal throughput (lifts per hour)",
          ],
          personas: [
            "Head of Freight",
            "VP Terminal Operations",
            "Chief Operating Officer",
          ],
        },
      ],
    },
    {
      name: "Transform Asset Management & Maintenance",
      whyChange:
        "Rail operators manage billions in infrastructure — track, signalling, bridges, tunnels — and rolling stock. Unplanned failures cause major disruptions and safety risks. 30-40% of maintenance budgets are spent on time-based rather than condition-based interventions. Predictive analytics can cut maintenance costs by 20-30% while improving asset reliability.",
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
            },
            {
              name: "Wheel & Bogie Condition Monitoring",
              description:
                "Detect wheel flats, bearing degradation, and bogie faults using wayside acoustic and vibration monitoring systems, triggering maintenance before failures cause service disruption.",
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
      name: "Grow Passenger Revenue & Experience",
      whyChange:
        "Passenger expectations are shaped by airline and ride-hailing experiences. Revenue management, real-time information, and personalised services are critical for growing ridership and optimising yield. Operators leveraging dynamic pricing see 5-15% revenue uplift. Post-pandemic recovery requires data-driven capacity and demand alignment.",
      priorities: [
        {
          name: "Revenue Management",
          useCases: [
            {
              name: "Dynamic Pricing & Yield Management",
              description:
                "Optimise fares by service, time of day, and demand using booking curves, competitor pricing, and elasticity models to maximise revenue per seat-km.",
              businessValue:
                "5-15% revenue uplift from dynamic pricing on key routes.",
            },
            {
              name: "Demand Forecasting for Capacity Planning",
              description:
                "Forecast passenger volumes by route, day, and time using historical ridership, events, weather, and economic indicators to right-size train formations and reduce overcrowding.",
              businessValue:
                "15-25% improvement in load factor through demand-aligned capacity.",
            },
            {
              name: "Ancillary Revenue Optimization",
              description:
                "Personalise upsell offers for first-class upgrades, Wi-Fi packages, car parking, and onboard catering based on customer profiles and journey context.",
            },
          ],
          kpis: [
            "Revenue per seat-km",
            "Load factor (%)",
            "Yield per passenger",
            "Ancillary revenue per journey",
          ],
          personas: [
            "Chief Commercial Officer",
            "Head of Revenue Management",
            "VP Pricing",
          ],
        },
        {
          name: "Customer Experience & Engagement",
          useCases: [
            {
              name: "Real-Time Passenger Information",
              description:
                "Deliver accurate, context-aware journey updates across apps, station screens, and announcements using live train data and disruption feeds.",
            },
            {
              name: "Passenger Flow & Crowding Analytics",
              description:
                "Predict crowding by platform, carriage, and time using ticket sales, sensor data, and historical patterns to guide passengers toward less crowded options.",
            },
            {
              name: "Customer Sentiment & Feedback Analytics",
              description:
                "Analyse complaints, social media, and survey responses using NLP to identify systemic service issues and prioritise improvements.",
            },
            {
              name: "Disruption Communication Automation",
              description:
                "Auto-generate clear, consistent, and timely disruption messaging from control room data using AI, ensuring passengers receive accurate information across all channels.",
            },
          ],
          kpis: [
            "Passenger satisfaction score",
            "NPS",
            "Real-time information accuracy (%)",
            "Complaints per million journeys",
          ],
          personas: [
            "Head of Customer Experience",
            "VP Commercial",
            "Chief Marketing Officer",
          ],
        },
      ],
    },
    {
      name: "Strengthen Safety, Security & Compliance",
      whyChange:
        "Rail safety is heavily regulated and public confidence is paramount. Signal Passed at Danger (SPAD) incidents, level crossing collisions, and infrastructure failures carry catastrophic consequences. Predictive risk modelling and automated compliance reporting reduce incidents by 20-40% and streamline regulatory obligations.",
      priorities: [
        {
          name: "Safety Analytics",
          useCases: [
            {
              name: "SPAD Risk Prediction",
              description:
                "Predict Signal Passed at Danger likelihood from driver behaviour patterns, route geometry, signalling layout, and environmental conditions to target interventions at highest-risk locations.",
            },
            {
              name: "Level Crossing Risk Assessment",
              description:
                "Score level crossing risk using road traffic volumes, sighting distances, near-miss history, and population density to prioritise upgrades and closures.",
            },
            {
              name: "Worker Safety & Track Access Monitoring",
              description:
                "Track possessions, safe systems of work compliance, and near-miss events to prevent workforce injuries and improve track access planning.",
            },
            {
              name: "Fatigue & Human Factors Analytics",
              description:
                "Analyse driver rosters, hours worked, shift patterns, and physiological indicators to identify and mitigate fatigue-related safety risk.",
            },
          ],
          kpis: [
            "SPAD rate per million train-miles",
            "Workforce lost-time injuries",
            "Level crossing incidents",
            "Safety critical event rate",
          ],
          personas: [
            "Head of Safety",
            "Chief Safety Officer",
            "VP Operations Risk",
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
          ],
          kpis: [
            "Regulatory submission timeliness",
            "Carbon intensity per passenger-km",
            "Environmental incident rate",
          ],
          personas: [
            "Head of Regulatory Affairs",
            "Chief Sustainability Officer",
            "VP Compliance",
          ],
        },
      ],
    },
    {
      name: "Drive Freight & Supply Chain Intelligence",
      whyChange:
        "Rail freight competes with road on reliability, visibility, and flexibility. Shippers demand real-time tracking, accurate ETAs, and seamless intermodal connectivity. Data-driven freight intelligence can increase rail modal share by 5-10% and improve operator margins by 10-20%.",
      priorities: [
        {
          name: "Freight Visibility & Planning",
          useCases: [
            {
              name: "End-to-End Shipment Tracking",
              description:
                "Provide real-time consignment visibility from origin to destination across rail and intermodal legs using GPS, RFID, and network event data.",
            },
            {
              name: "ETA Prediction for Freight",
              description:
                "Predict freight train arrival times using current network state, weather conditions, and historical performance data to provide shippers with reliable delivery windows.",
              businessValue:
                "90%+ ETA accuracy, reducing shipper buffer stock and improving supply chain planning.",
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
            },
          ],
          kpis: [
            "Freight reliability (%)",
            "ETA accuracy (%)",
            "Rail modal share (%)",
            "Freight revenue per train-km",
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
            },
            {
              name: "Dynamic Freight Pricing",
              description:
                "Optimise freight rates by corridor, commodity type, and demand intensity using ML-driven pricing models that respond to market conditions in real time.",
            },
            {
              name: "Contract & SLA Performance Analytics",
              description:
                "Track contract performance, SLA compliance, and penalty exposure across the freight customer portfolio to improve commercial outcomes and retention.",
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
