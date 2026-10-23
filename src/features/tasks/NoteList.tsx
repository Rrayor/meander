import { useState } from "react";
import type { ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import {
  createSeriesNote,
  createTaskNote,
  deleteNote,
  listSeriesNotes,
  listTaskNotes,
  updateNote,
  NOTE_BODY_MAX_LEN,
  type Note,
} from "@/api/notes";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  NOTE_BODY_REQUIRED_MESSAGE,
  NOTE_BODY_TOO_LONG_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";
import {
  CANCEL_BUTTON_LABEL,
  DELETE_BUTTON_LABEL,
  NOTE_ADD_LABEL,
  NOTE_COMPOSER_PLACEHOLDER,
  NOTE_DELETE_CONFIRM_MESSAGE,
  NOTE_DELETE_LABEL,
  NOTE_EDIT_LABEL,
  NOTE_EDITED_PREFIX,
  NOTE_SAVE_LABEL,
  NOTES_EMPTY_MESSAGE,
  noteConfirmDeleteLabel,
  noteDeleteLabel,
  noteEditLabel,
} from "@/lib/labels";
import { codePointsWithin, formatDate, unicodeTrim } from "@/lib/utils";

export type NotesTarget = { taskId: number } | { seriesId: number };

const NOTE_OPENING_LEN = 30;
const noteOpening = (body: string) => body.slice(0, NOTE_OPENING_LEN);

const schema = z.object({
  body: z
    .string()
    .transform(unicodeTrim)
    .pipe(
      z
        .string()
        .min(1, NOTE_BODY_REQUIRED_MESSAGE)
        .refine((s) => codePointsWithin(s, NOTE_BODY_MAX_LEN), {
          message: NOTE_BODY_TOO_LONG_MESSAGE,
        }),
    ),
});

type FormValues = z.infer<typeof schema>;

const noteAuditLabel = (note: Note) =>
  note.updated_at === null
    ? formatDate(note.created_at)
    : `${NOTE_EDITED_PREFIX} ${formatDate(note.updated_at)}`;

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
  editForm: UseFormReturn<FormValues>;
}

