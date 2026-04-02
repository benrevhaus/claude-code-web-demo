import { mockApi } from "./mockDataset";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3002/api";
function toQuery(params) {
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
export async function fetchJson(path, params) {
    const query = params ? toQuery(params) : "";
    try {
        const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`);
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    }
    catch {
        return mockApi(path, params, "GET");
    }
}
export async function postJson(path, body) {
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    }
    catch {
        return mockApi(path, body, "POST");
    }
}
