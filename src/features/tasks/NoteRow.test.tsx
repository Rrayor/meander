import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { Note } from "@/api/bindings";
import {
  NOTE_DELETE_CONFIRM_MESSAGE,
  NOTE_DELETE_LABEL,
  NOTE_EDIT_LABEL,
  noteConfirmDeleteLabel,
} from "@/lib/labels";

import type { NoteFormValues } from "./noteForm";
import { noteOpening } from "./noteForm";
import { noteDeleteLabel, noteEditLabel } from "@/lib/labels";
import { NoteRow } from "./NoteRow";

const NOTE: Note = {
  id: 7,
  task_id: 3,
  series_id: null,
  body: "Remember the parking spot",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: null,
};

const CALLBACKS = {
  onEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onSave: vi.fn(),
  onConfirmDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  onDelete: vi.fn(),
};

function Harness({
  editing = false,
  confirmingDelete = false,
}: {
  editing?: boolean;
  confirmingDelete?: boolean;
}) {
  const editForm = useForm<NoteFormValues>({ defaultValues: { body: "" } });
  return (
    <ul>
      <NoteRow
        note={NOTE}
        editing={editing}
        confirmingDelete={confirmingDelete}
        mutating={false}
        editForm={editForm}
        {...CALLBACKS}
      />
    </ul>
  );
}

describe("NoteRow", () => {
  it("read view shows the body and routes the edit action", () => {
    render(<Harness />);
    expect(screen.getByText(NOTE.body)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: noteEditLabel(noteOpening(NOTE.body)),
      }),
    );
    expect(CALLBACKS.onEdit).toHaveBeenCalledWith(NOTE);
    expect(
      screen.getByRole("button", {
        name: noteDeleteLabel(noteOpening(NOTE.body)),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(NOTE_EDIT_LABEL)).toBeInTheDocument();
    expect(screen.getByText(NOTE_DELETE_LABEL)).toBeInTheDocument();
  });

  it("adds the delete-confirm strip while confirming", () => {
    render(<Harness confirmingDelete />);
    expect(screen.getByText(NOTE_DELETE_CONFIRM_MESSAGE)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: noteConfirmDeleteLabel(noteOpening(NOTE.body)),
      }),
    );
    expect(CALLBACKS.onDelete).toHaveBeenCalled();
  });
});
