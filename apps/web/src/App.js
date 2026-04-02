import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { ColumnPicker } from "./components/ColumnPicker";
import { DataTable } from "./components/DataTable";
import { FilterBar } from "./components/FilterBar";
import { SavedSearches } from "./components/SavedSearches";
import { SummaryCards } from "./components/SummaryCards";
import { fetchJson, postJson } from "./lib/api";
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
];
function formatDate(date) {
    return date.toISOString().slice(0, 10);
}
const defaultFilters = {
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
];
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
];
export default function App() {
    const [activeView, setActiveView] = useState("home");
    const [tab, setTab] = useState("pages");
    const [filters, setFilters] = useState(defaultFilters);
    const [savedSearches, setSavedSearches] = useState([]);
    const [visiblePageColumns, setVisiblePageColumns] = useState(pageColumns.map((column) => column.key));
    const [visibleEventColumns, setVisibleEventColumns] = useState(eventColumns.map((column) => column.key));
    const [summary, setSummary] = useState(null);
    const [filterOptions, setFilterOptions] = useState({
        pagePaths: [],
        eventNames: [...defaultEventNames],
        deviceCategories: [],
        sourceMediums: [],
        eventClasses: ["valid_event"],
        variantKeys: [],
        variantValues: [],
    });
    const [pagesData, setPagesData] = useState({ page: 1, pageSize: 25, total: 0, rows: [] });
    const [eventsData, setEventsData] = useState({ page: 1, pageSize: 25, total: 0, rows: [] });
    const [pagesSort, setPagesSort] = useState({ sortBy: "date_pst", sortDirection: "desc" });
    const [eventsSort, setEventsSort] = useState({ sortBy: "date_pst", sortDirection: "desc" });
    const [pagesPage, setPagesPage] = useState(1);
    const [eventsPage, setEventsPage] = useState(1);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [isLoadingPages, setIsLoadingPages] = useState(false);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [error, setError] = useState(null);
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
            const data = await fetchJson("/filters");
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
            const data = await fetchJson("/summary", queryBase);
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
            const data = await fetchJson("/pages", {
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
            const data = await fetchJson("/events", {
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
    function updateFilters(patch) {
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
    function loadSearch(search) {
        setFilters({
            ...defaultFilters,
            ...search.filters,
            eventNames: Array.isArray(search.filters.eventNames) && search.filters.eventNames.length > 0
                ? search.filters.eventNames
                : defaultFilters.eventNames,
        });
    }
    function setQuickRange(days) {
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
    function deleteSearch(id) {
        const next = savedSearches.filter((search) => search.id !== id);
        setSavedSearches(next);
        localStorage.setItem(storageKey, JSON.stringify(next));
    }
    function toggleSort(current, setSort, sortBy) {
        if (current.sortBy === sortBy) {
            setSort({ sortBy, sortDirection: current.sortDirection === "asc" ? "desc" : "asc" });
            return;
        }
        setSort({ sortBy, sortDirection: "desc" });
    }
    function toggleColumn(current, setCurrent, storage, key) {
        const next = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
        setCurrent(next);
        localStorage.setItem(storage, JSON.stringify(next));
    }
    function setAllColumns(setCurrent, storage, keys) {
        setCurrent(keys);
        localStorage.setItem(storage, JSON.stringify(keys));
    }
    function clearAllColumns(setCurrent, storage) {
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
    ].filter(Boolean);
    const visiblePageColumnDefs = pageColumns.filter((column) => visiblePageColumns.includes(column.key));
    const visibleEventColumnDefs = eventColumns.filter((column) => visibleEventColumns.includes(column.key));
    async function runBackfill() {
        try {
            setIsSyncing(true);
            setError(null);
            await postJson("/sync/backfill", { days: 90 });
            const [nextSummary, nextFilters] = await Promise.all([
                fetchJson("/summary", queryBase),
                fetchJson("/filters"),
            ]);
            setSummary(nextSummary);
            setFilterOptions(nextFilters);
            setPagesPage(1);
            setEventsPage(1);
        }
        catch (syncError) {
            setError(String(syncError));
        }
        finally {
            setIsSyncing(false);
        }
    }
    if (activeView === "home") {
        return (_jsxs("main", { className: "app-shell", children: [_jsx("header", { className: "hero hero--stacked", children: _jsxs("div", { children: [_jsx("button", { className: "eyebrow-link", onClick: () => setActiveView("home"), children: "Data Streams Explorer" }), _jsx("h1", { children: "Choose a stream" }), _jsx("p", { className: "muted", children: "Internal read-only explorer for stream quality, analytical slices, and cross-stream inspection." })] }) }), _jsx("section", { className: "stream-grid", children: _jsxs("button", { className: "stream-card", onClick: () => setActiveView("ga4"), children: [_jsx("span", { className: "stream-card__eyebrow", children: "Available Now" }), _jsx("strong", { children: "GA4 Stream View" }), _jsx("span", { children: "Historical GA4 activity by date, page, event, device, and source / medium with grouped read views." })] }) })] }));
    }
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("header", { className: "hero", children: [_jsxs("div", { children: [_jsx("button", { className: "eyebrow-link", onClick: () => setActiveView("home"), children: "Data Streams Explorer" }), _jsx("h1", { children: "GA4 stream view" }), _jsx("p", { className: "muted", children: "Internal read-only explorer for stream quality and analytical slices. GA4 is the first stream surface." })] }), _jsxs("div", { className: "actions-inline", children: [_jsx("button", { className: "ghost", onClick: () => setActiveView("home"), children: "All streams" }), _jsx("button", { onClick: runBackfill, disabled: isSyncing, children: isSyncing ? "Syncing..." : "Backfill 90 days" })] })] }), error ? _jsx("div", { className: "error-banner", children: error }) : null, _jsx(SummaryCards, { summary: summary?.summary ?? null, latestSync: summary?.latestSync ?? null }), _jsxs("section", { className: "result-strip", children: [_jsxs("div", { className: "result-strip__group", children: [_jsx("strong", { children: tab === "pages" ? pagesData.total.toLocaleString() : eventsData.total.toLocaleString() }), _jsx("span", { children: tab === "pages" ? "page rows" : "event rows" })] }), _jsxs("div", { className: "result-strip__group", children: [_jsx("strong", { children: filters.startDate }), _jsxs("span", { children: ["to ", filters.endDate] })] }), _jsxs("div", { className: "result-strip__group", children: [_jsx("strong", { children: tab === "pages" ? `${pagesSort.sortBy} ${pagesSort.sortDirection}` : `${eventsSort.sortBy} ${eventsSort.sortDirection}` }), _jsx("span", { children: isLoadingSummary || isLoadingPages || isLoadingEvents ? "Refreshing…" : "Live slice" })] })] }), activeFilterChips.length > 0 ? (_jsx("section", { className: "chip-row", children: activeFilterChips.map((chip) => (_jsx("span", { className: "filter-chip", children: chip }, chip))) })) : null, _jsxs("div", { className: "layout-grid", children: [_jsx("div", { children: _jsx(FilterBar, { filters: filters, options: filterOptions, onChange: updateFilters, onReset: resetFilters, onSaveSearch: saveSearch, onQuickRange: setQuickRange }) }), _jsx(SavedSearches, { searches: savedSearches, onLoad: loadSearch, onDelete: deleteSearch })] }), _jsxs("section", { className: "tabs", children: [_jsx("button", { className: tab === "pages" ? "active" : "", onClick: () => setTab("pages"), children: "Pages" }), _jsx("button", { className: tab === "events" ? "active" : "", onClick: () => setTab("events"), children: "Events" })] }), tab === "pages" ? (_jsx(ColumnPicker, { title: "Visible Columns", columns: pageColumns.map((column) => ({ key: column.key, label: column.label })), visibleKeys: visiblePageColumns, onSelectAll: () => setAllColumns(setVisiblePageColumns, pageColumnsKey, pageColumns.map((column) => column.key)), onDeselectAll: () => clearAllColumns(setVisiblePageColumns, pageColumnsKey), onToggle: (key) => toggleColumn(visiblePageColumns, setVisiblePageColumns, pageColumnsKey, key) })) : (_jsx(ColumnPicker, { title: "Visible Columns", columns: eventColumns.map((column) => ({ key: column.key, label: column.label })), visibleKeys: visibleEventColumns, onSelectAll: () => setAllColumns(setVisibleEventColumns, eventColumnsKey, eventColumns.map((column) => column.key)), onDeselectAll: () => clearAllColumns(setVisibleEventColumns, eventColumnsKey), onToggle: (key) => toggleColumn(visibleEventColumns, setVisibleEventColumns, eventColumnsKey, key) })), tab === "pages" ? (_jsx(DataTable, { columns: visiblePageColumnDefs, rows: pagesData.rows, total: pagesData.total, page: pagesData.page, pageSize: pagesData.pageSize, sortBy: pagesSort.sortBy, sortDirection: pagesSort.sortDirection, onSort: (sortBy) => toggleSort(pagesSort, setPagesSort, sortBy), onPageChange: setPagesPage, loading: isLoadingPages })) : (_jsx(DataTable, { columns: visibleEventColumnDefs, rows: eventsData.rows, total: eventsData.total, page: eventsData.page, pageSize: eventsData.pageSize, sortBy: eventsSort.sortBy, sortDirection: eventsSort.sortDirection, onSort: (sortBy) => toggleSort(eventsSort, setEventsSort, sortBy), onPageChange: setEventsPage, loading: isLoadingEvents }))] }));
}
