# Copying a task

Copying a whole task with its subtasks to the clipboard for agents and editors.

### yaml-structure — Copy Task replaces Copy Task Content in the card menu and task toolbar and copies raw version 1 YAML with the task ID, verbatim Markdown content, and ordered live subtasks

Why: AI agents need the full task and subtasks in a structured, lossless, token-efficient format without fenced wrappers or escaped newlines

- Right-click a saved task on the board with no subtasks → Copy → "Copy Task" → clipboard holds raw YAML with `version: 1`, the task's `id`, verbatim `content`, and `subtasks: []`, and a "Task copied to clipboard" toast appears
- Right-click an unopened task on the board with multiple subtasks (checked and unchecked, multi-line Markdown/HTML, code blocks, quotes, `---`, and Unicode) → Copy → "Copy Task" → clipboard holds raw YAML whose parsed `id`, `content`, and `subtasks` (`id`, `done`, `content`) match the task and subtask order verbatim
- Open a saved task in the right panel and click "Copy Task" in the toolbar (no "Copy Task Content" remains in the toolbar or card menu) → clipboard holds the same raw YAML with the real task ID, the button icon briefly becomes a checkmark, and "Task copied to clipboard" appears

### blocks-unsaved-draft — Copying a task that is open in the task panel with unsaved changes refuses the copy and shows a save-first toast without changing the clipboard

Why: copying an unpersisted draft would hand an agent content that differs from what Daily has saved

- Edit any field or text of the open task without saving, then click "Copy Task" in the toolbar or on the same card's context menu → clipboard stays unchanged and a "Save changes before copying task" toast appears; copying a different card on the board still works
- Save the edits in the right panel and click "Copy Task" again → clipboard holds the updated YAML
