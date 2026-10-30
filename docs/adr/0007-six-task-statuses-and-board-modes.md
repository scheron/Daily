# Six task statuses and display-only board modes

Status: extended by [ADR 0009](0009-planning-is-separate-from-execution.md) with To Do and scheduling defaults. Supersedes [ADR 0002](0002-backlog-is-the-absence-of-a-date.md)'s equivalence between backlog and the absence of a date.

Prepared work and work awaiting merge are distinct outstanding states. Daily stores exactly
`backlog`, `ready_for_agent`, `in_progress`, `ready_to_merge`, `done`, and `cancelled`.
Legacy `active` and `discarded` migrate to `in_progress` and `cancelled`. Snapshot version 12
makes clients that cannot understand the new states refuse them before import.

Backlog has no schedule. Ready for Agent accepts either a complete schedule or null. Entering
Ready for Agent preserves the schedule or its absence, and assigning or clearing its day preserves
readiness. The other four statuses require a schedule. Only Done and Cancelled resolve work;
both ready states continue to block dependent tasks and milestone closure.

Normal and Agents are global display choices, independent of the day/milestone frame and project.
Normal groups Ready for Agent under Backlog and Ready to Merge under In Progress. Agents exposes
all six columns. Changing the display never writes task status, schedule, order, or history.
Reordering inside a grouped column preserves exact status and date; an explicit column transfer
uses the destination column's canonical status. Scheduling an undated ready task assigns its day
without changing readiness. The day board includes that day's ready tasks plus the undated ready
queue; the milestone frame keeps the selected milestone's scope.

The shared tools always read and write exact statuses, irrespective of the local display choice.
The Assistant's wrapper and the OAuth/MCP host use the same schemas and WorkStorage operations.
Preparing work does not start an agent; Ready to Merge does not merge anything automatically.

## Consequences

The old biconditional becomes one-way: Backlog implies no day, but no day can also mean Ready for
Agent. Consumers use shared scheduling and grouping rules rather than inferring status from date.
Historical event types remain unchanged. Batch writes remain atomic and preserve the host's actor
source for history and comments.
