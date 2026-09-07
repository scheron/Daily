# Daily

Daily is a local-first, day-first task manager for macOS. Work is planned in days rather than in an endless list: a task belongs to a day, and the day is the unit a person thinks in.

## Language

### Work

**Task**:
A single piece of work, written as Markdown. The only unit a person creates, schedules, tags and completes.
_Avoid_: issue, ticket, todo, card, item

**Active**:
The status of a task still to be done.
_Avoid_: open, pending, in progress

**Done**:
The status of a task that was completed.
_Avoid_: closed, finished, resolved

**Discarded**:
The status of a task deliberately abandoned without being done. Not the same as deleted — a discarded task is kept, shown and counted.
_Avoid_: cancelled, archived, rejected, dropped

**Estimate**:
How long a task is expected to take, as set by the person.
_Avoid_: points, size, effort

**Spent time**:
How long a task actually took.
_Avoid_: logged time, actual, tracked time

### Time

**Day**:
The unit work is planned in. A scheduled task belongs to exactly one.
_Avoid_: date, bucket, slot

**Schedule**:
The day, time and timezone a task is placed on. A task either has one or is Backlog.
_Avoid_: due date, deadline, planned date

**Backlog**:
The status of a task waiting for a day, with no schedule. The fourth status, alongside Active, Done and Discarded — but shown in the sidebar, not the board.
_Avoid_: inbox, someday, unplanned, icebox

**Active day**:
The day currently selected on the board, which is not necessarily today.
_Avoid_: current day, selected date, today

### Grouping

**Project**:
An isolated space of tasks. A task belongs to exactly one.
_Avoid_: branch, workspace, space

**Tag**:
A named, coloured label on a task. A task may carry several.
_Avoid_: label, category, topic

**Milestone**:
A named goal inside a project, optionally dated, that tasks can be assigned to.
_Avoid_: epic, sprint, release, phase, iteration

### Relations

**Relation**:
A link between two tasks — either directional, where one blocks the other, or symmetric.
_Avoid_: dependency, link, reference, connection

**Blocks**:
The directional relation. Read from the other end it is _blocked by_; it is one relation, not two.
_Avoid_: depends on, requires, precedes

**Related**:
The symmetric relation between two tasks that bear on each other without one holding up the other.
_Avoid_: linked, associated, see also

**Blocked**:
The state of a task that something unfinished is blocking. Derived from its relations, never set by hand, and not a status.
_Avoid_: waiting, stuck, on hold, paused

### Surfaces

**Board**:
The three columns — Active, Done, Discarded — showing the tasks of whatever is selected.
_Avoid_: kanban, columns, list

**Display mode**:
Which axis the board is cut along: days or milestones.
_Avoid_: view, tab, layout

**Activity**:
The record of meaningful changes to tasks.
_Avoid_: log, history, audit trail, feed

**Assistant**:
Daily's built-in task agent. It acts through Daily's own task operations and nothing else.
_Avoid_: bot, AI, chat, copilot

### Sync

**Remote**:
A configured destination that carries snapshots — iCloud Drive, a folder, or SSH.
_Avoid_: backend, server, provider, cloud

**Snapshot**:
The state Daily writes to a remote and merges back from it.
_Avoid_: backup, dump, export, sync file
