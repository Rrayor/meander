import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PAGE_SIZE } from "@/lib/constants";

import { Pagination, Paged } from "./Pagination";

// Test-owned copy — the component takes all labels as props, so the
// assertions check the props are applied, not any particular wording.
const NAV_LABEL = "Result pages";
const PREVIOUS_LABEL = "Back a page";
const NEXT_LABEL = "Forward a page";
const formatPageIndicator = (page: number, count: number) =>
  `${page} / ${count}`;

const LABEL_PROPS = {
  navLabel: NAV_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
  formatPageIndicator,
};

const nav = () => screen.getByRole("navigation", { name: NAV_LABEL });

describe("Pagination", () => {
  it("shows the current page indicator and navigates", () => {
    const onPage = vi.fn();
    render(
      <Pagination page={0} pageCount={3} onPage={onPage} {...LABEL_PROPS} />,
    );
    expect(nav()).toHaveTextContent(formatPageIndicator(1, 3));
    fireEvent.click(screen.getByRole("button", { name: NEXT_LABEL }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("reports previous-page clicks from a later page", () => {
    const onPage = vi.fn();
    render(
      <Pagination page={2} pageCount={3} onPage={onPage} {...LABEL_PROPS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: PREVIOUS_LABEL }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("disables previous on the first page and next on the last", () => {
    const { rerender } = render(
      <Pagination page={0} pageCount={2} onPage={() => {}} {...LABEL_PROPS} />,
    );
    expect(screen.getByRole("button", { name: PREVIOUS_LABEL })).toBeDisabled();
    expect(screen.getByRole("button", { name: NEXT_LABEL })).toBeEnabled();
    rerender(
      <Pagination page={1} pageCount={2} onPage={() => {}} {...LABEL_PROPS} />,
    );
    expect(screen.getByRole("button", { name: NEXT_LABEL })).toBeDisabled();
    expect(screen.getByRole("button", { name: PREVIOUS_LABEL })).toBeEnabled();
  });

  it("renders nothing for a single page", () => {
    const { container } = render(
      <Pagination page={0} pageCount={1} onPage={() => {}} {...LABEL_PROPS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Paged", () => {
  const items = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => `i${i}`);

  it("slices children to the first page and paginates", () => {
    render(
      <Paged items={items} {...LABEL_PROPS}>
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
    fireEvent.click(screen.getByRole("button", { name: NEXT_LABEL }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(nav()).toHaveTextContent(formatPageIndicator(2, 2));
  });
});
