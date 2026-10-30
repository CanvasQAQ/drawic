import React, {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const RANGE_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function clampValue(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) {
    next = Math.max(min, next);
  }
  if (max !== undefined) {
    next = Math.min(max, next);
  }
  return next;
}

function roundTo(value: number, precision: number): number {
  return Number(value.toFixed(precision));
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const text = String(value);
  if (text.includes("e-")) {
    return Math.min(8, Number(text.split("e-")[1] ?? 0));
  }
  return text.split(".")[1]?.length ?? 0;
}

function formatNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const text = value.toFixed(precision);
  return precision > 0 ? text.replace(/\.?0+$/, "") : text;
}

interface NumberStepperFieldProps {
  label: string;
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  step: number;
  onCommit: (value: number) => void;
}

/**
 * Numeric input with explicit decrement/increment buttons for values that are
 * naturally adjusted one notch at a time (text sizes, pixel offsets).
 */
export function NumberStepperField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: NumberStepperFieldProps): React.ReactElement {
  const inputId = useId();
  const stepPrecision = Math.min(
    4,
    Math.max(decimalPlaces(step), decimalPlaces(value)),
  );
  const [draft, setDraft] = useState(() =>
    formatNumber(value, stepPrecision),
  );
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    setDraft(formatNumber(value, stepPrecision));
  }, [value, stepPrecision]);

  const commitDraft = (): void => {
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value, stepPrecision));
      return;
    }
    const next = clampValue(roundTo(parsed, 4), min, max);
    setDraft(
      formatNumber(
        next,
        Math.min(4, Math.max(stepPrecision, decimalPlaces(next))),
      ),
    );
    if (next !== value) {
      onCommit(next);
    }
  };

  const nudge = (direction: -1 | 1): void => {
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    const base = Number.isFinite(parsed) ? parsed : value;
    const next = clampValue(
      roundTo(base + direction * step, 4),
      min,
      max,
    );
    setDraft(
      formatNumber(
        next,
        Math.min(4, Math.max(stepPrecision, decimalPlaces(next))),
      ),
    );
    if (next !== value) {
      onCommit(next);
    }
  };

  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="property-field numeric-field">
      <label className="numeric-field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="number-stepper">
        <button
          type="button"
          className="number-stepper-button"
          aria-label={`Decrease ${label}`}
          title={`Decrease ${label}`}
          disabled={atMin}
          onClick={() => nudge(-1)}
        >
          −
        </button>
        <input
          id={inputId}
          className="number-stepper-input"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            commitDraft();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              skipBlurCommit.current = true;
              setDraft(formatNumber(value, stepPrecision));
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="number-stepper-button"
          aria-label={`Increase ${label}`}
          title={`Increase ${label}`}
          disabled={atMax}
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onCommit: (value: number) => void;
  onPreviewStart?: (() => void) | undefined;
  onPreviewEnd?: (() => void) | undefined;
}

/**
 * Range control for values with a meaningful continuous span. Dragging is
 * previewed live but only becomes one undo step when the gesture ends.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onCommit,
  onPreviewStart,
  onPreviewEnd,
}: SliderFieldProps): React.ReactElement {
  const inputId = useId();
  const previewing = useRef(false);
  const previewEndRef = useRef(onPreviewEnd);
  const pointerCleanup = useRef<(() => void) | null>(null);
  const normalized = clampValue(value, min, max);
  const formatted = formatValue(normalized);
  const fill =
    max > min
      ? Math.min(100, Math.max(0, ((normalized - min) / (max - min)) * 100))
      : 0;
  const rangeStyle = { "--range-fill": `${fill}%` } as CSSProperties;

  const clearPointerListener = (): void => {
    pointerCleanup.current?.();
    pointerCleanup.current = null;
  };

  const startPreview = (): void => {
    if (previewing.current) {
      return;
    }
    previewing.current = true;
    onPreviewStart?.();
  };

  const endPreview = (): void => {
    if (!previewing.current) {
      return;
    }
    previewing.current = false;
    onPreviewEnd?.();
  };

  const finishPointerPreview = (): void => {
    clearPointerListener();
    endPreview();
  };

  const startPointerPreview = (): void => {
    startPreview();
    clearPointerListener();
    // Native range inputs can release the pointer outside the track, where the
    // input never receives pointerup. Listen on the window for the whole drag.
    const finish = (): void => finishPointerPreview();
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    pointerCleanup.current = () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  };

  useEffect(() => {
    previewEndRef.current = onPreviewEnd;
  }, [onPreviewEnd]);

  useEffect(
    () => () => {
      pointerCleanup.current?.();
      pointerCleanup.current = null;
      if (previewing.current) {
        previewing.current = false;
        previewEndRef.current?.();
      }
    },
    [],
  );

  return (
    <div className="property-field slider-field">
      <div className="numeric-field-head">
        <label className="numeric-field-label" htmlFor={inputId}>
          {label}
        </label>
        <output className="numeric-field-value" htmlFor={inputId}>
          {formatted}
        </output>
      </div>
      <input
        id={inputId}
        className="slider-input"
        type="range"
        aria-valuetext={formatted}
        min={min}
        max={max}
        step={step}
        value={normalized}
        style={rangeStyle}
        onBlur={finishPointerPreview}
        onPointerDown={(event) => {
          if (event.button === 0) {
            startPointerPreview();
          }
        }}
        onPointerUp={finishPointerPreview}
        onPointerCancel={finishPointerPreview}
        onKeyDown={(event) => {
          if (RANGE_KEYS.has(event.key)) {
            startPreview();
          }
        }}
        onKeyUp={(event) => {
          if (RANGE_KEYS.has(event.key)) {
            endPreview();
          }
        }}
        onChange={(event) => {
          startPreview();
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) {
            onCommit(clampValue(next, min, max));
          }
        }}
      />
    </div>
  );
}
