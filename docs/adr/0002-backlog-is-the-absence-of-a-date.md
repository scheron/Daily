# A task is in the backlog exactly when it has no date

Daily needed somewhere for work that is real but not yet scheduled, so that it stops being a lie
parked on an arbitrary day. We made that a fourth task status — `backlog`, beside `active`, `done`
and `discarded` — and tied it to the schedule by a biconditional: a task's status is `backlog` **if
and only if** its `scheduled` is null, and `scheduled` is nulled whole, date, time and timezone
together. The two facts are one fact wearing two hats, so the invariant is enforced in one place
rather than defended in every consumer.

The complete set of transitions:

| From           | To                        | Date           | Status               |
| -------------- | ------------------------- | -------------- | -------------------- |
| any column     | Backlog column            | cleared        | `backlog`            |
| Backlog column | Active / Done / Discarded | the active day | that column's status |
| any column     | a day in the calendar     | that day       | preserved            |
| Backlog column | a day in the calendar     | that day       | `active`             |

## Considered Options

**Keep a date on a backlog task and filter it out of day queries.** Cheaper to build: nothing becomes
nullable, no consumer changes, and the existing queries grow one clause. Rejected because the stored
date would be a lie. Some day would be carrying a task that nobody intends to do then, and every
reader would have to know which dates were real. The cost does not disappear, it just moves from the
type into everyone's head.

**A separate container that backlog tasks are moved into.** Rejected because everything that already
moves tasks — the columns, drag and drop, the context menu, the filters — is keyed on status, so a
status costs almost nothing while a parallel container needs all of that built a second time.

**Status and date as independent fields.** Rejected because it admits states nobody can act on: a
task that is done but has no day, or one that is in the backlog and scheduled for Tuesday. Neither
means anything, and allowing them puts a branch in every consumer forever.

## Consequences

`Task.scheduled` is nullable, and every consumer of a task now accounts for that. This is the price
paid, and it is paid in the type system rather than in behaviour, which is the trade we wanted.

There is no control that clears the date on its own. Clearing a date is what moving a task to the
backlog does, and it is reached through the status, so there is exactly one route to the transition
and a resolved task can never lose its day as a side effect of someone touching a date field.

The sync snapshot shape changed with it — `Snapshot.version` moved from 4 to 5 — because the
scheduled fields became nullable and the set of legal status values grew. Without the bump an older
app would pull a snapshot it cannot insert and fail part-way through a write, instead of refusing
the sync cleanly.

The invariant has one home. It lived in `TasksService` and moved into a pure rule shared by the main
process and the renderer when the renderer began predicting its own writes; that move is what first
made it testable without a database. Wherever it lives, it is one function — a second place that
enforces it is a bug, not redundancy.
