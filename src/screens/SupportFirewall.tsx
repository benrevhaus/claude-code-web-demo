import { useState } from "react";
import { useDemo } from "../hooks/useDemo";
import ROIBadge from "../components/ROIBadge";

interface Inquiry {
  id: string;
  text: string;
  channel: "chat" | "email" | "faq";
  category: string;
  resolution: "self_serve" | "ai_resolved" | "agent" | "legacy";
  aiResponse: string;
  confidence: number;
}

const inquiries: Inquiry[] = [
  { id: "INQ-01", text: "Where is my order #ORD-10043?", channel: "chat", category: "order_tracking", resolution: "ai_resolved", aiResponse: "Your order ORD-10043 is currently in transit via USPS. Tracking: 9400111899223100012. Expected delivery: March 15. Is there anything else I can help with?", confidence: 0.97 },
  { id: "INQ-02", text: "I want to return my Merino Wool Beanie", channel: "email", category: "return_request", resolution: "ai_resolved", aiResponse: "Your beanie is within the 30-day return window. I've generated a prepaid return label sent to your email. A $5.95 return shipping fee applies for Standard accounts. Refund will process within 3-5 days of receipt.", confidence: 0.94 },
  { id: "INQ-03", text: "Can you change my shipping address to 123 New St?", channel: "chat", category: "address_change", resolution: "self_serve", aiResponse: "I've updated your default shipping address. Since you have no unshipped orders, this will apply to all future purchases. You can always update this in Account Settings.", confidence: 0.99 },
  { id: "INQ-04", text: "Do your hiking shoes run true to size?", channel: "faq", category: "product_question", resolution: "self_serve", aiResponse: "Our Trail Running Shoes run about half a size large. We recommend ordering half a size down from your usual size. Check our size guide for detailed measurements.", confidence: 0.88 },
  { id: "INQ-05", text: "My 4-Season Tent arrived with a torn zipper", channel: "email", category: "damaged_item", resolution: "agent", aiResponse: "I'm sorry about the damage. Since this involves a high-value item ($299.99), I'm connecting you with a support specialist who can arrange an immediate replacement. No need to return the damaged item.", confidence: 0.85 },
  { id: "INQ-06", text: "I was charged twice for my last order!", channel: "email", category: "billing_issue", resolution: "legacy", aiResponse: "I can see your concern about the double charge. This requires manual review of payment records. I'm escalating this to our billing team for immediate investigation.", confidence: 0.62 },
  { id: "INQ-07", text: "When will my processing order ship?", channel: "chat", category: "order_status", resolution: "ai_resolved", aiResponse: "Your order ORD-10045 is being packed and should ship within 1-2 business days. You'll get a tracking email as soon as it's on its way!", confidence: 0.96 },
  { id: "INQ-08", text: "What's your return policy for international orders?", channel: "faq", category: "product_question", resolution: "self_serve", aiResponse: "For international orders, returns are only accepted for defective items. Please contact support with photos of the defect and we'll arrange a replacement at no charge.", confidence: 0.91 },
];

const tabs = [
  { id: "chat", label: "Website Chat" },
  { id: "email", label: "Email Intake" },
  { id: "faq", label: "Self-Serve FAQ" },
];

