import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { pickFile } from "@/api/dialog";
import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";
import { DatabaseSection } from "@/features/settings/DatabaseSection";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/dialog", () => ({ pickFile: vi.fn() }));
vi.mock("@/api/settings", () => ({
  currentDatabasePath: vi.fn(),
  selectDatabaseFile: vi.fn(),
}));

const renderSection = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <DatabaseSection />
    </QueryClientProvider>,
  );

describe("DatabaseSection", () => {
  beforeEach(() => {
    vi.mocked(currentDatabasePath).mockResolvedValue("/data/meander.db");
    vi.mocked(selectDatabaseFile).mockResolvedValue("/other/app.db");
    vi.mocked(pickFile).mockResolvedValue("/other/app.db");
  });

  it("shows the current database path", async () => {
    renderSection();
    expect(await screen.findByText("/data/meander.db")).toBeInTheDocument();
  });

  it("selects a new database file through the picker", async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: "Choose database file" }),
    );
    await waitFor(() =>
      expect(selectDatabaseFile).toHaveBeenCalledWith("/other/app.db"),
    );
    expect(pickFile).toHaveBeenCalledWith({
      filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    expect(await screen.findByText("/other/app.db")).toBeInTheDocument();
  });

  it("does nothing when the picker is cancelled", async () => {
    vi.mocked(pickFile).mockResolvedValue(null);
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: "Choose database file" }),
    );
    await waitFor(() => expect(pickFile).toHaveBeenCalled());
    expect(selectDatabaseFile).not.toHaveBeenCalled();
  });
});
