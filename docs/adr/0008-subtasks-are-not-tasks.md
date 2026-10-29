# Subtasks are their own record, not tasks with a parent

Status: accepted.

A task needed a way to hold its own small pieces of work without each piece cluttering the board
beside it. A subtask is a checkbox with its own markdown, and it takes everything else from its
parent: day, status, project, milestone, tags, priority. It has no comments, no history and no
place on the board. Anything that needs more than that is made into a task. The planning unit
stays the parent, and work spread across days stays a milestone's job.

We store a subtask as its own record, holding the task it belongs to, its markdown, whether it is
done and its place in the list. One task has many subtasks, and a subtask belongs to exactly one
task, one level deep.

## Considered Options

**A task with a `parentId`.** This was the obvious path: content, attachments, sync and the agent
tools would all come for free. We rejected it because a task row carries a status, a day, a
project and the rest, and every reader that lists tasks would have to filter children out: the
board, the calendar, search, milestone progress, the focus session, `list_tasks` and statistics.
Missing one filter puts a subtask on the board, and nothing in the type stops it. That is the cost
[ADR 0002](0002-backlog-is-the-absence-of-a-date.md) rejected for backlog dates, moved into
everyone's head instead of the type. A separate record cannot leak into a task list, because it
has none of the fields a task list reads.

**Markdown checkboxes in the task's content.** These already exist in the editor. We rejected them
because a checkbox holds one line, and a subtask needs a body worth writing. Agents also could not
check one off without rewriting the parent's whole content.

## Consequences

The sync snapshot gains a collection of its own, so `Snapshot.version` moves to 13. Subtasks merge
by Last-Write-Wins one at a time, not as part of the parent.

Images in a subtask are anchored by `daily://file/…` links in the subtask's own markdown, so the
file collector must read subtask content as well as task content, or it will delete them.
Subtasks share their task's lifetime the way comments do. Soft-deleting a task leaves its subtasks
untouched, so restoring the task brings them back. Deleting the task for good deletes them too,
and that frees their images.

"Make a task" is the only way out. It creates a task with the subtask's markdown, copies the
parent's status, day, project, milestone and tags as they are, and removes the subtask. Agents do
not get this action. They create the task and delete the subtask themselves.
