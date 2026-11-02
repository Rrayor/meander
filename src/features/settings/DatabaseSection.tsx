import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pickFile } from "@/api/dialog";
import { QUERY_KEYS } from "@/api/queryKeys";
import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";
import { DATABASE_FILE_FILTERS } from "@/lib/constants";
import { DATABASE_CHOOSE_LABEL } from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/shared/ui/Button";

export function DatabaseSection() {
  const queryClient = useQueryClient();
  const { data: path, error: loadError } = useQuery({
    queryKey: QUERY_KEYS.dbPath,
    queryFn: currentDatabasePath,
  });

  const select = useMutation({
    mutationFn: async () => {
      const selected = await pickFile({ filters: DATABASE_FILE_FILTERS });
      return selected ? selectDatabaseFile(selected) : null;
    },
    onSuccess: (newPath) => {
      if (!newPath) return;
      queryClient.setQueryData(QUERY_KEYS.dbPath, newPath);
      // Every cached query reads from the previous pool — refetch them
      // all against the newly selected database.
      void queryClient.invalidateQueries();
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
        <Button
          type="button"
          className="shrink-0"
          onClick={() => select.mutate()}
          disabled={select.isPending}
        >
          {DATABASE_CHOOSE_LABEL}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
