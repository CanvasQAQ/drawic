// @vitest-environment node
import { describe, expect, it } from "vitest";
import { selectReleasesToPrune } from "../scripts/prune-github-releases.mjs";

function release(tagName, isPrerelease, publishedAt, isDraft = false) {
  return { tagName, isPrerelease, isDraft, publishedAt, createdAt: publishedAt };
}

describe("GitHub release retention", () => {
  it("keeps the newest preview when no formal release exists", () => {
    const releases = [
      release("v0.1.0-preview", true, "2026-01-01T00:00:00Z"),
      release("v0.2.0-preview", true, "2026-02-01T00:00:00Z"),
      release("v0.1.1-preview", true, "2026-01-15T00:00:00Z"),
    ];
    expect(selectReleasesToPrune(releases)).toEqual([
      "v0.1.0-preview",
      "v0.1.1-preview",
    ]);
  });

  it("keeps the newest preview and newest formal release", () => {
    const releases = [
      release("v0.2.0-preview", true, "2026-02-01T00:00:00Z"),
      release("v0.3.0-preview", true, "2026-03-01T00:00:00Z"),
      release("v0.2.2", false, "2026-02-15T00:00:00Z"),
      release("v0.3.0", false, "2026-03-05T00:00:00Z"),
    ];
    expect(selectReleasesToPrune(releases)).toEqual([
      "v0.2.0-preview",
      "v0.2.2",
    ]);
  });

  it("never deletes draft releases", () => {
    const releases = [
      release("v0.2.0-preview", true, "2026-02-01T00:00:00Z"),
      release("v0.1.0-preview", true, "2026-01-01T00:00:00Z"),
      release("v0.4.0-draft", false, "2026-04-01T00:00:00Z", true),
    ];
    expect(selectReleasesToPrune(releases)).toEqual([
      "v0.1.0-preview",
    ]);
  });
});
