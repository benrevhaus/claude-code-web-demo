import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SummaryCards({ summary, latestSync }) {
    const cards = summary
        ? [
            ["Views", summary.views],
            ["Sessions", summary.sessions],
            ["Users", summary.totalUsers],
            ["Pages", summary.pageCount],
            ["Events", summary.eventCount],
            ["Distinct Events", summary.distinctEvents],
        ]
        : [];
    return (_jsxs("section", { className: "summary-grid", children: [cards.map(([label, value]) => (_jsxs("article", { className: "summary-card", children: [_jsx("span", { children: label }), _jsx("strong", { children: Number(value).toLocaleString() })] }, label))), _jsxs("article", { className: "summary-card sync-card", children: [_jsx("span", { children: "Latest Sync" }), _jsx("strong", { children: latestSync?.status ?? "none" }), _jsx("small", { children: latestSync
                            ? `${latestSync.pages_rows} page rows, ${latestSync.events_rows} event rows`
                            : "Run a backfill to populate data" })] })] }));
}
