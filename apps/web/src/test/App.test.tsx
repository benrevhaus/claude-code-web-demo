import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import App from "../App";

// Stub all API calls so components mount without hitting a real backend
vi.mock("../lib/api", () => {
  const emptyPaged = { page: 1, pageSize: 25, total: 0, rows: [] };
  const emptySummary = {
    summary: { views: 0, sessions: 0, totalUsers: 0, pageCount: 0, eventCount: 0, distinctEvents: 0 },
    latestSync: null,
  };
  const emptyFilters = {
    pagePaths: [],
    eventNames: ["page_view"],
    deviceCategories: [],
    sourceMediums: [],
    eventClasses: ["valid_event"],
    variantKeys: [],
    variantValues: [],
  };

  return {
    fetchJson: vi.fn(async (path: string) => {
      if (path === "/filters") return emptyFilters;
      if (path === "/summary") return emptySummary;
      return emptyPaged;
    }),
    postJson: vi.fn(async () => ({})),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Find the .tabs section and query within it */
function getTabsSection() {
  // The tabs section has buttons "Pages" and "Events" — find via class
  const allSections = document.querySelectorAll("section.tabs");
  return allSections[0] as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

describe("routing", () => {
  it("renders the home view at /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
  });

  it("renders the GA4 stream view at /ga4-stream", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ga4 stream view/i })).toBeInTheDocument();
    });
  });

  it("redirects unknown paths to home", () => {
    renderAt("/unknown/route");
    expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
  });

  it("redirects /ga4 (old path) to home", () => {
    renderAt("/ga4");
    expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Home view
// ---------------------------------------------------------------------------

describe("Home view", () => {
  it("shows the explorer title", () => {
    renderAt("/");
    expect(screen.getByText("Data Streams Explorer")).toBeInTheDocument();
  });

  it("shows a GA4 stream card", () => {
    renderAt("/");
    expect(screen.getByText("GA4 Stream View")).toBeInTheDocument();
  });

  it("shows the stream card description", () => {
    renderAt("/");
    expect(screen.getByText(/historical ga4 activity/i)).toBeInTheDocument();
  });

  it("navigates to /ga4-stream when the stream card is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(screen.getByRole("button", { name: /ga4 stream view/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ga4 stream view/i })).toBeInTheDocument();
    });
  });

  it("does not render GA4-specific elements on home", () => {
    renderAt("/");
    expect(screen.queryByRole("heading", { name: /ga4 stream view/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/backfill 90 days/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GA4 stream view — layout
// ---------------------------------------------------------------------------

describe("GA4 stream view layout", () => {
  it("shows the explorer breadcrumb link", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /data streams explorer/i })).toBeInTheDocument();
    });
  });

  it('shows an "All streams" button', async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /all streams/i })).toBeInTheDocument();
    });
  });

  it("shows the backfill button", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /backfill 90 days/i })).toBeInTheDocument();
    });
  });

  it("shows Pages and Events tabs", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      const tabs = getTabsSection();
      expect(within(tabs).getByText("Pages")).toBeInTheDocument();
      expect(within(tabs).getByText("Events")).toBeInTheDocument();
    });
  });

  it("shows the summary cards section", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByText("Latest Sync")).toBeInTheDocument();
    });
  });

  it("shows the filters panel", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /filters/i })).toBeInTheDocument();
    });
  });

  it("shows the saved searches panel", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /saved searches/i })).toBeInTheDocument();
    });
  });

  it("shows the column picker", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /visible columns/i })).toBeInTheDocument();
    });
  });

  it("does not show the home stream grid", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ga4 stream view/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Choose a stream")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GA4 stream view — navigation back to home
// ---------------------------------------------------------------------------

describe("GA4 stream view navigation", () => {
  it("navigates home when the explorer breadcrumb is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /data streams explorer/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /data streams explorer/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
    });
  });

  it('navigates home when "All streams" is clicked', async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /all streams/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /all streams/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe("tab switching", () => {
  it("defaults to the Pages tab", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      const tabs = getTabsSection();
      expect(within(tabs).getByText("Pages").closest("button")).toHaveClass("active");
    });
  });

  it("switches to Events tab when clicked", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => expect(getTabsSection()).toBeTruthy());
    const tabs = getTabsSection();
    await user.click(within(tabs).getByText("Events"));

    expect(within(tabs).getByText("Events").closest("button")).toHaveClass("active");
    expect(within(tabs).getByText("Pages").closest("button")).not.toHaveClass("active");
  });

  it("switches back to Pages tab", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => expect(getTabsSection()).toBeTruthy());
    const tabs = getTabsSection();

    await user.click(within(tabs).getByText("Events"));
    await user.click(within(tabs).getByText("Pages"));

    expect(within(tabs).getByText("Pages").closest("button")).toHaveClass("active");
  });

  it("persists tab selection to localStorage", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => expect(getTabsSection()).toBeTruthy());
    const tabs = getTabsSection();
    await user.click(within(tabs).getByText("Events"));

    expect(localStorage.getItem("data-streams-explorer-active-tab")).toBe("events");
  });
});

