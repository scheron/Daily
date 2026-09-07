---
status: accepted
date: 2026-09-07
---

# Backlog becomes the fourth `TaskStatus`, tied to the nullable schedule

`docs/adr/0001-nullable-scheduled-object.md` made "no schedule" a real state: `Task.scheduled` is `{date, time, timezone} | null`. Until now, that null was the only signal a task was parked — `status` stayed one of `active`, `done` or `discarded` regardless. The decision is to make `backlog` a fourth `TaskStatus` and to tie the two together as one invariant, enforced in `TasksService` alone: `status === "backlog"` if and only if `scheduled === null`. Leaving the backlog through any path gives the task a day; entering it through any path clears the one it had. `BoardStatus` (`Exclude<TaskStatus, "backlog">`) names the three columns the board still shows, since the backlog is not one of them — it lives in the sidebar as its own column.

## Considered options

**Two orthogonal fields: keep `status` at three values and add a separate `isBacklogged` (or similar) flag.** Rejected. It states "this task is parked" in two places — `scheduled === null` and the flag — and gives no rule for what happens when they disagree, which they eventually will under last-write-wins sync. `docs/adr/0001` rejected the same shape of problem for the schedule itself; a second flag reopens it one level up.

**A UI-only fourth column, with `status` and `scheduled` unchanged underneath.** Rejected. It leaves the actual rule ("no date" = "in the backlog") implicit in whatever component happens to render the column, so every caller — the board, the editor, the CLI, the assistant — has to know and repeat it. The plan needs one place that can say a task is parked and have every layer agree, including a task the assistant moves without ever seeing a column.

## Consequences

- A schedule-less task and a `backlog` task are now the same fact stated once, not two facts a caller must keep in sync — the same reasoning `docs/adr/0001` used for the schedule itself, carried one level up.
- `TaskEventType` gains `backlogged`, so leaving `active`/`done`/`discarded` for the backlog is its own recorded event, distinct from `reactivated`.
- `TaskStatus` now has four members everywhere it appears; call sites that build a `Record<TaskStatus, …>` over board columns must switch to `BoardStatus`, or they silently drop the backlog's tasks from whatever they compute.
- Existing rows are brought into the invariant by migration `v010`: an unscheduled `active` task becomes `backlog`; an unscheduled `done`/`discarded` task keeps its status and is given a schedule derived from its own `updated_at`, so no row is left violating the rule either way.
- `Snapshot.version` moves to `6`, since a snapshot may now carry a `backlog` status a version-5 reader would not recognize as meaningful.
