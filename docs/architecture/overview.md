# Architectural overview

## Technological stack

- Tauri application: Rust "backend", React frontend (built with Vite)
- Tailwind CSS + shadcn/ui
- SQLite database
- Vitest + React Testing Library for frontend unit/component tests
- Playwright for frontend e2e testing (against the Vite dev server)
- cucumber-rs for acceptance testing (Rust service layer)
- WebdriverIO (`@wdio/tauri-service`) for real-app smoke tests
- GitHub actions for CI/CD
- Starlight for user guides

## Modular structure

Tauri by default requires separation of "backend and frontend". Though it allows for a very thin Rust layer and developing the majority of the application in TypeScript would be possible, Meander follows a more classical approach. The Rust side is responsible for state consistency. It handles database operations and validation as a traditional backend and Typescript is responsible for communicating that state to the user and allowing the user to send modification requests to the backend.

This is both for separation of concerns and to allow for a possible migration to an online architecture.

Database interactions need to be more robust for this reason than the minimum requirement of interacting with SQLite. We have a persistence layer responsible for transforming Rust objects into database entities and vice versa, a connection layer that currently only allows for connecting to SQLite but it is set up so in the future other SQL databases can be easily connected as well. And we have a service layer, where every operation happens with the involvement of Rust objects representing database entities. Business logic and validation happen here.

The frontend is a React application built with Vite, styled with Tailwind CSS and composed from shadcn/ui components. React doesn't enforce structure the way Angular does, so the frontend follows explicit conventions:

- Feature-based structure: `src/features/<domain>` (kanban, backlog, categories, profiles, settings, ...) holds that domain's components, hooks and API calls. Route-level views stay thin — they compose feature components and hold no logic themselves.
- Backend communication is isolated in an API layer wrapping Tauri `invoke` calls in typed functions. Components never call `invoke` directly; they consume backend state through hooks. TypeScript types for backend entities are declared in one shared place so they stay in sync with the Rust objects.
- Consistent with the backend boundary: the Rust side owns state consistency and validation. The frontend may mirror validation for UX (e.g. form feedback) but never duplicates business rules.
- shadcn/ui primitives live in `src/components/ui` and aren't modified in place. Shared composed components live in `src/components` and reusable cross-feature hooks in `src/hooks`.
- UI work is designed with Stitch first (see `docs/CONTRIBUTION.md`): generated screens are converted into modular components following the above conventions rather than copied as raw markup.

## Migrations

We use database migrations for maintainability and future proofing.

## Persistence layer

- `src-tauri/src/db/` is the connection layer: `db::connect(path)` opens (or creates) a SQLite file with WAL + foreign keys and applies all pending migrations from `src-tauri/migrations/` via sqlx; `db::default_path()` resolves the conventional location.
- The default database is portable: `meander.db` at the repository root in dev builds (gitignored), next to the executable in release builds.
- `src-tauri/src/state.rs` (`AppState`, managed by Tauri) owns the active pool and path; `reconnect` validates the candidate with `db::check_compatible` (requires `meander_meta` and an applied-migration set contained in the app's known migrations) and swaps the pool only on success — the current database is untouched on any failure.
- `src-tauri/src/config.rs` persists application-level settings (`config.json` in the app config dir): the selected database path, needed before a db can be opened. Missing, corrupt, or pointing-at-a-deleted-file config falls back to the default path. Profile-scoped settings live inside the database, keyed to a profile.
- Tauri commands live in `src-tauri/src/commands/` and stay thin (deserialize → service → serialize).

## Testing

As the development is AI assisted testing is an even more pronounced requirement. Testing is layered:

- **Unit tests**: `cargo test` for the backend, Vitest + React Testing Library for frontend components.
- **Acceptance tests**: cucumber-rs runs Gherkin `.feature` files under `cargo test` directly against the service layer and the seeded test database. Most acceptance criteria are business rules, so they are validated where the logic lives — not through the UI.
- **Frontend e2e tests**: Playwright runs against the Vite dev server with the Tauri API layer mocked. Fast and stable for UI behavior like drag and drop and board rendering.
- **Real-app smoke tests**: a thin WebdriverIO suite via `@wdio/tauri-service` (embedded webdriver provider) verifies the actual binary and webview — app startup and a small number of end-to-end flows against the real backend.

Tauri command handlers are kept thin (deserialize -> service -> serialize) so service layer tests cover the business logic.

Benchmarks are also set up to guard performance.

Use a separate test-database file which can be seeded for testing purposes.

## CI/CD

Every change must be validated before integrating into the main branch or releasing. GitHub actions is the easiest way we can do that.

## Documentation

The user-guide is using Starlight for easy development and consumption.
