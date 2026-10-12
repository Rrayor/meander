# Meander

Offline desktop weekly kanban planner. Tauri app: Rust backend, React (Vite) + TypeScript + Tailwind frontend, SQLite storage.

## Development setup

Prerequisites: Node.js, Rust toolchain, and Tauri system dependencies ([docs](https://v2.tauri.app/start/prerequisites/)).

```sh
npm install        # frontend deps
npm run dev        # Vite dev server (frontend only)
cargo tauri dev    # full desktop app with hot reload
```

## Testing

```sh
npm run test       # Vitest unit tests (frontend)
npm run test:e2e   # Playwright e2e (mocked Tauri IPC)
npm run test:smoke # WebdriverIO smoke test against the real binary
cargo test         # Rust unit + cucumber acceptance tests (in src-tauri/)
```

## Generated code

`src/api/bindings.ts` is generated from Rust types via [specta](https://github.com/specta-rs/specta) and committed to the repo — the frontend builds without Rust. When adding or changing a struct that crosses the IPC boundary:

1. Derive `specta::Type` on it
2. Run `cargo test` to regenerate `bindings.ts`
3. Commit both

## Docs

- `docs/specification.md` — feature specs and acceptance criteria (source of truth)
- `docs/architecture/overview.md` — stack and architectural decisions
- `docs/CONTRIBUTION.md` — required checklist before committing
- `docs/testing.md` — test layer conventions
