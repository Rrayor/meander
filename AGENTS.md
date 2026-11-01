# Meander — Agent Guide

Weekly kanban planner. Tauri desktop app: Rust backend, React (Vite) + Tailwind CSS + Base UI frontend, SQLite storage.

## Documentation (read first)

- `docs/specification.md` — feature specifications and acceptance criteria. Source of truth.
- `docs/architecture/overview.md` — stack and architectural decisions.
- `docs/tasks/big-picture-plan.md` — sequencing frame only; not a complete feature checklist.
- `docs/CONTRIBUTION.md` — required checklist: acceptance tests, unit tests, Playwright tests, lint before commit.

## UI work: Stitch first

For any UI task, create the design with Stitch before implementing:

1. Invoke the `generate-design` skill to create/edit screens via the Stitch MCP server (configured in `.devin/mcp_config.local.json`).
2. Use `manage-design-system` / `design-md` to maintain a shared design system so generated screens stay consistent.
3. Save generated assets under `.stitch/designs/` and keep `.stitch/metadata.json` up to date after each sync.
4. Convert designs into modular React + Tailwind + shadcn/ui components (the `react-components` skill documents the conventions) — don't paste raw Stitch HTML into the app.

## Conventions

- No magic values: shared literals live in constants, never inline. Existing
  registries: `src/lib/routes.ts` (paths/labels), `src/lib/labels.ts` (UI
  copy asserted in tests), `src/api/commands.ts`
  (Tauri command names), `src/api/queryKeys.ts` (TanStack cache keys). Add
  to the registry rather than introducing a new one-off constant, and use
  the constants in tests as well.
- If a string value is used more than once, create a variable or constant for
  it — including in tests. A test must not set a value to `"Work"` and then
  assert that the value is `"Work"` with two inline literals.
- Closed option sets are `enum` declarations in `src/lib/enums.ts`, never
  scattered string literals — form state, radio values, draft fields, and
  comparisons all use members. Members carry the specta wire values so they
  serialize to generated types for free; wire→enum reads cast once at the
  boundary. Exception: switches on generated union discriminants
  (`Recurrence["kind"]`) match literal members — the union is the wire enum
  and literals are the only way to narrow variants; `Extract` filters use
  template-literal types of `RecurrenceKind` members instead.
- When a test asserts a value produced by production code (error messages,
  labels, formatted output), the expected value must come from the same
  production constant or formatter — never a duplicated literal. Example:
  assert against `STATUS_LABELS.done` or `formatMinutes(90)`, not `"Done"`
  or `"1h 30m"`.
- Validation boundaries must never be hardcoded in error messages. Define the
  bound as a constant once and interpolate it into the message string, on
  both the Rust and TypeScript side.
- Persisted data and view transforms are separate concerns: stored values
  (e.g. manual `sort_order`) are data; sorting, filtering, and searching are
  view-time transforms that must never mutate stored data.
- The app is dark-theme only. Native control popups (`<select>` dropdowns,
  `input[type="date"]` pickers, scrollbars) follow the OS color scheme, not
  Tailwind classes — `color-scheme: dark` is set once on `:root` in
  `index.css`. Never restyle the element to fix a light popup; fix or
  preserve the root color-scheme instead.

## Architecture and layering

- Everything is designed for a possible future webapp migration: keep the
  transport seam clean. Code outside `src/api/` must never call Tauri
  directly — all IPC goes through the `Transport` interface
  (`src/api/transport.ts`) so it can later be swapped for REST.
  Enforced by eslint `no-restricted-imports` on `@tauri-apps/*`.
- Backend types are shared with the frontend via specta. After changing any
  exported Rust type, regenerate `src/api/bindings.ts` and commit it — never
  hand-edit the generated file. `scripts/check-bindings.sh` fails the
  pre-commit hook and CI when it is stale.
- Errors cross the wire as typed `ApiError` objects (`code`, `kind`,
  `message`), not stringly-typed rejects. Add a variant to `ErrorCode` rather
  than inventing a new message, and map server errors in the frontend by
  `ErrorCode` — never by matching message text.
- Feature modules must never reach into another feature module's internals.
  If two modules need the same helper, validator, or primitive, extract it
  into the shared layer instead — `src-tauri/src/validation.rs` on the
  backend (see `parse_hex_color`, `PositiveDuration`, `MAX_DURATION_MINUTES`,
  `HexColor`), `src/lib/` on the frontend. Domain types a second module
  legitimately produces or consumes (e.g. a series materializing `TaskTitle`s)
  may be shared directly; private helpers and implementation details may not.

## Frontend component architecture

