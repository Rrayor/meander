import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { SideNav } from "@/components/layout/SideNav";

describe("SideNav", () => {
  it("marks the active route", () => {
    render(
      <MemoryRouter initialEntries={["/backlog"]}>
        <SideNav />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    expect(nav).toBeInTheDocument();

    const backlog = screen.getByRole("link", { name: "Backlog" });
    expect(backlog).toHaveAttribute("aria-current", "page");

    const board = screen.getByRole("link", { name: "Board" });
    expect(board).not.toHaveAttribute("aria-current");
  });
});
