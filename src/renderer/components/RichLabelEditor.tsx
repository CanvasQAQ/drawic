import React, { useMemo, useRef, useState } from "react";
import {
  referenceFromRichTextRuns,
  richTextRunsForReference,
} from "../../core/richText";
import type {
  DocumentTypography,
  RichTextRun,
} from "../../core/model";
import { NAME_BASE_FONT_SIZE } from "../../core/labels";
import { ComponentTextLabel } from "./ComponentTextLabel";
import { RichTextEditor } from "./RichTextEditor";

interface RichLabelEditorProps {
  reference: string;
  storedRuns?: readonly RichTextRun[] | undefined;
  typography?: DocumentTypography | undefined;
  /** Applies each keystroke so the canvas tracks the Name while typing. */
  onChange?: ((reference: string, runs: RichTextRun[]) => void) | undefined;
  onCommit: (reference: string, runs: RichTextRun[]) => void;
  onPreviewStart?: (() => void) | undefined;
  onPreviewEnd?: (() => void) | undefined;
}

export function RichLabelEditor({
  reference,
  storedRuns,
  typography,
  onChange,
  onCommit,
  onPreviewStart,
  onPreviewEnd,
}: RichLabelEditorProps) {
  const initialRuns = useMemo(
    () => richTextRunsForReference(reference, storedRuns),
    [reference, storedRuns],
  );
  const [draftRuns, setDraftRuns] = useState<RichTextRun[]>(initialRuns);
  const previewing = useRef(false);

  const applyRuns = (runs: RichTextRun[]): void => {
    setDraftRuns(runs);
    if (!previewing.current) {
      previewing.current = true;
      onPreviewStart?.();
    }
    const composed = referenceFromRichTextRuns(runs);
    if (composed) {
      onChange?.(composed, runs);
    }
  };

  const finishPreview = (): void => {
    if (!previewing.current) {
      return;
    }
    previewing.current = false;
    onPreviewEnd?.();
  };

  return (
    <div className="rich-label-editor">
      <RichTextEditor
        initialRuns={initialRuns}
        ariaLabel="Editable component Name"
        multiline={false}
        onChange={applyRuns}
        onFinish={(runs) => {
          finishPreview();
          if (!runs) {
            return;
          }
          const composed = referenceFromRichTextRuns(runs);
          if (!composed) {
            return;
          }
          onCommit(composed, runs);
        }}
      />
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
        Select characters to format only that part of the Name. Clicking outside
        the editor applies the change. Default size{" "}
        {NAME_BASE_FONT_SIZE.toFixed(3)}.
      </p>
    </div>
  );
}
