import { NavLink, Outlet } from "react-router-dom";
import { useDemo } from "../hooks/useDemo";
import WalkthroughOverlay from "./WalkthroughOverlay";

const nav = [
  { to: "/", label: "Overview" },
  { to: "/cfo", label: "CFO Dashboard" },
  { to: "/system-map", label: "System Map" },
  { to: "/cost-simulator", label: "Cost Sim" },
  { to: "/agent", label: "Agent Plane" },
  { to: "/phone", label: "Phone" },
  { to: "/shadow", label: "Shadow Tickets" },
  { to: "/firewall", label: "Firewall" },
  { to: "/tickets", label: "Tickets" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/war-room", label: "War Room" },
];

export default function Layout() {
  const { state, resetDemo } = useDemo();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 flex items-center h-14 gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">AI</div>
            <span className="font-semibold text-sm text-white hidden sm:block">Support Platform</span>
          </div>
          <nav className="flex-1 overflow-x-auto">
            <div className="flex gap-1">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive ? "bg-blue-600/20 text-blue-400" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
          </nav>
          <button onClick={resetDemo} className="px-3 py-1.5 text-xs bg-red-900/30 text-red-400 rounded-md hover:bg-red-900/50 transition-colors shrink-0">
            Reset Demo
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      {state.walkthroughActive && <WalkthroughOverlay />}
    </div>
  );
}
