import { TaskSort, TASK_SORTS, TASK_SORT_LABELS } from "@/lib/enums";
import { SEARCH_TASKS_LABEL, SORT_TASKS_LABEL } from "@/lib/labels";

/// The shared view-controls row (spec §360): search by title and
/// description, sort by a spec property, filter by categories. All
/// view-time — nothing here touches stored data.
export function ViewToolbar({
  query,
  onQuery,
  sort,
  onSort,
}: Readonly<{
  query: string;
  onQuery: (v: string) => void;
  sort: TaskSort;
  onSort: (v: TaskSort) => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
      <input
        type="search"
        aria-label={SEARCH_TASKS_LABEL}
        placeholder={SEARCH_TASKS_LABEL}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        className="w-56 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <label className="flex items-center gap-2 text-sm text-text-muted">
        {SORT_TASKS_LABEL}
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as TaskSort)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {TASK_SORTS.map((s) => (
            <option key={s} value={s}>
              {TASK_SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
