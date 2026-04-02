import { useEffect, useMemo, useState } from "react";

import { ColumnPicker } from "./components/ColumnPicker";
import { DataTable } from "./components/DataTable";
import { FilterBar } from "./components/FilterBar";
import { SavedSearches, type SavedSearch } from "./components/SavedSearches";
import { SummaryCards } from "./components/SummaryCards";
import { fetchJson, postJson, type Filters } from "./lib/api";

type SummaryResponse = {
  summary: {
    views: number;
    sessions: number;
    totalUsers: number;
    pageCount: number;
    eventCount: number;
    distinctEvents: number;
  };
  latestSync: {
    status: string;
    started_at: string;
    finished_at: string | null;
    pages_rows: number;
    events_rows: number;
  } | null;
};

type PagedResponse<T> = {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
};

type FilterOptions = {
  pagePaths: string[];
  eventNames: string[];
  deviceCategories: string[];
  sourceMediums: string[];
  eventClasses?: string[];
  variantKeys?: string[];
  variantValues?: string[];
};

type PageRow = {
  date_pst: string;
  page_path: string;
  page_title: string;
  landing_page_path?: string;
  device_category: string;
  source_medium: string;
  views: number;
  sessions: number;
  total_users: number;
  event_count: number;
};

type EventRow = {
  date_pst: string;
  page_path: string;
  landing_page_path?: string;
  event_name: string;
  raw_event_name?: string;
  event_class?: string;
  derived_page_path?: string;
  device_category: string;
  source_medium: string;
  is_conversion_event?: boolean;
  event_count: number;
  sessions: number;
  total_users: number;
};

type SortState = {
  sortBy: string;
  sortDirection: "asc" | "desc";
};

type ExplorerView = "home" | "ga4";

const today = new Date();
const thirtyDaysAgo = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
const defaultEventNames = [
  "page_view",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
  "purchase",
  "search",
  "view_search_results",
  "carousel_slide",
  "carousel_thumbnail_click",
  "scroll_depth",
  "click",
  "show_more",
  "show_less",
  "shared_facebook",
] as const;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

const defaultFilters: Filters = {
  startDate: formatDate(thirtyDaysAgo),
  endDate: formatDate(today),
  pagePath: "",
  eventNames: [...defaultEventNames],
  rawEventName: "",
  eventClass: "valid_event",
  deviceCategory: "",
  sourceMedium: "",
  conversionOnly: "",
  search: "",
  groupBy: "detail",
};

const storageKey = "data-streams-explorer-saved-searches";
const activeViewKey = "data-streams-explorer-active-view";
const activeTabKey = "data-streams-explorer-active-tab";
const pageColumnsKey = "data-streams-explorer-page-columns";
const eventColumnsKey = "data-streams-explorer-event-columns";

const pageColumns = [
  { key: "date_pst", label: "Date", sortable: true },
  { key: "page_path", label: "Page", sortable: true },
  { key: "page_title", label: "Title" },
  { key: "device_category", label: "Device" },
  { key: "source_medium", label: "Source / Medium" },
  { key: "views", label: "Views", sortable: true },
  { key: "sessions", label: "Sessions", sortable: true },
  { key: "total_users", label: "Users", sortable: true },
  { key: "event_count", label: "Events", sortable: true },
] as const;

const eventColumns = [
  { key: "date_pst", label: "Date", sortable: true },
  { key: "event_name", label: "Event", sortable: true },
  { key: "raw_event_name", label: "Raw Event" },
  { key: "event_class", label: "Class", sortable: true },
  { key: "derived_page_path", label: "Derived Path" },
  { key: "page_path", label: "Page", sortable: true },
  { key: "device_category", label: "Device" },
  { key: "source_medium", label: "Source / Medium" },
  { key: "event_count", label: "Event Count", sortable: true },
  { key: "sessions", label: "Sessions", sortable: true },
  { key: "total_users", label: "Users", sortable: true },
] as const;

