import { migrationPhases } from "../data/roi";
import { useDemo } from "../hooks/useDemo";
import ROIBadge from "../components/ROIBadge";

export default function MigrationRoadmap() {
  const { state, setState } = useDemo();

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Feature Migration Roadmap</h1>
          <p className="text-sm text-gray-500 mt-1">7-phase journey from legacy to AI-native support</p>
        </div>
        <ROIBadge lever="Migration safety" />
      </div>

      {/* Phase selector */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {migrationPhases.map((phase, i) => (
          <button key={phase.id} onClick={() => setState((prev) => ({ ...prev, migrationPhase: phase.id }))}
            className="flex items-center gap-1 shrink-0">
            <div className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              phase.id === state.migrationPhase ? "bg-blue-600/20 border-blue-700 text-blue-300" :
              phase.status === "complete" ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-400" :
              phase.status === "active" ? "bg-yellow-950/30 border-yellow-900/50 text-yellow-400" :
              "bg-gray-900 border-gray-800 text-gray-500"
            }`}>
              P{phase.id}
            </div>
            {i < migrationPhases.length - 1 && (
              <div className={`w-4 h-px ${phase.status === "complete" ? "bg-emerald-700" : "bg-gray-700"}`} />
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {migrationPhases.map((phase) => {
          const isSelected = phase.id === state.migrationPhase;
          return (
            <div key={phase.id}
              className={`rounded-xl border transition-all ${
                isSelected ? "bg-gray-900 border-blue-800" :
                phase.status === "complete" ? "bg-gray-900/50 border-emerald-900/40" :
                phase.status === "active" ? "bg-gray-900/50 border-yellow-900/40" :
                "bg-gray-900/30 border-gray-800"
              }`}>
              <div className="p-5 cursor-pointer" onClick={() => setState((prev) => ({ ...prev, migrationPhase: phase.id }))}>
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    phase.status === "complete" ? "bg-emerald-600" :
                    phase.status === "active" ? "bg-yellow-600" :
                    "bg-gray-700"
                  }`}>
                    {phase.status === "complete" ? (
                      <span className="text-white text-sm">&#10003;</span>
                    ) : (
                      <span className="text-white text-sm font-bold">{phase.id}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-semibold text-white">{phase.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        phase.status === "complete" ? "bg-emerald-900/40 text-emerald-400" :
                        phase.status === "active" ? "bg-yellow-900/40 text-yellow-400" :
                        "bg-gray-800 text-gray-500"
                      }`}>{phase.status}</span>
                      <span className="text-xs text-gray-500">{phase.duration}</span>
                    </div>
                    <p className="text-sm text-gray-400">{phase.description}</p>
                  </div>

                  <div className="shrink-0 hidden md:block">
                    <ROIBadge lever={phase.roi_lever} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="mt-4 ml-14 grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-2">Features</div>
                      <div className="space-y-1.5">
                        {phase.features.map((f) => (
                          <div key={f} className="flex items-center gap-2 text-sm">
                            <span className="text-emerald-400 text-xs">&#10003;</span>
                            <span className="text-gray-300">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-2">System Status at Phase {phase.id}</div>
                      <div className="space-y-2">
                        {/* Feature tracker */}
                        {[
                          { label: "AI Copilot", from: 1 },
                          { label: "Internal Tickets", from: 2 },
                          { label: "Shadow System", from: 3 },
                          { label: "Phone Ticketing", from: 4 },
                          { label: "Email Processing", from: 5 },
                          { label: "Support Firewall", from: 6 },
                          { label: "Legacy Retired", from: 7 },
                        ].map((feat) => {
                          const status = phase.id < feat.from ? "Legacy Only" : phase.id === feat.from ? "Dual Run" : "New System";
                          return (
                            <div key={feat.label} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">{feat.label}</span>
                              <span className={`px-2 py-0.5 rounded ${
                                status === "New System" ? "bg-emerald-900/40 text-emerald-400" :
                                status === "Dual Run" ? "bg-yellow-900/40 text-yellow-400" :
                                "bg-gray-800 text-gray-500"
                              }`}>{status}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
