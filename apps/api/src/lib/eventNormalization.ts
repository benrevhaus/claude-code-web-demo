export type EventClass = "valid_event" | "page_path_leak" | "implementation_noise";

export type NormalizedEvent = {
  rawEventName: string;
  normalizedEventName: string;
  eventClass: EventClass;
  derivedPagePath: string;
  eventParamValue: string;
};

/**
 * Events whose primary GA4 parameter should split them into distinct rows.
 * Key: normalized event name. Value: GA4 customEvent dimension name.
 *
 * To add a new parameterized event, add an entry here and include the
 * corresponding `customEvent:paramName` in EVENT_PARAM_DIMENSIONS below.
 */
export const PARAMETERIZED_EVENTS: Record<string, string> = {
  scroll_depth: "percent_scrolled",
  time_on_site: "seconds_on_site",
};

/** GA4 API dimension names to fetch for parameterized event splitting. */
export const EVENT_PARAM_DIMENSIONS = [
  "customEvent:percent_scrolled",
  "customEvent:seconds_on_site",
];

export function normalizeEventName(rawValue: string, paramValue = ""): NormalizedEvent {
  const rawEventName = (rawValue || "").trim();
  const lower = rawEventName.toLowerCase();

  if (
    rawEventName.startsWith("http://") ||
    rawEventName.startsWith("https://") ||
    rawEventName.startsWith("/")
  ) {
    return {
      rawEventName,
      normalizedEventName: "page_path_leak",
      eventClass: "page_path_leak",
      derivedPagePath: rawEventName,
      eventParamValue: "",
    };
  }

  if (lower.startsWith("ga4 - ") || lower.startsWith("image_http")) {
    return {
      rawEventName,
      normalizedEventName: "implementation_noise",
      eventClass: "implementation_noise",
      derivedPagePath: "",
      eventParamValue: "",
    };
  }

  const baseName = lower.replace(/\s+/g, "_");
  const cleanParam = (paramValue || "").trim();

  // For parameterized events with a value, create a compound name
  if (cleanParam && baseName in PARAMETERIZED_EVENTS) {
    return {
      rawEventName,
      normalizedEventName: `${baseName}_${cleanParam}`,
      eventClass: "valid_event",
      derivedPagePath: "",
      eventParamValue: cleanParam,
    };
  }

  return {
    rawEventName,
    normalizedEventName: baseName,
    eventClass: "valid_event",
    derivedPagePath: "",
    eventParamValue: cleanParam,
  };
}
