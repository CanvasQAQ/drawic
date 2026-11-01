// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/core/hash";

describe("sha256Hex", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256Hex("The quick brown fox jumps over the lazy dog"),
    ).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });

  it("agrees with node:crypto across block boundaries and unicode", () => {
    const samples = [
      "a",
      "a".repeat(55),
      "a".repeat(56),
      "a".repeat(63),
      "a".repeat(64),
      "a".repeat(65),
      "a".repeat(1000),
      "器件 — ✓",
      '{"id":"custom-a","title":"分压器"}',
    ];
    for (const sample of samples) {
      expect(sha256Hex(sample)).toBe(
        createHash("sha256").update(sample, "utf8").digest("hex"),
      );
    }
  });
});
