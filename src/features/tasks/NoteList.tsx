import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import { serverErrorMessage } from "@/lib/errors";
import {
  CANCEL_BUTTON_LABEL,
  NOTE_ADD_LABEL,
  NOTE_COMPOSER_PLACEHOLDER,
  NOTE_DELETE_LABEL,
  NOTE_EDIT_LABEL,
  NOTE_EDITED_PREFIX,
  NOTE_SAVE_LABEL,
  NOTES_EMPTY_MESSAGE,
  noteDeleteLabel,
  noteEditLabel,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export type NotesTarget = { taskId: number } | { seriesId: number };

const NOTE_OPENING_LEN = 30;
const noteOpening = (body: string) => body.slice(0, NOTE_OPENING_LEN);

const noteAuditLabel = (note: Note) =>
  note.updated_at === note.created_at
    ? formatDate(note.created_at)
    : `${NOTE_EDITED_PREFIX} ${formatDate(note.updated_at)}`;

/// A note's whole editor/list for one target — a task (which may be a
/// series instance) or the series itself. Notes are handled outside the
/// task form per spec: this lives in the read-only details view.
export function NoteList({ target }: { target: NotesTarget }) {
  const queryClient = useQueryClient();
  const taskId = "taskId" in target ? target.taskId : null;
  const seriesId = "seriesId" in target ? target.seriesId : null;
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

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(
    null,
  );
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: (body: string) =>
      taskId !== null
        ? createTaskNote(taskId, body)
        : createSeriesNote(seriesId!, body),
    onSuccess: () => {
      setDraft("");
      void invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      updateNote(id, body),
    onSuccess: () => {
      setEditing(null);
      void invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteNote(id),
    onSuccess: () => void invalidate(),
  });

  const failed = create.error ?? update.error ?? remove.error ?? error;
  const submit = () => {
    if (draft.trim() === "") return;
    create.mutate(draft);
  };

  return (
    <div className="flex flex-col gap-3">
      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {serverErrorMessage(error)}
        </p>
      ) : isPending ? null : notes!.length === 0 ? (
        <p className="text-sm text-text-muted italic">{NOTES_EMPTY_MESSAGE}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes!.map((note) =>
            editing?.id === note.id ? (
              <li
                key={note.id}
                className="rounded-lg border border-border bg-surface-raised/40 p-3"
              >
                <textarea
                  value={editing.body}
                  maxLength={NOTE_BODY_MAX_LEN}
                  aria-label={NOTE_SAVE_LABEL}
                  onChange={(e) =>
                    setEditing({ id: note.id, body: e.target.value })
                  }
                  className="w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text"
                  >
                    {CANCEL_BUTTON_LABEL}
                  </button>
                  <button
                    type="button"
                    disabled={editing.body.trim() === "" || update.isPending}
                    onClick={() => update.mutate(editing)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-on-primary disabled:opacity-50"
                  >
                    {NOTE_SAVE_LABEL}
                  </button>
                </div>
              </li>
            ) : (
              <li
                key={note.id}
                className="rounded-lg border border-border bg-surface-raised/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-sm text-text">
                    {note.body}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={noteEditLabel(noteOpening(note.body))}
                      onClick={() =>
                        setEditing({ id: note.id, body: note.body })
                      }
                      className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
                    >
                      {NOTE_EDIT_LABEL}
                    </button>
                    <button
                      type="button"
                      aria-label={noteDeleteLabel(noteOpening(note.body))}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(note.id)}
                      className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-raised hover:text-danger disabled:opacity-50"
                    >
                      {NOTE_DELETE_LABEL}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {noteAuditLabel(note)}
                </p>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="rounded-lg border border-border bg-surface-raised/40 p-3">
        <textarea
          value={draft}
          maxLength={NOTE_BODY_MAX_LEN}
          placeholder={NOTE_COMPOSER_PLACEHOLDER}
          aria-label={NOTE_COMPOSER_PLACEHOLDER}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={draft.trim() === "" || create.isPending}
            onClick={submit}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {NOTE_ADD_LABEL}
          </button>
        </div>
      </div>
      {failed !== null && failed !== error ? (
        <p role="alert" className="text-sm text-danger">
          {serverErrorMessage(failed)}
        </p>
      ) : null}
    </div>
  );
}
