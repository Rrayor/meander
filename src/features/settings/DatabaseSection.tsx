import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";

export function DatabaseSection() {
  const [path, setPath] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    currentDatabasePath()
      .then(setPath)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  const choose = async () => {
    setError(undefined);
    try {
      const selected = await open({
        directory: false,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (selected) setPath(await selectDatabaseFile(selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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
          onClick={choose}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-surface transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          Choose database file
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