export default function App() {
  const [activeView, setActiveView] = useState<ExplorerView>("home");
  const [tab, setTab] = useState<"pages" | "events">("pages");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [visiblePageColumns, setVisiblePageColumns] = useState<string[]>(pageColumns.map((column) => column.key));
  const [visibleEventColumns, setVisibleEventColumns] = useState<string[]>(eventColumns.map((column) => column.key));
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    pagePaths: [],
    eventNames: [...defaultEventNames],
    deviceCategories: [],
    sourceMediums: [],
    eventClasses: ["valid_event"],
    variantKeys: [],
    variantValues: [],
  });
  const [pagesData, setPagesData] = useState<PagedResponse<PageRow>>({ page: 1, pageSize: 25, total: 0, rows: [] });
  const [eventsData, setEventsData] = useState<PagedResponse<EventRow>>({ page: 1, pageSize: 25, total: 0, rows: [] });
  const [pagesSort, setPagesSort] = useState<SortState>({ sortBy: "date_pst", sortDirection: "desc" });
  const [eventsSort, setEventsSort] = useState<SortState>({ sortBy: "date_pst", sortDirection: "desc" });
  const [pagesPage, setPagesPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryBase = useMemo(() => ({ ...filters }), [filters]);

  useEffect(() => {
    const savedView = localStorage.getItem(activeViewKey);
    if (savedView === "home" || savedView === "ga4") {
      setActiveView(savedView);
    }
    const savedTab = localStorage.getItem(activeTabKey);
    if (savedTab === "pages" || savedTab === "events") {
      setTab(savedTab);
    }
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setSavedSearches(JSON.parse(saved));
    }
    const savedPageColumns = localStorage.getItem(pageColumnsKey);
    if (savedPageColumns) {
      setVisiblePageColumns(JSON.parse(savedPageColumns));
    }
    const savedEventColumns = localStorage.getItem(eventColumnsKey);
    if (savedEventColumns) {
      setVisibleEventColumns(JSON.parse(savedEventColumns));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(activeViewKey, activeView);
  }, [activeView]);

  useEffect(() => {
    localStorage.setItem(activeTabKey, tab);
  }, [tab]);

  useEffect(() => {
    if (activeView !== "ga4") {
      return;
    }
    async function loadFilterOptions() {
      const data = await fetchJson<FilterOptions>("/filters");
      setFilterOptions(data);
    }
    loadFilterOptions().catch((loadError) => setError(String(loadError)));
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "ga4") {
      return;
    }
    async function loadSummary() {
      setIsLoadingSummary(true);
      const data = await fetchJson<SummaryResponse>("/summary", queryBase);
      setSummary(data);
      setIsLoadingSummary(false);
    }
    loadSummary().catch((loadError) => {
      setError(String(loadError));
      setIsLoadingSummary(false);
    });
  }, [activeView, queryBase]);

  useEffect(() => {
    if (activeView !== "ga4") {
      return;
    }
    async function loadPages() {
      setIsLoadingPages(true);
      const data = await fetchJson<PagedResponse<PageRow>>("/pages", {
        ...queryBase,
        ...pagesSort,
        page: pagesPage,
        pageSize: 25,
      });
      setPagesData(data);
      setIsLoadingPages(false);
    }
    loadPages().catch((loadError) => {
      setError(String(loadError));
      setIsLoadingPages(false);
    });
  }, [activeView, queryBase, pagesSort, pagesPage]);

  useEffect(() => {
    if (activeView !== "ga4") {
      return;
    }
    async function loadEvents() {
      setIsLoadingEvents(true);
      const data = await fetchJson<PagedResponse<EventRow>>("/events", {
        ...queryBase,
        ...eventsSort,
        page: eventsPage,
        pageSize: 25,
      });
      setEventsData(data);
      setIsLoadingEvents(false);
    }
    loadEvents().catch((loadError) => {
      setError(String(loadError));
      setIsLoadingEvents(false);
    });
  }, [activeView, queryBase, eventsSort, eventsPage]);

  function updateFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPagesPage(1);
    setEventsPage(1);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    setPagesPage(1);
    setEventsPage(1);
  }

  function saveSearch() {
    const name = window.prompt("Saved search name");
    if (!name) {
      return;
    }
    const next = [...savedSearches, { id: crypto.randomUUID(), name, filters }];
    setSavedSearches(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function loadSearch(search: SavedSearch) {
    setFilters({
      ...defaultFilters,
      ...search.filters,
      eventNames:
        Array.isArray(search.filters.eventNames) && search.filters.eventNames.length > 0
          ? search.filters.eventNames
          : defaultFilters.eventNames,
    });
  }

  function setQuickRange(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    setFilters((current) => ({
      ...current,
      startDate: formatDate(start),
      endDate: formatDate(end),
    }));
    setPagesPage(1);
    setEventsPage(1);
  }

  function deleteSearch(id: string) {
    const next = savedSearches.filter((search) => search.id !== id);
    setSavedSearches(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function toggleSort(
    current: SortState,
    setSort: (next: SortState) => void,
    sortBy: string,
  ) {
    if (current.sortBy === sortBy) {
      setSort({ sortBy, sortDirection: current.sortDirection === "asc" ? "desc" : "asc" });
      return;
    }
    setSort({ sortBy, sortDirection: "desc" });
  }

  function toggleColumn(
    current: string[],
    setCurrent: (next: string[]) => void,
    storage: string,
    key: string,
  ) {
    const next = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
    setCurrent(next);
    localStorage.setItem(storage, JSON.stringify(next));
  }

  function setAllColumns(setCurrent: (next: string[]) => void, storage: string, keys: string[]) {
    setCurrent(keys);
    localStorage.setItem(storage, JSON.stringify(keys));
  }

  function clearAllColumns(setCurrent: (next: string[]) => void, storage: string) {
    setCurrent([]);
    localStorage.setItem(storage, JSON.stringify([]));
  }

  const activeFilterChips = [
    filters.pagePath ? `Page: ${filters.pagePath}` : null,
    filters.eventNames && filters.eventNames.length !== defaultEventNames.length ? `Events: ${filters.eventNames.length}` : null,
    filters.eventClass && filters.eventClass !== "valid_event" ? `Class: ${filters.eventClass}` : null,
    filters.conversionOnly === "true" ? "Conversions only" : null,
    filters.groupBy && filters.groupBy !== "detail" ? `Grouped: ${filters.groupBy}` : null,
    filters.deviceCategory ? `Device: ${filters.deviceCategory}` : null,
    filters.sourceMedium ? `Source: ${filters.sourceMedium}` : null,
    filters.search ? `Search: ${filters.search}` : null,
  ].filter(Boolean) as string[];

  const visiblePageColumnDefs = pageColumns.filter((column) => visiblePageColumns.includes(column.key));
  const visibleEventColumnDefs = eventColumns.filter((column) => visibleEventColumns.includes(column.key));

  async function runBackfill() {
    try {
      setIsSyncing(true);
      setError(null);
      await postJson("/sync/backfill", { days: 90 });
      const [nextSummary, nextFilters] = await Promise.all([
        fetchJson<SummaryResponse>("/summary", queryBase),
        fetchJson<FilterOptions>("/filters"),
      ]);
      setSummary(nextSummary);
      setFilterOptions(nextFilters);
      setPagesPage(1);
      setEventsPage(1);
    } catch (syncError) {
      setError(String(syncError));
    } finally {
      setIsSyncing(false);
    }
  }

  if (activeView === "home") {
    return (
      <main className="app-shell">
        <header className="hero hero--stacked">
          <div>
            <button className="eyebrow-link" onClick={() => setActiveView("home")}>
              Data Streams Explorer
            </button>
            <h1>Choose a stream</h1>
            <p className="muted">
              Internal read-only explorer for stream quality, analytical slices, and cross-stream inspection.
            </p>
          </div>
        </header>

        <section className="stream-grid">
          <button className="stream-card" onClick={() => setActiveView("ga4")}>
            <span className="stream-card__eyebrow">Available Now</span>
            <strong>GA4 Stream View</strong>
            <span>
              Historical GA4 activity by date, page, event, device, and source / medium with grouped read views.
            </span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <button className="eyebrow-link" onClick={() => setActiveView("home")}>
            Data Streams Explorer
          </button>
          <h1>GA4 stream view</h1>
          <p className="muted">
            Internal read-only explorer for stream quality and analytical slices. GA4 is the first stream surface.
          </p>
        </div>
        <div className="actions-inline">
          <button className="ghost" onClick={() => setActiveView("home")}>
            All streams
          </button>
          <button onClick={runBackfill} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Backfill 90 days"}
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <SummaryCards summary={summary?.summary ?? null} latestSync={summary?.latestSync ?? null} />

      <section className="result-strip">
        <div className="result-strip__group">
          <strong>{tab === "pages" ? pagesData.total.toLocaleString() : eventsData.total.toLocaleString()}</strong>
          <span>{tab === "pages" ? "page rows" : "event rows"}</span>
        </div>
        <div className="result-strip__group">
          <strong>{filters.startDate}</strong>
          <span>to {filters.endDate}</span>
        </div>
        <div className="result-strip__group">
          <strong>{tab === "pages" ? `${pagesSort.sortBy} ${pagesSort.sortDirection}` : `${eventsSort.sortBy} ${eventsSort.sortDirection}`}</strong>
          <span>{isLoadingSummary || isLoadingPages || isLoadingEvents ? "Refreshing…" : "Live slice"}</span>
        </div>
      </section>

      {activeFilterChips.length > 0 ? (
        <section className="chip-row">
          {activeFilterChips.map((chip) => (
            <span key={chip} className="filter-chip">
              {chip}
            </span>
          ))}
        </section>
      ) : null}

      <div className="layout-grid">
        <div>
          <FilterBar
            filters={filters}
            options={filterOptions}
            onChange={updateFilters}
            onReset={resetFilters}
              onSaveSearch={saveSearch}
              onQuickRange={setQuickRange}
            />
        </div>
        <SavedSearches searches={savedSearches} onLoad={loadSearch} onDelete={deleteSearch} />
      </div>

      <section className="tabs">
        <button className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")}>
          Pages
        </button>
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>
          Events
        </button>
      </section>

      {tab === "pages" ? (
        <ColumnPicker
          title="Visible Columns"
          columns={pageColumns.map((column) => ({ key: column.key, label: column.label }))}
          visibleKeys={visiblePageColumns}
          onSelectAll={() => setAllColumns(setVisiblePageColumns, pageColumnsKey, pageColumns.map((column) => column.key))}
          onDeselectAll={() => clearAllColumns(setVisiblePageColumns, pageColumnsKey)}
          onToggle={(key) =>
            toggleColumn(
              visiblePageColumns,
              setVisiblePageColumns,
              pageColumnsKey,
              key,
            )
          }
        />
      ) : (
        <ColumnPicker
          title="Visible Columns"
          columns={eventColumns.map((column) => ({ key: column.key, label: column.label }))}
          visibleKeys={visibleEventColumns}
          onSelectAll={() => setAllColumns(setVisibleEventColumns, eventColumnsKey, eventColumns.map((column) => column.key))}
          onDeselectAll={() => clearAllColumns(setVisibleEventColumns, eventColumnsKey)}
          onToggle={(key) =>
            toggleColumn(
              visibleEventColumns,
              setVisibleEventColumns,
              eventColumnsKey,
              key,
            )
          }
        />
      )}

      {tab === "pages" ? (
        <DataTable<PageRow>
          columns={visiblePageColumnDefs}
          rows={pagesData.rows}
          total={pagesData.total}
          page={pagesData.page}
          pageSize={pagesData.pageSize}
          sortBy={pagesSort.sortBy}
          sortDirection={pagesSort.sortDirection}
          onSort={(sortBy) => toggleSort(pagesSort, setPagesSort, sortBy)}
          onPageChange={setPagesPage}
          loading={isLoadingPages}
        />
      ) : (
        <DataTable<EventRow>
          columns={visibleEventColumnDefs}
          rows={eventsData.rows}
          total={eventsData.total}
          page={eventsData.page}
          pageSize={eventsData.pageSize}
          sortBy={eventsSort.sortBy}
          sortDirection={eventsSort.sortDirection}
          onSort={(sortBy) => toggleSort(eventsSort, setEventsSort, sortBy)}
          onPageChange={setEventsPage}
          loading={isLoadingEvents}
        />
      )}
    </main>
  );
}
