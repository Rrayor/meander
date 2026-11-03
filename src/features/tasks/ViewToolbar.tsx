import { TASK_SORTS, TaskSort } from "@/lib/enums";
import {
  SEARCH_TASKS_LABEL,
  SORT_TASKS_LABEL,
  TASK_SORT_LABELS,
} from "@/lib/labels";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";

/// `items` feeds Select.Value the picked sort's label — without it the
/// trigger would render the raw TaskSort wire name.
const SORT_OPTIONS = TASK_SORTS.map((value) => ({
  value,
  label: TASK_SORT_LABELS[value],
}));

interface ViewToolbarProps {
  query: string;
  onQuery: (v: string) => void;
  sort: TaskSort;
  onSort: (v: TaskSort) => void;
}

/// The shared view-controls row (spec §360): search by title and
/// description, sort by a spec property, filter by categories. All
/// view-time — nothing here touches stored data.
export function ViewToolbar({
  query,
  onQuery,
  sort,
  onSort,
}: Readonly<ViewToolbarProps>) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
      <Input
        type="search"
        aria-label={SEARCH_TASKS_LABEL}
        placeholder={SEARCH_TASKS_LABEL}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        className="w-56 bg-surface py-1.5"
      />
      <Field.Root className="flex-row items-center gap-2">
        <Field.Label className="text-sm font-normal">
          {SORT_TASKS_LABEL}
        </Field.Label>
        <Select.Root
          items={SORT_OPTIONS}
          value={sort}
          onValueChange={(v) => {
            if (v != null) onSort(v);
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Icon />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popup>
                {SORT_OPTIONS.map(({ value, label }) => (
                  <Select.Item key={value} value={value}>
                    <Select.ItemText>{label}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </Field.Root>
    </div>
  );
}

export type { ViewToolbarProps };
