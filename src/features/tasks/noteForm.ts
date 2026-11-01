import { z } from "zod";

import { NOTE_BODY_MAX_LEN } from "@/api/notes";
import {
  NOTE_BODY_REQUIRED_MESSAGE,
  NOTE_BODY_TOO_LONG_MESSAGE,
} from "@/lib/errors";
import { NOTE_EDITED_PREFIX } from "@/lib/labels";
import { codePointsWithin, formatDate, unicodeTrim } from "@/lib/utils";

import type { Note } from "@/api/notes";

// The note body schema and note display helpers shared by NoteList and
// NoteRow — non-rendering logic lifted out of the component files (the
// composer and the inline editor share the same validation).
export const noteSchema = z.object({
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

export type NoteFormValues = z.infer<typeof noteSchema>;

const NOTE_OPENING_LEN = 30;
// A note's leading characters name it in the edit/delete aria-labels so
// screen readers can tell same-named buttons on different rows apart.
export const noteOpening = (body: string) => body.slice(0, NOTE_OPENING_LEN);

// The audit line under each note — the creation date, or "edited <date>"
// once the body has been saved over.
export const noteAuditLabel = (note: Note) =>
  note.updated_at === null
    ? formatDate(note.created_at)
    : `${NOTE_EDITED_PREFIX} ${formatDate(note.updated_at)}`;
