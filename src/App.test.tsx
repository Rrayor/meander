import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the demo screen", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Meander" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "It works" })).toBeInTheDocument();
});
