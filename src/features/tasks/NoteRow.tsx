import type { Note } from "@/api/notes";
import { ButtonVariant, ComponentSize } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  DELETE_BUTTON_LABEL,
  NOTE_DELETE_CONFIRM_MESSAGE,
  NOTE_DELETE_LABEL,
  NOTE_EDIT_LABEL,
  NOTE_SAVE_LABEL,
  noteConfirmDeleteLabel,
  noteDeleteLabel,
  noteEditLabel,
} from "@/lib/labels";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Textarea } from "@/shared/ui/Textarea";

import { noteAuditLabel, noteOpening } from "./noteForm";
import type { NoteFormValues } from "./noteForm";

import type { UseFormReturn } from "react-hook-form";

interface NoteRowProps {
  note: Note;
  editing: boolean;
  confirmingDelete: boolean;
  onEdit: (note: Note) => void;
  onCancelEdit: () => void;
  onSave: (body: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  mutating: boolean;
  editForm: UseFormReturn<NoteFormValues>;
}

const LI_CLASSES = "rounded-lg border border-border bg-surface-raised/40 p-3";

// One note row: the read view with edit/delete actions plus an inline
// delete-confirm strip, swapped for an inline editor while editing. The
// parent owns the single edit form — only one row edits at a time.
export function NoteRow({
  note,
  editing,
  confirmingDelete,
  onEdit,
  onCancelEdit,
  onSave,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  mutating,
  editForm,
}: Readonly<NoteRowProps>) {
  const bodyError = editForm.formState.errors.body;

  if (editing) {
    return (
      <li className={LI_CLASSES}>
        <form onSubmit={editForm.handleSubmit(({ body }) => onSave(body))}>
          <Field.Root invalid={bodyError !== undefined}>
            <Field.Control
              render={
                // The primitive bakes resize-none — the hand-rolled
                // editor defaulted to resizable, so restore it.
                <Textarea className="resize px-2" />
              }
              aria-label={NOTE_SAVE_LABEL}
              {...editForm.register("body")}
            />
            {bodyError !== undefined && (
              <Field.Error match={true} id={`note-edit-error-${note.id}`}>
                {bodyError.message}
              </Field.Error>
            )}
          </Field.Root>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ComponentSize.Sm}
              onClick={onCancelEdit}
              className="py-1 text-xs hover:bg-transparent"
            >
              {CANCEL_BUTTON_LABEL}
            </Button>
            <Button
              type="submit"
              size={ComponentSize.Sm}
              disabled={mutating}
              className="py-1 text-xs"
            >
              {NOTE_SAVE_LABEL}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={LI_CLASSES}>
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap text-sm text-text">{note.body}</p>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            size={ComponentSize.Sm}
            aria-label={noteEditLabel(noteOpening(note.body))}
            onClick={() => onEdit(note)}
            className="px-2 py-1 text-xs"
          >
            {NOTE_EDIT_LABEL}
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            size={ComponentSize.Sm}
            aria-label={noteDeleteLabel(noteOpening(note.body))}
            disabled={mutating}
            onClick={onConfirmDelete}
            className="px-2 py-1 text-xs hover:text-danger"
          >
            {NOTE_DELETE_LABEL}
          </Button>
        </div>
      </div>
      {confirmingDelete ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/10 p-2">
          <p className="text-xs text-danger">{NOTE_DELETE_CONFIRM_MESSAGE}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ComponentSize.Sm}
              onClick={onCancelDelete}
              className="py-1 text-xs hover:bg-transparent"
            >
              {CANCEL_BUTTON_LABEL}
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Danger}
              size={ComponentSize.Sm}
              aria-label={noteConfirmDeleteLabel(noteOpening(note.body))}
              disabled={mutating}
              onClick={onDelete}
              className="py-1 text-xs"
            >
              {DELETE_BUTTON_LABEL}
            </Button>
          </div>
        </div>
      ) : null}
      <p className="mt-1 text-xs text-text-muted">{noteAuditLabel(note)}</p>
    </li>
  );
}
