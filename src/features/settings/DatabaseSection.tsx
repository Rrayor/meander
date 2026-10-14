import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pickFile } from "@/api/dialog";
import { QUERY_KEYS } from "@/api/queryKeys";
import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";
import { errorMessage } from "@/lib/utils";

export function DatabaseSection() {
  const queryClient = useQueryClient();
  const { data: path, error: loadError } = useQuery({
    queryKey: QUERY_KEYS.dbPath,
    queryFn: currentDatabasePath,
  });

  const select = useMutation({
    mutationFn: async () => {
      const selected = await pickFile({
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      return selected ? selectDatabaseFile(selected) : null;
    },
    onSuccess: (newPath) => {
      if (newPath) queryClient.setQueryData(QUERY_KEYS.dbPath, newPath);
    },
  });

  const error = select.error ?? loadError;

  return (
    <section aria-labelledby="database-heading" className="flex flex-col gap-3">
      <h2
        id="database-heading"
        className="text-sm font-medium tracking-tight text-text"
      >
        Database
      </h2>
      <p className="text-sm text-text-muted">
        Tasks and settings are stored in this file.
      </p>
      <div className="flex items-center gap-3">
        <code className="truncate rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text">
          {path ?? "…"}
        </code>
        <button
          type="button"
          onClick={() => select.mutate()}
          disabled={select.isPending}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        >
          Choose database file
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
