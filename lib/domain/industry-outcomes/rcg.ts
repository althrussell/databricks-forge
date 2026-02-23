import type { IndustryOutcome } from "./index";

export const RCG: IndustryOutcome = {
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
