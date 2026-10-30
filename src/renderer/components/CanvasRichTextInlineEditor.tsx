import React, { useEffect, useRef } from "react";
import type { RichTextRun } from "../../core/model";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "./RichTextEditor";

interface CanvasRichTextInlineEditorProps {
  x: number;
  y: number;
  width: number;
  height: number;
  initialRuns: readonly RichTextRun[];
  multiline: boolean;
  ariaLabel: string;
  initialFormat?: "bold" | "italic" | "subscript" | "superscript" | undefined;
  clearFormatOnNewParagraph?: boolean;
  onCommit: (runs: RichTextRun[]) => void;
  onClose: () => void;
  onOutsidePointerDown?: (() => void) | undefined;
}

/**
 * Rich text editor used inside the SVG canvas. The toolbar moves formatting
 * into the canvas while the surrounding click handler prevents the click that
 * finishes editing from creating a new object.
 */
export function CanvasRichTextInlineEditor({
  x,
  y,
  width,
  height,
  initialRuns,
  multiline,
  ariaLabel,
  initialFormat,
  clearFormatOnNewParagraph = false,
  onCommit,
  onClose,
  onOutsidePointerDown,
}: CanvasRichTextInlineEditorProps) {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const outsideRef = useRef(onOutsidePointerDown);
  outsideRef.current = onOutsidePointerDown;

  useEffect(() => {
    // The click that creates the text object focuses the canvas after the
    // editor mounts, so take focus back once the pointer sequence is over.
    const timer = window.setTimeout(() => {
      editorRef.current?.focus(true);
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (target?.closest?.(".canvas-inline-editor-object")) {
        return;
      }
      if (!target?.closest?.("svg.schematic-canvas")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      editorRef.current?.commit();
      outsideRef.current?.();
    };
    window.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, []);

  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      className="canvas-inline-editor-object canvas-rich-inline-editor-object"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="canvas-inline-editor canvas-rich-inline-editor">
        <RichTextEditor
          ref={editorRef}
          initialRuns={initialRuns}
          ariaLabel={ariaLabel}
          multiline={multiline}
          initialFormat={initialFormat}
          clearFormatOnNewParagraph={clearFormatOnNewParagraph}
          onFinish={(runs) => {
            if (runs) {
              onCommit(runs);
            }
            onClose();
          }}
        />
      </div>
    </foreignObject>
  );
}
