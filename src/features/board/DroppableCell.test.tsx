import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DroppableCell } from "./DroppableCell";

describe("DroppableCell", () => {
  it("renders its children inside a cell", () => {
    render(
      <DndContext>
        <table>
          <tbody>
            <tr>
              <DroppableCell id="2026-11-02|todo">
                <span>cell child</span>
              </DroppableCell>
            </tr>
          </tbody>
        </table>
      </DndContext>,
    );
    expect(screen.getByText("cell child")).toBeInTheDocument();
    expect(screen.getByRole("cell")).toContainElement(
      screen.getByText("cell child"),
    );
  });
});
