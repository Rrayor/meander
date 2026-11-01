# Frontend component architecture — design

Refactor the whole frontend (~7,400 LOC, ~30 non-test components) into a
layered component architecture: small single-purpose components built on a
shared primitive layer. Goal is eliminating duplication (~86 hand-rolled
`<button>`s, 5 copy-pasted modal overlays, 39 per-field `role="alert"`
implementations) and making the folder layout self-explanatory.

## Intent and why

The frontend grew without a primitive layer. Every dialog reimplements
`fixed inset-0` + `bg-black/60` + centering; every button re-types the same
Tailwind recipe; every form field re-wires label/`aria-invalid`/
`role="alert"`/`aria-describedby` by hand. `EditTaskDialog.tsx` alone is
1,797 lines holding ~10 components and 6 hooks. `components/` and
`features/` both just hold components with no rule for what goes where.
This refactor establishes the layers and the rules, and decomposes the big
files.

## User decisions

- **Primitive foundation: Base UI** (`@base-ui/react` 1.9.0, already
  installed, currently unused). Headless — ships zero styles; we style via
  `className` (string or state-function), `data-*` state attributes, and
  `render` props. It gives focus trapping, keyboard nav, and ARIA wiring
  that the hand-rolled dialogs currently reimplement badly.
- **One component with variants, not separate components.** `Button
variant="danger"`, not `<DangerButton>`. `class-variance-authority`
  (already installed, unused) generates the variant recipes.
- **Scope: the entire frontend.** The plan covers all ~30 components;
  migration workflow is decided separately after this doc.
- **Folder structure: `shared/` + `features/`** (below). Rejected the
  fuller `core/`/`domains/` split — it would just reparent `api/`/`lib/`
  without buying clarity at this size.

## Goals

- Every repeated UI pattern exists exactly once in `shared/`.
- No hand-rolled overlay/backdrop/focus-management code remains.
- No file over ~400 lines; `EditTaskDialog` decomposes into focused files.
- Folder names make the placement rule self-evident: `shared/` knows no
  domain, `features/` holds domain slices only.
- WCAG AA maintained or improved — Base UI supplies focus trap, escape
  handling, and `aria-*` wiring for free; the `Field` pattern standardizes
  `role="alert"`/`aria-invalid`/`aria-describedby`.
- Existing conventions preserved: labels registry, enums, no magic
  values, colocated tests moving with their components.

## Non-goals

- No visual redesign — same dark theme, same tokens, same layouts.
- No spec changes; `docs/specification.md` stays the source of truth and
  no behavior changes unless a hand-rolled control was buggy.
- No new features, no backend changes, no `src/api/` changes.
- No design-system tooling (Storybook etc.).

## Anti-goals

- A refactor that changes pixels. Regression risk is contained by keeping
  recipes byte-equivalent in intent — same tokens, same spacing values.
- A `ui/` layer that imports domain types, API functions, or label
  constants — primitives take everything via props.
- Decomposition for its own sake: a 40-line component used once stays
  inline in its feature file.

## Constraints

- `cn` (already a dependency) merges classes; cva recipes own variants.
- `components.json` exists for the shadcn CLI with `style: "base-nova"`
  (the Base UI preset). Its `ui` alias points at `@/components/ui`; update
  it to `@/shared/ui` so CLI scaffolding lands in the right place.
- Tests colocate (existing convention) and move with their files.
- Copy stays in `src/lib/labels.ts`; shared components receive strings
  via props — they must not import `labels.ts`.
- Validation-bound messages stay interpolated from constants (existing
  rule) — `Field` surfaces them, it does not define them.

## Approaches

1. **Base UI primitives + `shared/`/`features/` layering (chosen).**
   Behavior-free primitives stay styled natives (button, input); anything
   with interaction complexity wraps the matching Base UI part. A11y and
   keyboard semantics come from the library; styling stays 100% ours via
   existing tokens.
