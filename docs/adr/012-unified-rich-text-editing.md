# ADR 012: Unified rich text editing

Status: accepted, 2026-10-30

## Context

Component Names, free Text annotations, and drawing-shape labels (including
Notes) all contain user-authored text, but they previously used different
editing models. Names had a Lexical editor with serialized runs; Text and shape
labels used plain fields plus whole-label bold/italic toggles. Formatting was
lost when a Name edit changed only its runs, and the whole-label toggles could
not express or display partial formatting.

## Decision

All user-authored diagram text shares one run model and one editor:

- `RichTextRun` remains the single serialized representation of styled text.
  `text` stays canonical for search, connectivity, exports, and legacy data.
- Text annotations and drawing shapes gain an optional `richText` array.
  `richText`, when present, must compose exactly the object's `text`; the parser
  rejects mismatches. Documents without it keep the legacy whole-label
  `bold`/`italic`/`textBold` fallback.
- The Renderer uses one Lexical-based `RichTextEditor` for the Properties Name
  builder, Text annotations, and shape/Note labels, including the canvas inline
  editors. Its toolbar reflects the live selection format, applies bold,
  italic, subscript, and superscript to selected runs only, and commits when
  focus leaves the editor. Enter commits single-line editors; Escape cancels.
- Canvas rendering and SVG export walk the same runs. Note wrapping preserves
  run styling across wrapped lines. The first paragraph of a new empty Note
  starts bold and resets to normal after a plain newline; existing Note text
  keeps its legacy heading styling until edited.
- The optional fields are additions to schema version 3. No migration is needed
  and existing projects are not re-laid-out.

## Consequences

- Partial formatting is consistent between the Properties panel, canvas inline
  editing, the canvas renderer, and SVG/PDF/PNG exports.
- Editing plain text without supplying runs clears stale rich text so saved
  files never contain mismatched representations.
- The desktop editor still performs no runtime network access and adds no
  renderer filesystem/Node capability. Lexical remains bundled locally.
- Net labels and component Value labels remain plain single-style text; they
  can be folded into the same run model later without changing this contract.
