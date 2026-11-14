# Six task statuses and display-only board modes

Status: [ADR 0009](0009-planning-is-separate-from-execution.md) adds To Do and scheduling defaults.
This decision replaces [ADR 0002](0002-backlog-is-the-absence-of-a-date.md)'s rule that no date always means Backlog.

Prepared work and work waiting to merge need separate statuses. Daily stores exactly six:
`backlog`, `ready_for_agent`, `in_progress`, `ready_to_merge`, `done`, and `cancelled`.
Migration changes `active` to `in_progress` and `discarded` to `cancelled`. Snapshot version 12
makes older clients reject these statuses before import.

Backlog has no schedule. Ready for Agent allows a complete schedule or null. Moving a task to
Ready for Agent keeps its schedule or lack of one. Assigning or clearing its day keeps that status.
The other four statuses require a schedule. Only Done and Cancelled resolve work. Both ready
statuses still block dependent tasks and milestone closure.

Normal and Agents are global board modes. They do not depend on the Day or Milestone view or the
project. Normal groups Ready for Agent under Backlog and Ready to Merge under In Progress. Agents
shows all six columns. Changing modes never changes task status, schedule, order, or history.

Reordering within a grouped column keeps the task's exact status and date. Moving a task to another
column uses that column's main status. Scheduling an undated ready task assigns its day and keeps
its ready status. The Day board shows that day's ready tasks and all undated ready tasks. The
Milestone view stays limited to the selected milestone.

Shared tools always read and write exact statuses, regardless of the local board mode. The
Assistant wrapper and OAuth/MCP host use the same schemas and `WorkStorage` operations. Preparing
work does not start an agent. Ready to Merge does not merge work automatically.

## Consequences

Backlog always means no day. A task with no day can also be Ready for Agent. Callers use shared
scheduling and grouping rules instead of guessing status from the date.

Historical event types stay unchanged. Batch writes remain atomic: either all changes succeed or
none do. History and comments keep the actor source supplied by the host.