2. **Hand-rolled primitives.** Rejected — reimplements focus trap, escape
   handling, select keyboard nav, and ARIA we get free, and the dialog
   implementations show we don't do it well by hand.
3. **Full domain-driven split (`core/` + `shared/` + `domains/`).**
   Rejected with the user's agreement — one layer too many for 7k LOC;
   `api/` and `lib/` are already correct at top level.

Component API style also decided: variant props via cva (one `Button`)
over separate named components, per user decision.

## Folder structure

```
src/
  shared/
    ui/           # primitives — know no domain, no api/, no labels.ts
    patterns/     # composed generics — may combine ui/ pieces + lib types
    hooks/        # generic hooks (usePagination moves here)
  layout/         # app chrome — AppShell, SideNav, ProfileSwitcher
                  # (NOT under shared/: chrome legitimately owns queries,
                  # mutations and nav labels, so it lives in its own layer)
  features/
    tasks/        # TaskCard, dialogs, notes, recurrence, calendar wrapper
    board/        # board grid pieces, WeekJumpCalendar, CarryOverPrompt
    categories/   # CategoryDialog, CategoryMultiSelect
    settings/     # the settings sections
    pagination/   # gone — Pagination/Paged are generic, move to shared
    calendar/     # gone — MonthNav folds into patterns/MonthCalendar
  pages/          # thin route entries; own no primitives
  lib/            # unchanged: labels, enums, routes, utils
  api/            # unchanged: transport seam
  test/           # unchanged
```

Import direction (enforced by extending the existing eslint
`no-restricted-imports` setup):

```
shared/ui       → react, @base-ui/*, lib/enums (variant enums only)
shared/patterns → shared/ui, shared/hooks, lib
shared/hooks    → react, lib
layout          → shared/*, features (top-level files only), lib, api
features/*      → shared/*, lib, api, own slice + sibling slices'
                  ROOT-LEVEL files only (never a sibling's subdirectories —
                  e.g. features/tasks may import
                  features/categories/CategoryMultiSelect but not
                  features/categories/sub/anything)
pages           → features, shared, layout, lib, api
shared/**       → never layout/, features/, pages/, api/, lib/labels
```

Dismissal/behavior parity (builder-check clarification): migrating to Base
UI must preserve today's _observable_ semantics — regular dialogs close on
Escape and outside press (Base UI `Dialog.Root` `onOpenChange`/`modal`
config), `CarryOverPrompt` stays non-dismissible, and the layered case in
NewTaskDialog (Escape closes the inner dropdown, not the dialog) is kept.
Tests asserting observable behavior survive; tests coupled to
implementation details (native `<select>` `selectOption`, fireEvent on
internals) are rewritten during migration — that's expected scope.

## Component types

- **Page** — one per route (`BoardPage`, `BacklogPage`, `CategoriesPage`,
  `SettingsPage`). Composes features + patterns + layout; owns route-level
  state and query wiring; renders no raw styled elements of its own.
- **Layout** — app chrome (`AppShell`, `SideNav`, `ProfileSwitcher`) in
  top-level `src/layout/`. Unlike `shared/` pieces it may own queries and
  labels — `ProfileSwitcher` already wires profile queries + mutations +
  cache resets and moving that orchestration out would buy nothing.
- **Primitive (`shared/ui/`)** — styled Base UI part or styled native
  element. Props only; no domain knowledge; variants via cva.
- **Pattern (`shared/patterns/`)** — composed generic that still knows no
  domain: a `ConfirmDialog` wrapping `AlertDialog` + two `Button`s.
- **Feature component** — domain-aware: touches `api/`, domain types, or
  label constants. Lives in `features/<domain>/`.
- **Hook** — generic reusable logic in `shared/hooks/`; domain logic as
  `*.ts` beside its feature slice.

## Component catalog

### shared/ui — primitives

All accept standard `className` (merged via `cn`) and forward native/
Base UI props. Sizes: `sm | md` where applicable.

