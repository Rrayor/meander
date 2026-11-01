import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ButtonVariant, ComponentSize, Weekday } from "@/lib/enums";
import {
  ADD_TASK_LABEL,
  BOARD_HEADING,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_PREVIOUS_WEEK_LABEL,
  BOARD_THIS_WEEK_LABEL,
  boardWeekRangeLabel,
  dayTotalsLabel,
  taskCountLabel,
} from "@/lib/labels";
import { shiftDays, todayLocalIso } from "@/lib/utils";
import { PageHeader } from "@/shared/patterns/PageHeader";
import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";

import { WeekJumpCalendar } from "./WeekJumpCalendar";

import type { ColumnTotals } from "./boardGrid";

interface BoardHeaderProps {
  /// The seven day ISOs of the viewed week, in column order.
  week: string[];
  /// A date inside the viewed week — the jump calendar opens on its month.
  anchorIso: string;
  weekStart: Weekday;
  isCurrentWeek: boolean;
  totals: ColumnTotals;
  onNavigate: (iso: string) => void;
  onAddTask: () => void;
}

/// The board's header band: week-stepping chevrons, the week-range
/// button that opens the jump-calendar popover, This week, Add task,
/// and the week's aggregate totals.
export function BoardHeader({
  week,
  anchorIso,
  weekStart,
  isCurrentWeek,
  totals,
  onNavigate,
  onAddTask,
}: Readonly<BoardHeaderProps>) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const rangeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!jumpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setJumpOpen(false);
        // The focused cell unmounts with the popover — hand focus
        // back to the trigger instead of dropping it on <body>.
        rangeButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [jumpOpen]);

  return (
    <PageHeader
      title={BOARD_HEADING}
      className="flex-wrap justify-between gap-2"
      actions={
        <>
          <div className="relative flex items-center gap-1">
            <IconButton
              icon={ChevronLeft}
              label={BOARD_PREVIOUS_WEEK_LABEL}
              onClick={() => onNavigate(shiftDays(week[0], -7))}
            />
            <Button
              type="button"
              ref={rangeButton}
              variant={ButtonVariant.Ghost}
              size={ComponentSize.Sm}
              aria-expanded={jumpOpen}
              aria-haspopup="dialog"
              onClick={() => setJumpOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setJumpOpen(false);
              }}
              className="px-1 py-0 text-text"
            >
              {boardWeekRangeLabel(week[0], week[6])}
            </Button>
            {jumpOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setJumpOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute top-full z-20 mt-2 w-72">
                  <WeekJumpCalendar
                    anchorIso={anchorIso}
                    weekStart={weekStart}
                    onPick={(iso) => {
                      onNavigate(iso);
                      setJumpOpen(false);
                    }}
                  />
                </div>
              </>
            )}
            <IconButton
              icon={ChevronRight}
              label={BOARD_NEXT_WEEK_LABEL}
              onClick={() => onNavigate(shiftDays(week[0], 7))}
            />
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ComponentSize.Sm}
              disabled={isCurrentWeek}
              onClick={() => onNavigate(todayLocalIso())}
              // The source recipe's px-space-md token never resolved —
              // px-0 py-1 reproduces its rendered padding exactly.
              className="px-0 py-1 text-text"
            >
              {BOARD_THIS_WEEK_LABEL}
            </Button>
            <Button
              type="button"
              onClick={onAddTask}
              className="ml-2 rounded-lg px-3 font-medium"
            >
              {ADD_TASK_LABEL}
            </Button>
          </div>
          <p className="text-sm text-text-muted">
            {taskCountLabel(totals.count)} ·{" "}
            {dayTotalsLabel(totals.estimated, totals.spent)}
          </p>
        </>
      }
    />
  );
}

export type { BoardHeaderProps };
