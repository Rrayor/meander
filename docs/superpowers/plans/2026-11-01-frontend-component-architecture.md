# Frontend Component Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend on a layered component architecture — shared Base UI primitives + composed patterns under `src/shared/`, domain slices under `src/features/`, thin pages — eliminating hand-rolled controls and decomposing all files over ~400 lines.

**Architecture:** Phase 1 lands the `shared/` layer (styled `@base-ui/react` primitives + patterns) plus the eslint-enforced import rules, proven by migrating the settings surface. Phases 2–4 migrate feature areas one sweep at a time, decomposing `EditTaskDialog`, `RepeatScheduleFields`, and `BoardPage` along the way.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, `@base-ui/react` 1.9, `class-variance-authority`, `cn`, react-hook-form + zod, TanStack Query, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-frontend-component-architecture-design.md`
**Component standards:** `docs/architecture/component-standards.md` — every component in this plan follows it.

## Global Constraints

- No visual changes: same `index.css` `@theme` tokens, same spacing values, `color-scheme: dark` on `:root` untouched.
- `shared/` never imports `api/`, `lib/labels`, `features/`, `pages/`, or `layout/` — copy/data arrive via props.
- Closed option sets are string enums in `src/lib/enums.ts` (e.g. `ButtonVariant.Primary`), never string-union props.
- Labels/registry conventions unchanged: `labels.ts` copy is passed in at call sites; tests assert against the same constants.
- Component standards doc rules apply everywhere: named exports, `interface XProps` + `Readonly<>`, `cn()`/cva only, `ComponentProps` extension on primitives, required `label` on icon-only controls.
- Conventional commits; tests colocated and move with their files.
- Observable behavior parity: dismissal (Escape/outside press), keyboard, and focus behavior match today's implementation per call site.
- Verification per task: `npx vitest run <test-file>` + `npx tsc` + `npx eslint <files>`; phase end adds `npm test` and `npm run test:e2e`.

## Review Focus

Inputs/conditions the spec implies that are most likely to regress — each has a test pinned to the owning task:

1. **Escape layering** — inside an open `Select`/`CategoryMultiSelect` popup, Escape closes the popup but not the enclosing dialog. Pinned to Task 7 (Select) and Task 22 (NewTaskDialog e2e note).
2. **Portaled popups inside a modal Dialog** — `Select` popup and `ConfirmDialog` must render above `FormDialog` content (Base UI portals to body; stacking must be verified, z-index applied via `className` on `Positioner`/`Popup`).
3. **Focus return on dialog close** — closing `EditTaskDialog`/`NewTaskDialog` must return focus to the invoking control (Base UI default; verify, don't assume).
4. **RHF `register` + Base UI `Field` interplay** — `Field.Control` must accept the registered `<input>` without swallowing its `ref`; `aria-invalid`/`aria-describedby` wiring preserved.
5. **Non-dismissible prompt** — `CarryOverPrompt` keeps its current non-dismissing backdrop (no outside-press close) after moving to `ConfirmDialog`.
6. **`weekStart`-ordered weekday rows** — `WeekdayPicker` order comes from the profile's `weekStart`; wrong-order chips are a silent UX regression.

---

## Phase 1 — Foundation, shared layer, settings pilot (PR 1)

### Task 1: Foundation — folders, layout move, eslint layering, enums

**Files:**

- Create: `src/shared/ui/styles.ts`, `src/shared/hooks/` (empty dir lands with first hook — no placeholder files)
- Move: `src/components/layout/{AppShell,SideNav,ProfileSwitcher}.tsx` (+ `.test.tsx`) → `src/layout/`
- Modify: `src/router.tsx`, `src/main.tsx`, import sites of the moved files
- Modify: `eslint.config.js:43-51` (add layering patterns to `no-restricted-imports`)
- Modify: `src/lib/enums.ts` (add `ButtonVariant`, `ComponentSize` string enums)
- Modify: `components.json` (`aliases.ui` → `@/shared/ui`)

**Interfaces:**

- Produces: `ButtonVariant { Primary="primary", Secondary="secondary", Danger="danger", Ghost="ghost" }`, `ComponentSize { Sm="sm", Md="md" }` in `src/lib/enums.ts`; `FOCUS_RING`, `FIELD_SURFACE`, `ERROR_TEXT` string constants in `src/shared/ui/styles.ts`; eslint rules encoding the design doc's import-direction table (`shared/**` cannot import `layout|features|pages|api|lib/labels`; sibling-slice imports only via root-level paths `@/features/<name>/<File>`, never deeper).

- [ ] **Step 1: Move the files and update imports**

`git mv` the layout files; update every import to `@/layout/…`. No behavior change — this step must keep the suite green.

- [ ] **Step 2: Add the enums and styles fragments**

`ButtonVariant`/`ComponentSize` per the signature above. `styles.ts` exports `FOCUS_RING` (`"focus:outline-none focus:ring-1 focus:ring-primary"`), `FIELD_SURFACE` (`"rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60"`), `ERROR_TEXT` (`"text-sm text-danger"`) — values taken verbatim from the repeated classes in `EditTaskDialog.tsx`.

- [ ] **Step 3: Extend the eslint rule**

Add `no-restricted-imports` pattern groups per the layering table. `src/api/**` keeps its existing exemption; the Tauri restriction stays.

- [ ] **Step 4: Verify**

Run: `npm test` + `npx tsc` + `npm run lint`
Expected: all green; a deliberate test import violating the rule (e.g. `import … from "@/api"` inside a `shared/` file, reverted after) fails lint.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: establish shared/layout layering and import rules"
```

### Task 2: `Button` + `IconButton` primitives

**Files:**

- Create: `src/shared/ui/Button.tsx`, `src/shared/ui/IconButton.tsx`
- Test: `src/shared/ui/Button.test.tsx`, `src/shared/ui/IconButton.test.tsx`

**Interfaces:**

- Produces:
  - `interface ButtonProps extends ComponentProps<"button"> { variant?: ButtonVariant; size?: ComponentSize }` — defaults `Primary`/`Md`; `className` merges last via `cn()`.
  - `interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> { icon: LucideIcon; label: string; variant?: ButtonVariant; size?: ComponentSize }` — `label` becomes `aria-label`.

- [ ] **Step 1: Write the failing tests**

Cover per the standards test floor: renders children, each variant's recipe classes present (`bg-primary`, `border border-border`, `bg-danger`, no-bg for ghost), `size` classes, caller `className` merges, `ref` reaches `<button>`, `disabled` attribute, `type` passthrough. `IconButton`: renders the icon with `aria-hidden`, exposes `aria-label` (query `getByRole("button", { name })`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/ui`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement**

`buttonVariants` cva recipe (variants + sizes) above `Button`; recipes use the token classes currently repeated at call sites (`bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:brightness-110 disabled:opacity-50` for primary, `border border-border … hover:bg-surface-raised` for secondary, `bg-danger … text-on-primary` for danger, `text-text-muted hover:bg-surface-raised hover:text-text` for ghost). `IconButton` is a `Button` with ghost default, icon child, `aria-label={label}`.

- [ ] **Step 4: Verify + commit**

`npx vitest run src/shared/ui` + `npx tsc` + `npx eslint src/shared/ui` → green. Commit `feat: add Button and IconButton primitives`.

### Task 3: Form field primitives — `Field`, `Fieldset`, `Input`, `Textarea`

**Files:**

- Create: `src/shared/ui/Field.tsx`, `src/shared/ui/Fieldset.tsx`, `src/shared/ui/Input.tsx`, `src/shared/ui/Textarea.tsx`
- Test: `src/shared/ui/Field.test.tsx`, `src/shared/ui/Input.test.tsx`

**Interfaces:**

- Produces: `Field` re-exports styled `@base-ui/react/field` parts `Root/Label/Control/Error` — `Error` renders `role="alert"` with `ERROR_TEXT`; `Fieldset` styled `Root/Legend`; `Input`/`Textarea` are styled natives applying `FIELD_SURFACE` + `FOCUS_RING`, accepting all native props incl. `aria-invalid` (`data-[invalid]`/`aria-[invalid=true]:border-danger` styling).

- [ ] **Step 1: Write the failing tests**

`Field` composed with `Input`: label associated (`getByLabelText`), error text exposed as `role="alert"` and referenced via `aria-describedby`, `aria-invalid` present on control when set, ref reaches the `<input>` (Review Focus #4 — `Field.Control` renders the registered input via `render` prop without swallowing `ref`).

- [ ] **Step 2-5: fail → implement → verify → commit** (same cycle as Task 2; commit `feat: add Field/Fieldset/Input/Textarea primitives`)

### Task 4: `Dialog` primitive

**Files:**

- Create: `src/shared/ui/Dialog.tsx`
- Test: `src/shared/ui/Dialog.test.tsx`

**Interfaces:**

- Produces: styled re-exports of `@base-ui/react/dialog` parts — `Root`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`, `Trigger`, `Portal`, `Viewport` where needed. `Backdrop` = `bg-black/60`; `Popup` = the current overlay recipe (`rounded-lg border border-border bg-surface p-6 text-text shadow-2xl max-h-[90vh] w-full max-w-lg overflow-y-auto`) centered via `Viewport` (`fixed inset-0 z-50 flex items-center justify-center p-4`).

- [ ] **Step 1: Write the failing tests**

Open via `Root open`, renders title/popup with `role="dialog"`, Escape fires `onOpenChange(false)`, outside press on backdrop fires it too, focus is trapped inside while open and returned on close (Review Focus #3).

- [ ] **Step 2-5: cycle; commit** `feat: add Dialog primitive`

### Task 5: `AlertDialog` primitive

**Files:**

- Create: `src/shared/ui/AlertDialog.tsx`
- Test: `src/shared/ui/AlertDialog.test.tsx`

**Interfaces:**

- Produces: same part structure as `Dialog` on `@base-ui/react/alert-dialog`, `role="alertdialog"`. Note in docstring: Base UI's AlertDialog does not outside-press-dismiss — call sites needing today's backdrop-close semantics use `Dialog` parts with a `role` override instead (per-call-site parity decision, design doc).

- [ ] **Step 1-5: test (renders `alertdialog`, Escape behavior matches Base UI semantics, focus trap) → implement → verify → commit** `feat: add AlertDialog primitive`

### Task 6: `ToggleGroup` + `Toggle` primitives

**Files:**

- Create: `src/shared/ui/ToggleGroup.tsx`
- Test: `src/shared/ui/ToggleGroup.test.tsx`

**Interfaces:**

- Produces: styled `@base-ui/react/toggle-group` `Root` + `@base-ui/react/toggle` — chip recipe from `RepeatScheduleFields` (`rounded-md px-3 py-2 text-sm` with `data-[pressed]:bg-primary data-[pressed]:text-on-primary`, unpressed `border border-border text-text`). `multiple` prop passes through.

- [ ] **Step 1-5: test (single + multiple modes, `aria-pressed` toggling, keyboard nav) → implement → verify → commit** `feat: add ToggleGroup/Toggle primitives`

### Task 7: `Select` primitive

**Files:**

- Create: `src/shared/ui/Select.tsx`
- Test: `src/shared/ui/Select.test.tsx`

**Interfaces:**

- Produces: styled `@base-ui/react/select` parts — `Root`, `Trigger`, `Value`, `Icon`, `Portal`, `Positioner`, `Popup`, `Item`, `ItemText`, `ItemIndicator`. Trigger = `FIELD_SURFACE`; Popup = `rounded-md border border-border bg-surface-raised shadow-2xl`; Positioner accepts `className` for z-index (Review Focus #2).

- [ ] **Step 1: Write the failing tests**

Open via `userEvent.click` on trigger, options listed `role="listbox"`, selection updates `Value`, keyboard navigation (arrows/Enter/Escape), `aria-expanded`/`aria-haspopup` wiring, Escape inside select inside a mounted `Dialog` closes only the select (Review Focus #1).

- [ ] **Step 2-5: cycle; commit** `feat: add Select primitive`

### Task 8: `RadioGroup` primitive

**Files:**

- Create: `src/shared/ui/RadioGroup.tsx`
- Test: `src/shared/ui/RadioGroup.test.tsx`

**Interfaces:**

- Produces: styled `@base-ui/react/radio-group` `Root` + `Radio` (`Root`/`Indicator`) parts — card-style radios matching `ColorRadios` and inline radios matching the carry-over options.

- [ ] **Step 1-5: test (`role="radiogroup"`/`radio`, arrow-key movement, checked state, disabled radio) → implement → verify → commit** `feat: add RadioGroup primitive`

### Task 9: `Tabs` primitive

**Files:**

- Create: `src/shared/ui/Tabs.tsx`
- Test: `src/shared/ui/Tabs.test.tsx`

**Interfaces:**

- Produces: styled `@base-ui/react/tabs` `Root/List/Tab/Panel` — List = `flex gap-4 border-b border-border`, Tab = `data-[selected]` underline styling from `NotesTabs`.

- [ ] **Step 1-5: test (`role="tablist"`, `aria-selected`, arrow-key navigation, panel association) → implement → verify → commit** `feat: add Tabs primitive`

### Task 10: `FormDialog` + `ConfirmDialog` patterns

**Files:**

- Create: `src/shared/patterns/FormDialog.tsx`, `src/shared/patterns/ConfirmDialog.tsx`
- Test: `src/shared/patterns/FormDialog.test.tsx`, `src/shared/patterns/ConfirmDialog.test.tsx`

**Interfaces:**

- Consumes: `Dialog`/`AlertDialog` parts, `Button`.
- Produces:
  - `interface FormDialogProps { open: boolean; onClose(): void; title: string; children: ReactNode; footer?: ReactNode }` — Dialog + title header + scrollable body + footer row.
  - `interface ConfirmDialogProps { open: boolean; onClose(): void; title: string; description?: string; children?: ReactNode; confirmLabel: string; cancelLabel: string; onConfirm(): void; confirmDisabled?: boolean; destructive?: boolean; busy?: boolean }` — AlertDialog + body + fixed cancel/confirm footer; `destructive` renders confirm as `ButtonVariant.Danger` else `Primary`.

- [ ] **Step 1-5: test (composition renders, footer buttons fire handlers, `confirmDisabled` honored, dismissal per props) → implement → verify → commit** `feat: add FormDialog and ConfirmDialog patterns`

### Task 11: `PageHeader` + `SettingsSection` + `EmptyState` patterns

**Files:**

- Create: `src/shared/patterns/{PageHeader,SettingsSection,EmptyState}.tsx` + colocated tests

**Interfaces:**

- Produces:
  - `PageHeaderProps { title: string; actions?: ReactNode }` — the repeated `<h1 className="text-2xl font-semibold tracking-tight text-text">` + action row.
  - `SettingsSectionProps { title: string; description?: string; children: ReactNode }` — settings card wrapper from the settings sections' shared markup.
  - `EmptyStateProps { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }`.

- [ ] **Step 1-5: test (heading level + copy render, actions slot, children) → implement → verify → commit** `feat: add PageHeader, SettingsSection, EmptyState patterns`

### Task 12: `DurationField` pattern

**Files:**

- Create: `src/shared/patterns/DurationField.tsx`
- Test: `src/shared/patterns/DurationField.test.tsx`
- Consumes: `Field`, `Input`, `Fieldset`.

**Interfaces:**

- Produces: `interface DurationFieldProps<T extends FieldValues> { label: string; idPrefix: string; names: { hours: Path<T>; minutes: Path<T> }; register: UseFormRegister<T>; error?: string; disabled?: boolean }` — the hours+minutes pair extracted from `EditTaskDialog.tsx:1244-1307` verbatim in behavior (two `Input`s, `w-20`, summed minutes elsewhere stays in callers).

- [ ] **Step 1-5: test (two labelled inputs registered under `names`, error via `role="alert"`, disabled state) → implement → verify → commit** `feat: add DurationField pattern`

### Task 13: `WeekdayPicker` pattern

**Files:**

- Create: `src/shared/patterns/WeekdayPicker.tsx`
- Test: `src/shared/patterns/WeekdayPicker.test.tsx`
- Consumes: `ToggleGroup`/`Toggle`, `Weekday` enum, `weekdayNameOf` label helper.

**Interfaces:**

- Produces: `interface WeekdayPickerProps { value: readonly Weekday[]; onChange(days: Weekday[]): void; order: readonly Weekday[]; minSelected?: number; disabled?: boolean }` — renders `order`-sequenced `Toggle`s (Review Focus #6 — caller supplies `order` from the profile's `weekStart`; the pattern fetches nothing); `minSelected` keeps the last selected chip non-toggleable (WorkDays rule).

- [ ] **Step 1-5: test (renders in `order`, toggles update `value`, `minSelected` blocks last deselect, `aria-pressed`) → implement → verify → commit** `feat: add WeekdayPicker pattern`

### Task 14: `MonthCalendar` pattern (+`MonthNav` absorption)

**Files:**

- Create: `src/shared/patterns/MonthCalendar.tsx`
- Test: `src/shared/patterns/MonthCalendar.test.tsx`
- Consumes: `IconButton`, `weekdayNameOf`/calendar helpers from `src/lib/calendar.ts`, `MonthNav` logic from `src/features/calendar/MonthNav.tsx`.

**Interfaces:**

- Produces: `interface MonthCalendarProps { month: Date; selectedDate?: string; markedDates?: ReadonlySet<string>; onSelect(date: string): void; onMonthShift(delta: number): void }` — generic month grid + prev/next nav (`MonthNav` folds in); marked dates render the dot indicator used by `InstanceCalendar`.

- [ ] **Step 1-5: test (renders month grid, nav fires `onMonthShift`, `onSelect` on day click, marked/selected states, day cells labelled) → implement → verify → commit** `feat: add MonthCalendar pattern`

### Task 15: Move `Pagination`/`Paged`/`usePagination` to `shared/`

**Files:**

- Move: `src/features/pagination/Pagination.tsx` → `src/shared/patterns/Pagination.tsx`; `src/features/pagination/usePagination.ts` → `src/shared/hooks/usePagination.ts`; tests colocated.
- Modify: import sites.
- Delete: `src/features/pagination/`.

- [ ] **Step 1-4: move + update imports → verify green → commit** `refactor: move pagination to shared layer`

### Task 16: Settings pilot — form controls

**Files:**

- Modify: `src/features/settings/WeekStartSection.tsx` (native `<select>` → `Select`), `ColorRadios.tsx` (→ `RadioGroup`), `WorkDaysSection.tsx` (→ `WeekdayPicker` with `order` from `weekStart` query), `ThresholdSection.tsx` + `CategoryThresholdsSection.tsx` (→ `Field`/`Input`), `DatabaseSection.tsx` (→ `Button`).
- Test: update colocated tests only where implementation-coupled.

- [ ] **Step 1-5: migrate each section preserving behavior (values, persistence calls, error surfaces); run section tests + `npx tsc` + lint; commit** `refactor: migrate settings sections to shared primitives`

### Task 17: Settings pilot — `ProfilesSection` + `SettingsPage` frame + `DeleteProfileDialog`

**Files:**

- Modify: `src/features/settings/ProfilesSection.tsx` (`Select`, `Button`), `src/features/settings/DeleteProfileDialog.tsx` (→ `ConfirmDialog` with type-to-confirm `children` body), `src/pages/SettingsPage.tsx` (→ `PageHeader` + `SettingsSection` composition).

- [ ] **Step 1-5: migrate; keep type-to-confirm gating identical; tests green; commit** `refactor: migrate profile settings and settings page frame`

### Task 18: Phase-1 gate

- [ ] `npm test` + `npm run lint` + `npm run build` + `npm run test:e2e` all green on the phase branch; open PR "refactor: shared component layer + settings migration" per repo convention.

---

## Phase 2 — Tasks feature sweep (PR 2)

### Task 19: `TaskFormFields` + `formSchema.ts` shared block

**Files:**

- Create: `src/features/tasks/TaskFormFields.tsx`, `src/features/tasks/formSchema.ts`
- Modify: `src/features/tasks/NewTaskDialog.tsx` (adopt them)
- Test: `src/features/tasks/TaskFormFields.test.tsx`

**Interfaces:**

- Produces: `TaskFormFields` — the title/description/estimate (`DurationField`)/carry-over (`RadioGroup`) block shared by new and edit forms; `formSchema.ts` — `optionalDurationPart` and shared zod pieces currently copy-pasted (`NewTaskDialog.tsx:49`, `EditTaskDialog.tsx:120`).
- Consumes: `Field`, `Input`, `Textarea`, `DurationField`, `RadioGroup`, `CategoryMultiSelect` (stays a feature component for now).

- [ ] **Step 1-5: extract the block so NewTaskDialog composes it — test asserts fields render/register/errors identically to today; verify + commit** `refactor: extract shared task form fields`

### Task 20: `NewTaskDialog` → `FormDialog`

**Files:**

- Modify: `src/features/tasks/NewTaskDialog.tsx`

- [ ] **Step 1-4: swap hand-rolled overlay/footer for `FormDialog` + `Button`s; preserve Escape/backdrop-close and the inner-dropdown-Escape layering (Review Focus #1); tests green; commit** `refactor: rebuild NewTaskDialog on FormDialog`

### Task 21: `RepeatScheduleFields` decomposition

**Files:**

- Modify: `src/features/tasks/RepeatScheduleFields.tsx` → split into `RepeatScheduleFields.tsx` (shell) + `MonthlySection.tsx` + `DateRangeFields.tsx` + `repeatDraft.ts` (draft state/reducer) in `src/features/tasks/`.
- Replace chip rows with `ToggleGroup`/`Toggle`; weekday rows with `WeekdayPicker` (multi) and `ToggleGroup` (single-select monthly).

- [ ] **Step 1-5: split at the seams so every file lands under ~400 lines; adopt primitives; colocated tests stay green; commit** `refactor: decompose RepeatScheduleFields`

### Task 22: `EditTaskDialog` decomposition

**Files:**

- Modify: `src/features/tasks/EditTaskDialog.tsx` (1,797 → shell only)
- Create: `src/features/tasks/edit-dialog/{EditTaskForm,TaskDetailsView,SaveScopeFieldset,PendingOccurrence,PendingSharedFields,DeleteConfirmPanel}.tsx`, `edit-dialog/hooks.ts`, `edit-dialog/utils.ts`
- Consumes: `FormDialog`, `Field`, `Input`, `Textarea`, `DurationField`, `RadioGroup`, `Tabs`, `MonthCalendar`, `Button`/`IconButton`, `TaskFormFields`.

**Interfaces:**

- Produces: `EditTaskDialog` keeps its public props (`EditTaskDialogProps`) unchanged — callers untouched. Internal files export the pieces listed in the design doc; `DeleteConfirmPanel` stays an INLINE panel rebuilt on `Fieldset`+`RadioGroup`+danger `Button` (not a modal).

- [ ] **Step 1: Move pieces out mechanically** — `TaskDetailsView`, `PendingOccurrence`, `PendingSharedFields`, `SaveScopeFieldset`, hooks (`usePendingSegment`, `useMaterializeInstance`, `useSeriesScopeSeed`, `useScopedCategories`), and utils (`defaultsFor`, `seriesUpdatePayload`, `toMinutes`, `deleteForScope`, `invalidateSeriesQueries`) move unchanged; tests stay colocated and green after each move.

- [ ] **Step 2: Adopt primitives inside the moved pieces** — overlay→`FormDialog`, fields→`Field`/`Input`/`Textarea`, duration→`DurationField`, radios→`RadioGroup`, notes tabs→`Tabs`, instance calendar→`MonthCalendar` wrapper (`InstanceCalendar` becomes a thin domain wrapper staying in `features/tasks/`), buttons→`Button`/`IconButton`.

- [ ] **Step 3-5: verify** (`npx vitest run src/features/tasks` + `npx tsc` + lint; every file under ~400 lines) → commit `refactor: decompose EditTaskDialog onto shared primitives`

### Task 23: Tasks leftovers — `NoteList`/`NoteRow`, `NotesTabs`, `TaskCard`

**Files:**

- Modify: `src/features/tasks/NoteList.tsx` (`NoteRow` → own file; buttons → `Button`/`IconButton`), `src/features/tasks/NotesTabs.tsx` (rebuild on `Tabs`, or dissolve per builder decision — if dissolved, update `EditTaskForm`/`TaskDetailsView`), `src/features/tasks/TaskCard.tsx` (buttons → primitives).

- [ ] **Step 1-4: migrate; tests green; commit** `refactor: migrate task notes and card to primitives`

### Task 24: Phase-2 gate

- [ ] Full suite + e2e green; open PR "refactor: tasks feature on shared component layer".

---

## Phase 3 — Board + categories sweep (PR 3)

### Task 25: `BoardPage` decomposition

**Files:**

- Modify: `src/pages/BoardPage.tsx` (669 → composition only)
- Create: `src/features/board/DroppableCell.tsx`, `src/features/board/BoardCard.tsx`, `src/features/board/WeekColumns.tsx` (column grid rendering)
- Modify: `src/features/ViewToolbar.tsx` — native `<select>` → `Select`; relocate `ViewToolbar`+`viewFilters.ts` per the design doc's builder decision (recommend `features/board/`).

- [ ] **Step 1-5: extract board rendering to `features/board/`; `ViewToolbar` on `Select`; tests + lint green; commit** `refactor: decompose BoardPage into board feature`

### Task 26: `WeekJumpCalendar` + `CarryOverPrompt`

**Files:**

- Modify: `src/features/board/WeekJumpCalendar.tsx` (wrap `MonthCalendar`), `src/features/board/CarryOverPrompt.tsx` (→ `ConfirmDialog` with `children` body; **non-dismissible backdrop preserved — Review Focus #5**), `src/features/calendar/` deleted once `MonthNav` is absorbed.

- [ ] **Step 1-4: migrate; verify CarryOverPrompt does NOT close on outside press (existing behavior); tests green; commit** `refactor: migrate board calendar and carry-over prompt`

### Task 27: `CategoryDialog` + `CategoryMultiSelect`

**Files:**

- Modify: `src/features/categories/CategoryDialog.tsx` (→ `FormDialog` + `Field`/`Input`), `src/features/categories/CategoryMultiSelect.tsx` (rebuild dropdown on `Dialog`-family popup parts or Base UI `Popover`-equivalent parts — keep its search+checkbox-list behavior), `src/pages/CategoriesPage.tsx` (`PageHeader`, `EmptyState`).

- [ ] **Step 1-4: migrate; tests green; commit** `refactor: migrate categories to shared layer`

### Task 28: Phase-3 gate

- [ ] Full suite + e2e green; open PR "refactor: board and categories on shared component layer".

---

## Phase 4 — Backlog, layout polish, cleanup (PR 4)

### Task 29: `BacklogPage` + `TaskRow`

**Files:**

- Modify: `src/pages/BacklogPage.tsx` (`PageHeader`, `Pagination`/`Paged` from `shared/`, `Button`s; `TaskRow` extracted to `features/tasks/TaskRow.tsx` if it remains non-trivial after primitives — builder decision per design doc).

- [ ] **Step 1-4: migrate; tests green; commit** `refactor: migrate backlog page to shared layer`

### Task 30: Final sweep

**Files:**

- Delete: `src/components/` (`DeleteButton` — all call sites now `Button variant={ButtonVariant.Danger}`), `src/features/calendar/`, `src/features/pagination/` (already empty/deleted).
- Modify: any stragglers found by the sweep.

- [ ] **Step 1: grep sweep** — `rg "<button" src/` (only inside `shared/ui`), `rg "fixed inset-0" src/` (only `shared/ui/Dialog`), `rg "role=\"tablist\"" src/` (only `Tabs`), `rg "<select" src/` (zero outside primitives). Every hit outside `shared/` gets migrated or justified in the PR description.

- [ ] **Step 2-4: verify whole suite + e2e + lint; confirm no file over ~400 lines (`wc -l src/**/*.tsx`); commit** `refactor: remove legacy component locations`; open PR.

---

## Self-review notes

- Spec coverage: every catalog row maps to a task; every current file has a destination; rules/standards docs land in Tasks 1–2's conventions and are enforced throughout.
- Deliberately builder-owned per the design doc: `NotesTabs` dissolve decision, `ViewToolbar` slice placement (plan recommends `features/board/`), `TaskRow` extraction threshold, `Button` native-vs-Base-UI, per-site `AlertDialog` vs `Dialog` dismissal parity.
