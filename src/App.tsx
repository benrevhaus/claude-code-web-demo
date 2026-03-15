import { Routes, Route } from "react-router-dom";
import { DemoContext, defaultDemoState } from "./hooks/useDemo";
import type { DemoState } from "./hooks/useDemo";
import { useLocalStorage } from "./hooks/useLocalStorage";
import Layout from "./components/Layout";
import ExecutiveOverview from "./screens/ExecutiveOverview";
import CFODashboard from "./screens/CFODashboard";
import SystemMap from "./screens/SystemMap";
import CostSimulator from "./screens/CostSimulator";
import AgentControlPlane from "./screens/AgentControlPlane";
import PhoneSupport from "./screens/PhoneSupport";
import ShadowTickets from "./screens/ShadowTickets";
import SupportFirewall from "./screens/SupportFirewall";
import InternalTickets from "./screens/InternalTickets";
import MigrationRoadmap from "./screens/MigrationRoadmap";
import WarRoom from "./screens/WarRoom";

export default function App() {
  const [state, setState] = useLocalStorage<DemoState>("demo_state", defaultDemoState);

  const resetDemo = () => {
    window.localStorage.clear();
    setState(defaultDemoState);
  };

  return (
    <DemoContext.Provider value={{ state, setState, resetDemo }}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ExecutiveOverview />} />
          <Route path="cfo" element={<CFODashboard />} />
          <Route path="system-map" element={<SystemMap />} />
          <Route path="cost-simulator" element={<CostSimulator />} />
          <Route path="agent" element={<AgentControlPlane />} />
          <Route path="phone" element={<PhoneSupport />} />
          <Route path="shadow" element={<ShadowTickets />} />
          <Route path="firewall" element={<SupportFirewall />} />
          <Route path="tickets" element={<InternalTickets />} />
          <Route path="roadmap" element={<MigrationRoadmap />} />
          <Route path="war-room" element={<WarRoom />} />
        </Route>
      </Routes>
    </DemoContext.Provider>
  );
}
