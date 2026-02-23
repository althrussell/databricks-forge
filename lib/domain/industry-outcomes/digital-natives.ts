import type { IndustryOutcome } from "./index";

export const DIGITAL_NATIVES: IndustryOutcome = {
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
