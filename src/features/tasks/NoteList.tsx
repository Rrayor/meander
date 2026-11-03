import { useState } from "react";
import type { ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import {
  createSeriesNote,
  createTaskNote,
  deleteNote,
  listSeriesNotes,
  listTaskNotes,
  updateNote,
} from "@/api/notes";
import { QUERY_KEYS } from "@/api/queryKeys";
import { serverErrorMessage } from "@/lib/errors";
import { ComponentSize } from "@/lib/enums";
import {
  NOTE_ADD_LABEL,
  NOTE_COMPOSER_PLACEHOLDER,
  NOTES_EMPTY_MESSAGE,
} from "@/lib/labels";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Textarea } from "@/shared/ui/Textarea";
import { ERROR_TEXT } from "@/shared/ui/styles";

import { NoteRow } from "./NoteRow";
import { noteSchema } from "./noteForm";
import type { NoteFormValues } from "./noteForm";

export type NotesTarget = { taskId: number } | { seriesId: number };

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

  const composer = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    mode: "onTouched",
    defaultValues: { body: "" },
  });
  const editForm = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
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
  const draftError = composer.formState.errors.body;

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
      <p role="alert" className={ERROR_TEXT}>
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
          <Field.Root invalid={draftError !== undefined}>
            <Field.Control
              render={
                // resize-none is baked into the primitive — the hand-rolled
                // composer was resizable. The source also used the
                // full-opacity muted placeholder, not FIELD_SURFACE's /60.
                <Textarea className="resize px-2 placeholder:text-text-muted" />
              }
              placeholder={NOTE_COMPOSER_PLACEHOLDER}
              aria-label={NOTE_COMPOSER_PLACEHOLDER}
              {...composer.register("body")}
            />
            {draftError !== undefined && (
              <Field.Error match={true} id={draftErrorId}>
                {draftError.message}
              </Field.Error>
            )}
          </Field.Root>
          <div className="mt-2 flex justify-end">
            <Button
              type="submit"
              size={ComponentSize.Sm}
              disabled={create.isPending}
              className="px-4"
            >
              {NOTE_ADD_LABEL}
            </Button>
          </div>
        </form>
      </div>
      {failed !== null && failed !== error ? (
        <p role="alert" className={ERROR_TEXT}>
          {serverErrorMessage(failed)}
        </p>
      ) : null}
    </div>
  );
}
