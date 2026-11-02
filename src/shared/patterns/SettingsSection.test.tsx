import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsSection } from "./SettingsSection";

const TITLE = "Daily threshold";
const DESCRIPTION = "Tint columns over the limit";
const CHILD_TEXT = "Section body";

const region = () => screen.getByRole("region", { name: TITLE });
const heading = () => screen.getByRole("heading", { level: 2, name: TITLE });

describe("SettingsSection", () => {
  it("renders the title as a level-2 heading", () => {
    render(
      <SettingsSection title={TITLE}>
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    expect(heading()).toBeInTheDocument();
  });

  it("exposes the section as a region named by its heading", () => {
    render(
      <SettingsSection title={TITLE}>
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    expect(region()).toBeInTheDocument();
    // aria-labelledby resolves to the heading's own id.
    expect(region().getAttribute("aria-labelledby")).toBe(heading().id);
  });

  it("uses the given id for the heading and aria-labelledby", () => {
    const HEADING_ID = "threshold-heading";
    render(
      <SettingsSection id={HEADING_ID} title={TITLE}>
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    expect(heading()).toHaveAttribute("id", HEADING_ID);
    expect(region()).toHaveAttribute("aria-labelledby", HEADING_ID);
  });

  it("renders the description as muted text", () => {
    render(
      <SettingsSection title={TITLE} description={DESCRIPTION}>
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    expect(screen.getByText(DESCRIPTION)).toHaveClass(
      "text-sm",
      "text-text-muted",
    );
  });

  it("omits the description when none is given", () => {
    render(
      <SettingsSection title={TITLE}>
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument();
  });

  it("renders children as the section body", () => {
    render(
      <SettingsSection title={TITLE}>
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    const body = screen.getByText(CHILD_TEXT);
    expect(body).toBeInTheDocument();
    expect(region()).toContainElement(body);
  });

  it("merges caller className last on the section", () => {
    render(
      <SettingsSection title={TITLE} className="flex flex-col gap-3">
        <p>{CHILD_TEXT}</p>
      </SettingsSection>,
    );
    expect(region()).toHaveClass("flex", "flex-col", "gap-3");
  });
});
