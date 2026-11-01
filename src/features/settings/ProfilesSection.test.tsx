import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import {
  createProfile,
  deleteProfile,
  currentProfile,
  listProfiles,
  renameProfile,
  importProfileSettings,
} from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { ProfilesSection } from "@/features/settings/ProfilesSection";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_LABEL,
  CREATE_PROFILE_LABEL,
  DELETE_BUTTON_LABEL,
  DELETE_CONFIRM_INPUT_LABEL,
  EDIT_BUTTON_LABEL,
  SAVE_BUTTON_LABEL,
  deleteProfileLabel,
  deleteProfileSentence,
  IMPORT_SETTINGS_LABEL,
  PROFILE_NAME_LABEL,
  PROFILE_NAME_REQUIRED_MESSAGE,
  renameProfileLabel,
} from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  listProfiles: vi.fn(),
  currentProfile: vi.fn(),
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  importProfileSettings: vi.fn(),
  deleteProfile: vi.fn(),
}));

const DEFAULT_PROFILE_NAME = "Default";
const NEW_PROFILE_NAME = "  Work  ";
const RENAMED_PROFILE_NAME = "Personal";
const BACKEND_ERROR_MESSAGE = "name taken";

const SECOND_PROFILE: Profile = {
  id: 2,
  name: "Second",
  created_at: "2026-01-01 10:00:00",
  updated_at: "2026-01-02 10:00:00",
};
const profiles: Profile[] = [
  {
    id: 1,
    name: DEFAULT_PROFILE_NAME,
    created_at: "2026-01-01 10:00:00",
    updated_at: "2026-01-02 10:00:00",
  },
];

const renderSection = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <ProfilesSection />
    </QueryClientProvider>,
  );

