import type { IndustryOutcome } from "./index";

export const MEDIA_ADVERTISING: IndustryOutcome = {
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
