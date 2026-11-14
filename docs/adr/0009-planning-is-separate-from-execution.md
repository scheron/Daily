# Planning is separate from execution

Status: accepted. Extends [ADR 0007](0007-six-task-statuses-and-board-modes.md).

Scheduling work does not mean work has started. Daily stores seven exact statuses:
`backlog`, `todo`, `ready_for_agent`, `in_progress`, `ready_to_merge`, `done`, and `cancelled`.
To Do means planned for a day. In Progress means work has started.

Backlog has no schedule. Assigning it a day changes it to To Do. Clearing To Do's day returns it to
Backlog. Moving a scheduled task to another day keeps its exact status. Ready for Agent still allows
a schedule or null. Assigning or clearing its day keeps it Ready for Agent. The other five statuses
require a schedule. An explicitly chosen status takes priority over automatic changes caused by
scheduling.

Creating a dated task with automatic status uses To Do. Duplicating a resolved task also uses To Do.
Undated Backlog drafts remain Backlog. Shared Assistant and MCP tools default new tasks to To Do on
the caller's own day. An explicit null date defaults to Backlog. An explicit request to start work
uses In Progress. Only Done and Cancelled resolve work. To Do still blocks dependent tasks and
milestone closure.

Normal shows Backlog, To Do, In Progress, Done, and Cancelled. It still groups Ready for Agent under
Backlog and Ready to Merge under In Progress. Agents shows all seven statuses. If a saved column
order has no To Do, it is inserted after Backlog. Existing columns keep their relative order. A
saved To Do position stays unchanged. Board mode changes only the display.

## Consequences

SQLite migration v020 and snapshot version 14 add To Do. They do not change existing task statuses
or rewrite history. Older clients reject the newer snapshot before importing an unknown status.
The transport protocol stays unchanged.

Shared schemas get their statuses from `TASK_STATUSES`. The Assistant and OAuth/MCP use the same
rules for exact statuses. Batch writes remain atomic: either all changes succeed or none do.
History and comments keep the actor source supplied by the host.
