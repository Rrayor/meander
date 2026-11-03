import { useDroppable } from "@dnd-kit/core";
import { cn } from "cn";

import type { CSSProperties, ReactNode } from "react";

interface DroppableCellProps {
  /// Cell id packed by `cellId` — column and status decoded on drop.
  id: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/// One board cell: the drop target for a column × status pair. The
/// hover fill is dnd-kit's `isOver`, not a hover class, so only a real
/// drag gesture lights it.
export function DroppableCell({
  id,
  style,
  children,
}: Readonly<DroppableCellProps>) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <td
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md align-top transition-colors",
        isOver ? "bg-primary/20" : "bg-surface/40",
      )}
    >
      {children}
    </td>
  );
}

export type { DroppableCellProps };
