import { ChevronLeft, ChevronRight } from "lucide-react";

import { usePagination } from "../hooks/usePagination";

import type { ReactNode } from "react";

// Copy is caller-supplied — shared/patterns must not import lib/labels.
// The pages pass the PAGINATION_* labels / pageXOfYLabel through.
interface PaginationProps {
  page: number;
  pageCount: number;
  onPage(page: number): void;
  /** Accessible name for the nav landmark. */
  navLabel: string;
  /** Accessible name for the previous-page button. */
  previousLabel: string;
  /** Accessible name for the next-page button. */
  nextLabel: string;
  /** Formats the indicator from the 1-based page and the page count. */
  formatPageIndicator(page: number, count: number): string;
}

export function Pagination({
  page,
  pageCount,
  onPage,
  navLabel,
  previousLabel,
  nextLabel,
  formatPageIndicator,
}: Readonly<PaginationProps>) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label={navLabel}
      className="flex items-center justify-end gap-1 pt-3"
    >
      <button
        type="button"
        aria-label={previousLabel}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs text-text-muted">
        {formatPageIndicator(page + 1, pageCount)}
      </span>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

interface PagedProps<T> {
  items: readonly T[] | undefined;
  navLabel: string;
  previousLabel: string;
  nextLabel: string;
  formatPageIndicator(page: number, count: number): string;
  children: (pageItems: readonly T[] | undefined) => ReactNode;
}

/// Keyed boundary for the paged region — render it with key={owner id}
/// (e.g. the profile id) so a context switch remounts the hook and the
/// list reopens on page one instead of restoring a stale page.
export function Paged<T>({
  items,
  navLabel,
  previousLabel,
  nextLabel,
  formatPageIndicator,
  children,
}: Readonly<PagedProps<T>>) {
  const { pageItems, page, pageCount, setPage } = usePagination(items);
  return (
    <>
      {children(pageItems)}
      <Pagination
        page={page}
        pageCount={pageCount}
        onPage={setPage}
        navLabel={navLabel}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        formatPageIndicator={formatPageIndicator}
      />
    </>
  );
}
