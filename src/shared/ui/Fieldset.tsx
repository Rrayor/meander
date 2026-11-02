/* eslint-disable react-refresh/only-export-components -- the assembled
   Fieldset part namespace (Fieldset.Root/Legend) is the public API surface
   mirroring @base-ui/react/fieldset; it is not itself a component. */
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";

import { mergePartClassName } from "./styles";

import type {
  FieldsetLegendProps as BaseFieldsetLegendProps,
  FieldsetRootProps as BaseFieldsetRootProps,
} from "@base-ui/react/fieldset";

// Root stays a pass-through: call sites set their own layout (stacked
// radio groups, bordered chip rows, mt-N settings sections share no common
// recipe). Legend defaults to the same muted-caption look as Field.Label;
// call sites with heading-style or sr-only legends override via className.
type FieldsetRootProps = BaseFieldsetRootProps;

export function FieldsetRoot(props: Readonly<FieldsetRootProps>) {
  return <BaseFieldset.Root {...props} />;
}

type FieldsetLegendProps = BaseFieldsetLegendProps;

export function FieldsetLegend({
  className,
  ...rest
}: Readonly<FieldsetLegendProps>) {
  return (
    <BaseFieldset.Legend
      className={mergePartClassName(
        "text-xs font-medium text-text-muted",
        className,
      )}
      {...rest}
    />
  );
}

export const Fieldset = {
  Root: FieldsetRoot,
  Legend: FieldsetLegend,
};

export type { FieldsetLegendProps, FieldsetRootProps };