// ---------------------------------------------------------------------------
// Column picker
// ---------------------------------------------------------------------------

describe("column picker", () => {
  it("shows page columns when Pages tab is active", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /visible columns/i })).toBeInTheDocument();
    });
    const picker = screen.getByRole("heading", { name: /visible columns/i }).closest("section")!;
    expect(within(picker).getByText("Views")).toBeInTheDocument();
  });

  it("shows event columns when Events tab is active", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => expect(getTabsSection()).toBeTruthy());
    await user.click(within(getTabsSection()).getByText("Events"));

    await waitFor(() => {
      const picker = screen.getByRole("heading", { name: /visible columns/i }).closest("section")!;
      expect(within(picker).getByText("Event Count")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Quick date ranges
// ---------------------------------------------------------------------------

describe("quick date ranges", () => {
  it("renders 7d, 30d, and 90d range buttons", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "30d" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "90d" })).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Result strip
// ---------------------------------------------------------------------------

describe("result strip", () => {
  it("shows row count and date range", async () => {
    renderAt("/ga4-stream");
    await waitFor(() => {
      expect(screen.getByText("page rows")).toBeInTheDocument();
    });
  });

  it("shows event rows label when on Events tab", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    await waitFor(() => expect(getTabsSection()).toBeTruthy());
    await user.click(within(getTabsSection()).getByText("Events"));

    await waitFor(() => {
      expect(screen.getByText("event rows")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Round-trip navigation
// ---------------------------------------------------------------------------

describe("round-trip navigation", () => {
  it("can go home -> ga4 -> home -> ga4 without breaking", async () => {
    const user = userEvent.setup();
    renderAt("/");

    // Home -> GA4
    await user.click(screen.getByRole("button", { name: /ga4 stream view/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ga4 stream view/i })).toBeInTheDocument();
    });

    // GA4 -> Home
    await user.click(screen.getByRole("button", { name: /all streams/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
    });

    // Home -> GA4 again
    await user.click(screen.getByRole("button", { name: /ga4 stream view/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ga4 stream view/i })).toBeInTheDocument();
    });
  });

  it("preserves tab state after navigating away and back", async () => {
    const user = userEvent.setup();
    renderAt("/ga4-stream");

    // Switch to Events tab
    await waitFor(() => expect(getTabsSection()).toBeTruthy());
    await user.click(within(getTabsSection()).getByText("Events"));
    expect(localStorage.getItem("data-streams-explorer-active-tab")).toBe("events");

    // Navigate to home
    await user.click(screen.getByRole("button", { name: /all streams/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /choose a stream/i })).toBeInTheDocument();
    });

    // Navigate back to GA4
    await user.click(screen.getByRole("button", { name: /ga4 stream view/i }));
    await waitFor(() => {
      const tabs = getTabsSection();
      expect(within(tabs).getByText("Events").closest("button")).toHaveClass("active");
    });
  });
});
