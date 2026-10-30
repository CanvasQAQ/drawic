import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $selectAll,
  FORMAT_TEXT_COMMAND,
  IS_BOLD,
  IS_ITALIC,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
  type TextNode,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { RichTextRun } from "../../core/model";

export interface RichTextEditorHandle {
  /** Finish editing now, committing the current draft through `onFinish`. */
  commit(): void;
  /** Finish editing now without applying the draft (`onFinish(null)`). */
  cancel(): void;
  /** Focus the editable content, optionally selecting everything. */
  focus(selectAll?: boolean): void;
}

export interface RichTextEditorProps {
  /** Runs used to seed the editor. Read once when the editor mounts. */
  initialRuns: readonly RichTextRun[];
  ariaLabel: string;
  multiline?: boolean;
  showToolbar?: boolean;
  autoFocus?: boolean;
  selectAllOnFocus?: boolean;
  /** Applied to an empty editor so new content starts in this format. */
  initialFormat?: TextFormatType | undefined;
  /** Clears the current character format after a plain newline. */
  clearFormatOnNewParagraph?: boolean;
  className?: string;
  toolbarLabel?: string;
  /** `null` means the draft is unchanged or the edit was cancelled. */
  onFinish: (runs: RichTextRun[] | null) => void;
  /** Live draft used for previews. Fires only when the runs actually change. */
  onChange?: (runs: RichTextRun[]) => void;
}

interface EditorFormatState {
  bold: boolean;
  italic: boolean;
  subscript: boolean;
  superscript: boolean;
}

const EMPTY_FORMATS: EditorFormatState = {
  bold: false,
  italic: false,
  subscript: false,
  superscript: false,
};

const TOOLBAR_BUTTONS: ReadonlyArray<{
  format: keyof EditorFormatState;
  glyph: string;
  label: string;
}> = [
  { format: "bold", glyph: "B", label: "Bold selected text" },
  { format: "italic", glyph: "I", label: "Italicize selected text" },
  { format: "subscript", glyph: "x₂", label: "Subscript selected text" },
  { format: "superscript", glyph: "x²", label: "Superscript selected text" },
];

const FONT_SIZE_SCALE_STYLE = "--drawic-font-size-scale";
const SIX_DIGIT_HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Lexical renders at most one inline element per run (bold wins over italic),
// so composable formats need theme classes instead of relying on the tag.
const RICH_TEXT_THEME = {
  text: {
    bold: "rich-text-bold",
    italic: "rich-text-italic",
  },
};

function RichTextErrorBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Run serialization helpers
// ---------------------------------------------------------------------------

function copyRun(run: RichTextRun): RichTextRun {
  return {
    text: run.text,
    bold: run.bold,
    italic: run.italic,
    script: run.script,
    ...(run.color !== undefined ? { color: run.color } : {}),
    ...(run.fontSizeScale !== undefined
      ? { fontSizeScale: run.fontSizeScale }
      : {}),
  };
}

function copyRuns(runs: readonly RichTextRun[]): RichTextRun[] {
  return runs.map(copyRun);
}

function sameFormatting(a: RichTextRun, b: RichTextRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.script === b.script &&
    a.color === b.color &&
    a.fontSizeScale === b.fontSizeScale
  );
}

function sameRun(a: RichTextRun, b: RichTextRun): boolean {
  return a.text === b.text && sameFormatting(a, b);
}

function mergeRuns(runs: readonly RichTextRun[]): RichTextRun[] {
  const merged: RichTextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) {
      continue;
    }
    const previous = merged[merged.length - 1];
    if (previous !== undefined && sameFormatting(previous, run)) {
      previous.text += run.text;
    } else {
      merged.push(copyRun(run));
    }
  }
  return merged;
}

function runsWithText(run: RichTextRun, text: string): RichTextRun {
  return {
    ...copyRun(run),
    text,
  };
}

