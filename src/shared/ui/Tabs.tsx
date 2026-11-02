/* eslint-disable react-refresh/only-export-components -- the assembled
   Tabs part namespace (Tabs.Root/List/Tab/Panel) is the public API
   surface mirroring @base-ui/react/tabs; it is not itself a component. */
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "cn";

import { FOCUS_RING, mergePartClassName } from "./styles";

import type {
  TabsListProps as BaseTabsListProps,
  TabsListState,
  TabsPanelProps as BaseTabsPanelProps,
  TabsPanelState,
  TabsRootProps as BaseTabsRootProps,
  TabsTabProps as BaseTabsTabProps,
  TabsTabState,
} from "@base-ui/react/tabs";

// Recipes come verbatim from the hand-rolled `role="tablist"` in
// NotesTabs — the only tablist in the app: a bordered row of tab
// buttons whose selected member carries a primary bottom underline and
// primary text while inactive members stay muted until hover. Base UI
// mirrors the selected tab onto `data-active` (the brief's
// `data-[selected]` — the attribute this version actually emits; the
// inactive branch is scoped with `not-data-[active]:` so the hover
// colour can never fight the active colour. Focus ring and disabled
// dim match the other interactive primitives (Toggle, Radio).
const TAB_CLASSES = cn(
  "-mb-px border-b-2 pb-2 text-sm transition-colors",
  FOCUS_RING,
  "not-data-[active]:border-transparent not-data-[active]:text-text-muted not-data-[active]:hover:text-text",
  "data-[active]:border-primary data-[active]:font-medium data-[active]:text-primary",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

type TabsRootProps = BaseTabsRootProps;

// Root stays a pure wiring part — it renders a plain grouping `<div>`
// with no shared recipe; `value`/`defaultValue`/`onValueChange`,
// `orientation`, and `defaultValue`'s disabled/missing fallbacks pass
// through untouched.
export function TabsRoot(props: Readonly<TabsRootProps>) {
  return <BaseTabs.Root {...props} />;
}

type TabsListProps = BaseTabsListProps;

export function TabsList({ className, ...rest }: Readonly<TabsListProps>) {
  return (
    <BaseTabs.List
      className={mergePartClassName<TabsListState>(
        "flex gap-4 border-b border-border",
        className,
      )}
      {...rest}
    />
  );
}

type TabsTabProps = BaseTabsTabProps;

export function TabsTab({ className, ...rest }: Readonly<TabsTabProps>) {
  return (
    <BaseTabs.Tab
      className={mergePartClassName<TabsTabState>(TAB_CLASSES, className)}
      {...rest}
    />
  );
}

type TabsPanelProps = BaseTabsPanelProps;

// Panel keeps the source's `py-3` content padding as the default;
// inactive panels unmount unless the caller passes `keepMounted`.
export function TabsPanel({ className, ...rest }: Readonly<TabsPanelProps>) {
  return (
    <BaseTabs.Panel
      className={mergePartClassName<TabsPanelState>("py-3", className)}
      {...rest}
    />
  );
}

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
};

export type { TabsListProps, TabsPanelProps, TabsRootProps, TabsTabProps };
