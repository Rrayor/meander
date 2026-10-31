import { useState } from "react";

import { PAGE_SIZE } from "@/lib/labels";

/// Slices a list into 50-item pages (spec §205/§224). The returned index
/// clamps against the live item count — shrinking under the current page
/// (e.g. deleting an empty last page) reads as the final page instead of
/// overflowing. Owner resets (profile switches) happen through a keyed
/// <Paged> boundary, which remounts the hook's component.
export function usePagination<T>(items: readonly T[] | undefined) {
  const [requested, setRequested] = useState(0);
  const count = items?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(requested, pageCount - 1);

  return {
    page,
    pageCount,
    setPage: setRequested,
    pageItems: items?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
  };
}