/**
 * Splits the flat run list into paragraphs at every "\n" in a run's text.
 * Empty strings between newlines still create (empty) paragraphs so that
 * trailing and repeated newlines survive a round trip.
 */
function splitRunsIntoParagraphs(
  runs: readonly RichTextRun[],
  multiline: boolean,
): RichTextRun[][] {
  const paragraphs: RichTextRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split("\n");
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) {
        paragraphs.push([]);
      }
      const text = parts[index] ?? "";
      if (text.length > 0) {
        paragraphs[paragraphs.length - 1]?.push(runsWithText(run, text));
      }
    }
  }
  const merged = paragraphs.map((paragraph) => mergeRuns(paragraph));
  if (multiline) {
    return merged;
  }
  // Single-line editors have no way to display a line break, so flatten every
  // original line into one paragraph rather than dropping content.
  return [mergeRuns(merged.flat())];
}

function formatFlag(format: TextFormatType): number {
  switch (format) {
    case "bold":
      return IS_BOLD;
    case "italic":
      return IS_ITALIC;
    case "subscript":
      return IS_SUBSCRIPT;
    case "superscript":
      return IS_SUPERSCRIPT;
    default:
      return 0;
  }
}

function lexicalFormatForRun(run: RichTextRun): number {
  let format = 0;
  if (run.bold) {
    format |= IS_BOLD;
  }
  if (run.italic) {
    format |= IS_ITALIC;
  }
  if (run.script === "subscript") {
    format |= IS_SUBSCRIPT;
  } else if (run.script === "superscript") {
    format |= IS_SUPERSCRIPT;
  }
  return format;
}

function styleForRun(run: RichTextRun): string {
  const declarations: string[] = [];
  const color = run.color?.trim();
  if (color !== undefined && SIX_DIGIT_HEX_COLOR.test(color)) {
    declarations.push(`color: ${color}`);
  }
  if (
    run.fontSizeScale !== undefined &&
    Number.isFinite(run.fontSizeScale) &&
    run.fontSizeScale > 0
  ) {
    declarations.push(`${FONT_SIZE_SCALE_STYLE}: ${run.fontSizeScale}`);
  }
  return declarations.join("; ");
}

interface RunStyleMetadata {
  color?: string;
  fontSizeScale?: number;
}

function metadataFromStyle(style: string): RunStyleMetadata {
  const metadata: RunStyleMetadata = {};
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .replace(/\s*!important\s*$/i, "")
      .trim();
    if (value.length === 0) {
      continue;
    }
    if (property === "color") {
      // The document model only accepts six-digit hexadecimal colors; ignore
      // anything a paste may have introduced.
      if (SIX_DIGIT_HEX_COLOR.test(value)) {
        metadata.color = value;
      }
    } else if (property === FONT_SIZE_SCALE_STYLE) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        metadata.fontSizeScale = parsed;
      }
    }
  }
  return metadata;
}

function runFromTextNode(node: TextNode): RichTextRun {
  const metadata = metadataFromStyle(node.getStyle());
  return {
    text: node.getTextContent(),
    bold: node.hasFormat("bold"),
    italic: node.hasFormat("italic"),
    script: node.hasFormat("superscript")
      ? "superscript"
      : node.hasFormat("subscript")
        ? "subscript"
        : "normal",
    ...(metadata.color !== undefined ? { color: metadata.color } : {}),
    ...(metadata.fontSizeScale !== undefined
      ? { fontSizeScale: metadata.fontSizeScale }
      : {}),
  };
}

function appendRun(result: RichTextRun[], run: RichTextRun): void {
  if (run.text.length === 0) {
    return;
  }
  const previous = result[result.length - 1];
  if (previous !== undefined && sameFormatting(previous, run)) {
    previous.text += run.text;
    return;
  }
  result.push(copyRun(run));
}