export default function SupportFirewall() {
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const { setState } = useDemo();

  const filtered = inquiries.filter((inq) => inq.channel === activeTab);
  const allProcessed = inquiries.filter((i) => processedIds.has(i.id));
  const deflected = allProcessed.filter((i) => i.resolution !== "legacy").length;
  const total = allProcessed.length;

  const processInquiry = (inq: Inquiry) => {
    setSelectedInquiry(inq);
    setProcessedIds((prev) => new Set([...prev, inq.id]));
    if (inq.resolution !== "legacy") {
      setState((prev) => ({ ...prev, resolvedTickets: [...prev.resolvedTickets, inq.id] }));
    }
  };

  const resColor = (r: string) => {
    switch (r) {
      case "self_serve": return "text-emerald-400 bg-emerald-900/30";
      case "ai_resolved": return "text-blue-400 bg-blue-900/30";
      case "agent": return "text-yellow-400 bg-yellow-900/30";
      case "legacy": return "text-red-400 bg-red-900/30";
      default: return "text-gray-400 bg-gray-800";
    }
  };

  const resLabel = (r: string) => {
    switch (r) {
      case "self_serve": return "Self-Served";
      case "ai_resolved": return "AI Resolved";
      case "agent": return "Escalated to Agent";
      case "legacy": return "Sent to Legacy";
      default: return r;
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Support Firewall</h1>
          <p className="text-sm text-gray-500 mt-1">Intercept and resolve inquiries before they reach Gorgias</p>
        </div>
        <ROIBadge lever="Ticket deflection" />
      </div>

      {/* Deflection Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-xs text-gray-500">Processed</div>
        </div>
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{deflected}</div>
          <div className="text-xs text-gray-500">Deflected</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{total > 0 ? ((deflected / total) * 100).toFixed(0) : 0}%</div>
          <div className="text-xs text-gray-500">Deflection Rate</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">${(deflected * 4.2).toFixed(0)}</div>
          <div className="text-xs text-gray-500">Vendor Cost Avoided</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? "bg-blue-600/20 text-blue-400 border border-blue-800" : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700"
            }`}>
            {tab.label}
            <span className="ml-2 text-xs opacity-60">({inquiries.filter((i) => i.channel === tab.id).length})</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Inquiry List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400">INCOMING INQUIRIES</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {filtered.map((inq) => (
              <button key={inq.id} onClick={() => processInquiry(inq)}
                className={`w-full text-left p-4 transition-colors ${selectedInquiry?.id === inq.id ? "bg-gray-800/50" : "hover:bg-gray-800/30"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-gray-500">{inq.id}</span>
                  {processedIds.has(inq.id) && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${resColor(inq.resolution)}`}>
                      {resLabel(inq.resolution)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-white">{inq.text}</div>
                <div className="text-xs text-gray-500 mt-1">{inq.category.replace(/_/g, " ")}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Resolution Detail */}
        <div className="space-y-4">
          {selectedInquiry ? (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-400 mb-4">FIREWALL PROCESSING</h3>

                {/* Routing visualization */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="px-3 py-2 rounded-lg bg-gray-800 text-xs text-gray-300">Inquiry</div>
                  <div className="w-8 h-px bg-gray-600" />
                  <div className="px-3 py-2 rounded-lg bg-orange-900/30 text-xs text-orange-400 border border-orange-800/50">Firewall</div>
                  <div className="w-8 h-px bg-gray-600" />
                  <div className={`px-3 py-2 rounded-lg text-xs border ${resColor(selectedInquiry.resolution)} border-current/20`}>
                    {resLabel(selectedInquiry.resolution)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Customer Inquiry</div>
                    <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-white">{selectedInquiry.text}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">AI Response</div>
                    <div className="p-3 bg-blue-950/30 border border-blue-900/40 rounded-lg text-sm text-gray-300">{selectedInquiry.aiResponse}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500">Confidence: </span>
                      <span className="text-sm text-white font-mono">{(selectedInquiry.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${resColor(selectedInquiry.resolution)}`}>
                        {selectedInquiry.resolution === "legacy" ? "Reaches Gorgias" : "DEFLECTED — Never reaches Gorgias"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Routing Logic */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 mb-3">ROUTING LOGIC</h3>
                <div className="space-y-2 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className={selectedInquiry.confidence >= 0.95 ? "text-emerald-400" : "text-gray-600"}>&#10003;</span>
                    Confidence ≥ 95%? → Auto-resolve (self-serve)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={selectedInquiry.confidence >= 0.85 && selectedInquiry.confidence < 0.95 ? "text-blue-400" : "text-gray-600"}>&#10003;</span>
                    Confidence 85-95%? → AI resolves with agent review
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={selectedInquiry.confidence >= 0.7 && selectedInquiry.confidence < 0.85 ? "text-yellow-400" : "text-gray-600"}>&#10003;</span>
                    Confidence 70-85%? → Route to internal agent
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={selectedInquiry.confidence < 0.7 ? "text-red-400" : "text-gray-600"}>&#10003;</span>
                    Confidence &lt; 70%? → Send to legacy helpdesk
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <p className="text-gray-500 text-sm">Click an inquiry to see how the firewall routes it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
