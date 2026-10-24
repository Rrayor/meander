import type { Category, Task } from "@/api/bindings";
import { TASK_CARD_LABEL, formatMinutes } from "@/lib/labels";

type TaskCardProps = {
  task: Task;
  categories: Category[];
};

// Category colors paint the card's left accent — a solid stripe for one
// category, a gradient when a task carries several.
const accentStyle = (colors: string[]) => {
  if (colors.length === 0) return undefined;
  const background =
    colors.length === 1
      ? colors[0]
      : `linear-gradient(to bottom, ${colors.join(", ")})`;
  return { background };
};

export function TaskCard({ task, categories }: TaskCardProps) {
  const colors = categories
    .map((c) => c.color)
    .filter((c): c is string => c !== null);
  return (
    <article
      aria-label={TASK_CARD_LABEL(task.title)}
      className="flex overflow-hidden rounded-lg border border-border bg-surface"
    >
      {colors.length > 0 && (
        <div aria-hidden className="w-1 shrink-0" style={accentStyle(colors)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <h3 className="truncate text-sm font-medium text-text">{task.title}</h3>
        {task.estimated_minutes !== null && (
          <p className="text-xs text-text-muted">
            {formatMinutes(task.estimated_minutes)}
          </p>
        )}
        {categories.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: category.color
                    ? `${category.color}26`
                    : "transparent",
                  color: category.color ?? "var(--color-text-muted)",
                }}
              >
                {category.color && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                )}
                {category.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