| Component                | Base                                              | Props (beyond native/passthrough)                                                                                 | Replaces                                                                                                                                       |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                 | styled `<button>`                                 | `variant: "primary" \| "secondary" \| "danger" \| "ghost"`, `size`                                                | ~86 inline buttons                                                                                                                             |
| `IconButton`             | styled `<button>`                                 | `icon: LucideIcon`, `label: string` (required a11y name), `variant`, `size`                                       | close/chevron icon buttons, `DeleteButton` call sites                                                                                          |
| `Dialog`                 | `@base-ui/react/dialog`                           | styled `Root/Backdrop/Popup/Title/Description/Close` parts, re-exported                                           | 5 hand-rolled overlays                                                                                                                         |
| `AlertDialog`            | `@base-ui/react/alert-dialog`                     | same part structure                                                                                               | destructive-confirm surfaces where AlertDialog dismissal semantics already match current behavior (builder decides per call site; parity wins) |
| `Field`                  | `@base-ui/react/field`                            | `Root/Label/Control/Error` parts; `Error` renders `role="alert"`, Control wires `aria-invalid`/`aria-describedby` | 39 hand-wired error spots                                                                                                                      |
| `Fieldset`               | `@base-ui/react/fieldset`                         | `Root/Legend` parts                                                                                               | SaveScopeFieldset, radio groups, duration groups                                                                                               |
| `Input`                  | styled `<input>` as `Field.Control` render target | none beyond native                                                                                                | repeated input recipe                                                                                                                          |
| `Textarea`               | styled `<textarea>`                               | none                                                                                                              | description fields                                                                                                                             |
| `ToggleGroup` / `Toggle` | `@base-ui/react/toggle-group`                     | `Root` (`multiple` prop covers multi- and single-select) + `Toggle` part                                          | all `aria-pressed` chip groups: weekday/work-day toggles, repeat-unit segments, nth-occurrence segments, CarryOverPrompt tri-choice            |
| `Select`                 | `@base-ui/react/select`                           | `Root/Trigger/Value/Icon/Portal/Positioner/Popup/Item` parts                                                      | 3 native `<select>`s (WeekStart, Profiles, ViewToolbar)                                                                                        |
| `RadioGroup`             | `@base-ui/react/radio-group`                      | `Root/Radio` parts                                                                                                | ColorRadios, carry-over, save-scope radios                                                                                                     |
| `Tabs`                   | `@base-ui/react/tabs`                             | `Root/List/Tab/Panel` parts                                                                                       | hand-rolled `role="tablist"` in NotesTabs                                                                                                      |

Dropped from an earlier draft: `Checkbox` (zero consumers — there are no
`type="checkbox"` elements; the "checkbox-like" controls are `aria-pressed`
chips served by `ToggleGroup`) and `NumberField` (duration/threshold inputs
are string-registered react-hook-form fields; Base UI's stepper parts would
change pixels — plain `Input` keeps parity).

`shared/ui/styles.ts` holds shared class fragments (focus ring, field
surface, error text) used across cva recipes — the one place a recipe
detail lives once. (assistant's call; alternative is repeating the
fragments per recipe)

### shared/patterns — composed generics

