import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { z } from "zod";

import type { Category } from "@/api/categories";
import { listCategories } from "@/api/categories";
import { MAX_TASK_DESCRIPTION_LENGTH } from "@/api/tasks";
import { TaskFormFields } from "@/features/tasks/TaskFormFields";
import {
  ESTIMATE_DURATION_FIELDS,
  refineDurationRange,
  taskFieldSchemas,
} from "@/features/tasks/formSchema";
import type { TaskFormValues } from "@/features/tasks/formSchema";
import {
  DURATION_RANGE_MESSAGE,
  TASK_DESCRIPTION_TOO_LONG_MESSAGE,
} from "@/lib/errors";
import { CarryOverRule } from "@/lib/enums";
import {
  CARRY_OVER_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  DESCRIPTION_PLACEHOLDER,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  TITLE_PLACEHOLDER,
  TITLE_REQUIRED_MESSAGE,
} from "@/lib/labels";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
}));

const ID_PREFIX = "test-task";
const TITLE_VALUE = "Write tests";
const DESCRIPTION_VALUE = "Some context";
const SUBMIT_LABEL = "Save";
const COMPANION_TEST_ID = "spent-companion";
const CHILD_TEST_ID = "status-slot";

// The same composition NewTaskDialog builds — exercising the exported
// schema pieces keeps the test wired to production code, not a copy.
const schema = z
  .object(taskFieldSchemas)
  .superRefine(({ estHours, estMinutes }, ctx) => {
    refineDurationRange(
      estHours,
      estMinutes,
      ESTIMATE_DURATION_FIELDS,
      DURATION_RANGE_MESSAGE,
      ctx,
    );
  });

interface HarnessProps {
  disabled?: boolean;
  estimateCompanion?: ReactNode;
  children?: ReactNode;
  onSubmit?: (values: TaskFormValues) => void;
}

function Harness({
  disabled,
  estimateCompanion,
  children,
  onSubmit = vi.fn(),
}: Readonly<HarnessProps>) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      title: "",
      description: "",
      estHours: "",
      estMinutes: "",
      carryOver: CarryOverRule.Ask,
    },
  });
  const [categories, setCategories] = useState<Category[]>([]);
  return (
    <QueryClientProvider client={testQueryClient()}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <TaskFormFields
          idPrefix={ID_PREFIX}
          register={register}
          control={control}
          errors={errors}
          categories={categories}
          onCategoriesChange={setCategories}
          disabled={disabled}
          titlePlaceholder={TITLE_PLACEHOLDER}
          descriptionPlaceholder={DESCRIPTION_PLACEHOLDER}
          estimateCompanion={estimateCompanion}
        >
          {children}
        </TaskFormFields>
        <button type="submit">{SUBMIT_LABEL}</button>
      </form>
    </QueryClientProvider>
  );
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

describe("TaskFormFields", () => {
  beforeEach(() => {
    vi.mocked(listCategories)
      .mockReset()
      .mockResolvedValue([categoryFixture()]);
  });

  it("renders the shared field block with the parity ids", () => {
    render(<Harness />);

    expect(screen.getByPlaceholderText(TITLE_PLACEHOLDER)).toHaveAttribute(
      "id",
      `${ID_PREFIX}-title-input`,
    );
    expect(
      screen.getByPlaceholderText(DESCRIPTION_PLACEHOLDER),
    ).toHaveAttribute("id", `${ID_PREFIX}-description`);
    expect(screen.getByLabelText(ESTIMATED_HOURS_LABEL)).toHaveAttribute(
      "id",
      `${ID_PREFIX}-est-hours`,
    );
    expect(screen.getByLabelText(ESTIMATED_MINUTES_LABEL)).toHaveAttribute(
      "id",
      `${ID_PREFIX}-est-minutes`,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", {
      name: CARRY_OVER_FIELD_LABEL,
    });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(
      CARRY_OVER_OPTIONS.length,
    );
    expect(screen.getByRole("radio", { name: "Ask" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("submits the registered values including the picked carry-over", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: DESCRIPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(ESTIMATED_HOURS_LABEL), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText(ESTIMATED_MINUTES_LABEL), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Carry over" }));
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: TITLE_VALUE,
      description: DESCRIPTION_VALUE,
      estHours: "1",
      estMinutes: "30",
      carryOver: CarryOverRule.Carry,
    });
  });

  it("surfaces the title error as an alert referenced by the input", async () => {
    render(<Harness />);
    const title = screen.getByLabelText(/Title/);
    fireEvent.focus(title);
    fireEvent.blur(title);

    const alert = await screen.findByText(TITLE_REQUIRED_MESSAGE);
    expect(alert).toHaveAttribute("id", `${ID_PREFIX}-title-error`);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("surfaces the description error as an alert referenced by the input", async () => {
    render(<Harness />);
    const description = screen.getByLabelText(/Description/);
    fireEvent.change(description, {
      target: { value: "x".repeat(MAX_TASK_DESCRIPTION_LENGTH + 1) },
    });
    fireEvent.blur(description);

    const alert = await screen.findByText(TASK_DESCRIPTION_TOO_LONG_MESSAGE);
    expect(alert).toHaveAttribute("id", `${ID_PREFIX}-description-error`);
    expect(description.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("shares one estimate alert between the hours and minutes inputs", async () => {
    render(<Harness />);
    const hours = screen.getByLabelText(ESTIMATED_HOURS_LABEL);
    fireEvent.change(hours, { target: { value: "30" } });
    fireEvent.blur(hours);

    const alert = await screen.findByText(DURATION_RANGE_MESSAGE);
    expect(alert).toHaveAttribute("id", `${ID_PREFIX}-estimate-error`);
    for (const label of [ESTIMATED_HOURS_LABEL, ESTIMATED_MINUTES_LABEL]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    }
  });

  it("disables every field when the form is locked", () => {
    render(<Harness disabled />);

    expect(screen.getByLabelText(/Title/)).toBeDisabled();
    expect(screen.getByLabelText(/Description/)).toBeDisabled();
    expect(screen.getByLabelText(ESTIMATED_HOURS_LABEL)).toBeDisabled();
    expect(screen.getByLabelText(ESTIMATED_MINUTES_LABEL)).toBeDisabled();
    for (const { label } of CARRY_OVER_OPTIONS) {
      expect(screen.getByRole("radio", { name: label })).toHaveAttribute(
        "data-disabled",
      );
    }
  });

  it("renders the estimate companion beside it and children before carry-over", () => {
    render(
      <Harness estimateCompanion={<div data-testid={COMPANION_TEST_ID} />}>
        <div data-testid={CHILD_TEST_ID} />
      </Harness>,
    );

    const companion = screen.getByTestId(COMPANION_TEST_ID);
    expect(companion.parentElement).toHaveClass("grid", "grid-cols-2");
    // The slot lands between the duration row and the carry-over group.
    const child = screen.getByTestId(CHILD_TEST_ID);
    const group = screen.getByRole("radiogroup", {
      name: CARRY_OVER_FIELD_LABEL,
    });
    expect(
      child.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