function NoteRow({
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
  const liClass = "rounded-lg border border-border bg-surface-raised/40 p-3";

  if (editing) {
    return (
      <li className={liClass}>
        <form onSubmit={editForm.handleSubmit(({ body }) => onSave(body))}>
          <textarea
            {...editForm.register("body")}
            aria-label={NOTE_SAVE_LABEL}
            aria-invalid={editForm.formState.errors.body !== undefined}
            aria-describedby={
              editForm.formState.errors.body
                ? `note-edit-error-${note.id}`
                : undefined
            }
            className="w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {editForm.formState.errors.body ? (
            <p
              role="alert"
              id={`note-edit-error-${note.id}`}
              className="mt-1 text-sm text-danger"
            >
              {editForm.formState.errors.body.message}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text"
            >
              {CANCEL_BUTTON_LABEL}
            </button>
            <button
              type="submit"
              disabled={mutating}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-on-primary disabled:opacity-50"
            >
              {NOTE_SAVE_LABEL}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={liClass}>
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap text-sm text-text">{note.body}</p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={noteEditLabel(noteOpening(note.body))}
            onClick={() => onEdit(note)}
            className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            {NOTE_EDIT_LABEL}
          </button>
          <button
            type="button"
            aria-label={noteDeleteLabel(noteOpening(note.body))}
            disabled={mutating}
            onClick={onConfirmDelete}
            className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-raised hover:text-danger disabled:opacity-50"
          >
            {NOTE_DELETE_LABEL}
          </button>
        </div>
      </div>
      {confirmingDelete ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/10 p-2">
          <p className="text-xs text-danger">{NOTE_DELETE_CONFIRM_MESSAGE}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text"
            >
              {CANCEL_BUTTON_LABEL}
            </button>
            <button
              type="button"
              aria-label={noteConfirmDeleteLabel(noteOpening(note.body))}
              disabled={mutating}
              onClick={onDelete}
              className="rounded-md bg-danger px-3 py-1 text-xs font-medium text-on-primary disabled:opacity-50"
            >
              {DELETE_BUTTON_LABEL}
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-1 text-xs text-text-muted">{noteAuditLabel(note)}</p>
    </li>
  );
}

/// A note's whole editor/list for one target — a task (which may be a
/// series instance) or the series itself. Notes are handled outside the
/// task form per spec: this lives in the read-only details view.
/// Rendered under a `key` of the target id so an instance switch can never
/// carry a draft into another instance's notes.
export function NoteList({ target }: Readonly<{ target: NotesTarget }>) {
  const queryClient = useQueryClient();
  const taskId = "taskId" in target ? target.taskId : null;
  const seriesId = "taskId" in target ? null : target.seriesId;
  const queryKey =
    taskId !== null
      ? QUERY_KEYS.taskNotes(taskId)
      : QUERY_KEYS.seriesNotes(seriesId!);

  const {
    data: notes,
    isPending,
    error,
  } = useQuery({
    queryKey,
    queryFn: () =>
      taskId !== null ? listTaskNotes(taskId) : listSeriesNotes(seriesId!),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const composer = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { body: "" },
  });
  const editForm = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { body: "" },
  });

  const create = useMutation({
    mutationFn: (body: string) =>
      taskId !== null
        ? createTaskNote(taskId, body)
        : createSeriesNote(seriesId!, body),
    onSuccess: () => {
      composer.reset({ body: "" });
      void invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      updateNote(id, body),
    onSuccess: () => {
      setEditingId(null);
      void invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteNote(id),
    onSuccess: () => {
      setConfirmingDeleteId(null);
      void invalidate();
    },
  });

  const failed = create.error ?? update.error ?? remove.error ?? error;

  // Both tabs render a NoteList, so the composer error ID must be scoped to
  // the target — aria-describedby must never resolve to a sibling panel's
  // hidden error. (Edit errors already embed the globally unique note id.)
  const draftErrorId =
    taskId !== null
      ? `note-draft-error-task-${taskId}`
      : `note-draft-error-series-${seriesId}`;

  let listBody: ReactNode = null;
  if (error !== null) {
    listBody = (
      <p role="alert" className="text-sm text-danger">
        {serverErrorMessage(error)}
      </p>
    );
  } else if (!isPending) {
    if (notes!.length === 0) {
      listBody = (
        <p className="text-sm text-text-muted italic">{NOTES_EMPTY_MESSAGE}</p>
      );
    } else {
      listBody = (
        <ul className="flex flex-col gap-2">
          {notes!.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              editing={editingId === note.id}
              confirmingDelete={confirmingDeleteId === note.id}
              mutating={update.isPending || remove.isPending}
              editForm={editForm}
              onEdit={(n) => {
                setConfirmingDeleteId(null);
                setEditingId(n.id);
                editForm.reset({ body: n.body });
              }}
              onCancelEdit={() => setEditingId(null)}
              onSave={(body) => update.mutate({ id: note.id, body })}
              onConfirmDelete={() => setConfirmingDeleteId(note.id)}
              onCancelDelete={() => setConfirmingDeleteId(null)}
              onDelete={() => remove.mutate(note.id)}
            />
          ))}
        </ul>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {listBody}

      <div className="rounded-lg border border-border bg-surface-raised/40 p-3">
        <form
          onSubmit={composer.handleSubmit(({ body }) => create.mutate(body))}
        >
          <textarea
            {...composer.register("body")}
            placeholder={NOTE_COMPOSER_PLACEHOLDER}
            aria-label={NOTE_COMPOSER_PLACEHOLDER}
            aria-invalid={composer.formState.errors.body !== undefined}
            aria-describedby={
              composer.formState.errors.body ? draftErrorId : undefined
            }
            className="w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {composer.formState.errors.body ? (
            <p
              role="alert"
              id={draftErrorId}
              className="mt-1 text-sm text-danger"
            >
              {composer.formState.errors.body.message}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {NOTE_ADD_LABEL}
            </button>
          </div>
        </form>
      </div>
      {failed !== null && failed !== error ? (
        <p role="alert" className="text-sm text-danger">
          {serverErrorMessage(failed)}
        </p>
      ) : null}
    </div>
  );
}
