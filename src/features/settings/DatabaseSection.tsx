import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pickFile } from "@/api/dialog";
import { QUERY_KEYS } from "@/api/queryKeys";
import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";
import { DATABASE_FILE_FILTERS } from "@/lib/constants";
import {
  DATABASE_CHOOSE_LABEL,
  DATABASE_HEADING,
  DATABASE_HEADING_ID,
  DATABASE_HINT,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { SettingsSection } from "@/shared/patterns/SettingsSection";
import { Button } from "@/shared/ui/Button";
import { ERROR_TEXT } from "@/shared/ui/styles";

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
    // `contents` keeps the section's own gap-3 spacing the children —
    // the pre-pattern layout had no body container; the hint is a child
    // rather than `description` because it carries no `mt-1` here.
    <SettingsSection
      title={DATABASE_HEADING}
      id={DATABASE_HEADING_ID}
      className="flex flex-col gap-3"
      headingClassName="text-sm font-medium tracking-tight text-text"
      bodyClassName="contents"
    >
      <p className="text-sm text-text-muted">{DATABASE_HINT}</p>
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
        <p role="alert" className={ERROR_TEXT}>
          {errorMessage(error)}
        </p>
      )}
    </SettingsSection>
  );
}
