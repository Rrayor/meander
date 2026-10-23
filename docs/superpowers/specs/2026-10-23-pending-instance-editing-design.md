# Future-instance editing — design

Plan item #29. Spec §148, §230–232, §249–252. Currently the instance
calendar marks scheduled dates and selecting an unpersisted one shows a
read-only "not persisted yet" state. This task makes that selection
create the instance in the background so it can be viewed and edited —
and closes the notes deferral from the notes task.

## Scope (decided with user)

- Selecting a scheduled-but-unpersisted date materializes the instance
  via a new `get_or_create_instance` command, then shows it like any
  persisted instance. Notes work immediately on the new instance —
  the deferred piece of the notes task.
- Persisted instance dates get a visually distinct calendar marker
  (§230: "highlighted with a different color").
- **Deferred**: "current and all future" save scope (#30), workday
  rules, board population (boards don't exist yet — instances are
  only created deliberately here).

## Backend

### `occurs_on` — Rust mirror of `isScheduledOn`

`series.rs` already mirrors `first_occurrence`; add a `occurs_on`
predicate alongside it (same four-digit bound, same weekly Monday
anchor, `workday_after` always false). `get_or_create_instance`
validates the picked date against it — the frontend only offers
scheduled dates, but the command must not trust the client.

### `tasks::get_or_create_instance(profile_id, series_id, date)`

1. `iso_date` on `date`; series row scoped to `profile_id`
   (`series_not_found` for foreign/unknown).
2. Existing task at `series_id` + `scheduled_date` → return it
   (idempotent — double-picks, retries, board-created instances).
3. `occurs_on` fails → `instance_date_not_scheduled` (new `ErrorCode`).
4. INSERT copying the series' shared fields (title, description,
   estimated_minutes, carry_over_rule) + `scheduled_date`, plus the
   series' category set into `task_categories` — a materialized
   instance starts as the series defines it, then diverges like any
   instance (spec §146 says series edits overwrite instance
   customizations, the reverse baseline is the same).
5. Return the task.

`sort_order` takes the same `MAX+1` tail as ordinary creates — board
placement isn't consumed yet anyway.

## Frontend

- `api/series.ts` (or a small `api/instances.ts`): `getOrCreateInstance(seriesId, date)`
  via `Transport`; command registered as `get_or_create_instance`.
- `EditTaskDialog.onPick`: a `Task` → view it as today. `null` → run
  the materialize mutation; while pending keep the pending state but
  as a loading indicator, on success swap `viewed` to the new task
  (same dialog, same keying semantics — `pendingIso` clears).
- Edit affordance: currently hidden whenever `pendingIso !== null` or
  `viewed.id !== task.id`. For a _future_ viewed instance (persisted
  or just-materialized) the Edit button shows — instance scope only;
  series scope still writes the whole series, and the "this and
  future" scope stays disabled until #30.
- Past instances stay read-only except notes (§232, §249).
  Materialization is allowed for **any** scheduled date, past included:
  §266 wants notes manageable on all past and future instances, and a
  past occurrence the user deliberately opens is a reasonable thing to
  record ("this instance existed"). The "no editing past" rule lives in
  the Edit affordance — the backend doesn't gate on "today" (avoids
  timezone coupling in a command anyway).
- `SERVER_ERROR_MESSAGES` gains `instance_date_not_scheduled`.
- Calendar markers: persisted instance → filled dot (current style);
  scheduled-only → outline dot. Both colors must pass AA contrast on
  `surface-raised`.

## Tests

- Rust unit: create returns instance with inherited fields/categories;
  idempotent on repeat call; rejects unscheduled date; rejects foreign
  series; works for a past scheduled date? (decide: backend accepts any
  scheduled date — gating past dates is a UI concern since the backend
  can't know "today" reliably... actually local today is fine, but
  keeping the rule in the UI avoids timezone coupling. Backend = any
  scheduled occurrence.)
- Cucumber: materialize on a scheduled date; repeated pick returns the
  same instance; category inheritance; not-scheduled rejection.
- Vitest: onPick → mutation → viewed swap; edit button on future
  instance; pending state on past date; error surfaces typed copy.
- Playwright e2e: pick future scheduled date → `get_or_create_instance`
  wire call → instance editable → save persists; marker distinction
  visible via aria or class.
- Smoke: existing notes spec already covers the task-level path; add a
  small "materialize and note a future instance" flow? — decide during
  implementation; the wdio suite is expensive and the e2e layer covers
  the contract.
