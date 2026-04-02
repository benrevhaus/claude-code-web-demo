const pages = [
    ["/", "Homepage"],
    ["/products/fat-burner", "Fat Burner"],
    ["/products/sleep-gummies", "Sleep Gummies"],
    ["/collections/bestsellers", "Bestsellers"],
    ["/quiz", "Quiz Landing"],
    ["/cart", "Cart"],
    ["/checkout", "Checkout"],
];
const events = [
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
const devices = ["desktop", "mobile", "tablet"];
const sources = ["google / organic", "google / cpc", "klaviyo / email", "direct / (none)", "meta / paid"];
let cache;
function toDateString(date) {
    return date.toISOString().slice(0, 10);
}
function numberFromSeed(seed, min, max) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return min + (hash % (max - min + 1));
}
function ensureDataset() {
    if (cache) {
        return cache;
    }
    const pageRows = [];
    const eventRows = [];
    for (let i = 90; i >= 1; i -= 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - i);
        const date_pst = toDateString(date);
        for (const [page_path, page_title] of pages) {
            for (const device of devices) {
                for (const source_medium of sources) {
                    const seed = `${date_pst}|${page_path}|${device}|${source_medium}`;
                    const views = numberFromSeed(seed, 20, 900);
                    const sessions = Math.max(5, Math.floor(views * 0.55));
                    const total_users = Math.max(3, Math.floor(sessions * 0.82));
                    const event_count = Math.max(views, Math.floor(views * 1.8));
                    pageRows.push({
                        date_pst,
                        page_path,
                        page_title,
                        landing_page_path: page_path,
                        device_category: device,
                        source_medium,
                        views,
                        sessions,
                        total_users,
                        event_count,
                    });
                    for (const event_name of events) {
                        const eventSeed = `${seed}|${event_name}`;
                        const eventClass = "valid_event";
                        const normalizedEventName = event_name.toLowerCase().replace(/\s+/g, "_");
                        const eventMultiplier = normalizedEventName === "page_view"
                            ? 1
                            : normalizedEventName === "view_item"
                                ? 0.42
                                : normalizedEventName === "add_to_cart"
                                    ? 0.18
                                    : normalizedEventName === "begin_checkout"
                                        ? 0.09
                                        : normalizedEventName === "purchase"
                                            ? 0.035
                                            : 0.12;
                        eventRows.push({
                            date_pst,
                            page_path,
                            landing_page_path: page_path,
                            event_name: normalizedEventName,
                            raw_event_name: event_name,
                            event_class: eventClass,
                            derived_page_path: "",
                            device_category: device,
                            source_medium,
                            is_conversion_event: ["purchase", "begin_checkout"].includes(normalizedEventName),
                            event_count: Math.max(1, Math.floor(views * eventMultiplier) + numberFromSeed(eventSeed, 0, 8)),
                            sessions,
                            total_users,
                        });
                    }
                }
            }
        }
    }
    cache = { pageRows, eventRows, generatedAt: new Date().toISOString() };
    return cache;
}
function applyFilters(rows, filters, searchKeys) {
    return rows.filter((row) => {
        if (filters.startDate && String(row.date_pst) < filters.startDate)
            return false;
        if (filters.endDate && String(row.date_pst) > filters.endDate)
            return false;
        if (filters.pagePath && row.page_path !== filters.pagePath)
            return false;
        if ("landing_page_path" in row && filters.landingPagePath && row.landing_page_path !== filters.landingPagePath)
            return false;
        if ("event_name" in row && filters.eventNames) {
            if (filters.eventNames.length === 0)
                return false;
            if (!filters.eventNames.includes(String(row.event_name)))
                return false;
        }
        if ("raw_event_name" in row && filters.rawEventName && row.raw_event_name !== filters.rawEventName)
            return false;
        if ("event_class" in row && filters.eventClass && row.event_class !== filters.eventClass)
            return false;
        if (filters.deviceCategory && row.device_category !== filters.deviceCategory)
            return false;
        if (filters.sourceMedium && row.source_medium !== filters.sourceMedium)
            return false;
        if ("is_conversion_event" in row && filters.conversionOnly === "true" && row.is_conversion_event !== true)
            return false;
        if (filters.search) {
            const query = filters.search.toLowerCase();
            const matches = searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(query));
            if (!matches)
                return false;
        }
        return true;
    });
}
function sortRows(rows, sortBy, sortDirection) {
    return [...rows].sort((a, b) => {
        const left = a[sortBy];
        const right = b[sortBy];
        if (left === right)
            return 0;
        if (sortDirection === "asc") {
            return left > right ? 1 : -1;
        }
        return left < right ? 1 : -1;
    });
}
function groupRows(rows, groupingKeys, metricKeys) {
    const grouped = new Map();
    for (const row of rows) {
        const key = groupingKeys.map((groupingKey) => String(row[groupingKey] ?? "")).join("|");
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, { ...row });
            continue;
        }
        for (const metricKey of metricKeys) {
            existing[metricKey] =
                Number(existing[metricKey] ?? 0) + Number(row[metricKey] ?? 0);
        }
    }
    return [...grouped.values()];
}
export function mockApi(path, params, method = "GET") {
    const dataset = ensureDataset();
    const filters = params;
    if (path === "/health") {
        return { ok: true, now: new Date().toISOString(), mock: true };
    }
    if (path === "/sync/backfill" && method === "POST") {
        cache = undefined;
        const refreshed = ensureDataset();
        return {
            runId: "mock-sync",
            daysBack: Number(params?.days ?? 90),
            pagesRows: refreshed.pageRows.length,
            eventsRows: refreshed.eventRows.length,
            usedMockData: true,
        };
    }
    if (path === "/summary") {
        const pageRows = applyFilters(dataset.pageRows, filters ?? {}, ["page_path", "page_title"]);
        const eventRows = applyFilters(dataset.eventRows, filters ?? {}, ["page_path", "event_name"]);
        return {
            summary: {
                views: pageRows.reduce((sum, row) => sum + row.views, 0),
                sessions: pageRows.reduce((sum, row) => sum + row.sessions, 0),
                totalUsers: pageRows.reduce((sum, row) => sum + row.total_users, 0),
                pageCount: new Set(pageRows.map((row) => row.page_path)).size,
                eventCount: eventRows.reduce((sum, row) => sum + Number(row.event_count), 0),
                distinctEvents: new Set(eventRows.map((row) => row.event_name)).size,
            },
            latestSync: {
                status: "mock",
                started_at: dataset.generatedAt,
                finished_at: dataset.generatedAt,
                pages_rows: dataset.pageRows.length,
                events_rows: dataset.eventRows.length,
            },
        };
    }
    if (path === "/filters") {
        return {
            pagePaths: [...new Set(dataset.pageRows.map((row) => row.page_path))].sort(),
            eventNames: [...new Set(dataset.eventRows.filter((row) => row.event_class === "valid_event").map((row) => row.event_name))].sort(),
            deviceCategories: [...new Set(dataset.eventRows.map((row) => row.device_category))].sort(),
            sourceMediums: [...new Set(dataset.eventRows.map((row) => row.source_medium))].sort(),
            eventClasses: ["valid_event"],
            variantKeys: [],
            variantValues: [],
        };
    }
    if (path === "/pages") {
        const page = Number(params?.page ?? 1);
        const pageSize = Number(params?.pageSize ?? 25);
        const groupBy = String(params?.groupBy ?? "detail");
        const groupingKeys = groupBy === "page"
            ? ["date_pst", "page_path", "page_title"]
            : groupBy === "device"
                ? ["date_pst", "page_path", "page_title", "device_category"]
                : groupBy === "source_medium"
                    ? ["date_pst", "page_path", "page_title", "source_medium"]
                    : ["date_pst", "page_path", "page_title", "landing_page_path", "device_category", "source_medium"];
        const filtered = sortRows(groupRows(applyFilters(dataset.pageRows, filters ?? {}, ["page_path", "page_title", "landing_page_path"]), groupingKeys, ["views", "sessions", "total_users", "event_count"]), String(params?.sortBy ?? "date_pst"), params?.sortDirection ?? "desc");
        const start = (page - 1) * pageSize;
        return {
            page,
            pageSize,
            groupBy,
            total: filtered.length,
            rows: filtered.slice(start, start + pageSize),
        };
    }
    if (path === "/events") {
        const page = Number(params?.page ?? 1);
        const pageSize = Number(params?.pageSize ?? 25);
        const groupBy = String(params?.groupBy ?? "detail");
        const groupingKeys = groupBy === "page"
            ? ["date_pst", "page_path", "event_name", "event_class", "is_conversion_event"]
            : groupBy === "device"
                ? ["date_pst", "page_path", "event_name", "event_class", "device_category", "is_conversion_event"]
                : groupBy === "source_medium"
                    ? ["date_pst", "page_path", "event_name", "event_class", "source_medium", "is_conversion_event"]
                    : groupBy === "event"
                        ? ["date_pst", "event_name", "event_class", "is_conversion_event"]
                        : [
                            "date_pst",
                            "page_path",
                            "landing_page_path",
                            "event_name",
                            "raw_event_name",
                            "event_class",
                            "derived_page_path",
                            "device_category",
                            "source_medium",
                            "is_conversion_event",
                        ];
        const filtered = sortRows(groupRows(applyFilters(dataset.eventRows, filters ?? {}, ["page_path", "event_name", "raw_event_name", "derived_page_path"]), groupingKeys, ["event_count", "sessions", "total_users"]), String(params?.sortBy ?? "date_pst"), params?.sortDirection ?? "desc");
        const start = (page - 1) * pageSize;
        return {
            page,
            pageSize,
            groupBy,
            total: filtered.length,
            rows: filtered.slice(start, start + pageSize),
        };
    }
    throw new Error(`No mock handler for ${path}`);
}
