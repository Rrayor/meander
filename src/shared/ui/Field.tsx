/* eslint-disable react-refresh/only-export-components -- the assembled
   Field part namespace (Field.Root/Label/Control/Error) is the public API
   surface mirroring @base-ui/react/field; it is not itself a component. */
import { Field as BaseField } from "@base-ui/react/field";

import { ERROR_TEXT, mergePartClassName } from "./styles";

import type {
  FieldControlProps as BaseFieldControlProps,
  FieldErrorProps as BaseFieldErrorProps,
  FieldLabelProps as BaseFieldLabelProps,
  FieldRootProps as BaseFieldRootProps,
} from "@base-ui/react/field";

// Part recipes consolidate the per-field markup repeated at ~40 form call
// sites (e.g. EditTaskDialog rows): a vertical stack wrapper, a muted
// caption label, and a role="alert" error line. Control stays a pure
// wiring part — it carries no recipe because visuals live on the styled
// render target (Input, Textarea, …) supplied via its `render` prop.
type FieldRootProps = BaseFieldRootProps;

export function FieldRoot({ className, ...rest }: Readonly<FieldRootProps>) {
  return (
    <BaseField.Root
      className={mergePartClassName("flex flex-col gap-1.5", className)}
      {...rest}
    />
  );
}

type FieldLabelProps = BaseFieldLabelProps;

export function FieldLabel({ className, ...rest }: Readonly<FieldLabelProps>) {
  return (
    <BaseField.Label
      className={mergePartClassName(
        "text-xs font-medium text-text-muted",
        className,
      )}
      {...rest}
    />
  );
}

type FieldControlProps = BaseFieldControlProps;

export function FieldControl(props: Readonly<FieldControlProps>) {
  return <BaseField.Control {...props} />;
}

type FieldErrorProps = BaseFieldErrorProps;

// Base UI mounts Error on computed validity (native constraints,
// `validate`, Form errors) — the `invalid` prop alone marks the control
// but does not show it. Externally-driven errors (react-hook-form) own
// the gate: mount conditionally with `match={true}`.
export function FieldError({ className, ...rest }: Readonly<FieldErrorProps>) {
  return (
    <BaseField.Error
      role="alert"
      className={mergePartClassName(ERROR_TEXT, className)}
      {...rest}
    />
  );
}

export const Field = {
  Root: FieldRoot,
  Label: FieldLabel,
  Control: FieldControl,
  Error: FieldError,
};

export type {
  FieldControlProps,
  FieldErrorProps,
  FieldLabelProps,
  FieldRootProps,
};