Design:
`docs/superpowers/specs/2026-11-01-frontend-component-architecture-design.md`.
Component-authoring rules (props, composition, styling, state, tests):
`docs/architecture/component-standards.md` — read it before writing or
touching a component.

- `src/shared/ui/` — primitives: styled `@base-ui/react` parts and styled
  native elements. No domain knowledge: never imports `api/`,
  `lib/labels`, `features/`, `pages/`, or `layout/`; all copy and data
  arrive via props. Enforced by eslint `no-restricted-imports`.
- `src/shared/patterns/` — composed generics (`ConfirmDialog`,
  `WeekdayPicker`, …): may combine `shared/ui` pieces and `lib` types,
  still no domain/API knowledge.
- `src/shared/hooks/` — generic reusable hooks (`usePagination`, …).
- `src/layout/` — app chrome (`AppShell`, `SideNav`, `ProfileSwitcher`).
  Unlike `shared/`, it may own queries, mutations, and labels.
- `src/features/<domain>/` — domain slices. Cross-slice imports may only
  reach a sibling slice's root-level files (its public API), never its
  subdirectories.
- `src/pages/` — thin route entries: composition and route state only.
- Interactive controls wrap `@base-ui/react` parts — never hand-roll
  focus traps, escape handling, or overlay dismissal. Behavior-free
  elements are styled natives.
- Variant APIs over separate components: `Button variant="danger"`, never
  `<DangerButton>`. Recipes use `cva` colocated in the component file;
  variant/size option sets are string enums in `src/lib/enums.ts`.
- Keep component files under ~400 lines — decompose at natural seams
  rather than growing mega-files.
- When migrating a control onto a primitive, preserve observable behavior
  (dismissal, keyboard, focus). Tests asserting behavior are kept; tests
  coupled to implementation details are rewritten as part of the move.

## Validation

- Backend validation uses `nutype` newtypes wherever feasible — never
  hand-written conditionals for value constraints.
- Frontend validation uses `zod` schemas and mirrors backend rules; validate
  before sending anything to the backend wherever possible.
- Forms use `react-hook-form` + `zodResolver` with `mode: "onTouched"` and
  per-field inline errors (`role="alert"`, `aria-invalid`,
  `aria-describedby`). Submit-only validation is not acceptable UX.
- Backend validation remains the authoritative layer; frontend validation is
  for immediate feedback, not security.

## Specification and accessibility

- `docs/specification.md` is the source of truth: every change must adhere to
  it unless the spec is found genuinely faulty (then fix the spec).
  Before committing, review the diff for specification drift.
- Any spec feature that is intentionally deferred must be written down in the
  relevant `docs/tasks/` plan — a deferral is a decision, not an oversight.
- WCAG AA is required. Before committing, verify: keyboard operability,
  accessible names, `role="alert"` for errors, contrast, and screen-reader
  semantics for custom controls (e.g. `radiogroup`/`radio`).
  `eslint-plugin-jsx-a11y` runs in lint; when a rule is intentionally
  bypassed (e.g. autofocus inside a modal), use an inline
  `eslint-disable` with a justification comment.

## Testing

- Tests must be written on multiple layers: unit tests, cucumber service
  tests (`src-tauri/tests`), Playwright e2e (`tests/e2e`), and the
  WebdriverIO smoke test.
- Tests must cover: happy path, error cases, edge cases, specification
  adherence, accessibility, and communication between layers (typed errors,
  transport behavior, migrations).
- A single happy-path test is not sufficient: cover thorough positive AND
  negative scenarios for the behavior being added or changed.
- When a new issue is found or feedback turns out to be valid, add a test
  scenario that reproduces it so the same problem cannot regress later.
- Migration tests must be generic (data-preservation invariants across all
  migrations), not regression tests for a single past bug.
- Coverage must stay at or above 80% (the Sonar quality gate). Cover
  everything that is meaningfully testable; startup entry points
  (`lib.rs`, `main.rs`, `main.tsx`, router/app-shell wiring) are the
  acceptable exceptions — don't write artificial tests for them.

## Migrations

- Never `SELECT *` when copying into a rebuilt table — use explicit column
  lists on both sides. Positional copies corrupt data when column order
  drifts. Enforced by `scripts/check-migrations.sh` in the pre-commit hook
  and CI.
- New constraints must account for pre-existing data that violates them:
  sanitize deliberately (e.g. invalid values to `NULL`) rather than failing
  the migration on real databases.

## Workflow

- Branch + pull request for every change; conventional commits.
- The pre-commit hook runs the full gate: `cargo fmt`, `clippy`, prettier,
  eslint, the migration and bindings checks, `cargo test`, `vitest`, and
  Playwright e2e. Only the WebdriverIO smoke test stays CI-only — it needs a
  release build.
