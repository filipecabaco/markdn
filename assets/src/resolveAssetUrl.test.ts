import { describe, expect, it } from "vitest";
import { normalizePath, resolveAssetUrl } from "./resolveAssetUrl";

const decode = (url: string) => decodeURIComponent(url.replace("/api/image?path=", ""));

describe("resolveAssetUrl", () => {
  it("leaves absolute URLs alone", () => {
    for (const url of [
      "https://example.com/a.png",
      "http://localhost:43118/favicon.svg",
      "data:image/svg+xml;base64,AAA",
      "//example.com/a.png",
    ]) {
      expect(resolveAssetUrl(url, "docs/guide.md")).toBe(url);
    }
  });

  it("resolves a relative path against the document's directory", () => {
    expect(decode(resolveAssetUrl("img/a.png", "docs/guide.md"))).toBe("docs/img/a.png");
    expect(decode(resolveAssetUrl("./a.png", "docs/guide.md"))).toBe("docs/a.png");
  });

  it("walks up out of the document's directory", () => {
    expect(decode(resolveAssetUrl("../shared/a.png", "docs/guide.md"))).toBe("shared/a.png");
    expect(decode(resolveAssetUrl("../../a.png", "docs/deep/guide.md"))).toBe("a.png");
  });

  it("passes a root-absolute path through for the server to resolve", () => {
    expect(decode(resolveAssetUrl("/shared/logo.svg", "docs/guide.md"))).toBe("/shared/logo.svg");
    expect(decode(resolveAssetUrl("/tmp/demo/pic.svg", null))).toBe("/tmp/demo/pic.svg");
  });

  it("handles a document at the root", () => {
    expect(decode(resolveAssetUrl("a.png", "guide.md"))).toBe("a.png");
  });

  it("survives no open document", () => {
    expect(decode(resolveAssetUrl("a.png", null))).toBe("a.png");
  });

  it("encodes characters that would break the query string", () => {
    const url = resolveAssetUrl("my images/a b.png", "guide.md");
    expect(url).not.toContain(" ");
    expect(decode(url)).toBe("my images/a b.png");
  });

  it("returns empty for a missing src rather than a broken request", () => {
    expect(resolveAssetUrl(undefined, "guide.md")).toBe("");
  });
});

describe("normalizePath", () => {
  it("collapses . and ..", () => {
    expect(normalizePath("a/./b/../c.png")).toBe("a/c.png");
    expect(normalizePath("/a/b/../c.png")).toBe("/a/c.png");
  });

  it("keeps leading .. on a relative path", () => {
    // The server resolves it against the root; dropping it would silently
    // retarget the reference at the wrong directory.
    expect(normalizePath("../a.png")).toBe("../a.png");
  });

  it("cannot escape above an absolute root", () => {
    expect(normalizePath("/../../etc/passwd")).toBe("/etc/passwd");
  });
});
