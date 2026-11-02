import { ButtonVariant, ComponentSize, TaskScope } from "@/lib/enums";
import {
  DELETE_BUTTON_LABEL,
  DELETE_KEEP_LABEL,
  DELETE_SCOPE_FUTURE_LABEL,
  DELETE_TASK_HEADING,
  DELETE_UNDO_WARNING,
  TASK_SCOPE_INSTANCE_LABEL,
  TASK_SCOPE_SERIES_LABEL,
} from "@/lib/labels";
import { Button } from "@/shared/ui/Button";
import { Fieldset } from "@/shared/ui/Fieldset";
import { RadioGroup } from "@/shared/ui/RadioGroup";

interface DeleteConfirmPanelProps {
  isSeries: boolean;
  pendingIso: string | null;
  scheduledDate: string | null;
  deleteScope: TaskScope;
  error: string | null | undefined;
  deleting: boolean;
  onScopeChange: (scope: TaskScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

// An inline confirm panel inside the details view — not a stacked modal.
export function DeleteConfirmPanel({
  isSeries,
  pendingIso,
  scheduledDate,
  deleteScope,
  error,
  deleting,
  onScopeChange,
  onCancel,
  onConfirm,
}: Readonly<DeleteConfirmPanelProps>) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface-raised/60 p-4">
      <h3 className="text-sm font-semibold text-danger">
        {DELETE_TASK_HEADING}
      </h3>
      {isSeries && (
        <Fieldset.Root>
          <RadioGroup.Root
            className="flex-col items-stretch gap-2"
            value={deleteScope}
            onValueChange={onScopeChange}
          >
            {[
              {
                value: TaskScope.Instance,
                label: TASK_SCOPE_INSTANCE_LABEL,
                shown: pendingIso === null,
              },
              {
                value: TaskScope.Series,
                label: TASK_SCOPE_SERIES_LABEL,
                shown: true,
              },
              {
                value: TaskScope.Future,
                label: DELETE_SCOPE_FUTURE_LABEL,
                shown: (pendingIso ?? scheduledDate) !== null,
              },
            ]
              .filter(({ shown }) => shown)
              .map(({ value, label }) => (
                <RadioGroup.Radio
                  key={value}
                  value={value}
                  className="group flex items-center gap-2 text-sm text-text"
                >
                  {/* Circle + mounted-on-check dot mirrors the native
                      accent-danger radio this replaces. */}
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-border group-data-[checked]:border-danger"
                  >
                    <RadioGroup.RadioIndicator className="h-2 w-2 rounded-full bg-danger" />
                  </span>
                  {label}
                </RadioGroup.Radio>
              ))}
          </RadioGroup.Root>
        </Fieldset.Root>
      )}
      <p className="text-xs text-text-muted">{DELETE_UNDO_WARNING}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant={ButtonVariant.Secondary}
          size={ComponentSize.Sm}
          className="px-4"
          onClick={onCancel}
        >
          {DELETE_KEEP_LABEL}
        </Button>
        <Button
          type="button"
          variant={ButtonVariant.Danger}
          size={ComponentSize.Sm}
          className="px-4"
          disabled={
            deleting ||
            (isSeries &&
              deleteScope === TaskScope.Instance &&
              pendingIso !== null)
          }
          onClick={onConfirm}
        >
          {DELETE_BUTTON_LABEL}
        </Button>
      </div>
    </div>
  );
}
