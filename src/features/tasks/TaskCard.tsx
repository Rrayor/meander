import { DEFAULT_CATEGORY_COLOR } from "@/api/categories";
import type { Category } from "@/api/categories";
import type { Task } from "@/api/bindings";
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

// Spec: a category with no stored color displays the primary accent, the
// same default the backend applies on create.
const categoryColor = (category: Category) =>
  category.color ?? DEFAULT_CATEGORY_COLOR;

export function TaskCard({ task, categories }: Readonly<TaskCardProps>) {
  const colors = categories.map(categoryColor);
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
            {/* Names stay in the foreground token — a dark custom color as
                chip text would fail WCAG AA on the dark surface. The chosen
                hue is carried by the dot and the chip's background tint. */}
            {categories.map((category) => {
              const color = categoryColor(category);
              return (
                <li
                  key={category.id}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-text"
                  style={{ backgroundColor: `${color}26` }}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {category.title}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
