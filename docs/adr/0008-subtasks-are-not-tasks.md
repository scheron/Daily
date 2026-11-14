# Subtasks have separate records

Status: accepted.

A task needs smaller pieces of work without adding each piece to the board. A subtask is a checkbox
with its own Markdown content. It uses its parent task's day, status, project, milestone, tags, and
priority. It has no comments, history, or board entry. Work that needs more features becomes a task.
The parent task remains the planning unit. Milestones group work across days.

Each subtask has a separate record with its parent task, Markdown content, done state, and list
position. A task can have many subtasks. Each subtask belongs to exactly one task. Subtasks cannot
have their own subtasks.

## Options considered

**Use a task with a `parentId`.** This would reuse task content, attachments, sync, and agent tools.
We rejected it because a task row also carries a status, day, project, and other fields. Every task
list would need to filter out subtasks. This includes the board, calendar, search, milestone
progress, `list_tasks`, and statistics.

A missing filter would put a subtask on the board. The type system would not prevent it. Like the
backlog dates rejected in [ADR 0002](0002-backlog-is-the-absence-of-a-date.md), this makes every caller
responsible for a rule. A separate record lacks the fields task lists read, so it cannot appear in
them by mistake.

**Use Markdown checkboxes in task content.** The editor already supports them. We rejected this
because a checkbox holds one line, while a subtask needs its own body. An agent would also need to
rewrite all parent content to check off one subtask.

## Consequences

The sync snapshot gains a subtask collection, so `Snapshot.version` moves to 13. Each subtask merges
separately by Last-Write-Wins. It does not merge as part of its parent.

Subtask Markdown refers to images through `daily://file/…` links. The file collector must read
subtask content as well as task content. Otherwise, it will delete images that subtasks still use.

Subtasks follow their task's lifetime, as comments do. Soft-deleting a task leaves its subtasks in
place. Restoring the task restores access to them. Permanently deleting a task also deletes its
subtasks and releases their images.

"Make a task" is the only action that converts a subtask. It creates a task with the subtask's
Markdown and copies the parent's status, day, project, milestone, and tags unchanged. It then removes
the subtask. Agents do not have this action. They create a task and delete the subtask themselves.
