import { useState } from "react";
import ROIBadge from "../components/ROIBadge";

interface MapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  purpose: string;
  roi_lever: string;
  phase: string;
  group: "channel" | "processing" | "internal" | "external";
}

const nodes: MapNode[] = [
  { id: "customers", label: "Customers", x: 50, y: 5, color: "bg-gray-600", purpose: "End users who initiate support requests across multiple channels.", roi_lever: "Customer satisfaction", phase: "Always", group: "channel" },
  { id: "phone", label: "Phone", x: 10, y: 22, color: "bg-amber-600", purpose: "Voice calls that currently bypass the ticketing system. 15% of all support volume.", roi_lever: "Data advantage", phase: "Phase 4", group: "channel" },
  { id: "email", label: "Email", x: 30, y: 22, color: "bg-sky-600", purpose: "Primary support channel. High volume, high automation potential.", roi_lever: "Ticket deflection", phase: "Phase 5", group: "channel" },
  { id: "chat", label: "Website Chat", x: 50, y: 22, color: "bg-green-600", purpose: "Real-time support widget. Best channel for AI automation.", roi_lever: "Automation readiness", phase: "Phase 6", group: "channel" },
  { id: "social", label: "Social", x: 70, y: 22, color: "bg-pink-600", purpose: "Instagram, Twitter, Facebook support mentions.", roi_lever: "Brand protection", phase: "Phase 7", group: "channel" },
  { id: "firewall", label: "Support Firewall", x: 50, y: 38, color: "bg-orange-600", purpose: "Pre-processing layer that intercepts and resolves inquiries before they reach any helpdesk. Self-serve FAQ, AI chat resolution, smart routing.", roi_lever: "65% vendor cost reduction", phase: "Phase 6", group: "processing" },
  { id: "entry", label: "Entry Control Plane", x: 30, y: 52, color: "bg-blue-600", purpose: "Unified agent interface wrapping all tools. Single pane of glass for support ops.", roi_lever: "Agent productivity +40%", phase: "Phase 2", group: "processing" },
  { id: "copilot", label: "AI Copilot (MCP)", x: 70, y: 52, color: "bg-purple-600", purpose: "Model Context Protocol AI assistant. Order lookups, KB search, draft responses, customer history — all via tool calls.", roi_lever: "Handle time -50%", phase: "Phase 1", group: "processing" },
  { id: "internal", label: "Internal Tickets", x: 30, y: 68, color: "bg-emerald-600", purpose: "Our ticket system of record. Structured data, full analytics, AI-enriched.", roi_lever: "Data ownership", phase: "Phase 2+", group: "internal" },
  { id: "shadow", label: "Shadow Tickets", x: 50, y: 68, color: "bg-yellow-600", purpose: "Parallel processing of legacy tickets. Builds confidence before migration.", roi_lever: "Migration safety", phase: "Phase 3", group: "internal" },
  { id: "legacy", label: "Gorgias (Legacy)", x: 70, y: 68, color: "bg-red-600", purpose: "Current helpdesk. Being progressively replaced. Becomes archive-only.", roi_lever: "Vendor cost elimination", phase: "Phase 7", group: "external" },
  { id: "shopify", label: "Shopify", x: 10, y: 85, color: "bg-lime-700", purpose: "Order management, product catalog, customer data source.", roi_lever: "Data integration", phase: "Always", group: "external" },
  { id: "3pl", label: "3PL / Fulfillment", x: 30, y: 85, color: "bg-teal-700", purpose: "Third-party logistics. Shipment tracking, inventory status.", roi_lever: "Operational visibility", phase: "Always", group: "external" },
  { id: "catalog", label: "Product Catalog", x: 50, y: 85, color: "bg-indigo-700", purpose: "Product information, pricing, return policies, care instructions.", roi_lever: "Agent accuracy", phase: "Phase 1", group: "external" },
  { id: "kb", label: "Knowledge Base", x: 70, y: 85, color: "bg-violet-700", purpose: "Policies, FAQs, and support documentation. Powers AI responses.", roi_lever: "Self-serve deflection", phase: "Phase 1", group: "external" },
];

