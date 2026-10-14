import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  createProfile,
  currentProfile,
  listProfiles,
  renameProfile,
} from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { ProfilesSection } from "@/features/settings/ProfilesSection";
import {
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
}));

const DEFAULT_PROFILE_NAME = "Default";
const NEW_PROFILE_NAME = "  Work  ";
const RENAMED_PROFILE_NAME = "Personal";
const BACKEND_ERROR_MESSAGE = "name taken";
const CREATE_PROFILE_BUTTON = "Create profile";
const RENAME_BUTTON = "Rename";

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
      await screen.findByRole("button", { name: CREATE_PROFILE_BUTTON }),
    );
    expect(
      await screen.findByText(PROFILE_NAME_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
  });

  it("creates a profile and clears the input", async () => {
    renderSection();
    const input = await screen.findByLabelText("Profile name");
    fireEvent.change(input, { target: { value: NEW_PROFILE_NAME } });
    fireEvent.click(
      screen.getByRole("button", { name: CREATE_PROFILE_BUTTON }),
    );
    await waitFor(() =>
      expect(vi.mocked(createProfile).mock.calls[0][0]).toBe(NEW_PROFILE_NAME),
    );
  });

  it("renames a profile through the inline editor", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: RENAME_BUTTON }));
    const editor = screen.getByLabelText(
      renameProfileLabel(DEFAULT_PROFILE_NAME),
    );
    fireEvent.change(editor, { target: { value: RENAMED_PROFILE_NAME } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(vi.mocked(renameProfile).mock.calls[0].slice(0, 2)).toEqual([
        1,
        RENAMED_PROFILE_NAME,
      ]),
    );
  });

  it("cancelling a rename restores the name", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: RENAME_BUTTON }));
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
    fireEvent.click(await screen.findByRole("button", { name: RENAME_BUTTON }));
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
    const input = await screen.findByLabelText("Profile name");
    fireEvent.change(input, { target: { value: "Dup" } });
    fireEvent.click(
      screen.getByRole("button", { name: CREATE_PROFILE_BUTTON }),
    );
    expect(await screen.findByText(BACKEND_ERROR_MESSAGE)).toBeInTheDocument();
  });
});
