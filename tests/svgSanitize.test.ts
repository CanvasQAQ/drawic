import { describe, expect, it } from "vitest";
import {
  extractSvgBody,
  sanitizeSvgBody,
  sanitizeSvgFragment,
} from "../src/core/svgSanitize";

describe("SVG sanitizer", () => {
  it("extracts the inner body and removes dangerous markup", () => {
    const markup = [
      '﻿<?xml version="1.0"?>',
      "<!-- comment -->",
      '<svg viewBox="0 0 10 10">',
      "<title>Ignore</title>",
      "<script>alert(1)</script>",
      '<rect x="1" y="1" width="2" height="2" fill="#000" stroke="black" onload="run()"/>',
      "</svg>",
    ].join("");
    expect(sanitizeSvgBody(markup)).toBe(
      '<rect x="1" y="1" width="2" height="2" fill="currentColor" stroke="currentColor"/>',
    );
  });

  it("removes external and script URLs", () => {
    expect(
      sanitizeSvgFragment(
        '<image href="https://example.com/a.png"/><use xlink:href="//cdn/x"/><a href="javascript:run()"/>',
      ),
    ).toBe("<image/><use/><a/>");
  });

  it("normalizes fixed black colors and drops empty style attributes", () => {
    expect(
      sanitizeSvgFragment(
        '<path d="M0 0" fill="#000000" stroke="black" style=""/>',
      ),
    ).toBe('<path d="M0 0" fill="currentColor" stroke="currentColor"/>');
  });

  it("is idempotent for already sanitized artwork", () => {
    const once = sanitizeSvgFragment(
      '<g fill="#000"><script>x</script><rect style="" onclick="x()"/></g>',
    );
    expect(sanitizeSvgFragment(once)).toBe(once);
    expect(once).toBe('<g fill="currentColor"><rect/></g>');
  });

  it("preserves benign artwork details", () => {
    const body = '<path d="M -10 0 L 10 0" stroke-width="1.5"/>';
    expect(sanitizeSvgFragment(body)).toBe(body);
  });

  it("rejects a document without an SVG element", () => {
    expect(() => extractSvgBody("<div>not svg</div>")).toThrow(
      /not a valid SVG document/i,
    );
  });
});
