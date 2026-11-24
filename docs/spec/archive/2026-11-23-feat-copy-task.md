This is history; the rules that hold now are in `docs/spec/`.

# Plan: Copy Task as structured YAML with subtasks

## Result

"Copy Task Content" currently copies only the task body text, dropping its ID and subtasks. Replacing it with "Copy Task" lets the user copy a complete saved task — its ID, raw Markdown content, and ordered live subtasks — as clean, lossless version 1 YAML ready to paste into an AI agent chat or editor, while blocking copies of tasks that have unsaved edits in the task panel.

## Approach

Add a pure YAML task serializer in the renderer backed by the `yaml` package, harden `subtasks.store` to share in-flight subtask fetches across concurrent callers, and encapsulate the dirty-editor check, lazy subtask loading, error handling, and clipboard write inside one shared `useCopyTask` composable consumed by both the board card menu and the right-panel toolbar.

- Raw YAML (`yaml` `stringify(..., {lineWidth: 0})`) without fenced code-block wrappers — primary consumers are AI agents; literal block scalars avoid `\n`/`\"` escaping noise, save tokens, and preserve `---`, quotes, code fences, raw HTML, trailing spaces, and Unicode losslessly on round-trip.
- Minimal flat schema (`version: 1`, `id`, `content`, `subtasks: [{id, done, content}]`) — Daily's subtask model is flat (`orderKey ASC, id ASC`, live rows only); tasks without subtasks always emit `subtasks: []`, and Markdown/HTML (including `daily://file/...` links) stays verbatim inside string fields.
- Replace "Copy Task Content" with "Copy Task" in both the card context menu and the right-panel toolbar — keeps exactly two clear copy actions (`Copy Task ID` and `Copy Task`) without adding a third toolbar icon or nested dropdown.
- Block copying with an info toast (`"Save changes before copying task"`) whenever the target task is open in the right panel with any unsaved change (`taskEditorStore.isDirty`) — enforces copying only a saved task from both the toolbar and the card menu without blocking other cards.
- Share in-flight `loadSubtasks(taskId)` promises in `subtasks.store` and abort with `"Failed to copy task"` (without writing to the clipboard) if loading subtasks fails — prevents copying a truncated task with `subtasks: []` during lazy loading or IPC failure.
- Keep the serializer local to renderer `utils/tasks/` and add `yaml` to `apps/desktop/package.json` runtime dependencies — only the renderer consumes it today, avoiding speculative promotion to shared packages.

## Out of scope

- Importing tasks from YAML or duplicating tasks inside Daily.
- Copying comments, task history, attachments, or extra task metadata (`status`, `priority`, `project`, `tags`, `scheduled`, time tracking, relations).
- Nested subtasks (Daily's model is flat).
- Wrapping clipboard output in Markdown fenced code blocks or adding new keyboard shortcuts.

## Done and Spec

```text
## Done

1. Right-click a saved task on the board with no subtasks → Copy → "Copy Task" → clipboard holds raw YAML with `version: 1`, the task's `id`, verbatim `content`, and `subtasks: []`, and a "Task copied to clipboard" toast appears — you check
2. Right-click an unopened task on the board with multiple subtasks (checked and unchecked, multi-line Markdown/HTML, code blocks, quotes, `---`, and Unicode) → Copy → "Copy Task" → clipboard holds raw YAML whose parsed `id`, `content`, and `subtasks` (`id`, `done`, `content`) match the task and subtask order verbatim — you check
3. Open a saved task in the right panel and click "Copy Task" in the toolbar (no "Copy Task Content" remains in the toolbar or card menu) → clipboard holds the same raw YAML with the real task ID, the button icon briefly becomes a checkmark, and "Task copied to clipboard" appears — you check
4. Edit any field or text of the open task without saving, then click "Copy Task" in the toolbar or on the same card's context menu → clipboard stays unchanged and a "Save changes before copying task" toast appears; copying a different card on the board still works — you check
5. Save the edits in the right panel and click "Copy Task" again → clipboard holds the updated YAML — you check

## Spec

+ task-copy — Copying a task
  About: Copying a whole task with its subtasks to the clipboard for agents and editors.
+ task-copy#yaml-structure — Copy Task replaces Copy Task Content in the card menu and task toolbar and copies raw version 1 YAML with the task ID, verbatim Markdown content, and ordered live subtasks
  Why: AI agents need the full task and subtasks in a structured, lossless, token-efficient format without fenced wrappers or escaped newlines
  Done: 1, 2, 3
+ task-copy#blocks-unsaved-draft — Copying a task that is open in the task panel with unsaved changes refuses the copy and shows a save-first toast without changing the clipboard
  Why: copying an unpersisted draft would hand an agent content that differs from what Daily has saved
  Done: 4, 5
```
