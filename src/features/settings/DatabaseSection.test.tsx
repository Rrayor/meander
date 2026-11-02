import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { pickFile } from "@/api/dialog";
import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";
import { DatabaseSection } from "@/features/settings/DatabaseSection";
import { DATABASE_FILE_FILTERS } from "@/lib/constants";
import { DATABASE_CHOOSE_LABEL } from "@/lib/labels";
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

  it("invalidates every cached query after a database switch", async () => {
    const client = testQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <DatabaseSection />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: DATABASE_CHOOSE_LABEL }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
  });

  it("shows the current database path", async () => {
    renderSection();
    expect(await screen.findByText("/data/meander.db")).toBeInTheDocument();
  });

  it("selects a new database file through the picker", async () => {
    // The switch invalidates every query — the post-switch db-path
    // refetch must come back as the new file (as the backend would).
    vi.mocked(currentDatabasePath)
      .mockResolvedValueOnce("/data/meander.db")
      .mockResolvedValue("/other/app.db");
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: DATABASE_CHOOSE_LABEL }),
    );
    await waitFor(() =>
      expect(selectDatabaseFile).toHaveBeenCalledWith("/other/app.db"),
    );
    expect(pickFile).toHaveBeenCalledWith({
      filters: DATABASE_FILE_FILTERS,
    });
    expect(await screen.findByText("/other/app.db")).toBeInTheDocument();
  });

  it("does nothing when the picker is cancelled", async () => {
    vi.mocked(pickFile).mockResolvedValue(null);
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: DATABASE_CHOOSE_LABEL }),
    );
    await waitFor(() => expect(pickFile).toHaveBeenCalled());
    expect(selectDatabaseFile).not.toHaveBeenCalled();
  });
});
