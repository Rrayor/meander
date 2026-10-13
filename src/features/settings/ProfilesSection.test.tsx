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
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  listProfiles: vi.fn(),
  currentProfile: vi.fn(),
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
}));

const profiles: Profile[] = [
  {
    id: 1,
    name: "Default",
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
    expect(await screen.findByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("rejects an empty profile name without calling the backend", async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: "Create profile" }),
    );
    expect(
      await screen.findByText("Profile name is required"),
    ).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
  });

  it("creates a profile and clears the input", async () => {
    renderSection();
    const input = await screen.findByLabelText("Profile name");
    fireEvent.change(input, { target: { value: "  Work  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));
    await waitFor(() =>
      expect(vi.mocked(createProfile).mock.calls[0][0]).toBe("  Work  "),
    );
  });

  it("renames a profile through the inline editor", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const editor = screen.getByLabelText("Rename Default");
    fireEvent.change(editor, { target: { value: "Personal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(vi.mocked(renameProfile).mock.calls[0].slice(0, 2)).toEqual([
        1,
        "Personal",
      ]),
    );
  });

  it("cancelling a rename restores the name", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const editor = screen.getByLabelText("Rename Default");
    fireEvent.change(editor, { target: { value: "Personal" } });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByLabelText("Rename Default")).not.toBeInTheDocument();
    expect(renameProfile).not.toHaveBeenCalled();
  });

  it("rejects an empty rename", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const editor = screen.getByLabelText("Rename Default");
    fireEvent.change(editor, { target: { value: "   " } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(
      await screen.findByText("Profile name is required"),
    ).toBeInTheDocument();
    expect(renameProfile).not.toHaveBeenCalled();
  });

  it("surfaces a backend error from create", async () => {
    vi.mocked(createProfile).mockRejectedValue(new Error("name taken"));
    renderSection();
    const input = await screen.findByLabelText("Profile name");
    fireEvent.change(input, { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));
    expect(await screen.findByText("name taken")).toBeInTheDocument();
  });
});
