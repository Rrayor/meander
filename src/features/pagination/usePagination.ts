import { useState } from "react";

import { PAGE_SIZE } from "@/lib/labels";

/// Slices a list into 50-item pages (spec §205/§224). `resetKey` scopes
/// the stored page — a different key (e.g. a profile switch refetching
/// the list) reads as page zero instead of opening midway through.
/// The index also clamps against the live item count.
export function usePagination<T>(
  items: readonly T[] | undefined,
  resetKey?: unknown,
) {
  const [requested, setRequested] = useState({ key: resetKey, page: 0 });
  const count = items?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const stored = requested.key === resetKey ? requested.page : 0;
  const page = Math.min(stored, pageCount - 1);

  return {
    page,
    pageCount,
    setPage: (next: number) => setRequested({ key: resetKey, page: next }),
    pageItems: items?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
  };
}
