This is history; the rules that hold now are in `docs/spec/`.

# Plan: Daily creates tasks only in its main window

## Result

Quick Task is an unused panel that runs as a second Electron process behind a global shortcut. After
this plan the user creates tasks in the main window: the panel, its slash-menu window, the shortcut,
the menu-bar item and the Quick Task settings are gone. The slash menu still works in every editor,
the menu-bar icon still opens Daily, and an existing profile starts unchanged.

## Approach

Remove the feature, not its traces. The renderer stops consuming Quick Task first, so the main
process and the settings type can then go without leaving a caller behind. The slash-menu contract
is shared by every editor in the app and outlives the panel; it moves to the component that renders
its rows. ADR 0010 (`docs/adr/0010-no-capture-outside-the-main-window.md`) records the decision.

- No replacement shortcut — a hotkey that raises the main window is a new feature, and it keeps the
  global-shortcut surface this removal retires.
- `QuickTaskMenu` becomes `SlashMenu`, owned by `SlashCommandRows` — the editor already imports that
  component, so the dependency direction does not change and no cycle appears.
- `caretX` goes with the external menu window; the internal popup positions through `getAnchor`.
  `MarkdownEditor` loses `externalMenu` and `menu` — one popup, one code path.
- Leftovers are ignored, not cleaned: the `quickTask` key stays in the local settings blob and the
  `Daily-QuickTask*` cache directories stay on disk. Cleanup code would be new surface serving a
  deleted feature.
- The `quickCapture` → `quickTask` migration and its test stay — the migration is untyped, so it
  compiles after the field leaves `Settings`, and deleting it breaks pinned behaviour for no gain.
- No version moves: settings never cross the wire and the snapshot carries no settings document, so
  neither `Snapshot.version` nor the transport protocol version changes.
- `isValidAccelerator` goes with its last consumers — unused code is deleted; git keeps it.
- The menu-bar icon and "Open Daily" stay; only the Quick Task item goes.
- Breaking change: a shortcut users could configure disappears, so the next release takes a major
  version. The CHANGELOG entry is written at that release, not here.

## Out of scope

- Any replacement capture: global hotkey, panel, tray quick-add.
- Cleanup of orphaned settings keys or cache directories; removal of the settings migration.
- Snapshot or protocol version bumps; build and packaging changes — Quick Task was never a separate
  build target, it is the same bundle respawned with a flag.
- CHANGELOG entry, version bump, release.
- Unrelated refactoring, including the `Branch`/project naming.

## Done and Spec

```text
## Done

1. Start the app on the existing `Daily-dev` profile → the main window opens and the log carries no
   error.
2. Press ⌘⌥Space from another app → no panel appears — you check
3. Open the menu-bar icon → there is no Quick Task item, and "Open Daily" raises the main window —
   you check
4. Settings → General → no Quick Task switch and no hotkey row, and the description does not name
   Quick task.
5. Create a task in the main window → it appears in the day.
6. Type `/` in a task editor, a comment, a subtask, a milestone row and a project description → the
   slash menu opens and the chosen row applies.
7. In the Day frame select A, `Cmd`+click B → the menu stays open, A and B have checkmarks, tasks from
   both appear with project labels, the button shows "A, B" with the layers icon.
8. Select No project and A → only tasks without a project and tasks from A appear.
9. Select A and B, both with a "bug" tag, then "bug" in the tag dock → tasks with "bug" from both
   projects appear.
10. Select A and B, create a task with the shortcut → it goes to No project.
11. Start the demo build → it seeds and opens with no Quick Task hotkey — you check
12. Search the source for Quick Task → only CHANGELOG history and the spec archive mention it.
13. Settings → General reads like the rest of Settings — you check

## Spec

~ project-menu#several-as-all — Several selected projects behave like All projects within that set
  Why: a set needs the same behavior as All projects. New tasks go to No project, as they do with All projects.
  Done: 7, 8, 9, 10
```