function appendNewline(result: RichTextRun[]): void {
  const previous = result[result.length - 1];
  if (previous !== undefined) {
    previous.text += "\n";
    return;
  }
  result.push({ text: "\n", bold: false, italic: false, script: "normal" });
}

function collectRuns(node: LexicalNode, result: RichTextRun[]): void {
  if ($isTextNode(node)) {
    appendRun(result, runFromTextNode(node));
    return;
  }
  if ($isLineBreakNode(node)) {
    appendNewline(result);
    return;
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      collectRuns(child, result);
    }
  }
}

/**
 * Serializes an editor state into the flat run model used by the document.
 * Runs never span a paragraph; a "\n" is appended to the previous run at each
 * paragraph boundary so `runs.map((run) => run.text).join("")` equals the
 * editor's plain text.
 */
export function runsFromEditorState(state: EditorState): RichTextRun[] {
  return state.read(() => {
    const result: RichTextRun[] = [];
    const root = $getRoot();
    const children = root.getChildren();
    for (let index = 0; index < children.length; index += 1) {
      if (index > 0) {
        appendNewline(result);
      }
      const child = children[index];
      if (child !== undefined) {
        collectRuns(child, result);
      }
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Draft comparison
// ---------------------------------------------------------------------------

function runsFromParagraphList(
  paragraphs: readonly (readonly RichTextRun[])[],
): RichTextRun[] {
  const result: RichTextRun[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    if (index > 0) {
      appendNewline(result);
    }
    const paragraph = paragraphs[index] ?? [];
    for (const run of paragraph) {
      appendRun(result, run);
    }
  }
  return result;
}

/**
 * The run list the editor will report after seeding `initialRuns` but before
 * any edit. Used to avoid a spurious `onChange` on mount for content whose
 * run boundaries change during serialization (e.g. multiline runs).
 */
function seededDraftRuns(
  runs: readonly RichTextRun[],
  multiline: boolean,
): RichTextRun[] {
  return runsFromParagraphList(splitRunsIntoParagraphs(runs, multiline));
}

function runsAreIdentical(
  left: readonly RichTextRun[],
  right: readonly RichTextRun[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftRun = left[index];
    const rightRun = right[index];
    if (
      leftRun === undefined ||
      rightRun === undefined ||
      !sameRun(leftRun, rightRun)
    ) {
      return false;
    }
  }
  return true;
}

function flattenParagraphs(
  paragraphs: readonly (readonly RichTextRun[])[],
): RichTextRun[] {
  return mergeRuns(paragraphs.flat());
}

/**
 * Canonical comparison form: run boundaries that carry no formatting meaning
 * are merged, but paragraph breaks are preserved (except for single-line
 * editors, which cannot represent them).
 */
function canonicalParagraphs(
  runs: readonly RichTextRun[],
  multiline: boolean,
): RichTextRun[][] {
  const paragraphs = splitRunsIntoParagraphs(runs, multiline);
  return multiline ? paragraphs : [flattenParagraphs(paragraphs)];
}

function runsEquivalent(
  left: readonly RichTextRun[],
  right: readonly RichTextRun[],
  multiline: boolean,
): boolean {
  const leftParagraphs = canonicalParagraphs(left, multiline);
  const rightParagraphs = canonicalParagraphs(right, multiline);
  if (leftParagraphs.length !== rightParagraphs.length) {
    return false;
  }
  for (let index = 0; index < leftParagraphs.length; index += 1) {
    const leftParagraph = leftParagraphs[index] ?? [];
    const rightParagraph = rightParagraphs[index] ?? [];
    if (leftParagraph.length !== rightParagraph.length) {
      return false;
    }
    for (let runIndex = 0; runIndex < leftParagraph.length; runIndex += 1) {
      const leftRun = leftParagraph[runIndex];
      const rightRun = rightParagraph[runIndex];
      if (
        leftRun === undefined ||
        rightRun === undefined ||
        !sameRun(leftRun, rightRun)
      ) {
        return false;
      }
    }
  }
  return true;
}

function formatsEqual(
  left: EditorFormatState,
  right: EditorFormatState,
): boolean {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.subscript === right.subscript &&
    left.superscript === right.superscript
  );
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

function seedEditor(runs: readonly RichTextRun[], multiline: boolean): void {
  const paragraphs = splitRunsIntoParagraphs(runs, multiline);
  const root = $getRoot();
  root.clear();
  for (const paragraphRuns of paragraphs) {
    const paragraph = $createParagraphNode();
    for (const run of paragraphRuns) {
      if (run.text.length === 0) {
        continue;
      }
      const textNode = $createTextNode(run.text);
      textNode.setFormat(lexicalFormatForRun(run));
      const style = styleForRun(run);
      if (style.length > 0) {
        textNode.setStyle(style);
      }
      paragraph.append(textNode);
    }
    root.append(paragraph);
  }
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function FormatToolbar({
  formats,
  toolbarLabel,
  onFormat,
}: {
  formats: EditorFormatState;
  toolbarLabel: string;
  onFormat: (format: TextFormatType) => void;
}) {
  return (
    <div
      className="rich-text-toolbar"
      role="toolbar"
      aria-label={toolbarLabel}
    >
      {TOOLBAR_BUTTONS.map((button) => (
        <button
          key={button.format}
          type="button"
          title={button.label}
          aria-label={button.label}
          aria-pressed={formats[button.format]}
          onMouseDown={(event) => {
            // Keeping focus in the contenteditable preserves the selection and
            // avoids committing just because a toolbar button was pressed.
            event.preventDefault();
          }}
          onClick={() => onFormat(button.format)}
        >
          {button.glyph}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bridge: lives inside LexicalComposer so it can use the editor instance.
// ---------------------------------------------------------------------------

function readFormats(state: EditorState): EditorFormatState {
  return state.read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      return {
        bold: selection.hasFormat("bold"),
        italic: selection.hasFormat("italic"),
        subscript: selection.hasFormat("subscript"),
        superscript: selection.hasFormat("superscript"),
      };
    }
    // With no live caret (for example immediately after the editor mounts),
    // show a format as active only when every non-empty text run has it.
    let found = false;
    const formats: EditorFormatState = { ...EMPTY_FORMATS };
    const visit = (node: LexicalNode): void => {
      if ($isTextNode(node)) {
        if (!node.getTextContent()) {
          return;
        }
        if (!found) {
          found = true;
          formats.bold = node.hasFormat("bold");
          formats.italic = node.hasFormat("italic");
          formats.subscript = node.hasFormat("subscript");
          formats.superscript = node.hasFormat("superscript");
          return;
        }
        formats.bold = formats.bold && node.hasFormat("bold");
        formats.italic = formats.italic && node.hasFormat("italic");
        formats.subscript = formats.subscript && node.hasFormat("subscript");
        formats.superscript = formats.superscript && node.hasFormat("superscript");
        return;
      }
      if ($isElementNode(node)) {
        for (const child of node.getChildren()) {
          visit(child);
        }
      }
    };
    visit($getRoot());
    return found ? formats : EMPTY_FORMATS;
  });
}

interface EditorSurfaceProps {
  ariaLabel: string;
  showToolbar: boolean;
  toolbarLabel: string;
  autoFocus: boolean;
  selectAllOnFocus: boolean;
  initialFormat: TextFormatType | undefined;
  clearFormatOnNewParagraph: boolean;
  editorRef: React.RefObject<LexicalEditor | null>;
  initialDraftRuns: readonly RichTextRun[];
  onDraftChange: (runs: RichTextRun[]) => void;
  onChange: ((runs: RichTextRun[]) => void) | undefined;
}

function EditorSurface({
  ariaLabel,
  showToolbar,
  toolbarLabel,
  autoFocus,
  selectAllOnFocus,
  initialFormat,
  clearFormatOnNewParagraph,
  editorRef,
  initialDraftRuns,
  onDraftChange,
  onChange,
}: EditorSurfaceProps) {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState<EditorFormatState>(() =>
    readFormats(editor.getEditorState()),
  );
  const draftRunsRef = useRef<RichTextRun[]>(copyRuns(initialDraftRuns));

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    setFormats(readFormats(editor.getEditorState()));
  }, [editor]);

  useEffect(() => {
    if (!initialFormat) {
      return;
    }
    const applyInitialFormat = (): void => {
      editor.update(
        () => {
          if ($getRoot().getTextContent() !== "") {
            return;
          }
          if (!$isRangeSelection($getSelection())) {
            $getRoot().selectStart();
          }
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.format |= formatFlag(initialFormat);
          }
        },
        { discrete: true },
      );
    };
    const rootElement = editor.getRootElement();
    rootElement?.addEventListener("focus", applyInitialFormat);
    applyInitialFormat();
    return () => {
      rootElement?.removeEventListener("focus", applyInitialFormat);
    };
  }, [editor, initialFormat]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const nextRuns = runsFromEditorState(editorState);
      if (!runsAreIdentical(draftRunsRef.current, nextRuns)) {
        draftRunsRef.current = nextRuns;
        onDraftChange(nextRuns);
        onChange?.(nextRuns.map(copyRun));
      }
      const nextFormats = readFormats(editorState);
      setFormats((current) =>
        formatsEqual(current, nextFormats) ? current : nextFormats,
      );
    });
  }, [editor, onDraftChange, onChange]);

  useEffect(() => {
    if (!autoFocus && !selectAllOnFocus) {
      return;
    }
    let cancelled = false;
    const focusAndSelect = (): void => {
      if (cancelled) {
        return;
      }
      const rootElement = editor.getRootElement();
      if (rootElement) {
        rootElement.focus({ preventScroll: true });
      } else {
        editor.focus();
      }
      editor.update(
        () => {
          if (selectAllOnFocus) {
            $selectAll();
          } else {
            $getRoot().selectEnd();
          }
          if (initialFormat && $getRoot().getTextContent() === "") {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.format |= formatFlag(initialFormat);
            }
          }
        },
        { discrete: true },
      );
    };
    focusAndSelect();
    // Inline editors open during pointerdown; the matching pointerup can move
    // focus back to the canvas. Focus once more after that pointer sequence.
    window.addEventListener("pointerup", focusAndSelect, { once: true });
    // The SVG foreignObject can mount after the editor effect, so retry once
    // on the next task when the contenteditable root was not ready yet.
    const retry = window.setTimeout(focusAndSelect, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      window.removeEventListener("pointerup", focusAndSelect);
    };
  }, [editor, autoFocus, selectAllOnFocus]);

  const applyFormat = useCallback(
    (format: TextFormatType) => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  return (
    <>
      {showToolbar ? (
        <FormatToolbar
          formats={formats}
          toolbarLabel={toolbarLabel}
          onFormat={applyFormat}
        />
      ) : null}
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="rich-text-content"
            aria-label={ariaLabel}
          />
        }
        placeholder={null}
        ErrorBoundary={RichTextErrorBoundary}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export const RichTextEditor = React.forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  {
    initialRuns,
    ariaLabel,
    multiline = false,
    showToolbar = true,
    autoFocus = false,
    selectAllOnFocus = false,
    initialFormat,
    clearFormatOnNewParagraph = false,
    className,
    toolbarLabel = "Text formatting",
    onFinish,
    onChange,
  },
  ref,
) {
  const seedRunsRef = useRef<readonly RichTextRun[]>(initialRuns);
  const multilineRef = useRef<boolean>(multiline);
  const seededDraftRef = useRef<RichTextRun[]>(
    seededDraftRuns(initialRuns, multiline),
  );
  const draftRunsRef = useRef<RichTextRun[]>(seededDraftRef.current);
  const finishedRef = useRef(false);
  const clearFormatOnNewParagraphRef = useRef(clearFormatOnNewParagraph);
  clearFormatOnNewParagraphRef.current = clearFormatOnNewParagraph;
  const onFinishRef = useRef(onFinish);
  const editorRef = useRef<LexicalEditor | null>(null);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const finish = useCallback((commit: boolean) => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    const notify = onFinishRef.current;
    if (!commit) {
      notify(null);
      return;
    }
    const draft = draftRunsRef.current;
    const changed = !runsEquivalent(
      draft,
      seedRunsRef.current,
      multilineRef.current,
    );
    notify(changed ? draft.map(copyRun) : null);
  }, []);

  const handleDraftChange = useCallback((runs: RichTextRun[]) => {
    draftRunsRef.current = runs;
  }, []);

  const handleRootKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (editor === null) {
        return;
      }
      const lexicalRoot = editor.getRootElement();
      const target = event.target;
      if (
        lexicalRoot === null ||
        !(target instanceof Node) ||
        !lexicalRoot.contains(target)
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        lexicalRoot.blur();
        return;
      }
      const hasCommandModifier =
        (event.metaKey || event.ctrlKey) && !event.altKey;
      if (hasCommandModifier) {
        const key = event.key.toLowerCase();
        if (key === "b" || key === "i") {
          event.preventDefault();
          event.stopPropagation();
          editor.dispatchCommand(
            FORMAT_TEXT_COMMAND,
            key === "b" ? "bold" : "italic",
          );
          return;
        }
        if (key === "enter" && multilineRef.current) {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
          lexicalRoot.blur();
          return;
        }
      }
      if (event.key === "Enter" && !multilineRef.current) {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
        lexicalRoot.blur();
        return;
      }
      if (
        event.key === "Enter" &&
        multilineRef.current &&
        clearFormatOnNewParagraphRef.current
      ) {
        window.setTimeout(() => {
          editor.update(
            () => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.format = 0;
              }
            },
            { discrete: true },
          );
        }, 0);
      }
    },
    [finish],
  );

  useImperativeHandle(
    ref,
    () => ({
      commit: () => finish(true),
      cancel: () => finish(false),
      focus: (selectAll = false) => {
        const editor = editorRef.current;
        if (editor === null) {
          return;
        }
        editor.getRootElement()?.focus({ preventScroll: true });
        editor.focus();
        editor.update(
          () => {
            if (selectAll) {
              $selectAll();
            } else {
              $getRoot().selectEnd();
            }
          },
          { discrete: true },
        );
      },
    }),
    [finish],
  );

  const initialConfig = useMemo(() => {
    const seed = seedRunsRef.current;
    const seedMultiline = multilineRef.current;
    return {
      namespace: "drawic-rich-text-editor",
      theme: RICH_TEXT_THEME,
      onError: (error: Error) => {
        throw error;
      },
      editorState: () => seedEditor(seed, seedMultiline),
    };
  }, []);

  const rootClassName =
    className === undefined
      ? "rich-text-editor"
      : `rich-text-editor ${className}`;

  return (
    <div
      className={rootClassName}
      role="group"
      onKeyDownCapture={handleRootKeyDownCapture}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (nextFocus !== null && event.currentTarget.contains(nextFocus)) {
          return;
        }
        finish(true);
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <EditorSurface
          ariaLabel={ariaLabel}
          showToolbar={showToolbar}
          toolbarLabel={toolbarLabel}
          autoFocus={autoFocus}
          selectAllOnFocus={selectAllOnFocus}
          initialFormat={initialFormat}
          clearFormatOnNewParagraph={clearFormatOnNewParagraph}
          editorRef={editorRef}
          initialDraftRuns={seededDraftRef.current}
          onDraftChange={handleDraftChange}
          onChange={onChange}
        />
      </LexicalComposer>
    </div>
  );
});
