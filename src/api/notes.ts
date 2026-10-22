import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Note } from "./bindings";

export type { Note };

/// Spec §52: a note holds at most 10,000 characters. Mirrors the backend
/// bound (notes.rs) and the CHECK on task_notes.body.
export const NOTE_BODY_MAX_LEN = 10_000;

export const listTaskNotes = (taskId: number) =>
  transport.invoke<Note[]>(COMMANDS.listTaskNotes, { taskId });

export const listSeriesNotes = (seriesId: number) =>
  transport.invoke<Note[]>(COMMANDS.listSeriesNotes, { seriesId });

export const createTaskNote = (taskId: number, body: string) =>
  transport.invoke<Note>(COMMANDS.createTaskNote, { taskId, body });

export const createSeriesNote = (seriesId: number, body: string) =>
  transport.invoke<Note>(COMMANDS.createSeriesNote, { seriesId, body });

export const updateNote = (noteId: number, body: string) =>
  transport.invoke<Note>(COMMANDS.updateNote, { noteId, body });

export const deleteNote = (noteId: number) =>
  transport.invoke<void>(COMMANDS.deleteNote, { noteId });
