type MockPageRow = {
  date_pst: string;
  page_path: string;
  page_title: string;
  landing_page_path: string;
  device_category: string;
  source_medium: string;
  views: number;
  sessions: number;
  total_users: number;
  event_count: number;
};

type MockEventRow = {
  date_pst: string;
  page_path: string;
  raw_event_name: string;
  normalized_event_name: string;
  event_class: string;
  derived_page_path: string;
  event_param_value: string;
  device_category: string;
  source_medium: string;
  landing_page_path: string;
  is_conversion_event: boolean;
  event_count: number;
  sessions: number;
  total_users: number;
};

const pages = [
  ["/", "Homepage"],
  ["/products/fat-burner", "Fat Burner"],
  ["/products/sleep-gummies", "Sleep Gummies"],
  ["/collections/bestsellers", "Bestsellers"],
  ["/quiz", "Quiz Landing"],
  ["/cart", "Cart"],
  ["/checkout", "Checkout"],
] as const;

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
  "time_on_site",
  "click",
  "show_more",
  "show_less",
  "shared_facebook",
] as const;

const devices = ["desktop", "mobile", "tablet"] as const;
const sources = ["google / organic", "google / cpc", "klaviyo / email", "direct / (none)", "meta / paid"] as const;

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numberFromSeed(seed: string, min: number, max: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return min + (hash % (max - min + 1));
}

export function generateMockDataset(days: number): { pageRows: MockPageRow[]; eventRows: MockEventRow[] } {
  const pageRows: MockPageRow[] = [];
  const eventRows: MockEventRow[] = [];

  for (let i = days; i >= 1; i -= 1) {
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
            const normalizedEventName = event_name.toLowerCase().replace(/\s+/g, "_");
            const eventMultiplier =
              normalizedEventName === "page_view"
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

            // Parameterized events get split into separate rows per param value
            if (normalizedEventName === "scroll_depth") {
              const thresholds = ["25", "50", "75", "90"];
              const baseCount = Math.max(1, Math.floor(views * eventMultiplier) + numberFromSeed(eventSeed, 0, 8));
              for (const threshold of thresholds) {
                const decay = threshold === "25" ? 1 : threshold === "50" ? 0.8 : threshold === "75" ? 0.55 : 0.3;
                eventRows.push({
                  date_pst,
                  page_path,
                  raw_event_name: event_name,
                  normalized_event_name: `scroll_depth_${threshold}`,
                  event_class: "valid_event",
                  derived_page_path: "",
                  event_param_value: threshold,
                  device_category: device,
                  source_medium,
                  landing_page_path: page_path,
                  is_conversion_event: false,
                  event_count: Math.max(1, Math.floor(baseCount * decay)),
                  sessions: Math.max(1, Math.floor(sessions * decay)),
                  total_users: Math.max(1, Math.floor(total_users * decay)),
                });
              }
            } else if (normalizedEventName === "time_on_site") {
              const buckets = ["10", "30", "60", "120", "300"];
              const baseCount = Math.max(1, Math.floor(views * eventMultiplier) + numberFromSeed(eventSeed, 0, 8));
              for (const seconds of buckets) {
                const decay = seconds === "10" ? 1 : seconds === "30" ? 0.7 : seconds === "60" ? 0.45 : seconds === "120" ? 0.2 : 0.08;
                eventRows.push({
                  date_pst,
                  page_path,
                  raw_event_name: event_name,
                  normalized_event_name: `time_on_site_${seconds}`,
                  event_class: "valid_event",
                  derived_page_path: "",
                  event_param_value: seconds,
                  device_category: device,
                  source_medium,
                  landing_page_path: page_path,
                  is_conversion_event: false,
                  event_count: Math.max(1, Math.floor(baseCount * decay)),
                  sessions: Math.max(1, Math.floor(sessions * decay)),
                  total_users: Math.max(1, Math.floor(total_users * decay)),
                });
              }
            } else {
              eventRows.push({
                date_pst,
                page_path,
                raw_event_name: event_name,
                normalized_event_name: normalizedEventName,
                event_class: "valid_event",
                derived_page_path: "",
                event_param_value: "",
                device_category: device,
                source_medium,
                landing_page_path: page_path,
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
  }

  return { pageRows, eventRows };
}
