import { useDraggable } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";

import type { Task } from "@/api/bindings";
import { listTaskCategories } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import { TaskCard } from "@/features/tasks/TaskCard";
import { editTaskLabel } from "@/lib/labels";

interface BoardCardProps {
  task: Task;
  onOpen: () => void;
  /// §285: cards of a reached category carry that threshold's tint.
  tintColors?: string[];
}

/// A task card on the board grid: draggable, opens the task dialog on
/// activation. The card queries its own category chips — the same
/// per-task association read the backlog row does.
export function BoardCard({
  task,
  onOpen,
  tintColors,
}: Readonly<BoardCardProps>) {
  const { data: categories } = useQuery({
    queryKey: QUERY_KEYS.taskCategories(task.id),
    queryFn: () => listTaskCategories(task.id),
  });
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- dnd-kit supplies role=button/tabIndex/keyboard via spread attributes
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={editTaskLabel(task.title)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      // §451: the card follows the pointer immediately — the backend
      // write must never gate the visual.
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 30 : undefined,
        cursor: "grab",
      }}
      className={isDragging ? "opacity-70" : undefined}
    >
      <TaskCard
        task={task}
        categories={categories ?? []}
        tintColors={tintColors}
      />
    </div>
  );
}

export type { BoardCardProps };
