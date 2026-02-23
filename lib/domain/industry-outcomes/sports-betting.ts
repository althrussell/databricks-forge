import type { IndustryOutcome } from "./index";

export const SPORTS_BETTING: IndustryOutcome = {
  id: "sports-betting",
  name: "Sports Betting & Wagering",
  subVerticals: [
    "Sports Betting (Fixed Odds)",
    "Racing (Thoroughbred, Harness, Greyhounds)",
    "In-Play / Live Betting",
    "Retail Wagering (TAB outlets, pubs, clubs)",
    "iGaming & Casino",
    "Lotteries & Keno",
  ],
  suggestedDomains: [
    "Trading & Risk",
    "Marketing & CRM",
    "Customer Experience",
    "Responsible Gambling",
    "Finance",
    "Operations",
    "Data & Analytics",
  ],
  suggestedPriorities: [
    "Increase Revenue",
    "Enhance Customer Experience",
    "Mitigate Risk",
    "Ensure Compliance",
    "Reduce Cost",
    "Drive Innovation",
  ],
  objectives: [
    {
      name: "Know & Grow the Punter",
      whyChange:
        "Customer acquisition costs in Australian wagering have tripled as competition intensifies and advertising restrictions tighten. Operators must unify fragmented customer data across retail TAB venues, mobile apps, and digital platforms, personalise offers without breaching responsible gambling obligations, and retain high-value customers to protect margins. Those who cannot build a single view of the punter will lose share to operators who can.",
      priorities: [
        {
          name: "Customer Intelligence & 360 View",
          useCases: [
            {
              name: "Punter 360",
              description:
                "Build a unified customer profile spanning retail TAB, digital app, and call centre channels — combining betting history, deposit/withdrawal patterns, promotional responses, responsible gambling settings, and customer service interactions into a single view.",
              businessValue:
                "Foundational for all personalisation, retention, and responsible gambling use cases. Operators report 15-25% uplift in campaign effectiveness after deploying unified profiles.",
              typicalDataEntities: ["Customer Profiles", "Bet History", "Deposit & Withdrawal Records", "Channel Interactions", "Responsible Gambling Settings"],
              typicalSourceSystems: ["Betting Platform / PAM", "CRM", "Payment Gateway", "Retail Terminal System", "Customer Service Platform"],
            },
            {
              name: "Customer Segmentation",
              description:
                "Segment the customer base using ML-driven clustering across dimensions including sport/racing preference, bet type (singles vs multis vs exotics), stake level, session frequency, channel preference, and promotional sensitivity to drive targeted engagement strategies.",
              businessValue:
                "10-20% improvement in promotional ROI through segment-specific campaigns instead of blanket offers.",
              typicalDataEntities: ["Bet History", "Customer Profiles", "Segment Definitions", "Engagement Scores", "Promotional Response Data"],
              typicalSourceSystems: ["Betting Platform / PAM", "CRM", "Marketing Platform", "Analytics Platform"],
            },
            {
              name: "Identity Resolution (Retail + Digital)",
              description:
                "Link anonymous retail TAB transactions (cash bets, terminal usage) to known digital accounts using loyalty cards, venue check-ins, and behavioural matching to close the attribution gap between retail and digital channels.",
              businessValue:
                "20-30% increase in attributable retail revenue; enables true omnichannel customer understanding.",
              typicalDataEntities: ["Identity Graph", "Retail Transaction Logs", "Loyalty Card Events", "Digital Account IDs", "Venue Check-In Data"],
              typicalSourceSystems: ["Retail Terminal System", "Loyalty Platform", "Betting Platform / PAM", "Venue Management System"],
            },
            {
              name: "Churn Prediction & Win-Back",
              description:
                "Predict customer churn risk using declining login frequency, reduced stake sizes, dormant account signals, and competitive switching indicators, then trigger automated win-back campaigns calibrated to the customer's value tier and responsible gambling profile.",
              businessValue:
                "15-25% reduction in high-value customer attrition through proactive intervention.",
              typicalDataEntities: ["Customer Activity Logs", "Bet History", "Churn Risk Scores", "Win-Back Campaign Results", "Dormancy Indicators"],
              typicalSourceSystems: ["Betting Platform / PAM", "CRM", "Marketing Platform", "Analytics Platform"],
            },
          ],
          kpis: [
            "Customer Lifetime Value (CLV)",
            "Monthly Active Customers (MAC)",
            "Churn rate (%)",
            "Retail-to-digital attribution rate (%)",
            "Customer data completeness score",
          ],
          personas: [
            "Head of Customer Intelligence",
            "VP Marketing & CRM",
            "Chief Data Officer",
            "Head of Retail Operations",
          ],
        },
        {
          name: "Personalisation & CRM",
          useCases: [
            {
              name: "Next Best Offer",
              description:
                "Use real-time context — upcoming events, recent bet history, sport/racing preferences, and current odds movements — to recommend personalised bet suggestions, boosted odds, and promotional offers at the optimal moment across push notification, app, and email channels.",
              businessValue:
                "15-25% increase in offer acceptance rates; measurable uplift in bets per active customer.",
              typicalDataEntities: ["Customer Preferences", "Event Calendar", "Odds Movements", "Promotional Catalog", "Real-Time Bet Activity"],
              typicalSourceSystems: ["Betting Platform / PAM", "Odds Feed Provider", "CRM", "Marketing Platform", "Event Data Provider"],
            },
            {
              name: "Promotional Spend Optimization",
              description:
                "Model the incremental revenue impact of each promotional type (bonus bets, boosted odds, deposit matches, refund specials) by customer segment and event type, reallocating budget from low-ROI generics to high-impact targeted promotions.",
              businessValue:
                "10-20% improvement in promotional ROI; reduction in bonus bet cost as a percentage of revenue.",
              typicalDataEntities: ["Promotion Definitions", "Redemption History", "Incremental Revenue Attribution", "Bonus Bet Costs", "Customer Segments"],
              typicalSourceSystems: ["Betting Platform / PAM", "CRM", "Finance System", "Marketing Platform"],
            },
            {
              name: "VIP & High-Value Customer Management",
              description:
                "Identify, monitor, and proactively manage high-value customers through dedicated relationship management, bespoke limits, personalised event experiences, and early detection of dissatisfaction or competitive switching signals.",
              businessValue:
                "Top 5% of customers typically generate 40-60% of revenue — protecting this cohort is existential.",
              typicalDataEntities: ["VIP Tier Assignments", "Relationship Manager Notes", "High-Value Bet Activity", "Competitive Intelligence", "Event Attendance"],
              typicalSourceSystems: ["CRM", "Betting Platform / PAM", "VIP Management System", "Customer Service Platform"],
            },
            {
              name: "Lifecycle Marketing Automation",
              description:
                "Orchestrate automated, trigger-based marketing journeys across the customer lifecycle — onboarding sequences for new sign-ups, reactivation flows for lapsed customers, milestone rewards, and seasonal event ramp-up campaigns — personalised by channel preference and betting behaviour.",
              businessValue:
                "30-40% improvement in onboarding-to-first-bet conversion; reduced manual campaign operations.",
              typicalDataEntities: ["Customer Lifecycle Stage", "Journey Definitions", "Trigger Events", "Channel Preferences", "Campaign Performance"],
              typicalSourceSystems: ["Marketing Platform", "CRM", "Betting Platform / PAM", "Email/Push Service"],
            },
          ],
          kpis: [
            "Offer acceptance rate (%)",
            "Promotional ROI",
            "Bonus bet cost as % of net wagering revenue",
            "VIP retention rate (%)",
            "Onboarding-to-first-bet conversion rate",
          ],
          personas: [
            "Head of CRM",
            "VP Marketing",
            "VIP Relationship Manager",
            "Head of Customer Experience",
          ],
        },
      ],
    },
    {
      name: "Optimise Trading & Revenue",
      whyChange:
        "Wagering margins are under sustained pressure from sophisticated punters using odds-comparison tools, competitors offering best-price guarantees, and the rise of high-volume, low-margin multi-leg products. Trading desks must evolve from intuition-based pricing to model-driven, algorithmically-assisted operations — managing in-play liability in real time, pricing complex multi-leg and same-game-multi products accurately, and optimising the revenue mix across racing, sport, and novelty markets.",
      priorities: [
        {
          name: "Pricing & Market Making",
          useCases: [
            {
              name: "Dynamic Odds Compilation",
              description:
                "Use ML models incorporating form data, historical results, market movements, and competitor pricing to compile opening odds and dynamically adjust prices as money flows in, balancing margin targets against market competitiveness.",
              businessValue:
                "1-3% improvement in theoretical margin through more accurate initial pricing and faster market response.",
              typicalDataEntities: ["Form & Statistics Data", "Market Movements", "Competitor Odds", "Liability Positions", "Historical Results"],
              typicalSourceSystems: ["Odds Feed Provider", "Racing Data Feed", "Betting Platform / PAM", "Competitor Scraping Service", "Sports Data Provider"],
            },
            {
              name: "In-Play Automated Trading",
              description:
                "Automate in-play odds adjustments using real-time match state (score, time, momentum indicators) and streaming liability data, enabling sub-second price updates and automated suspension triggers for key events (goals, wickets, tries).",
              businessValue:
                "50-70% reduction in in-play trader manual interventions; improved margin capture during fast-moving events.",
              typicalDataEntities: ["Live Match State", "In-Play Liability", "Price Adjustment Rules", "Suspension Triggers", "Streaming Odds"],
              typicalSourceSystems: ["Sports Data Provider", "Betting Platform / PAM", "In-Play Trading Engine", "Odds Feed Provider"],
            },
            {
              name: "Multi-Leg & Same-Game-Multi Pricing",
              description:
                "Price correlated multi-leg and same-game-multi bets using correlation matrices derived from historical co-occurrence data, adjusting for leg dependencies that simple multiplication of individual odds fails to capture.",
              businessValue:
                "Multi-leg products are the fastest-growing bet type — accurate correlation pricing protects margin on 30-50% of digital turnover.",
              typicalDataEntities: ["Correlation Matrices", "Leg Dependencies", "Historical Co-Occurrence Data", "Multi-Bet Configurations", "Margin Models"],
              typicalSourceSystems: ["Sports Data Provider", "Betting Platform / PAM", "Trading Engine", "Analytics Platform"],
            },
            {
              name: "Margin & Overround Optimization",
              description:
                "Dynamically adjust overround (margin built into odds) by market type, event profile, and competitive position, using elasticity models to find the pricing sweet spot that maximises revenue without driving price-sensitive customers to competitors.",
              businessValue:
                "0.5-1.5% improvement in achieved margin without material impact on turnover.",
              typicalDataEntities: ["Overround Settings", "Price Elasticity Models", "Competitive Price Index", "Market-Level P&L", "Turnover by Market"],
              typicalSourceSystems: ["Betting Platform / PAM", "Odds Feed Provider", "Competitor Scraping Service", "Finance System"],
            },
          ],
          kpis: [
            "Theoretical margin vs achieved margin (%)",
            "In-play turnover growth (%)",
            "Multi-leg product margin (%)",
            "Odds competitiveness index",
            "Trader interventions per event",
          ],
          personas: [
            "Head of Trading",
            "Chief Trading Officer",
            "Head of Sports Trading",
            "Head of Racing Trading",
          ],
        },
        {
          name: "Revenue & Yield Management",
          useCases: [
            {
              name: "Yield per Customer Analytics",
              description:
                "Track net wagering revenue, turnover, and margin at the individual customer level across all products and channels, enabling yield-based segmentation and identification of unprofitable customer cohorts that consume disproportionate promotional spend.",
              businessValue:
                "5-10% improvement in net revenue per active customer through yield-informed promotional allocation.",
              typicalDataEntities: ["Customer-Level P&L", "Turnover by Product", "Promotional Costs per Customer", "Yield Segments", "Channel Revenue"],
              typicalSourceSystems: ["Betting Platform / PAM", "Finance System", "CRM", "Analytics Platform"],
            },
            {
              name: "Product Mix Optimization",
              description:
                "Analyse revenue, margin, and growth trends across the product portfolio — fixed-odds sport, racing (win/place/exotics), multis, in-play, and novelties — to inform product investment, promotional weighting, and content scheduling decisions.",
              businessValue:
                "Shift promotional spend toward highest-margin, highest-growth product categories.",
              typicalDataEntities: ["Product Taxonomy", "Revenue by Product", "Margin by Product", "Growth Trends", "Promotional Allocation"],
              typicalSourceSystems: ["Betting Platform / PAM", "Finance System", "Analytics Platform", "Trading Engine"],
            },
            {
              name: "Cash-Out Pricing & Liability Management",
              description:
                "Price cash-out offers in real time using current odds, liability exposure, and customer behaviour models (cash-out propensity), balancing the margin captured on early settlement against the customer experience benefit of the feature.",
              businessValue:
                "Cash-out is a key retention feature — optimised pricing can improve cash-out margin by 2-5% while maintaining usage rates.",
              typicalDataEntities: ["Open Bet Positions", "Current Odds", "Cash-Out Propensity Scores", "Liability Exposure", "Settlement History"],
              typicalSourceSystems: ["Betting Platform / PAM", "Trading Engine", "Odds Feed Provider", "Analytics Platform"],
            },
            {
              name: "Bonus Bet ROI & Wagering Turnover Analytics",
              description:
                "Track the full lifecycle of bonus bets and promotional credits — issuance, wagering turnover, conversion to real-money bets, and incremental revenue generated — to measure true ROI and identify promotional structures that drive sustainable behaviour rather than one-time arbitrage.",
              businessValue:
                "Bonus bets represent 5-15% of operator costs — rigorous ROI tracking can reclaim 10-20% of wasted promotional spend.",
              typicalDataEntities: ["Bonus Bet Issuance", "Turnover Requirements", "Conversion Events", "Incremental Revenue", "Promotional Structures"],
              typicalSourceSystems: ["Betting Platform / PAM", "Finance System", "CRM", "Marketing Platform"],
            },
          ],
          kpis: [
            "Net wagering revenue per active customer",
            "Product mix margin contribution (%)",
            "Cash-out utilisation rate (%)",
            "Bonus bet ROI",
            "Wagering turnover growth (%)",
          ],
          personas: [
            "Chief Commercial Officer",
            "Head of Revenue",
            "VP Trading",
            "Head of Product",
          ],
        },
      ],
    },
    {
      name: "Lead in Responsible Gambling & Compliance",
      whyChange:
        "Australian regulators (ACMA, state racing/gaming authorities, AUSTRAC) are progressively tightening harm-minimisation obligations — mandatory pre-commitment tools, deposit limits, activity statements, and advertising restrictions are now law or imminent. AML/CTF requirements demand real-time transaction monitoring and automated suspicious-matter reporting. Non-compliance carries licence-threatening penalties and severe reputational damage. Operators who embed responsible gambling into their data and analytics strategy will turn a compliance burden into a competitive and social-licence advantage.",
      priorities: [
        {
          name: "Harm Minimisation & Player Protection",
          useCases: [
            {
              name: "Early Intervention & At-Risk Detection",
              description:
                "Use ML models to detect behavioural markers of gambling harm — escalating stakes, chasing losses, extended session durations, frequent deposit top-ups, and erratic bet patterns — triggering automated interventions (pop-up messages, cooling-off suggestions, staff alerts) before harm materialises.",
              businessValue:
                "Reduces regulatory risk and customer harm; operators report 20-30% reduction in harm-related complaints after deploying early-warning systems.",
              typicalDataEntities: ["Behavioural Markers", "Session Duration Data", "Deposit Frequency", "Stake Escalation Patterns", "Intervention Triggers"],
              typicalSourceSystems: ["Betting Platform / PAM", "Responsible Gambling Platform", "Analytics Platform", "Customer Service Platform"],
            },
            {
              name: "Affordability & Spend Monitoring",
              description:
                "Monitor individual customer spend against configurable thresholds (self-set limits, operator-set limits, and regulatory thresholds), integrating deposit data, net losses over time, and — where available — affordability signals to flag customers who may be betting beyond their means.",
              businessValue:
                "Proactive affordability monitoring is becoming a regulatory expectation in multiple jurisdictions — early adoption reduces enforcement risk.",
              typicalDataEntities: ["Deposit History", "Net Loss Tracking", "Limit Configurations", "Affordability Indicators", "Threshold Breach Events"],
              typicalSourceSystems: ["Betting Platform / PAM", "Payment Gateway", "Responsible Gambling Platform", "Finance System"],
            },
            {
              name: "Self-Exclusion & Limit Management Analytics",
              description:
                "Track the effectiveness of self-exclusion programmes and voluntary limit-setting — adoption rates, limit types, breach attempts, reinstatement patterns — to continuously improve the design of player protection tools and demonstrate regulatory compliance.",
              businessValue:
                "Evidence-based refinement of harm-minimisation tools; supports regulatory submissions and licence renewals.",
              typicalDataEntities: ["Self-Exclusion Records", "Voluntary Limits", "Breach Attempts", "Reinstatement Requests", "Programme Effectiveness Metrics"],
              typicalSourceSystems: ["Responsible Gambling Platform", "Betting Platform / PAM", "National Self-Exclusion Register", "CRM"],
            },
            {
              name: "Responsible Gambling Reporting & Dashboards",
              description:
                "Provide executive and regulatory dashboards showing key responsible gambling metrics — harm indicator prevalence, intervention volumes, self-exclusion trends, limit adoption rates, and customer complaint analysis — enabling data-driven governance and transparent reporting to regulators and boards.",
              businessValue:
                "Board-level visibility into responsible gambling posture; streamlined regulatory reporting.",
              typicalDataEntities: ["RG Metrics Summary", "Intervention Volumes", "Self-Exclusion Trends", "Complaint Categories", "Regulatory Submissions"],
              typicalSourceSystems: ["Responsible Gambling Platform", "Betting Platform / PAM", "Customer Service Platform", "Analytics Platform"],
            },
          ],
          kpis: [
            "At-risk detection rate (%)",
            "Time from detection to intervention (minutes)",
            "Self-exclusion adoption rate (%)",
            "Voluntary limit-setting rate (%)",
            "Harm-related complaint volume",
          ],
          personas: [
            "Head of Responsible Gambling",
            "Chief Risk Officer",
            "VP Compliance",
            "General Counsel",
          ],
        },
        {
          name: "Regulatory & AML/CTF Compliance",
          useCases: [
            {
              name: "AML Transaction Monitoring & Suspicious Activity Detection",
              description:
                "Apply rules-based and ML-driven transaction monitoring to detect suspicious patterns — structuring deposits below reporting thresholds, rapid deposit-and-withdrawal cycles (chip dumping), unusually large single transactions, and third-party funding indicators — generating automated suspicious matter reports (SMRs) for AUSTRAC.",
              businessValue:
                "Reduces AML/CTF compliance risk; AUSTRAC enforcement actions have resulted in penalties exceeding $1B — automated monitoring is essential.",
              typicalDataEntities: ["Transaction Records", "Suspicious Activity Indicators", "SMR Reports", "Customer Risk Ratings", "Threshold Rules"],
              typicalSourceSystems: ["Payment Gateway", "Betting Platform / PAM", "AML/CTF Platform", "Identity Verification Provider", "AUSTRAC Reporting"],
            },
            {
              name: "KYC & Identity Verification Analytics",
              description:
                "Track KYC completion rates, verification failure reasons, document fraud attempts, and time-to-verify across the customer onboarding pipeline, identifying bottlenecks and fraud vectors while ensuring 100% compliance with identity verification obligations.",
              businessValue:
                "Faster onboarding (reduced drop-off); improved fraud detection at the point of account creation.",
              typicalDataEntities: ["KYC Records", "Verification Status", "Document Fraud Flags", "Onboarding Funnel Metrics", "Verification Timelines"],
              typicalSourceSystems: ["Identity Verification Provider", "Betting Platform / PAM", "Document Verification Service", "CRM"],
            },
            {
              name: "Regulatory Reporting Automation",
              description:
                "Automate the preparation and submission of regulatory returns — wagering tax calculations, point-of-consumption tax, responsible gambling statistical returns, AML/CTF compliance reports, and licence condition reporting — from operational data pipelines with audit trails and reconciliation checks.",
              businessValue:
                "60-80% reduction in manual regulatory reporting effort; improved accuracy and timeliness.",
              typicalDataEntities: ["Tax Calculations", "Wagering Revenue by Jurisdiction", "Regulatory Return Templates", "Audit Trails", "Reconciliation Records"],
              typicalSourceSystems: ["Finance System", "Betting Platform / PAM", "AUSTRAC Reporting", "State Regulatory Portals", "Tax Engine"],
            },
            {
              name: "Advertising Compliance Monitoring",
              description:
                "Monitor advertising and promotional content across channels (TV, digital, social, venue signage) for compliance with advertising codes — inducement restrictions, responsible gambling messaging requirements, excluded-person targeting, and time-of-day restrictions — using automated content scanning and audience analytics.",
              businessValue:
                "Reduces risk of ACMA enforcement action and reputational damage from advertising code breaches.",
              typicalDataEntities: ["Ad Campaign Records", "Compliance Rules", "Channel Restrictions", "Audience Targeting Data", "Breach Incident Logs"],
              typicalSourceSystems: ["Marketing Platform", "Ad Platform", "Compliance System", "CRM", "Social Media Monitoring"],
            },
          ],
          kpis: [
            "SMR submission timeliness (%)",
            "KYC verification pass rate (%)",
            "Time-to-verify (minutes)",
            "Regulatory return accuracy (%)",
            "Advertising compliance breach count",
          ],
          personas: [
            "Head of AML/CTF",
            "Chief Compliance Officer",
            "VP Regulatory Affairs",
            "Money Laundering Reporting Officer",
          ],
        },
      ],
    },
    {
      name: "Transform the Omnichannel Experience",
      whyChange:
        "Customers expect seamless transitions between retail TAB venues, mobile apps, and desktop platforms. Live streaming, in-play betting, social features, and instant cash-out are now table stakes. With 70%+ of wagering turnover shifting to digital, operators must deliver friction-free, engaging digital experiences while maintaining relevant retail presence for the significant customer base that still values the social and venue experience. Those who master the omnichannel journey will capture disproportionate share.",
      priorities: [
        {
          name: "Digital & In-Play Experience",
          useCases: [
            {
              name: "In-Play Betting Performance Analytics",
              description:
                "Monitor in-play betting platform performance in real time — bet placement latency, odds refresh rates, suspension accuracy, and error rates by sport and market type — to identify and resolve experience issues before they impact turnover.",
              businessValue:
                "Every 100ms of bet placement latency costs measurable turnover — sub-second performance is a competitive differentiator.",
              typicalDataEntities: ["Bet Placement Latency", "Odds Refresh Metrics", "Suspension Events", "Error Rates", "Platform Health Metrics"],
              typicalSourceSystems: ["Betting Platform / PAM", "APM", "In-Play Trading Engine", "CDN", "Analytics Platform"],
            },
            {
              name: "Live Streaming Engagement Analytics",
              description:
                "Correlate live streaming viewership with betting activity — tracking concurrent viewers, stream-to-bet conversion, sport/race preference by stream, and streaming quality metrics — to optimise content investment and streaming-integrated betting features.",
              businessValue:
                "Customers who stream and bet simultaneously have 2-3x higher session value — understanding this link drives content ROI.",
              typicalDataEntities: ["Stream Viewership", "Concurrent Viewer Counts", "Stream-to-Bet Events", "Quality Metrics", "Content Costs"],
              typicalSourceSystems: ["Live Streaming Platform", "Betting Platform / PAM", "CDN", "Analytics Platform", "Content Management System"],
            },
            {
              name: "App Performance & UX Optimization",
              description:
                "Analyse app performance metrics (crash rates, ANR rates, load times), UX heatmaps, navigation flows, and A/B test results to continuously improve the digital betting experience and reduce friction in the bet placement journey.",
              businessValue:
                "10-15% improvement in bet placement completion rate through UX optimization.",
              typicalDataEntities: ["App Crash Reports", "Performance Metrics", "UX Heatmaps", "A/B Test Results", "Navigation Flows"],
              typicalSourceSystems: ["APM", "Analytics Platform", "A/B Testing Platform", "App Store Analytics", "Betting Platform / PAM"],
            },
            {
              name: "Bet Placement Funnel Conversion",
              description:
                "Track the full bet placement funnel — from event browsing through market selection, bet slip construction, stake entry, and bet confirmation — identifying drop-off points and optimising each step to maximise conversion rates.",
              businessValue:
                "5-10% increase in bet placement conversion drives material incremental revenue at zero acquisition cost.",
              typicalDataEntities: ["Funnel Step Events", "Drop-Off Points", "Bet Slip Abandonment", "Stake Distribution", "Conversion Rates"],
              typicalSourceSystems: ["Betting Platform / PAM", "Analytics Platform", "A/B Testing Platform", "UX Analytics"],
            },
          ],
          kpis: [
            "In-play bet placement latency (ms)",
            "Stream-to-bet conversion rate (%)",
            "App crash rate (%)",
            "Bet placement funnel conversion (%)",
            "Digital turnover as % of total",
          ],
          personas: [
            "Head of Digital Product",
            "VP Customer Experience",
            "Head of Engineering",
            "Chief Technology Officer",
          ],
        },
        {
          name: "Retail & Venue Integration",
          useCases: [
            {
              name: "Retail-to-Digital Migration Analytics",
              description:
                "Track and encourage the migration of retail-only customers to digital channels — measuring migration rates, dual-channel adoption, and the revenue uplift from customers who bet across both channels — while ensuring the transition does not cannibalise venue operator relationships.",
              businessValue:
                "Dual-channel customers typically generate 2-4x the revenue of single-channel customers.",
              typicalDataEntities: ["Channel Migration Events", "Dual-Channel Customer IDs", "Revenue by Channel", "Venue Operator Agreements", "Migration Campaign Results"],
              typicalSourceSystems: ["Betting Platform / PAM", "Retail Terminal System", "CRM", "Analytics Platform", "Venue Management System"],
            },
            {
              name: "Venue Performance & Terminal Optimization",
              description:
                "Analyse performance across the retail venue network — turnover per terminal, peak usage patterns, product mix by venue, and terminal uptime — to optimise terminal deployment, venue selection, and retail product offering.",
              businessValue:
                "10-15% improvement in revenue per terminal through data-driven placement and product optimization.",
              typicalDataEntities: ["Terminal Transactions", "Venue Profiles", "Peak Usage Patterns", "Terminal Uptime", "Venue Revenue"],
              typicalSourceSystems: ["Retail Terminal System", "Venue Management System", "Betting Platform / PAM", "Finance System"],
            },
            {
              name: "Omnichannel Journey Tracking",
              description:
                "Map the complete customer journey across retail, app, web, and call centre touchpoints — understanding how customers discover events, research form, place bets, and collect winnings across channels — to identify journey friction and optimise the cross-channel experience.",
              businessValue:
                "20-30% reduction in journey friction points; improved customer satisfaction scores.",
              typicalDataEntities: ["Journey Events", "Touchpoint Sequence", "Channel Transitions", "Friction Points", "Satisfaction Scores"],
              typicalSourceSystems: ["Betting Platform / PAM", "Retail Terminal System", "Analytics Platform", "CRM", "Customer Service Platform"],
            },
            {
              name: "Race & Sports Content Personalisation",
              description:
                "Personalise the content experience — featured races, promoted events, form guides, tips, and expert content — based on the customer's sport/race preferences, betting history, and geographic location (local racing, home-team sport) to increase engagement and bet frequency.",
              businessValue:
                "15-20% increase in content engagement; higher bets-per-session through relevant content surfacing.",
              typicalDataEntities: ["Content Catalog", "Customer Preferences", "Geographic Data", "Form & Tips Content", "Engagement Metrics"],
              typicalSourceSystems: ["Content Management System", "Betting Platform / PAM", "Racing Data Feed", "Sports Data Provider", "CRM"],
            },
          ],
          kpis: [
            "Retail-to-digital migration rate (%)",
            "Dual-channel customer revenue uplift",
            "Revenue per terminal",
            "Omnichannel NPS",
            "Content engagement rate (%)",
          ],
          personas: [
            "Head of Retail Operations",
            "VP Omnichannel",
            "Head of Content",
            "Venue Partnerships Manager",
          ],
        },
      ],
    },
    {
      name: "Drive Operational Excellence",
      whyChange:
        "Wagering platforms must handle massive, predictable spikes — Melbourne Cup day, State of Origin, AFL/NRL Grand Finals — where transaction volumes can surge 10-50x above baseline without any degradation in bet placement speed or odds accuracy. Legacy platforms inherited from acquisitions (Tabcorp/Tatts merger, Entain's multi-brand consolidation) create data silos that prevent unified analytics. Modernising the data estate, democratising analytics access, and optimising infrastructure and operational costs are foundational to competing effectively in a margin-compressed industry.",
      priorities: [
        {
          name: "Platform & Data Modernisation",
          useCases: [
            {
              name: "Platform Scalability & Peak-Event Analytics",
              description:
                "Monitor and forecast platform capacity across peak wagering events — modelling expected transaction volumes, pre-scaling infrastructure, and analysing real-time platform health during events to ensure zero-downtime performance on the biggest betting days of the year.",
              businessValue:
                "A single minute of downtime during Melbourne Cup can cost $500K+ in lost turnover — predictive scaling prevents this.",
              typicalDataEntities: ["Transaction Volumes", "Infrastructure Metrics", "Capacity Forecasts", "Event Calendar", "Incident History"],
              typicalSourceSystems: ["APM", "Cloud Platform", "Betting Platform / PAM", "Event Data Provider", "Incident Management System"],
            },
            {
              name: "Data Estate Consolidation & Quality",
              description:
                "Consolidate fragmented data estates from acquired brands and legacy systems into a unified data lakehouse, implementing data quality rules, lineage tracking, and master data management to create a single source of truth for customer, trading, and financial data.",
              businessValue:
                "30-50% reduction in data engineering overhead; trusted data foundation for all analytics and AI use cases.",
              typicalDataEntities: ["Data Quality Scores", "Lineage Maps", "Master Data Entities", "Schema Registries", "Data Source Inventory"],
              typicalSourceSystems: ["Legacy Betting Platforms", "Data Warehouse", "ETL/ELT Pipelines", "Master Data Management", "Data Catalog"],
            },
            {
              name: "Self-Service Analytics & Data Democratization",
              description:
                "Enable non-technical stakeholders — trading, marketing, compliance, and commercial teams — to explore data and build insights through self-service BI tools, natural-language query interfaces, and curated data products, reducing dependency on centralised data teams.",
              businessValue:
                "60-70% reduction in ad-hoc data request backlog; faster decision-making across the business.",
              typicalDataEntities: ["Curated Data Products", "Semantic Models", "User Query Logs", "Dashboard Catalog", "Access Policies"],
              typicalSourceSystems: ["BI Platform", "Data Catalog", "Betting Platform / PAM", "Analytics Platform", "Identity & Access Management"],
            },
            {
              name: "Real-Time Data Pipeline Monitoring",
              description:
                "Monitor the health, latency, and throughput of real-time data pipelines that feed trading, responsible gambling, and customer-facing systems — detecting delays, schema changes, and data quality anomalies before they impact downstream consumers.",
              businessValue:
                "Prevents cascade failures where stale data leads to incorrect odds, missed RG interventions, or inaccurate dashboards.",
              typicalDataEntities: ["Pipeline Health Metrics", "Latency Measurements", "Schema Change Events", "Data Quality Anomalies", "Alert Configurations"],
              typicalSourceSystems: ["Streaming Platform", "Data Pipeline Orchestrator", "Monitoring Platform", "Alerting System", "Data Catalog"],
            },
          ],
          kpis: [
            "Platform uptime during peak events (%)",
            "Data quality score (%)",
            "Pipeline latency (p95 ms)",
            "Self-service analytics adoption rate (%)",
            "Data request backlog reduction (%)",
          ],
          personas: [
            "Chief Technology Officer",
            "Head of Data Engineering",
            "VP Platform",
            "Head of Data Governance",
          ],
        },
        {
          name: "Financial Performance",
          useCases: [
            {
              name: "Customer Lifetime Value & Unit Economics",
              description:
                "Build CLV models that incorporate acquisition cost, promotional spend, wagering turnover, margin contribution, servicing cost, and expected tenure to understand true unit economics by customer cohort, acquisition channel, and product mix — informing sustainable growth strategies.",
              businessValue:
                "CLV-informed acquisition spend prevents the common trap of buying customers at negative ROI.",
              typicalDataEntities: ["Acquisition Costs", "Promotional Spend", "Margin Contribution", "Servicing Costs", "Tenure Predictions"],
              typicalSourceSystems: ["Finance System", "Betting Platform / PAM", "CRM", "Marketing Platform", "Analytics Platform"],
            },
            {
              name: "Marketing Attribution & Channel ROI",
              description:
                "Implement multi-touch attribution across marketing channels — TV, digital advertising, affiliate, social, CRM, and retail — to measure the true cost per acquisition and incremental revenue contribution of each channel, enabling data-driven budget allocation.",
              businessValue:
                "15-25% improvement in marketing spend efficiency through evidence-based channel allocation.",
              typicalDataEntities: ["Marketing Touchpoints", "Attribution Models", "Channel Costs", "Conversion Events", "Incremental Revenue"],
              typicalSourceSystems: ["Marketing Platform", "Ad Platform", "Analytics Platform", "CRM", "Finance System"],
            },
            {
              name: "Operational Cost Benchmarking",
              description:
                "Benchmark operational costs — technology, customer service, compliance, venue operations, content, and payment processing — against industry peers and internal targets, identifying cost-reduction opportunities and efficiency gains.",
              businessValue:
                "Identifies 5-15% cost reduction opportunities across operational categories.",
              typicalDataEntities: ["Cost Categories", "Benchmark Data", "Vendor Costs", "FTE Allocation", "Cost Trends"],
              typicalSourceSystems: ["Finance System", "ERP", "Vendor Management System", "HR System", "Analytics Platform"],
            },
            {
              name: "Revenue Forecasting & Scenario Planning",
              description:
                "Build revenue forecasting models incorporating event calendars, seasonal patterns, regulatory changes (advertising bans, tax changes), competitive dynamics, and macro-economic indicators to support budgeting, investor guidance, and strategic planning.",
              businessValue:
                "Improved forecast accuracy supports better capital allocation, investor confidence, and proactive risk management.",
              typicalDataEntities: ["Revenue History", "Event Calendar", "Regulatory Change Log", "Economic Indicators", "Scenario Definitions"],
              typicalSourceSystems: ["Finance System", "Betting Platform / PAM", "Event Data Provider", "Economic Data Service", "Analytics Platform"],
            },
          ],
          kpis: [
            "Customer acquisition cost (CAC)",
            "CLV:CAC ratio",
            "Marketing ROI by channel",
            "Operating cost as % of revenue",
            "Revenue forecast accuracy (%)",
          ],
          personas: [
            "Chief Financial Officer",
            "Head of FP&A",
            "VP Commercial",
            "Head of Investor Relations",
          ],
        },
      ],
    },
  ],
};
