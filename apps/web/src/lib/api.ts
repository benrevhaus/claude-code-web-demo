import { mockApi } from "./mockDataset";

export type Filters = {
  startDate: string;
  endDate: string;
  pagePath: string;
  landingPagePath?: string;
  eventNames?: string[];
  rawEventName?: string;
  eventClass?: string;
  deviceCategory: string;
  sourceMedium: string;
  conversionOnly?: string;
  search: string;
  groupBy?: string;
};

export type SortState = {
  sortBy: string;
  sortDirection: "asc" | "desc";
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3002/api";

function toQuery(params: Record<string, string | number | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      query.set(key, value.length > 0 ? value.join(",") : "__none__");
      continue;
    }
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

export async function fetchJson<T>(path: string, params?: Record<string, string | number | string[] | undefined>): Promise<T> {
  const query = params ? toQuery(params) : "";
  try {
    const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  } catch {
    return mockApi(path, params, "GET") as T;
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  } catch {
    return mockApi(path, body as Record<string, string | number | string[] | undefined>, "POST") as T;
  }
}