| Component             | Props                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FormDialog`          | `open`, `onClose`, `title`, `children` (form body), `footer` (button slot)                                                                                                                                   | Dialog + header + scrollable body + footer. NewTask/Category/EditTask dialogs converge on it                                                                                                                                                                       |
| `ConfirmDialog`       | `open`, `onClose`, `title`, `description?`, `children?` (custom body), `confirmLabel`, `cancelLabel`, `onConfirm`, `confirmDisabled?: boolean`, `destructive?: boolean`, `busy?: boolean`                    | On `AlertDialog`: fixed cancel/confirm footer + alert semantics. `children` carries type-to-confirm inputs (DeleteProfileDialog), per-task choice lists (CarryOverPrompt), etc. Differs from `FormDialog` in semantics (alert vs. form) and owning its button pair |
| `PageHeader`          | `title: string`, `actions?: ReactNode`                                                                                                                                                                       | The repeated `<h1 className="text-2xl font-semibold tracking-tight">` + action row on every page                                                                                                                                                                   |
| `SettingsSection`     | `title`, `description?`, `children`                                                                                                                                                                          | The repeated section card on SettingsPage                                                                                                                                                                                                                          |
| `DurationField`       | `label`, `names: { hours; minutes }`, `register: UseFormRegister`, `idPrefix`, `error?`                                                                                                                      | two `Input`s summing to minutes; extracted from EditTaskDialog, reused by estimate/spent (native inputs, not NumberField — see note above)                                                                                                                         |
| `WeekdayPicker`       | `value: Weekday[]`, `onChange`, `order: Weekday[]`, `minSelected?: number`, `disabled?`                                                                                                                      | Multi-select `ToggleGroup` of 7 day chips. `order` is caller-supplied (the feature computes it from the profile's `weekStart`) — the pattern itself fetches nothing. Single-select weekday rows (RepeatScheduleFields monthly mode) use `ToggleGroup` directly     |
| `MonthCalendar`       | `month`, `selectedDate?`, `markedDates?: ReadonlySet<string>`, `onSelect(date)`, `onMonthShift(delta)`                                                                                                       | Generic month grid + MonthNav. InstanceCalendar and WeekJumpCalendar become thin domain wrappers                                                                                                                                                                   |
| `Pagination`, `Paged` | same state API (`page`, `pageCount`, `onPage` / `items` + `children` render prop); copy moved to props (`navLabel`, `previousLabel`, `nextLabel`, `formatPageIndicator`) — shared/ cannot import `labels.ts` | Move from `features/pagination/` — nothing about them is domain-specific                                                                                                                                                                                           |
| `EmptyState`          | `title`, `description?`, `action?`, `icon?`                                                                                                                                                                  | Notes empty state, backlog empty, categories empty                                                                                                                                                                                                                 |

### features — domain components (destination after refactor)

- `features/tasks/`: `TaskCard`, `NoteList` (+`NoteRow` to own file),
  `RepeatScheduleFields`, `InstanceCalendar` (wraps `MonthCalendar`),
  `CategoryMultiSelect` stays in `features/categories/`.
- `features/tasks/edit-dialog/` decomposition of the 1,797-line file:
  `EditTaskDialog.tsx` (shell/wiring), `TaskDetailsView.tsx`,
  `EditTaskForm.tsx`, `SaveScopeFieldset.tsx`, `PendingOccurrence.tsx`,
  `PendingSharedFields.tsx`, `DeleteConfirmPanel.tsx` (stays an INLINE
  panel — it renders inside the dialog's form area, not as a stacked
  modal; rebuilt on `Fieldset` + `RadioGroup` + `Button variant="danger"`),
  `hooks.ts` (usePendingSegment, useMaterializeInstance, useSeriesScopeSeed,
  useScopedCategories), `utils.ts` (defaultsFor, seriesUpdatePayload,
  toMinutes, deleteForScope, invalidateSeriesQueries). The internal
  `DurationField` is deleted in favor of the `shared/patterns` one.
- `features/tasks/` also gains `TaskFormFields.tsx` + `formSchema.ts`:
  the title/description/estimate/carry-over field block and zod helpers
  (`optionalDurationPart`) are copy-pasted between NewTaskDialog and the
  extracted EditTaskForm — the dedup goal requires one shared block that
  both dialogs compose. (assistant's call)
- `RepeatScheduleFields.tsx` (667) splits at its natural seams — monthly/
  nth-occurrence section, date-range fields, schedule draft state — so it
  lands under the ~400-line cap like everything else. `NewTaskDialog`
  (466) shrinks via `FormDialog` + `TaskFormFields`; `BoardPage` (669)
  sheds `DroppableCell`/`BoardCard`/column rendering to
  `features/board/`. (assistant's call: the cap applies to all files, not
  just EditTaskDialog)
- `features/board/`: `WeekJumpCalendar` (wraps `MonthCalendar`),
  `CarryOverPrompt` (via `ConfirmDialog`), extracted `DroppableCell`/
  `BoardCard`/`BoardColumn` from `BoardPage`.
- `features/settings/`: the eight section components, `DeleteProfileDialog`
  (via `ConfirmDialog`), `ColorRadios` (via `RadioGroup`).
- `features/` keeps `ViewToolbar` + `viewFilters` — placed under
  `features/board/` or a `features/views/` slice; builder's call since it
  serves both board and backlog.
- `NotesTabs` — likely dissolves: the two-tab declaration lives in
  `NoteList`'s parent and `Tabs` supplies the chrome. Builder's call.

### pages — after

- `BoardPage`: DnD context + week state + composing columns/toolbar/
  dialogs; `DroppableCell`/`BoardCard` extracted to `features/board/`.
- `BacklogPage`: `TaskRow` extracted to `features/tasks/` or kept inline
  if it stays small after primitives land. Builder's call.
- `CategoriesPage`, `SettingsPage`: compose via `PageHeader` +
  `SettingsSection`.

## Shared assets plan

- **Tokens**: `index.css` `@theme` block unchanged — primitives consume
  the same semantic tokens (`bg-surface`, `text-text-muted`, …).
  `color-scheme: dark` on `:root` preserved (native popups rule).
- **Variant recipes**: cva per component, colocated in the component file;
  shared fragments in `shared/ui/styles.ts`. Closed option sets follow the
  repo convention — variant/size props are string enums in
  `src/lib/enums.ts` (`ButtonVariant`, `ComponentSize`, …). They carry no
  specta wire value; the "members carry wire values" note in enums.ts
  describes the existing wire enums, not a requirement on new ones.
  (assistant's call)
- **`components.json`**: `ui` alias updated `@/components/ui` →
  `@/shared/ui` so the shadcn CLI can still scaffold Base UI pieces into
  the right directory (style preset `base-nova` already selected).
- **Registries**: `labels.ts`, `enums.ts`, `routes.ts`, `queryKeys.ts`,
  `commands.ts` unchanged. Copy flows into shared components via props.
- **ESLint**: extend `no-restricted-imports` with the layering table above
  — `shared/**` cannot import `layout/`, `features/`, `pages/`, `api/`, or
  `lib/labels`; cross-slice imports may only reach a slice's root-level
  files (the slice's public API), never its subdirectories.
- **`DeleteButton`** (`src/components/`) is removed; call sites use the
  ghost `IconButton` (`Trash2` icon, per-row `label`) — the same muted
  icon affordance the component always rendered, not a filled danger
  button.

## Migration notes

- Mapping is total: every current file has a destination above; nothing
  lands in `shared/` that isn't provably generic (the litmus: could it
  ship in a component library unchanged?).
- Execution order/workflow is deferred to the implementation plan — the
  user decides big-bang vs. primitives-first vs. page-by-page after this
  doc.
- Migration keeps tests green at each step; the e2e suite + axe coverage
  is the safety net for visual/a11y regressions.

## Left to the builder

- Exact per-part class recipes (tokens are fixed, composition is free).
- Per call site, whether `AlertDialog` or plain `Dialog` parts best
  preserve current dismissal semantics (parity is the rule, not
  library-idiomatic defaults).
- Whether `NotesTabs` survives as a domain component or folds into its
  parent.
- `ViewToolbar`/`viewFilters` slice placement.
- `TaskRow` extraction threshold.
- Whether `Button`/`IconButton` wrap `@base-ui/react/button` or stay
  styled natives (Base UI's button mainly adds `focusableWhenDisabled`).
- `components/ui` vs keeping a stray `components/` dir — this doc deletes
  `src/components/` entirely.
