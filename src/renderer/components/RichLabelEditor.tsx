import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  IS_BOLD,
  IS_ITALIC,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  type EditorState,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  referenceFromRichTextRuns,
  richTextRunsForReference,
} from "../../core/richText";
import type {
  DocumentTypography,
  LabelScript,
  RichTextRun,
} from "../../core/model";
import { NAME_BASE_FONT_SIZE } from "../../core/labels";
import { ComponentTextLabel } from "./ComponentTextLabel";

interface RichLabelEditorProps {
  nodeId: string;
  reference: string;
  storedRuns?: readonly RichTextRun[] | undefined;
  typography?: DocumentTypography | undefined;
  onCommit: (reference: string, runs: RichTextRun[]) => void;
}

function RichTextErrorBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function lexicalFormat(run: RichTextRun): number {
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

function seedEditor(runs: readonly RichTextRun[]): void {
  const root = $getRoot();
  const paragraph = $createParagraphNode();
  for (const run of runs) {
    if (!run.text) {
      continue;
    }
    const node = $createTextNode(run.text);
    node.setFormat(lexicalFormat(run));
    paragraph.append(node);
  }
  root.clear().append(paragraph);
}

function runFromTextNode(node: ReturnType<typeof $createTextNode>): RichTextRun {
  const script: LabelScript = node.hasFormat("superscript")
    ? "superscript"
    : node.hasFormat("subscript")
      ? "subscript"
      : "normal";
  return {
    text: node.getTextContent(),
    bold: node.hasFormat("bold"),
    italic: node.hasFormat("italic"),
    script,
  };
}

function collectTextNodes(node: LexicalNode, result: RichTextRun[]): void {
  if ($isTextNode(node)) {
    if (node.getTextContent()) {
      result.push(runFromTextNode(node));
    }
    return;
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      collectTextNodes(child, result);
    }
  }
}

export function runsFromEditorState(state: EditorState): RichTextRun[] {
  return state.read(() => {
    const result: RichTextRun[] = [];
    collectTextNodes($getRoot(), result);
    return result;
  });
}

function FormatToolbar({ onFormat }: { onFormat: (format: TextFormatType) => void }) {
  const buttons: Array<{ format: TextFormatType; label: string; title: string }> = [
    { format: "bold", label: "B", title: "Bold selected text" },
    { format: "italic", label: "I", title: "Italicize selected text" },
    { format: "subscript", label: "x₂", title: "Subscript selected text" },
    { format: "superscript", label: "x²", title: "Superscript selected text" },
  ];
  return (
    <div className="rich-label-toolbar" role="toolbar" aria-label="Name text formatting">
      {buttons.map((button) => (
        <button
          key={button.format}
          type="button"
          title={button.title}
          aria-label={button.title}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormat(button.format)}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

function EditorToolbar() {
  const [editor] = useLexicalComposerContext();
  return (
    <FormatToolbar
      onFormat={(format) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
    />
  );
}

export function RichLabelEditor({
  nodeId,
  reference,
  storedRuns,
  typography,
  onCommit,
}: RichLabelEditorProps) {
  const initialRuns = useMemo(
    () => richTextRunsForReference(reference, storedRuns),
    [reference, storedRuns],
  );
  const [draftRuns, setDraftRuns] = useState<RichTextRun[]>(initialRuns);
  const draftRef = useRef<RichTextRun[]>(initialRuns);
  const initialConfig = useMemo(
    () => ({
      namespace: `drawic-reference-${nodeId}`,
      onError: (error: Error) => {
        throw error;
      },
      editorState: () => seedEditor(initialRuns),
    }),
    [initialRuns, nodeId],
  );
  const commit = useCallback(() => {
    const runs = draftRef.current;
    const composed = referenceFromRichTextRuns(runs);
    if (composed && composed !== reference) {
      onCommit(composed, runs.map((run) => ({ ...run })));
    }
  }, [onCommit, reference]);

  return (
    <div
      className="rich-label-editor"
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(
            event.relatedTarget as Node | null,
          )
        ) {
          commit();
        }
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <EditorToolbar />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="rich-label-content"
              aria-label="Editable component Name"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          }
          placeholder={null}
          ErrorBoundary={RichTextErrorBoundary}
        />
        <OnChangePlugin
          ignoreSelectionChange
          onChange={(state) => {
            const runs = runsFromEditorState(state);
            draftRef.current = runs;
            setDraftRuns(runs);
          }}
        />
      </LexicalComposer>
      <svg
        className="reference-parts-preview"
        viewBox="0 0 220 48"
        aria-label={`Name preview ${referenceFromRichTextRuns(draftRuns) || "empty"}`}
      >
        {draftRuns.length > 0 ? (
          <ComponentTextLabel
            kind="reference"
            text={referenceFromRichTextRuns(draftRuns)}
            point={{ x: 12, y: 31 }}
            anchor="start"
            layout={{
              offset: { x: 0, y: 0 },
              hidden: false,
              fontSizeScale: 0.9,
              richText: draftRuns,
            }}
            typography={typography}
          />
        ) : null}
      </svg>
      <p className="property-hint rich-label-hint">
        Click a base or subscript directly, then edit or apply formatting only
        to the selected text. The inspector commits when focus leaves the editor.
        Default size {NAME_BASE_FONT_SIZE.toFixed(3)}.
      </p>
    </div>
  );
}
