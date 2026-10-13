import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { currentProfile, listProfiles, switchProfile } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
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

const renderSwitcher = () => {
  const queryClient = testQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileSwitcher />
    </QueryClientProvider>,
  );
  return queryClient;
};

describe("ProfileSwitcher", () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue(profiles);
    vi.mocked(currentProfile).mockResolvedValue(profiles[0]);
    vi.mocked(switchProfile).mockResolvedValue(undefined);
  });

  it("shows the current profile name", async () => {
    renderSwitcher();
    expect(
      await screen.findByRole("button", { name: "Default" }, { timeout: 3000 }),
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
    await waitFor(() =>
      expect(vi.mocked(switchProfile).mock.calls[0][0]).toBe(2),
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("closes the menu only when focus leaves the switcher", async () => {
    renderSwitcher();
    fireEvent.click(await screen.findByRole("button", { name: "Default" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.blur(screen.getByRole("button", { name: "Default" }), {
      relatedTarget: screen.getByRole("menuitem", { name: "Work" }),
    });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.blur(screen.getByRole("menuitem", { name: "Work" }), {
      relatedTarget: document.body,
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  
  it("clears profile-scoped cached queries on switch", async () => {
    const queryClient = renderSwitcher();
    queryClient.setQueryData(QUERY_KEYS.tasks, [{ id: 99 }]);
    fireEvent.click(await screen.findByRole("button", { name: "Default" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));
    await waitFor(() =>
      expect(queryClient.getQueryData(QUERY_KEYS.tasks)).toBeUndefined(),
    );
    await waitFor(() =>
      expect(vi.mocked(currentProfile).mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("closes the menu on Escape", async () => {
    renderSwitcher();
    fireEvent.click(await screen.findByRole("button", { name: "Default" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
