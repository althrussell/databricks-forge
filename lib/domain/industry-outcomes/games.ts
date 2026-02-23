import type { IndustryOutcome } from "./index";

export const GAMES: IndustryOutcome = {
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
