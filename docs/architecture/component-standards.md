# Component standards

How components are written in this codebase — the rules that make them
reliable, professional, and readable. Applies to every new component and
to every component touched by the architecture refactor (design:
`docs/superpowers/specs/2026-11-01-frontend-component-architecture-design.md`).
Where existing code disagrees, the refactored form is the target.

## File and export structure

- One exported component per file; the file is named after it
  (`Button.tsx`). Private sub-parts may share the file only while they
  are used solely there — the moment a second consumer exists, extract.
- Named exports only: `export function Component(props)`. No default
  exports, no `React.FC`, no `forwardRef` (React 19 passes `ref` as a
  normal prop).
- No barrel `index.ts` files — imports name the file directly.
- Tests colocate: `Button.test.tsx` beside `Button.tsx`.
- cva variant recipes (`buttonVariants`) are module-level constants in
  the component file, above the component — and stay module-private.
  `allowConstantExport` only exempts literal exports; a `cva()` result
  or any other non-literal still trips
  `react-refresh/only-export-components`. When a non-component export is
  genuinely part of the file's API (part namespaces, test-facing
  constants), suppress with the file-level justified
  `/* eslint-disable react-refresh/only-export-components -- … */`
  banner the sibling primitives use.
- A `.tsx` file exports UI only. Non-rendering logic (payload builders,
  query orchestration, multi-step form math) lives in a sibling `.ts`
  file or hook — this is what keeps files under the ~400-line cap
  honestly, rather than by splitting JSX arbitrarily.

## Props

- Every component declares `interface <Name>Props` (even single-prop)
  and takes it as `Readonly<<Name>Props>` in the signature — the
  codebase's existing convention, now uniform.
- **Primitives extend the underlying element's props.** A styled native
  uses `ComponentProps<"button">`; a Base UI wrapper uses that part's
  props type. Every valid HTML/ARIA attribute then works without being
  re-declared — never hand-write `onClick?`, `disabled?`, `aria-*?` on a
  primitive.
- `className` is always accepted and merged **last** via `cn(...)`, so
  callers can extend or override without fighting the recipe.
- `ref` is forwarded to the root element on every primitive.
- Slot content is typed `ReactNode` (not `JSX.Element`, not `string`
  unless the value is truly text-only).
- Any component rendering icon-only content takes a required
  `label: string` — the accessible name is part of the type, not a hope.
- Mutually exclusive props are a discriminated union, not a bag of
  optional booleans.
- Booleans read as predicates (`disabled`, `busy`, `destructive`).
  Negated booleans (`noPadding`) are inverted instead — a call site
  should never read `prop={false}` meaning "on".
- Closed option sets are string enums from `src/lib/enums.ts`, never
  ad-hoc string unions in props.
- Controlled components follow Base UI's vocabulary — `value` /
  `defaultValue` / `onValueChange`, `open` / `defaultOpen` /
  `onOpenChange`. No invented synonyms (`isOpen`, `setOpen`).

## Composition

- Multi-part primitives mirror Base UI's part structure as styled
  re-exports (`Dialog.Root`, `Dialog.Backdrop`, `Dialog.Popup`, …) —
  composition at the call site, not one component with a prop per part.
- Patterns take `children` and named slots (`footer`, `actions`) for
  variable content — not a prop per piece of the layout.
- A consumer restyles a component **only** through that component's own
  props (`className`, variants). Never reach inside with descendant
  selectors or `!important` overrides.

## Styling

- All class composition goes through `cn()` or a cva recipe — never
  template-string concatenation.
- Variant logic lives in the cva recipe; `className` overrides are the
  escape hatch, not the pattern.
- State styling targets `data-*`/`aria-*` attributes
  (`data-[open]:`, `aria-[invalid]:`) or Base UI's
  `className`-as-state-function — never `.parent .child` coupling.
- Colors come from semantic tokens only (`bg-surface`,
  `text-text-muted`, `border-border`, …). No raw hex, no palette
  utilities (`bg-red-500`) in components.
- Shared class fragments (focus ring, field surface, error text) come
  from `shared/ui/styles.ts`. Re-typing a fragment is duplication.

## Component body

- Order inside the function: hooks → derived values → handlers → early
  returns → JSX. `react-hooks` lint rules enforce hook placement.
- A JSX region that exceeds ~15 lines or repeats gets a named
  sub-component or a `let body: ReactNode` assignment — JSX should read
  as an outline, not a wall.
- Props destructure in the signature; the rest-spread goes onto the
  root element after local props are consumed.
- Event-handler props stay `on<Action>`; internal handlers are
  `handle<Action>`.

## State and data

- `shared/` components hold only UI state (open, pressed). They never
  fetch, never import `api/`, never touch TanStack Query.
- Server state lives in TanStack Query — it is not mirrored into
  `useState`. Derived-from-props values are computed, not stored.
- Query wiring belongs to feature components and pages via `api/` +
  `QUERY_KEYS`.

State shape:

- Default to **multiple simple `useState`s** for independent pieces —
  if two values never change together and constrain nothing about each
  other, keep them apart.
- Consolidate into **one typed `useState<T>`** when the pieces form a
  single logical value you treat as a unit (a draft you parse, reset,
  or submit together).
- Use **`useReducer`** when updates have transition rules — when the
  next value of one field depends on reading others, or one change must
  reshape several fields atomically.
- Never `useState` what a store owns: form fields belong to
  react-hook-form, server data to TanStack Query, route to the router.

## Forms

- `react-hook-form` + `zodResolver`, `mode: "onTouched"` (unchanged
  rule).
- Every form field renders through `Field` parts — label, control,
  `role="alert"` error, `aria-invalid`, `aria-describedby` come wired.
  Hand-wiring those attributes is a bug.
- Plain inputs use `register`; controlled primitives (`Select`,
  `RadioGroup`, `ToggleGroup`) use `Controller`.

## Testing a component

Every component gets a colocated test. For primitives the minimum set is:

- renders with required props
- each variant applies its classes
- caller `className` merges on top
- `ref` reaches the root element
- accessible name is exposed (role + name query in the test — tests
  select by role/label, never by class name)
- interactive parts: keyboard operation, focus management, disabled
  state
- dismissal primitives: Escape and outside-press behavior per the
  design doc's parity rules