describe("ProfilesSection", () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue(profiles);
    vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
    vi.mocked(createProfile).mockResolvedValue(profiles[0]);
    vi.mocked(renameProfile).mockResolvedValue(profiles[0]);
  });

  it("lists profiles and marks the current one", async () => {
    renderSection();
    expect(await screen.findByText(DEFAULT_PROFILE_NAME)).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("rejects an empty profile name without calling the backend", async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: CREATE_PROFILE_LABEL }),
    );
    expect(
      await screen.findByText(PROFILE_NAME_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
  });

  it("creates a profile and clears the input", async () => {
    renderSection();
    const input = await screen.findByLabelText(PROFILE_NAME_LABEL);
    fireEvent.change(input, { target: { value: NEW_PROFILE_NAME } });
    fireEvent.click(screen.getByRole("button", { name: CREATE_PROFILE_LABEL }));
    await waitFor(() =>
      expect(vi.mocked(createProfile).mock.calls[0][0]).toBe(NEW_PROFILE_NAME),
    );
  });

  it("renames a profile through the inline editor", async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    const editor = screen.getByLabelText(
      renameProfileLabel(DEFAULT_PROFILE_NAME),
    );
    fireEvent.change(editor, { target: { value: RENAMED_PROFILE_NAME } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(vi.mocked(renameProfile).mock.calls[0].slice(0, 2)).toEqual([
        1,
        RENAMED_PROFILE_NAME,
      ]),
    );
  });

  it("cancelling a rename restores the name", async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    const editor = screen.getByLabelText(
      renameProfileLabel(DEFAULT_PROFILE_NAME),
    );
    fireEvent.change(editor, { target: { value: RENAMED_PROFILE_NAME } });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(
      screen.queryByLabelText(renameProfileLabel(DEFAULT_PROFILE_NAME)),
    ).not.toBeInTheDocument();
    expect(renameProfile).not.toHaveBeenCalled();
  });

  it("rejects an empty rename", async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    const editor = screen.getByLabelText(
      renameProfileLabel(DEFAULT_PROFILE_NAME),
    );
    fireEvent.change(editor, { target: { value: "   " } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(
      await screen.findByText(PROFILE_NAME_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
    expect(renameProfile).not.toHaveBeenCalled();
  });

  it("surfaces a backend error from create", async () => {
    vi.mocked(createProfile).mockRejectedValue(
      new Error(BACKEND_ERROR_MESSAGE),
    );
    renderSection();
    const input = await screen.findByLabelText(PROFILE_NAME_LABEL);
    fireEvent.change(input, { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: CREATE_PROFILE_LABEL }));
    expect(await screen.findByText(BACKEND_ERROR_MESSAGE)).toBeInTheDocument();
  });

  // Base UI's select commits an item on pointerdown+click (mouse selection
  // order); the trigger opens on a plain click — see Select.test.tsx. The
  // popup is portaled to <body>, so options are found on `screen`, not
  // scoped to the section.
  const pickImportSource = async (sourceName: string) => {
    fireEvent.click(
      screen.getByRole("combobox", { name: IMPORT_SETTINGS_LABEL }),
    );
    const option = await screen.findByRole("option", { name: sourceName });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
  };

  it("imports settings from another profile on selection", async () => {
    const source = SECOND_PROFILE;
    vi.mocked(listProfiles).mockResolvedValue([...profiles, source]);
    vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
    vi.mocked(importProfileSettings).mockResolvedValue(source);
    renderSection();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: EDIT_BUTTON_LABEL }))[0],
    );
    fireEvent.click(
      await screen.findByRole("combobox", { name: IMPORT_SETTINGS_LABEL }),
    );
    // The edited profile itself is not offered as a source.
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([source.name]);
    const option = screen.getByRole("option", { name: source.name });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    // Staged only — the import must not fire until Save.
    expect(vi.mocked(importProfileSettings)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(
        vi.mocked(importProfileSettings).mock.calls[0].slice(0, 2),
      ).toEqual([profiles[0].id, source.id]),
    );
  });

  it("does not import when the edit is cancelled", async () => {
    const source = SECOND_PROFILE;
    vi.mocked(listProfiles).mockResolvedValue([...profiles, source]);
    vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
    renderSection();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: EDIT_BUTTON_LABEL }))[0],
    );
    await pickImportSource(source.name);
    fireEvent.click(screen.getByRole("button", { name: CANCEL_BUTTON_LABEL }));
    await waitFor(() =>
      expect(vi.mocked(importProfileSettings)).not.toHaveBeenCalled(),
    );
  });

  describe("profile deletion", () => {
    it("requires typing the exact confirmation sentence", async () => {
      vi.mocked(listProfiles).mockResolvedValue(profiles);
      vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
      renderSection();
      fireEvent.click(
        await screen.findByRole("button", {
          name: deleteProfileLabel(profiles[0].name),
        }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(
        await within(dialog).findByText(
          deleteProfileSentence(profiles[0].name),
        ),
      ).toBeInTheDocument();
      const deleteButton = within(dialog).getByRole("button", {
        name: DELETE_BUTTON_LABEL,
      });
      expect(deleteButton).toBeDisabled();
      // A near-miss is not enough — the match must be exact.
      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: DELETE_CONFIRM_INPUT_LABEL,
        }),
        { target: { value: ` ${deleteProfileSentence(profiles[0].name)} ` } },
      );
      expect(deleteButton).toBeDisabled();
      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: DELETE_CONFIRM_INPUT_LABEL,
        }),
        {
          target: {
            value: deleteProfileSentence(profiles[0].name).toLowerCase(),
          },
        },
      );
      expect(deleteButton).toBeDisabled();
      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: DELETE_CONFIRM_INPUT_LABEL,
        }),
        { target: { value: deleteProfileSentence(profiles[0].name) } },
      );
      expect(deleteButton).toBeEnabled();
      fireEvent.click(deleteButton);
      await waitFor(() =>
        expect(deleteProfile).toHaveBeenCalledWith(profiles[0].id),
      );
    });

    it("does not delete when the dialog is cancelled", async () => {
      vi.mocked(listProfiles).mockResolvedValue(profiles);
      vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
      renderSection();
      fireEvent.click(
        await screen.findByRole("button", {
          name: deleteProfileLabel(profiles[0].name),
        }),
      );
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(
        within(dialog).getByRole("button", { name: CANCEL_BUTTON_LABEL }),
      );
      expect(vi.mocked(deleteProfile)).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("closes on Escape, outside press, or the header close button without deleting", async () => {
      vi.mocked(listProfiles).mockResolvedValue(profiles);
      vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
      renderSection();
      const open = async () =>
        fireEvent.click(
          await screen.findByRole("button", {
            name: deleteProfileLabel(profiles[0].name),
          }),
        );
      const expectClosed = () =>
        waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );

      await open();
      fireEvent.keyDown(document, { key: "Escape" });
      await expectClosed();

      // A press outside the popup (the viewport/dim layer) dismisses too.
      await open();
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(dialog.parentElement!);
      await expectClosed();

      await open();
      fireEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: CLOSE_LABEL,
        }),
      );
      await expectClosed();
      expect(vi.mocked(deleteProfile)).not.toHaveBeenCalled();
    });

    it("closes the dialog after a successful delete", async () => {
      vi.mocked(listProfiles).mockResolvedValue(profiles);
      vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
      vi.mocked(deleteProfile).mockResolvedValue(undefined);
      renderSection();
      fireEvent.click(
        await screen.findByRole("button", {
          name: deleteProfileLabel(profiles[0].name),
        }),
      );
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: DELETE_CONFIRM_INPUT_LABEL,
        }),
        { target: { value: deleteProfileSentence(profiles[0].name) } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: DELETE_BUTTON_LABEL }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("surfaces a failed deletion", async () => {
      const failure = "db gone";
      vi.mocked(listProfiles).mockResolvedValue(profiles);
      vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
      vi.mocked(deleteProfile).mockRejectedValue(new Error(failure));
      renderSection();
      fireEvent.click(
        await screen.findByRole("button", {
          name: deleteProfileLabel(profiles[0].name),
        }),
      );
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: DELETE_CONFIRM_INPUT_LABEL,
        }),
        { target: { value: deleteProfileSentence(profiles[0].name) } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: DELETE_BUTTON_LABEL }),
      );
      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent(failure),
      );
    });
  });
});
