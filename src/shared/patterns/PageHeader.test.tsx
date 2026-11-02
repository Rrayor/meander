import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

const TITLE = "Settings";
const DESCRIPTION = "Tasks waiting to be planned";
const ACTION_LABEL = "Add task";

const banner = () => screen.getByRole("banner");
const heading = () => screen.getByRole("heading", { level: 1, name: TITLE });

describe("PageHeader", () => {
  it("renders the title as the level-1 heading", () => {
    render(<PageHeader title={TITLE} />);
    expect(heading()).toBeInTheDocument();
  });

  it("names the header landmark after the title", () => {
    render(<PageHeader title={TITLE} />);
    expect(heading()).toHaveAccessibleName(TITLE);
  });

  it("keeps the shared h1 recipe", () => {
    render(<PageHeader title={TITLE} />);
    expect(heading()).toHaveClass(
      "text-2xl",
      "font-semibold",
      "tracking-tight",
      "text-text",
    );
  });

  it("keeps the shared header chrome", () => {
    render(<PageHeader title={TITLE} />);
    expect(banner()).toHaveClass(
      "flex",
      "items-center",
      "border-b",
      "border-border",
      "px-6",
      "py-3",
    );
  });

  it("renders the heading as a direct header child when no description is given", () => {
    render(<PageHeader title={TITLE} />);
    // SettingsPage parity: no wrapping <div> around the bare <h1>.
    expect(heading().parentElement).toBe(banner());
  });

  it("renders the description under the title inside a shared wrapper", () => {
    render(<PageHeader title={TITLE} description={DESCRIPTION} />);
    const description = screen.getByText(DESCRIPTION);
    expect(description).toHaveClass("text-sm", "text-text-muted");
    // CategoriesPage/BacklogPage parity: <div><h1/><p/></div>.
    const wrapper = heading().parentElement;
    expect(wrapper).not.toBe(banner());
    expect(wrapper).toContainElement(description);
    expect(wrapper!.parentElement).toBe(banner());
  });

  it("omits the description text when none is given", () => {
    render(<PageHeader title={TITLE} />);
    expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument();
  });

  it("renders the actions slot as a trailing header child", () => {
    render(
      <PageHeader
        title={TITLE}
        actions={
          <div className="ml-auto flex items-center gap-2">
            <button type="button">{ACTION_LABEL}</button>
          </div>
        }
      />,
    );
    const action = screen.getByRole("button", { name: ACTION_LABEL });
    expect(action).toBeInTheDocument();
    expect(action.parentElement!.parentElement).toBe(banner());
  });

  it("renders no actions container when actions are omitted", () => {
    render(<PageHeader title={TITLE} />);
    // Only the bare heading is inside the header.
    expect(banner().childElementCount).toBe(1);
    expect(banner()).toContainElement(heading());
  });

  it("merges caller className last on the header", () => {
    render(<PageHeader title={TITLE} className="justify-between" />);
    expect(banner()).toHaveClass("justify-between", "border-b");
  });
});
