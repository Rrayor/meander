import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  createSeriesNote,
  createTaskNote,
  deleteNote,
  listSeriesNotes,
  listTaskNotes,
  updateNote,
  type Note,
} from "@/api/notes";
import { NoteList } from "@/features/tasks/NoteList";
import {
  CANCEL_BUTTON_LABEL,
  NOTE_ADD_LABEL,
  NOTE_COMPOSER_PLACEHOLDER,
  NOTE_EDITED_PREFIX,
  NOTE_SAVE_LABEL,
  NOTES_EMPTY_MESSAGE,
  noteDeleteLabel,
  noteEditLabel,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/notes");

const TASK_ID = 7;
const SERIES_ID = 3;
const NOTE_CREATED = "2026-10-21 09:30:00";
const NOTE_BODY = "call the venue";
const NOTE_BODY_EDITED = "call the venue and confirm chairs";
const LOAD_ERROR = "could not load notes";
const SAVE_ERROR = "could not save the note";

const note: Note = {
  id: 5,
  task_id: TASK_ID,
  series_id: null,
  body: NOTE_BODY,
  created_at: NOTE_CREATED,
  updated_at: NOTE_CREATED,
};

const renderList = (target: { taskId: number } | { seriesId: number }) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NoteList target={target} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(listTaskNotes).mockReset().mockResolvedValue([note]);
  vi.mocked(listSeriesNotes).mockReset().mockResolvedValue([]);
  vi.mocked(createTaskNote).mockReset().mockResolvedValue(note);
  vi.mocked(createSeriesNote).mockReset().mockResolvedValue(note);
  vi.mocked(updateNote).mockReset().mockResolvedValue(note);
  vi.mocked(deleteNote).mockReset().mockResolvedValue(undefined);
});

describe("NoteList", () => {
  it("lists task notes with their audit date", async () => {
    renderList({ taskId: TASK_ID });
    expect(await screen.findByText(NOTE_BODY)).toBeInTheDocument();
    expect(screen.getByText(formatDate(NOTE_CREATED))).toBeInTheDocument();
    expect(listTaskNotes).toHaveBeenCalledWith(TASK_ID);
  });

  it("queries the series target for series notes", async () => {
    renderList({ seriesId: SERIES_ID });
    await waitFor(() =>
      expect(listSeriesNotes).toHaveBeenCalledWith(SERIES_ID),
    );
    expect(await screen.findByText(NOTES_EMPTY_MESSAGE)).toBeInTheDocument();
  });

  it("marks an edited note", async () => {
    vi.mocked(listTaskNotes).mockResolvedValue([
      { ...note, updated_at: "2026-10-21 10:15:00" },
    ]);
    renderList({ taskId: TASK_ID });
    expect(
      await screen.findByText(
        `${NOTE_EDITED_PREFIX} ${formatDate("2026-10-21 10:15:00")}`,
      ),
    ).toBeInTheDocument();
  });

  it("adds a note and clears the composer", async () => {
    renderList({ taskId: TASK_ID });
    const composer = await screen.findByLabelText(NOTE_COMPOSER_PLACEHOLDER);
    fireEvent.change(composer, { target: { value: NOTE_BODY_EDITED } });
    fireEvent.click(screen.getByRole("button", { name: NOTE_ADD_LABEL }));
    await waitFor(() =>
      expect(createTaskNote).toHaveBeenCalledWith(TASK_ID, NOTE_BODY_EDITED),
    );
    expect(composer).toHaveValue("");
    // The list refetches so the new note shows up.
    await waitFor(() => expect(listTaskNotes).toHaveBeenCalledTimes(2));
  });

  it("keeps the add button disabled on a blank draft", async () => {
    vi.mocked(listTaskNotes).mockResolvedValue([]);
    renderList({ taskId: TASK_ID });
    const add = screen.getByRole("button", { name: NOTE_ADD_LABEL });
    expect(add).toBeDisabled();
    fireEvent.change(await screen.findByLabelText(NOTE_COMPOSER_PLACEHOLDER), {
      target: { value: "   " },
    });
    expect(add).toBeDisabled();
    expect(createTaskNote).not.toHaveBeenCalled();
  });

  it("edits a note inline", async () => {
    renderList({ taskId: TASK_ID });
    fireEvent.click(
      await screen.findByRole("button", {
        name: noteEditLabel(NOTE_BODY),
      }),
    );
    const editor = screen.getByLabelText(NOTE_SAVE_LABEL);
    expect(editor).toHaveValue(NOTE_BODY);
    fireEvent.change(editor, { target: { value: NOTE_BODY_EDITED } });
    fireEvent.click(screen.getByRole("button", { name: NOTE_SAVE_LABEL }));
    await waitFor(() =>
      expect(updateNote).toHaveBeenCalledWith(note.id, NOTE_BODY_EDITED),
    );
  });

  it("cancelling an edit restores the note", async () => {
    renderList({ taskId: TASK_ID });
    fireEvent.click(
      await screen.findByRole("button", { name: noteEditLabel(NOTE_BODY) }),
    );
    fireEvent.change(screen.getByLabelText(NOTE_SAVE_LABEL), {
      target: { value: NOTE_BODY_EDITED },
    });
    fireEvent.click(screen.getByRole("button", { name: CANCEL_BUTTON_LABEL }));
    expect(screen.getByText(NOTE_BODY)).toBeInTheDocument();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("deletes a note", async () => {
    renderList({ taskId: TASK_ID });
    fireEvent.click(
      await screen.findByRole("button", {
        name: noteDeleteLabel(NOTE_BODY),
      }),
    );
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith(note.id));
    await waitFor(() => expect(listTaskNotes).toHaveBeenCalledTimes(2));
  });

  it("surfaces a failed load", async () => {
    vi.mocked(listTaskNotes).mockRejectedValue(new Error(LOAD_ERROR));
    renderList({ taskId: TASK_ID });
    expect(await screen.findByRole("alert")).toHaveTextContent(LOAD_ERROR);
  });

  it("surfaces a typed rejection from the backend", async () => {
    const { ApiError } = await import("@/api/transport");
    vi.mocked(createTaskNote).mockRejectedValue(
      new ApiError("note_body_too_long", "validation", SAVE_ERROR),
    );
    renderList({ taskId: TASK_ID });
    fireEvent.change(await screen.findByLabelText(NOTE_COMPOSER_PLACEHOLDER), {
      target: { value: NOTE_BODY },
    });
    fireEvent.click(screen.getByRole("button", { name: NOTE_ADD_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent(SAVE_ERROR);
  });
});
