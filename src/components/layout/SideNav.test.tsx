import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { SideNav } from "@/components/layout/SideNav";
import { ROUTES } from "@/lib/routes";

describe("SideNav", () => {
  it("marks the active route", () => {
    const [active, inactive] = ROUTES.slice(1);

    render(
      <MemoryRouter initialEntries={[active.path]}>
        <SideNav />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    expect(nav).toBeInTheDocument();

    const activeLink = screen.getByRole("link", { name: active.label });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    const inactiveLink = screen.getByRole("link", { name: inactive.label });
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });
});
