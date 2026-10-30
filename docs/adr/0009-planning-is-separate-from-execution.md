# Planning is separate from execution

Status: accepted. Extends [ADR 0007](0007-six-task-statuses-and-board-modes.md).

Scheduling work does not mean execution has started. Daily stores seven exact statuses:
`backlog`, `todo`, `ready_for_agent`, `in_progress`, `ready_to_merge`, `done`, and `cancelled`.
To Do means planned for a day; In Progress means work has actually started.

Backlog has no schedule. Assigning it a day makes it To Do; clearing To Do's day returns it to
Backlog. Moving a scheduled task to another day preserves its exact status. Ready for Agent
continues to accept a schedule or null and keeps readiness when its day is assigned or cleared.
The other five statuses require a schedule. An explicit status takes priority over automatic
scheduling transitions.

Automatic dated creation and duplication of resolved work use To Do. Undated Backlog drafts
remain Backlog. The shared Assistant and MCP tools default new tasks to To Do on the caller's
own day, or Backlog for an explicit null date. An explicit request to start work uses In Progress.
Only Done and Cancelled resolve work; To Do continues to block dependencies and milestone closure.

Normal shows Backlog, To Do, In Progress, Done and Cancelled, retaining its grouping of Ready for
Agent under Backlog and Ready to Merge under In Progress. Agents exposes all seven statuses.
Missing To Do is inserted after Backlog in saved column order; existing relative order and an
already saved To Do position are preserved. Board mode remains display-only.

## Consequences

SQLite migration v020 and snapshot version 14 add To Do without reclassifying existing tasks or
rewriting history. Older clients reject the newer snapshot before importing an unknown status.
The transport protocol is unchanged. Shared schemas derive their statuses from `TASK_STATUSES`;
Assistant and OAuth/MCP exercise the same exact-status contract. Batch writes remain atomic and
history and comments retain the host's actor source.
