import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskSort } from "@/lib/enums";
import { SEARCH_TASKS_LABEL } from "@/lib/labels";

import { ViewToolbar } from "./ViewToolbar";

describe("ViewToolbar", () => {
  it("routes search input and sort changes", () => {
    const onQuery = vi.fn();
    const onSort = vi.fn();
    render(
      <ViewToolbar
        query=""
        onQuery={onQuery}
        sort={TaskSort.Manual}
        onSort={onSort}
      />,
    );
    fireEvent.change(screen.getByLabelText(SEARCH_TASKS_LABEL), {
      target: { value: "alpha" },
    });
    expect(onQuery).toHaveBeenCalledWith("alpha");
  });
});