export default function SystemMap() {
  const [selected, setSelected] = useState<MapNode | null>(null);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Interactive System Map</h1>
          <p className="text-sm text-gray-500 mt-1">Click any node to explore its purpose, ROI lever, and migration phase</p>
        </div>
        <ROIBadge lever="Architecture visibility" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6 relative" style={{ minHeight: 600 }}>
          {/* Connection lines (simplified) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            <line x1="50%" y1="8%" x2="30%" y2="20%" stroke="#374151" strokeWidth="1" />
            <line x1="50%" y1="8%" x2="50%" y2="20%" stroke="#374151" strokeWidth="1" />
            <line x1="50%" y1="8%" x2="70%" y2="20%" stroke="#374151" strokeWidth="1" />
            <line x1="50%" y1="8%" x2="10%" y2="20%" stroke="#374151" strokeWidth="1" />
            <line x1="30%" y1="25%" x2="50%" y2="37%" stroke="#374151" strokeWidth="1" />
            <line x1="50%" y1="25%" x2="50%" y2="37%" stroke="#374151" strokeWidth="1" />
            <line x1="10%" y1="25%" x2="30%" y2="50%" stroke="#374151" strokeWidth="1" />
            <line x1="50%" y1="42%" x2="30%" y2="50%" stroke="#374151" strokeWidth="1" />
            <line x1="50%" y1="42%" x2="70%" y2="50%" stroke="#374151" strokeWidth="1" />
            <line x1="30%" y1="55%" x2="70%" y2="55%" stroke="#4F46E5" strokeWidth="1" strokeDasharray="4" />
            <line x1="30%" y1="55%" x2="30%" y2="67%" stroke="#374151" strokeWidth="1" />
            <line x1="70%" y1="55%" x2="70%" y2="67%" stroke="#374151" strokeWidth="1" />
            <line x1="30%" y1="55%" x2="50%" y2="67%" stroke="#374151" strokeWidth="1" />
            <line x1="70%" y1="70%" x2="50%" y2="70%" stroke="#EAB308" strokeWidth="1" strokeDasharray="4" />
          </svg>

          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => setSelected(node)}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 z-10 px-3 py-2 rounded-lg border text-xs font-medium transition-all hover:scale-110 hover:z-20 ${
                selected?.id === node.id
                  ? "ring-2 ring-blue-400 border-blue-500 bg-blue-950"
                  : "border-gray-700 bg-gray-800 hover:border-gray-500"
              }`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div className={`w-2 h-2 rounded-full ${node.color} inline-block mr-1.5`} />
              {node.label}
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${selected.color}`} />
                <h3 className="text-lg font-bold text-white">{selected.label}</h3>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Purpose</div>
                <p className="text-sm text-gray-300">{selected.purpose}</p>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">ROI Lever</div>
                <ROIBadge lever={selected.roi_lever} />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Migration Phase</div>
                <span className="text-sm text-blue-400 font-medium">{selected.phase}</span>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Category</div>
                <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400 capitalize">{selected.group}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3 opacity-30">&#x2B95;</div>
              <p className="text-sm">Click a node on the map to see details</p>
            </div>
          )}

          {/* Legend */}
          <div className="mt-8 pt-6 border-t border-gray-800">
            <div className="text-xs text-gray-500 mb-3">Node Groups</div>
            <div className="space-y-2 text-xs">
              {[
                { label: "Channels", color: "bg-blue-500" },
                { label: "Processing Layer", color: "bg-purple-500" },
                { label: "Internal Systems", color: "bg-emerald-500" },
                { label: "External / Integrations", color: "bg-gray-500" },
              ].map((g) => (
                <div key={g.label} className="flex items-center gap-2 text-gray-400">
                  <div className={`w-2.5 h-2.5 rounded ${g.color}`} />
                  {g.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
