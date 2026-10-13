import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { currentProfile, listProfiles, switchProfile } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { ProfileSwitcher } from "@/components/layout/ProfileSwitcher";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  listProfiles: vi.fn(),
  currentProfile: vi.fn(),
  switchProfile: vi.fn(),
}));

const profiles: Profile[] = [
  {
    id: 1,
    name: "Default",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  { id: 2, name: "Work", created_at: "2026-01-02", updated_at: "2026-01-02" },
];

const renderSwitcher = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <ProfileSwitcher />
    </QueryClientProvider>,
  );

describe("ProfileSwitcher", () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue(profiles);
    vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
    vi.mocked(switchProfile).mockResolvedValue(undefined);
  });

  it("shows the current profile name", async () => {
    renderSwitcher();
    expect(
      await screen.findByRole("button", { name: "Default" }),
    ).toBeInTheDocument();
  });

  it("opens the menu and switches profile on menuitem click", async () => {
    renderSwitcher();
    const trigger = await screen.findByRole("button", { name: "Default" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(menu.querySelector("[aria-current='true']")).toHaveTextContent(
      "Default",
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));
    await waitFor(() => expect(switchProfile.mock.calls[0][0]).toBe(2));
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("closes the menu on Escape", async () => {
    renderSwitcher();
    fireEvent.click(await screen.findByRole("button", { name: "Default" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
