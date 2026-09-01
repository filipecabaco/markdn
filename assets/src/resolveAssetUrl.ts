/**
 * Turns an image reference inside a document into a URL the app can actually load.
 *
 * A document is a file on disk, so its relative references (`./img/a.png`,
 * `../shared/b.svg`) are relative to *that file's directory*, not to the page URL.
 * The browser would resolve them against the SPA's origin and 404. Absolute and
 * external references each need different treatment again:
 *
 *   https://… , data: , blob:   left alone; the browser can fetch these itself
 *   /shared/logo.svg            passed through as-is; the server resolves it
 *                               against the MarkDN root and rejects an escape
 *   ./diagram.svg               joined to the open document's directory first
 *
 * Everything that is not already a URL goes through `/api/image`, which enforces
 * the same root confinement as the document API.
 */

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

/** Collapses "." and ".." without needing a base URL. */
export function normalizePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const out: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // A leading ".." on a relative path has to survive: it means the parent of
      // the document's directory, which the server resolves against the root.
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbsolute) out.push("..");
      continue;
    }
    out.push(segment);
  }

  return (isAbsolute ? "/" : "") + out.join("/");
}

export function resolveAssetUrl(src: string | undefined, documentPath: string | null): string {
  if (!src) return "";
  // Protocol-relative ("//example.com/a.png") is a URL too, and must not be
  // mistaken for a root-absolute filesystem path.
  if (ABSOLUTE_URL.test(src) || src.startsWith("//")) return src;

  const path = src.startsWith("/")
    ? normalizePath(src)
    : normalizePath(`${documentPath ? documentPath.replace(/[^/]*$/, "") : ""}${src}`);

  return `/api/image?path=${encodeURIComponent(path)}`;
}
