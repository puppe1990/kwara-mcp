import { SITE_ORIGIN } from "./lots.js";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

export class KwaraHttpError extends Error {
  constructor(status, path) {
    super(`HTTP ${status} ${path}`);
    this.name = "KwaraHttpError";
    this.status = status;
    this.path = path;
  }
}

export async function kwaraFetch(
  url,
  { method = "GET", headers = {}, body, fetchImpl = fetch, timeoutMs = 15000 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const path = new URL(url).pathname;
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Origin: SITE_ORIGIN,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...headers,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new KwaraHttpError(response.status, path);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`timeout ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
