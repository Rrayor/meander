import { CALENDAR_NEXT_LABEL, CALENDAR_PREVIOUS_LABEL } from "@/lib/labels";
import { monthLabel } from "@/lib/calendar";

interface MonthNavProps {
  // Epoch ms of the displayed month's first day.
  month: number;
  onShift: (delta: number) => void;
  nextDisabled?: boolean;
}

export function MonthNav({
  month,
  onShift,
  nextDisabled,
}: Readonly<MonthNavProps>) {
  const d = new Date(month);
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-text">
        {monthLabel(d.getUTCFullYear(), d.getUTCMonth())}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={CALENDAR_PREVIOUS_LABEL}
          onClick={() => onShift(-1)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={CALENDAR_NEXT_LABEL}
          onClick={() => onShift(1)}
          disabled={nextDisabled}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}
