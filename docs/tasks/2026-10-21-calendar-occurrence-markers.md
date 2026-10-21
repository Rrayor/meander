# Task: calendar occurrence markers (plan #27)

Highlight dates in the details-view instance calendar that are supposed to
have a series instance. Plan item #27 also said "the calendar shouldn't be
clickable yet", but #26 already shipped click-to-load-instance — that part is
kept; this task is purely the visual marker.

## Shipped

- Scheduled days (per `isScheduledOn`) and persisted off-schedule instances
  render a primary dot under the day number, matching the Stitch design
  (`.stitch/designs/task-details-dialog.html`): `bg-primary` dot,
  `bg-on-primary` on the selected day.
- Marker is `aria-hidden`; the day button's ISO `aria-label` already conveys
  selectability, and persisted/pending are not visually distinguished per the
  design.

## Deferred

- Distinguishing persisted vs scheduled-but-unpersisted days visually — the
  approved design uses one uniform dot; revisit if users need the split.
