export type EventClass = "valid_event" | "page_path_leak" | "implementation_noise";

export type NormalizedEvent = {
  rawEventName: string;
  normalizedEventName: string;
  eventClass: EventClass;
  derivedPagePath: string;
};

export function normalizeEventName(rawValue: string): NormalizedEvent {
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
    };
  }

  if (lower.startsWith("ga4 - ") || lower.startsWith("image_http")) {
    return {
      rawEventName,
      normalizedEventName: "implementation_noise",
      eventClass: "implementation_noise",
      derivedPagePath: "",
    };
  }

  return {
    rawEventName,
    normalizedEventName: lower.replace(/\s+/g, "_"),
    eventClass: "valid_event",
    derivedPagePath: "",
  };
}
