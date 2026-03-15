import { useDemo } from "../hooks/useDemo";
import { useNavigate } from "react-router-dom";

const steps = [
  { title: "Why Legacy Support Is Expensive", description: "Current helpdesk vendors charge per-ticket fees that increase as you automate. The more AI replies you add, the more you pay — perverse incentives built into the pricing model.", route: "/cost-simulator", highlight: "Cost Sim" },
  { title: "How Agents Become Faster with MCP", description: "Model Context Protocol gives agents AI-powered tools: order lookups, knowledge retrieval, draft responses — all in one interface. Handle time drops 50%.", route: "/agent", highlight: "Agent Plane" },
  { title: "Phone-First Ticketing Shifts Control", description: "15% of support is phone calls that never enter the helpdesk. By creating tickets from calls in our system first, we become the system of record.", route: "/phone", highlight: "Phone" },
  { title: "Shadow Tickets Reduce Migration Risk", description: "Every legacy ticket is mirrored in the new system. We compare outputs, build confidence, and progressively grant autonomy — zero disruption.", route: "/shadow", highlight: "Shadow Tickets" },
  { title: "The Firewall Stops Unnecessary Tickets", description: "A pre-processing layer resolves common inquiries before they reach Gorgias. Self-serve, AI chat, and smart routing deflect 35% of volume.", route: "/firewall", highlight: "Firewall" },
  { title: "Own Your Support Infrastructure", description: "The end state: a fully internal, AI-native support platform. Zero vendor dependency. Complete data ownership. 80% cost reduction.", route: "/cfo", highlight: "CFO Dashboard" },
];

export default function WalkthroughOverlay() {
  const { state, setState } = useDemo();
  const navigate = useNavigate();
  const step = steps[state.walkthroughStep] || steps[0];
  const isLast = state.walkthroughStep >= steps.length - 1;

  const goTo = (idx: number) => {
    const s = steps[idx];
    if (s) {
      setState((prev) => ({ ...prev, walkthroughStep: idx }));
      navigate(s.route);
    }
  };

  const close = () => setState((prev) => ({ ...prev, walkthroughActive: false, walkthroughStep: 0 }));

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-xl">
        <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-blue-400 font-semibold">Step {state.walkthroughStep + 1} of {steps.length}</span>
            <button onClick={close} className="text-gray-500 hover:text-gray-300 text-sm">Exit Walkthrough</button>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
          <p className="text-sm text-gray-400 mb-4 leading-relaxed">{step.description}</p>
          <div className="flex items-center gap-2 mb-4">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= state.walkthroughStep ? "bg-blue-500" : "bg-gray-700"}`} />
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => goTo(state.walkthroughStep - 1)}
              disabled={state.walkthroughStep === 0}
              className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {isLast ? (
              <button onClick={close} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-500 flex-1">
                Finish Walkthrough
              </button>
            ) : (
              <button onClick={() => goTo(state.walkthroughStep + 1)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 flex-1">
                Next Step
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
