import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  PAGINATION_LABEL,
  PAGINATION_NEXT_LABEL,
  PAGINATION_PREVIOUS_LABEL,
  pageXOfYLabel,
} from "@/lib/labels";

export function Pagination({
  page,
  pageCount,
  onPage,
}: Readonly<{
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}>) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label={PAGINATION_LABEL}
      className="flex items-center justify-end gap-1 pt-3"
    >
      <button
        type="button"
        aria-label={PAGINATION_PREVIOUS_LABEL}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs text-text-muted">
        {pageXOfYLabel(page + 1, pageCount)}
      </span>
      <button
        type="button"
        aria-label={PAGINATION_NEXT_LABEL}
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
