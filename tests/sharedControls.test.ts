// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const renderer = "src/renderer";

// Exceptions describe the *element*, so adding a normal button to a canvas file still fails.
function isDrawingControl(file: string, tag: string, attributes: string): boolean {
  if (file === "components/SchematicCanvas.tsx") return ["input", "textarea"].includes(tag) && attributes.includes("autoFocus");
  if (file === "components/NumberControls.tsx") return tag === "input" && attributes.includes('type="range"');
  if (file === "components/PropertiesPanel.tsx") {
    return (tag === "input" && attributes.includes('type="color"')) ||
      (tag === "button" && /className=(?:"palette-swatch"|\{`net-color-swatch)/.test(attributes));
  }
  return false;
}

it("routes ordinary controls and Radix imports through the shared UI", () => {
  const violations: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { scan(path); continue; }
      if (!/\.tsx?$/.test(path)) continue;
      const file = relative(renderer, path).split(/[/\\]/).join("/");
      const source = ts.createSourceFile(file, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      function visit(node: ts.Node) {
        const report = (what: string) => violations.push(file + ":" +
          (source.getLineAndCharacterOfPosition(node.getStart()).line + 1) + " " + what);
        if (ts.isImportDeclaration(node) && file !== "ui.tsx" && node.moduleSpecifier.getText().includes("@radix-ui/")) report("direct Radix import");
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText();
          const attrs = node.attributes.getText();
          if (["button","input","textarea","select"].includes(tag) && !isDrawingControl(file, tag, attrs)) report(tag);
          // Full-window editor workspaces have dialog semantics but no floating overlay.
          if (/^[a-z]/.test(tag) && /role="(?:alertdialog|dialog|menu|listbox)"/.test(attrs) &&
              !/className="device-(?:editor|library-screen)"/.test(attrs)) report("hand-built overlay");
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(renderer);
  expect(violations, "Use src/renderer/ui.tsx. See docs/UI_CONTROLS.md.").toEqual([]);
});
