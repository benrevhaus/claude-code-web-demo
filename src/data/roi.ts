export const roiAssumptions = {
  current: {
    monthly_ticket_volume: 8500,
    cost_per_ticket_legacy: 4.20,
    agent_count: 12,
    agent_salary_monthly: 4200,
    gorgias_base_fee: 900,
    gorgias_per_ticket: 0.36,
    ai_reply_pct: 0.25,
    phone_pct: 0.15,
    avg_handle_time_min: 8.5,
    escalation_rate: 0.18,
    csat_score: 78,
  },
  projected: {
    ai_response_pct: 0.65,
    agent_productivity_gain: 0.40,
    ticket_deflection_rate: 0.35,
    phone_ticket_capture_rate: 0.95,
    vendor_cost_reduction: 0.80,
    avg_handle_time_min: 4.2,
    escalation_rate: 0.06,
    csat_score: 92,
  },
};

export const supportCategories = [
  { name: "Where is my order?", pct: 0.28, automatable: true, deflectable: true },
  { name: "Return / Exchange", pct: 0.18, automatable: true, deflectable: false },
  { name: "Product Questions", pct: 0.15, automatable: false, deflectable: true },
  { name: "Shipping Delay", pct: 0.12, automatable: true, deflectable: false },
  { name: "Order Status", pct: 0.10, automatable: true, deflectable: true },
  { name: "Address Change", pct: 0.07, automatable: true, deflectable: true },
  { name: "Damaged / Defective", pct: 0.05, automatable: false, deflectable: false },
  { name: "Billing Issue", pct: 0.03, automatable: false, deflectable: false },
  { name: "Account Help", pct: 0.02, automatable: true, deflectable: true },
];

export const migrationPhases = [
  { id: 1, name: "MCP in Portal", description: "Deploy AI copilot inside existing agent portal. Agents get suggested responses, order lookups, and knowledge retrieval via MCP tools.", status: "complete" as const, duration: "Weeks 1-4", features: ["AI-suggested responses", "Order lookup tool", "Knowledge base search", "Customer history summary"], roi_lever: "Agent productivity +40%" },
  { id: 2, name: "Entry Control Plane", description: "Build unified agent interface that wraps both legacy and new tools. Agents work from one screen.", status: "active" as const, duration: "Weeks 5-8", features: ["Unified agent dashboard", "Ticket queue management", "Customer 360 view", "Integrated phone + email + chat"], roi_lever: "Handle time -50%" },
  { id: 3, name: "Shadow Tickets", description: "Every legacy ticket also processed by new system in parallel. Compare results, build confidence.", status: "upcoming" as const, duration: "Weeks 9-14", features: ["Parallel ticket processing", "Confidence scoring", "Accuracy comparison", "Progressive autonomy modes"], roi_lever: "Migration safety" },
  { id: 4, name: "Phone-First Ticketing", description: "Phone calls create tickets in internal system first. Gorgias becomes secondary record.", status: "upcoming" as const, duration: "Weeks 15-18", features: ["Call-to-ticket automation", "AI call summaries", "Internal system of record", "Optional Gorgias sync"], roi_lever: "15% ticket volume captured internally" },
  { id: 5, name: "Email Extraction", description: "Inbound emails processed by internal system. AI classifies, drafts responses, routes intelligently.", status: "upcoming" as const, duration: "Weeks 19-24", features: ["Email ingestion pipeline", "AI classification", "Auto-draft responses", "Smart routing"], roi_lever: "35% ticket deflection" },
  { id: 6, name: "Support Firewall", description: "Customer inquiries intercepted before reaching Gorgias. Self-serve, AI resolution, and smart routing.", status: "upcoming" as const, duration: "Weeks 25-30", features: ["Chat widget with AI", "Self-serve FAQ", "Email pre-processing", "Ticket deflection layer"], roi_lever: "65% vendor cost reduction" },
  { id: 7, name: "Legacy Retirement", description: "Gorgias reduced to archive-only. Internal system becomes sole platform. Full cost savings realized.", status: "upcoming" as const, duration: "Weeks 31-36", features: ["Gorgias archive mode", "Full internal routing", "Complete data ownership", "Zero vendor dependency"], roi_lever: "80% vendor cost elimination" },
];

export const gorgiasArchive = [
  { id: "GRG-8801", subject: "Order not received", customer: "Sarah Mitchell", date: "2024-12-15", status: "closed", tags: ["shipping", "wismo"] },
  { id: "GRG-8802", subject: "Wrong item received", customer: "James Rodriguez", date: "2024-12-18", status: "closed", tags: ["fulfillment", "exchange"] },
  { id: "GRG-8803", subject: "Discount code not working", customer: "Emily Chen", date: "2025-01-02", status: "closed", tags: ["billing", "promo"] },
  { id: "GRG-8804", subject: "Cancel subscription", customer: "Lisa Park", date: "2025-01-10", status: "closed", tags: ["account", "cancellation"] },
  { id: "GRG-8805", subject: "Size exchange needed", customer: "David Kim", date: "2025-01-22", status: "closed", tags: ["return", "exchange"] },
  { id: "GRG-8806", subject: "Tracking not updating", customer: "Robert Wilson", date: "2025-02-01", status: "closed", tags: ["shipping", "wismo"] },
  { id: "GRG-8807", subject: "Refund not received", customer: "Amanda Foster", date: "2025-02-08", status: "closed", tags: ["billing", "refund"] },
  { id: "GRG-8808", subject: "Product quality complaint", customer: "Michael Brown", date: "2025-02-15", status: "closed", tags: ["product", "quality"] },
];

export const agentPrompts = [
  { id: "AP001", trigger: "where is my order", prompt: "Look up the customer's most recent order, retrieve tracking status, and provide a clear delivery estimate. If delayed, acknowledge and offer compensation per policy.", tools: ["order_lookup", "tracking_status", "policy_check"] },
  { id: "AP002", trigger: "return request", prompt: "Check if the item is within the return window. Determine customer tier for shipping fee. Generate return label if eligible.", tools: ["order_lookup", "product_info", "return_eligibility", "label_generator"] },
  { id: "AP003", trigger: "customer history", prompt: "Retrieve full customer profile including tier, lifetime value, order history, and previous support interactions. Summarize in 3-4 bullet points.", tools: ["customer_profile", "order_history", "ticket_history"] },
  { id: "AP004", trigger: "damaged item", prompt: "Verify order and product details. Apply damaged item policy: ship replacement, no return required, apply store credit. Escalate if item value > $500.", tools: ["order_lookup", "product_info", "policy_check", "replacement_order"] },
  { id: "AP005", trigger: "draft response", prompt: "Based on ticket context, customer tier, and relevant policies, draft a personalized response. Match tone to customer sentiment.", tools: ["ticket_context", "customer_profile", "policy_check", "tone_analyzer"] },
];
