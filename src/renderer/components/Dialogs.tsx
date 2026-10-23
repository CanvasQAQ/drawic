import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

interface NameDialogProps {
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function NameDialog({
  title,
  label,
  initialValue,
  confirmLabel,
  onConfirm,
  onCancel,
}: NameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="modal-card"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) {
            onConfirm(value.trim());
          }
        }}
      >
        <h2>{title}</h2>
        <label className="property-field">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

interface UnsavedDialogProps {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedDialog({ onSave, onDiscard, onCancel }: UnsavedDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card unsaved-dialog" role="alertdialog" aria-modal="true">
        <span className="modal-kicker">Unsaved changes</span>
        <h2>Save before continuing?</h2>
        <p>
          Your document has changes that are not in a project file. Save them, discard them,
          or return to the editor.
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="primary-button" onClick={onSave}>
            <Icon name="save" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExportDialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function ExportDialog({ title, children, onClose }: ExportDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
