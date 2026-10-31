import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PAGE_SIZE } from "@/lib/labels";

import { usePagination } from "./usePagination";

describe("usePagination", () => {
  it("slices the first page of a larger list", () => {
    const items = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i);
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.pageCount).toBe(2);
    expect(result.current.pageItems).toHaveLength(PAGE_SIZE);
    expect(result.current.pageItems?.[0]).toBe(0);
  });

  it("keeps exactly PAGE_SIZE items on a single page", () => {
    const { result } = renderHook(() =>
      usePagination(Array.from({ length: PAGE_SIZE }, (_, i) => i)),
    );
    expect(result.current.pageCount).toBe(1);
  });

  it("navigates and clamps past the last page", () => {
    const items = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i);
    const { result, rerender } = renderHook(() => usePagination(items));
    result.current.setPage(1);
    rerender();
    expect(result.current.pageItems).toEqual([PAGE_SIZE]);
    result.current.setPage(9);
    rerender();
    expect(result.current.page).toBe(1);
  });

  it("reads as the last page when the list shrinks under it", () => {
    let items: number[] = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i);
    const { result, rerender } = renderHook(({ data }) => usePagination(data), {
      initialProps: { data: items },
    });
    result.current.setPage(1);
    rerender({ data: items });
    items = items.slice(0, PAGE_SIZE);
    rerender({ data: items });
    expect(result.current.page).toBe(0);
    expect(result.current.pageItems).toHaveLength(PAGE_SIZE);
  });

  it("reports one empty page for an empty or absent list", () => {
    const { result } = renderHook(() => usePagination(undefined));
    expect(result.current.pageCount).toBe(1);
    expect(result.current.pageItems).toBeUndefined();
  });
});
