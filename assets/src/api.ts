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

export function health(): Promise<{
  status: string;
  root: string;
  rootLocked: boolean;
  settingsPath: string;
}> {
  return request("/api/health");
}

export interface SearchHit {
  name: string;
  path: string;
  /** Indices in `path` the query matched, for highlighting. Ranked server-side. */
  matches: number[];
  score: number;
}

/**
 * Fuzzy-finds documents anywhere under the root.
 *
 * The walk happens on the server: the browser never sees the tree, and a home
 * directory is far too large to ship to it just to filter in JS. A blank query
 * is valid and answers with the most recently modified documents.
 */
export function searchDocuments(query: string, limit = 50, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return request<{ query: string; results: SearchHit[] }>(`/api/search?${params}`, { signal });
}

export interface SearchFile {
  path: string;
  name: string;
  /** The whole document, not the matching lines — the multibuffer writes it back. */
  contents: string;
}

/**
 * Finds documents containing `query` literally.
 *
 * Not fuzzy, and not a regular expression: the multibuffer re-finds the same
 * matches in the text it gets back, to underline and to replace them, so client
 * and server have to mean exactly the same thing by "matches".
 */
export function searchContents(
  query: string,
  options: { caseSensitive?: boolean; limit?: number; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams({ q: query });
  if (options.caseSensitive) params.set("case", "1");
  if (options.limit) params.set("limit", String(options.limit));

  return request<{ query: string; files: SearchFile[]; truncated: boolean }>(
    `/api/search/contents?${params}`,
    { signal: options.signal },
  );
}

export type Theme = "system" | "light" | "dark";
export type ViewMode = "split" | "editor" | "preview";

export interface Settings {
  /** null means "the user's home directory". */
  root: string | null;
  theme: Theme;
  defaultView: ViewMode;
  editorFontSize: number;
  showHiddenFiles: boolean;
  /** Auto-scroll speed in pixels per second. */
  autoScrollSpeed: number;
}

export interface SettingsResponse {
  settings: Settings;
  defaults: Settings;
  /** Where settings.json lives, shown in the panel so it can be edited by hand. */
  path: string;
  /** The root actually in force, which is the home directory when unset. */
  root: string;
  /** True when MARKDN_ROOT pins the root, so the API will refuse to change it. */
  rootLocked: boolean;
}

export function getSettings(): Promise<SettingsResponse> {
  return request("/api/settings");
}

export function saveSettings(patch: Partial<Settings>): Promise<SettingsResponse> {
  return request("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}
