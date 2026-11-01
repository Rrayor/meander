import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPlus, GripVertical, Trash2 } from "lucide-react";

import type { Task } from "@/api/tasks";
import {
  ADD_TO_WEEK_LABEL,
  STATUS_LABELS,
  addToWeekLabel,
  deleteTaskLabel,
  editTaskLabel,
  formatMinutes,
  reorderLabel,
} from "@/lib/labels";
import { IconButton } from "@/shared/ui/IconButton";

const STATUS_BADGE = {
  todo: "bg-surface-raised text-text-muted",
  in_progress: "bg-threshold-amber/15 text-threshold-amber",
  done: "bg-primary/15 text-primary",
} as const;

interface TaskRowProps {
  task: Task;
  onDelete: () => void;
  onEdit: () => void;
  onAddToWeek: () => void;
  deletePending: boolean;
  /** A non-manual sort freezes the stored order — the handle is inert. */
  sortLocked: boolean;
}

// A backlog list row: drag handle, title button (opens the editor),
// estimate, status badge, and the add-to-week/delete affordances. The
// row itself is pointer-clickable per the Stitch design; the title
// button carries the keyboard/AT affordance.
export function TaskRow({
  task,
  onDelete,
  onEdit,
  onAddToWeek,
  deletePending,
  sortLocked,
}: Readonly<TaskRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id, disabled: sortLocked });

  return (
    // The row is clickable per the Stitch design (cursor-pointer + hover
    // tint); the title button carries the keyboard/AT affordance, so the
    // li's click handler is pointer-only by design.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- keyboard users reach the same action via the title's <button>
    <li
      ref={setNodeRef}
      onClick={onEdit}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors duration-150 ease-out hover:bg-surface-raised"
    >
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          icon={GripVertical}
          label={reorderLabel(task.title)}
          onClick={(e) => e.stopPropagation()}
          // The handle keeps the source 20px hit box (p-0.5 + 16px icon)
          // and grab cursors — the Md default box would balloon it to 28px.
          className="h-5 w-5 cursor-grab touch-none rounded active:cursor-grabbing"
          {...attributes}
          {...listeners}
        />
        <button
          type="button"
          aria-label={editTaskLabel(task.title)}
          onClick={onEdit}
          className="min-w-0 cursor-pointer truncate rounded text-left text-sm font-medium text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {task.title}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {task.estimated_minutes != null && (
          <span className="text-xs text-text-muted">
            {formatMinutes(task.estimated_minutes)}
          </span>
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[task.status]}`}
        >
          {STATUS_LABELS[task.status]}
        </span>
        <IconButton
          icon={CalendarPlus}
          label={addToWeekLabel(task.title)}
          title={ADD_TO_WEEK_LABEL}
          onClick={(e) => {
            e.stopPropagation();
            onAddToWeek();
          }}
        />
        <IconButton
          icon={Trash2}
          label={deleteTaskLabel(task.title)}
          disabled={deletePending}
          // The row itself opens the editor on click — the delete
          // affordance must not bubble up to it.
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1"
        />
      </div>
    </li>
  );
}

export type { TaskRowProps };
