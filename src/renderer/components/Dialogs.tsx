import { AlertDialog, Dialog, Button, IconButton, TextField } from "../ui";
import React, { useRef, useState } from "react";
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
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onCancel(); }}>
      <Dialog.Content className="modal-card" aria-describedby={undefined}
        onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }}>
        <Dialog.Title>{title}</Dialog.Title>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) {
              onConfirm(value.trim());
            }
          }}
        >
          <label className="property-field">
            <span>{label}</span>
            <TextField.Root
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="solid" type="submit" className="primary-button" disabled={!value.trim()}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

interface UnsavedDialogProps {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedDialog({ onSave, onDiscard, onCancel }: UnsavedDialogProps) {
  return (
    <AlertDialog.Root open onOpenChange={open => { if (!open) onCancel(); }}>
      <AlertDialog.Content className="modal-card unsaved-dialog">
        <span className="modal-kicker">Unsaved changes</span>
        <AlertDialog.Title>Save before continuing?</AlertDialog.Title>
        <AlertDialog.Description>
          Your document has changes that are not in a project file. Save them, discard them,
          or return to the editor.
        </AlertDialog.Description>
        <div className="modal-actions">
          <AlertDialog.Cancel><Button type="button">
            Cancel
          </Button></AlertDialog.Cancel>
          <Button type="button" onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="solid" type="button" className="primary-button" onClick={onSave}>
            <Icon name="save" /> Save
          </Button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

interface ExportDialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  returnFocus?: React.RefObject<HTMLButtonElement | null>;
}

export function ExportDialog({ title, children, onClose, returnFocus }: ExportDialogProps) {
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Content className="modal-card export-dialog" aria-describedby={undefined}
        onCloseAutoFocus={event => { if (returnFocus?.current) { event.preventDefault(); returnFocus.current.focus(); } }}>
        <header>
          <Dialog.Title>{title}</Dialog.Title>
          <IconButton variant="ghost" className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </IconButton>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
