# Frontend refactor — deferred items

The component-architecture refactor
(`docs/superpowers/specs/2026-11-01-frontend-component-architecture-design.md`)
parked two call sites whose hand-rolled behavior needs a shared primitive
that does not exist yet. Neither blocks the refactor; each is listed here
so the deferral is a decision, not an oversight.

## Deferred items

### `ProfileSwitcher` menu — needs a `Menu` primitive

`src/layout/ProfileSwitcher.tsx` keeps its pre-refactor hand-rolled
dropdown: a `role="menu"` `<ul>` whose items are `role="menuitem"`
buttons, opened/closed by a trigger with `aria-haspopup="menu"`.

- **Primitive needed:** a `Menu` wrapping `@base-ui/react/menu` in
  `src/shared/ui/` (styled `Root/Trigger/Portal/Positioner/Popup/Item`
  parts, following the `Select` precedent).
- **A11y gap until then:** the menu has no arrow-key navigation between
  items and no Escape handling of its own (a document-level
  `keydown`/`onBlur` close approximates dismissal, but focus is not
  managed — no focus move into the menu on open, none back to the
  trigger on close). Menus are also expected to close on
  `Tab`/outside-press via the library, which the hand-rolled version
  only partially reproduces.
- **Migration note:** Base UI `Menu` owns the trigger itself; the
  current open-state + blur-container wiring is replaced wholesale, not
  adapted.

### `BoardHeader` jump-calendar popover — needs a `Popover` primitive

`src/features/board/BoardHeader.tsx` dismisses the week-jump calendar
via a `fixed inset-0 z-10` transparent click-catcher `<button>` plus a
document-level Escape listener that manually returns focus to the
trigger.

- **Primitive needed:** a `Popover` wrapping `@base-ui/react/popover`
  in `src/shared/ui/` (styled `Root/Trigger/Portal/Positioner/Popup`
  parts).
- **Until then:** the click-catcher stays — it preserves the
  outside-press-to-close behavior a popover supplies natively (Base UI
  also restores focus to the trigger and closes on Escape, both
  currently hand-wired).
- **Migration note:** the trigger already carries
  `aria-haspopup="dialog"` + `aria-expanded`, which map directly onto
  the primitive's trigger part; `WeekJumpCalendar` becomes the popup
  content unchanged.
