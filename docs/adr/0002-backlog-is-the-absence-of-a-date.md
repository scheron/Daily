# A task is in the backlog exactly when it has no date

Status: replaced by [Six task statuses and display-only board modes](0007-six-task-statuses-and-board-modes.md).
The decision below records the old rule. Ready for Agent now also allows no date.

Daily needed a place for work that has not been scheduled. Such work should not have an arbitrary
date. We added a fourth task status, `backlog`, alongside `active`, `done`, and `discarded`.

A task has status `backlog` **if and only if** its `scheduled` value is null. Clearing `scheduled`
clears the date, time, and timezone together. Status and schedule express one rule. One shared
function enforces it, so each caller does not need its own check.

The complete set of transitions:

| From           | To                        | Date           | Status               |
| -------------- | ------------------------- | -------------- | -------------------- |
| any column     | Backlog column            | cleared        | `backlog`            |
| Backlog column | Active / Done / Discarded | the active day | that column's status |
| any column     | a day in the calendar     | that day       | preserved            |
| Backlog column | a day in the calendar     | that day       | `active`             |

## Options considered

**Keep a date on backlog tasks and exclude them from day queries.** This is cheaper to build.
Fields stay non-nullable, callers stay unchanged, and queries need only one more condition. We
rejected it because the stored date would be false. Each reader would need to know which dates
represent real plans. This moves the rule out of the type system and into every caller.

**Move backlog tasks into a separate container.** We rejected this because task movement already
uses status. This includes columns, drag and drop, context menus, and filters. A new status reuses
that behavior. A separate container would need a second implementation.

**Keep status and date independent.** We rejected this because it allows states with no useful
meaning. Examples include a done task with no day and a backlog task scheduled for Tuesday. Every
caller would need extra conditions to handle these states.

## Consequences

`Task.scheduled` can be null. Every caller that reads a task must handle this. The type system makes
the cost explicit.

There is no separate control to clear a date. Moving a task to Backlog clears its date through the
status change. This gives the transition one entry point. Editing a date field cannot accidentally
clear the day of a resolved task.

`Snapshot.version` moved from 4 to 5 because schedule fields became nullable and the allowed statuses
changed. Older apps must reject this snapshot before sync. Otherwise, an import could fail partway
through a write.

One shared function owns the rule. It first lived in `TasksService`. When the renderer started
predicting writes, the rule moved into a pure function shared by the main process and the renderer.
This also made it testable without a database. A second implementation of the rule is a bug.
