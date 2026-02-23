import type { IndustryOutcome } from "./index";

export const ENERGY_UTILITIES: IndustryOutcome = {
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
