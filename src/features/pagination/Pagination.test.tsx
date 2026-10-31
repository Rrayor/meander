import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PAGE_SIZE,
  PAGINATION_LABEL,
  PAGINATION_NEXT_LABEL,
  PAGINATION_PREVIOUS_LABEL,
  pageXOfYLabel,
} from "@/lib/labels";

import { Pagination, Paged } from "./Pagination";

const nav = () => screen.getByRole("navigation", { name: PAGINATION_LABEL });

describe("Pagination", () => {
  it("shows the current page indicator and navigates", () => {
    const onPage = vi.fn();
    render(<Pagination page={0} pageCount={3} onPage={onPage} />);
    expect(nav()).toHaveTextContent(pageXOfYLabel(1, 3));
    fireEvent.click(
      screen.getByRole("button", { name: PAGINATION_NEXT_LABEL }),
    );
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("reports previous-page clicks from a later page", () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pageCount={3} onPage={onPage} />);
    fireEvent.click(
      screen.getByRole("button", { name: PAGINATION_PREVIOUS_LABEL }),
    );
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("disables previous on the first page and next on the last", () => {
    const { rerender } = render(
      <Pagination page={0} pageCount={2} onPage={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: PAGINATION_PREVIOUS_LABEL }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: PAGINATION_NEXT_LABEL }),
    ).toBeEnabled();
    rerender(<Pagination page={1} pageCount={2} onPage={() => {}} />);
    expect(
      screen.getByRole("button", { name: PAGINATION_NEXT_LABEL }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: PAGINATION_PREVIOUS_LABEL }),
    ).toBeEnabled();
  });

  it("renders nothing for a single page", () => {
    const { container } = render(
      <Pagination page={0} pageCount={1} onPage={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Paged", () => {
  const items = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => `i${i}`);

  it("slices children to the first page and paginates", () => {
    render(
      <Paged items={items}>
        {(pageItems) => (
          <ul>
            {pageItems?.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </Paged>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(PAGE_SIZE);
    fireEvent.click(
      screen.getByRole("button", { name: PAGINATION_NEXT_LABEL }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(nav()).toHaveTextContent(pageXOfYLabel(2, 2));
  });
});
