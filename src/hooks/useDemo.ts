import { createContext, useContext } from "react";

export interface DemoState {
  walkthroughStep: number;
  walkthroughActive: boolean;
  migrationPhase: number;
  toggles: {
    mcpCopilot: boolean;
    phoneFirst: boolean;
    shadowMode: boolean;
    supportFirewall: boolean;
    automation: boolean;
  };
  roiParams: {
    ticketVolume: number;
    costPerTicket: number;
    aiResponsePct: number;
    phonePct: number;
    agentProductivityGain: number;
    automationCoverage: number;
    agentSeats: number;
    platformBaseFee: number;
  };
  internalTickets: string[];
  resolvedTickets: string[];
  phoneCallsHandled: string[];
  warRoomRunning: boolean;
}

export const defaultDemoState: DemoState = {
  walkthroughStep: 0,
  walkthroughActive: false,
  migrationPhase: 2,
  toggles: {
    mcpCopilot: true,
    phoneFirst: false,
    shadowMode: false,
    supportFirewall: false,
    automation: false,
  },
  roiParams: {
    ticketVolume: 8500,
    costPerTicket: 4.2,
    aiResponsePct: 25,
    phonePct: 15,
    agentProductivityGain: 40,
    automationCoverage: 35,
    agentSeats: 12,
    platformBaseFee: 900,
  },
  internalTickets: [],
  resolvedTickets: [],
  phoneCallsHandled: [],
  warRoomRunning: false,
};

export interface DemoContextType {
  state: DemoState;
  setState: (s: DemoState | ((prev: DemoState) => DemoState)) => void;
  resetDemo: () => void;
}

export const DemoContext = createContext<DemoContextType>({
  state: defaultDemoState,
  setState: () => {},
  resetDemo: () => {},
});

export function useDemo() {
  return useContext(DemoContext);
}
