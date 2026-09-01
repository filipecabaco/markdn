/**
 * Client for the Francis document API.
 *
 * Paths are always relative to the server's root; the server re-checks every one
 * of them, so nothing here is a security boundary — it is only a convenience.
 */

export interface Entry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export interface ComponentDoc {
  name: string;
  description: string;
  props: Record<string, { type: string; values?: string[]; required: boolean }>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    // The API answers errors as {"error": "..."}; fall back to the status line
    // for anything that is not JSON (a proxy error page, say).
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => null);

    throw new Error(detail ?? `${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function listDocuments(path = "."): Promise<{ entries: Entry[] }> {
  return request(`/api/documents?path=${encodeURIComponent(path)}`);
}

export function readDocument(path: string): Promise<{ path: string; contents: string }> {
  return request(`/api/document?path=${encodeURIComponent(path)}`);
}

export function saveDocument(path: string, contents: string): Promise<{ saved: boolean }> {
  return request("/api/document", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, contents }),
  });
}

export function listComponents(): Promise<{ components: ComponentDoc[] }> {
  return request("/api/components");
}

export function health(): Promise<{ status: string; root: string }> {
  return request("/api/health");
}
