import type { IndustryOutcome } from "./index";

export const HLS: IndustryOutcome = {
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
