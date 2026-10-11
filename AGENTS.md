# Meander — Agent Guide

Weekly kanban planner. Tauri desktop app: Rust backend, React (Vite) + Tailwind CSS + shadcn/ui frontend, SQLite storage.

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
  registries: `src/lib/routes.ts` (paths/labels), `src/api/commands.ts`
  (Tauri command names), `src/api/queryKeys.ts` (TanStack cache keys). Add
  to the registry rather than introducing a new one-off constant, and use
  the constants in tests as well.

## Workflow

- Branch + pull request for every change; conventional commits.
- Before committing: run the test suites, `cargo clippy`, and frontend linters.
