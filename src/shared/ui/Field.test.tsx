import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { Field } from "./Field";
import { Input } from "./Input";
import { ERROR_TEXT } from "./styles";

const LABEL = "Task title";
const ERROR_MESSAGE = "Title is required";
const FIELD_NAME = "title";
const TYPED_VALUE = "Write report";
const SUBMIT_LABEL = "Save";

type FormValues = Record<typeof FIELD_NAME, string>;

const control = () => screen.getByLabelText(LABEL);

function renderField({ invalid = false }: { invalid?: boolean } = {}) {
  return render(
    <Field.Root invalid={invalid}>
      <Field.Label>{LABEL}</Field.Label>
      <Field.Control render={<Input />} name={FIELD_NAME} />
      {/* Externally-driven errors (react-hook-form) own the visibility
          gate: match={true} renders whenever mounted, so callers mount
          the Error only when a message exists — Base UI's `invalid` prop
          marks the control but does not auto-show Error. */}
      {invalid && <Field.Error match={true}>{ERROR_MESSAGE}</Field.Error>}
    </Field.Root>,
  );
}

describe("Field", () => {
  it("associates the label with the control", () => {
    renderField();
    expect(control()).toBeInTheDocument();
  });

  it("lays out the parts as a vertical field stack", () => {
    const { container } = renderField();
    expect(container.firstChild).toHaveClass("flex", "flex-col", "gap-1.5");
  });

  it("applies the muted label recipe", () => {
    renderField();
    expect(screen.getByText(LABEL)).toHaveClass(
      "text-xs",
      "font-medium",
      "text-text-muted",
    );
  });

  it("exposes the error as an alert referenced by the control", () => {
    renderField({ invalid: true });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(ERROR_MESSAGE);
    expect(alert).toHaveClass(...ERROR_TEXT.split(" "));
    expect(control()).toHaveAttribute("aria-invalid", "true");
    expect(control().getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("renders no alert while the field is valid", () => {
    renderField();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(control()).not.toHaveAttribute("aria-invalid");
  });

  it("merges a caller className onto each styled part", () => {
    render(
      <Field.Root className="gap-4">
        <Field.Label className="text-sm">{LABEL}</Field.Label>
        <Field.Control render={<Input />} />
        <Field.Error className="italic" match={true}>
          {ERROR_MESSAGE}
        </Field.Error>
      </Field.Root>,
    );
    const el = control();
    expect(el.parentElement).toHaveClass("gap-4");
    expect(el.parentElement).not.toHaveClass("gap-1.5");
    expect(screen.getByText(LABEL)).toHaveClass("text-sm");
    expect(screen.getByRole("alert")).toHaveClass("italic");
  });

  it("supports a Base UI state-callback className on styled parts", () => {
    render(
      <Field.Root
        invalid
        className={(state) => (state.valid === false ? "ring-1" : undefined)}
      >
        <Field.Label>{LABEL}</Field.Label>
        <Field.Control render={<Input />} />
      </Field.Root>,
    );
    expect(control().parentElement).toHaveClass("ring-1", "flex");
  });

  it("forwards ref to the input rendered through the render prop", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Field.Root>
        <Field.Label>{LABEL}</Field.Label>
        <Field.Control render={<Input />} ref={ref} />
      </Field.Root>,
    );
    expect(ref.current).toBe(control());
  });

  it("wires react-hook-form register through the control", async () => {
    const onSubmit = vi.fn();
    const refSpy = vi.fn();
    function Harness() {
      const { register, handleSubmit } = useForm<FormValues>();
      const registration = register(FIELD_NAME);
      return (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Field.Root>
            <Field.Label>{LABEL}</Field.Label>
            <Field.Control
              render={<Input />}
              name={registration.name}
              onChange={registration.onChange}
              onBlur={registration.onBlur}
              ref={(el) => {
                registration.ref(el);
                refSpy(el);
              }}
            />
          </Field.Root>
          <button type="submit">{SUBMIT_LABEL}</button>
        </form>
      );
    }
    render(<Harness />);

    // The registration ref must reach the rendered <input> through the
    // render prop merge — a swallowed ref breaks RHF focus-on-error.
    expect(refSpy).toHaveBeenCalledWith(control());

    fireEvent.change(control(), { target: { value: TYPED_VALUE } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual({ [FIELD_NAME]: TYPED_VALUE });
  });
});
