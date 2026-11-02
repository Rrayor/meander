import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";

const TITLE = "No categories yet";
const DESCRIPTION = "Create one to organize tasks";
const ACTION_LABEL = "Add category";

describe("EmptyState", () => {
  it("renders the title as muted centered text", () => {
    render(<EmptyState title={TITLE} />);
    expect(screen.getByText(TITLE)).toHaveClass("text-sm", "text-text-muted");
  });

  it("renders the centered block container", () => {
    render(<EmptyState title={TITLE} />);
    const container = screen.getByText(TITLE).parentElement;
    expect(container).toHaveClass(
      "flex",
      "flex-col",
      "items-center",
      "justify-center",
      "text-center",
      "py-12",
    );
  });

  it("renders the description when given", () => {
    render(<EmptyState title={TITLE} description={DESCRIPTION} />);
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
  });

  it("omits the description when none is given", () => {
    render(<EmptyState title={TITLE} />);
    expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument();
  });

  it("renders the icon hidden from assistive tech when given", () => {
    render(<EmptyState title={TITLE} icon={Inbox} />);
    const icon = screen.getByText(TITLE).parentElement!.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no icon when none is given", () => {
    render(<EmptyState title={TITLE} />);
    expect(
      screen.getByText(TITLE).parentElement!.querySelector("svg"),
    ).toBeNull();
  });

  it("renders the action slot", () => {
    render(
      <EmptyState
        title={TITLE}
        action={<button type="button">{ACTION_LABEL}</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: ACTION_LABEL }),
    ).toBeInTheDocument();
  });

  it("renders no action when none is given", () => {
    render(<EmptyState title={TITLE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("merges caller className last on the container", () => {
    render(<EmptyState title={TITLE} className="h-full" />);
    expect(screen.getByText(TITLE).parentElement).toHaveClass(
      "h-full",
      "py-12",
    );
  });
});
