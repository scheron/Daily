This is history. The current rules are in `docs/spec/`.

# Plan: Select several projects in the dock menu with Cmd

## Result

The dock project menu selects one project or all projects. It cannot show two or three projects together. After this plan, `Cmd`+click in the Day frame builds a selection from any projects, including No project. The task list shows tasks from that selection at once. The dock button shows what is selected. The selection behaves like All projects within its set and stays after a restart. Daily task: `DT-qi4uUNiiI9GZOL9R0Omx8`. Its comment records the decisions.

## Approach

The dock selection becomes a set of project IDs in the Mac's local settings, beside the current `activeId` and `isAllProjects`. The project store answers three questions: which projects are in the filter, whether all projects are selected, and whether more than one is selected. The last check replaces the current All projects check in every caller. This gives the set the same behavior as All projects without separate logic in each caller. The dock menu reads `Cmd`; other project menus ignore it.

- All projects stays a flag, rather than a list of every ID. Selecting every project becomes that flag. A project created later then appears in All projects at once.
- The set keeps the order in which projects were added. `activeId` is the last project in the set. The Milestone frame and anything that needs one project keep reading `activeId` as before.
- Read old settings as a set with one `activeId`. The update does not reset the selection.
- Keep the snapshot version unchanged. Settings do not sync; `normalizeSnapshotDocs` drops them.
- With All projects selected, `Cmd`+click X selects every project except X, in menu order. Keep `activeId` unless it is X. If it is X, use the last project in the set.
- Remove a project from the set when Settings deletes it. If the set becomes empty, select No project, as when the active project is deleted today.

## Out of scope

- Selecting several projects in task details, the card context menu, or the Milestone frame.
- `Cmd+Enter` in menu search and moving between rows with the keyboard.
- Syncing the selection between Macs.
- Renaming `Branch` to project.
- A different project for new tasks. New tasks go to No project, even if it is outside the selection.

## Done and Spec

```text
## Done

1. In the Day frame, select project A. Hover over the dock menu and `Cmd`+click B → the menu stays open. A and B have checkmarks. Tasks from both projects appear with project labels on their cards. The button shows "A, B" with the layers icon.
2. `Cmd`+click C → the button shows "A, B +1".
3. `Cmd`+click B → its checkmark and tasks disappear. If only A is selected, `Cmd`+click A → nothing changes.
4. Click B without `Cmd` → only B is selected and the menu closes.
5. `Cmd`+click each project to select them all → All projects also gets a checkmark and the button shows "All projects". `Cmd`+click A → every project except A stays selected. All projects loses its checkmark.
6. `Cmd`+click All projects → everything is selected and the menu closes. All projects and every project have checkmarks.
7. Select No project and A → only tasks without a project and tasks from A appear.
8. Select A and B, adding B last. Switch to the Milestone frame → only B is selected in the menu and B's milestones appear. Return to Day → A and B are selected again.
9. Select A and B, both with a "bug" tag. Select "bug" in the tag dock → tasks with "bug" from both projects appear.
10. Select A and B. Create one task with the shortcut and another through Quick Task → both tasks go to No project.
11. Select A and B. Open a task from project C through search → only C is selected. Select A and B again. Open a task from A through search → the selection stays the same.
12. Select A and B. Delete B in Settings → only A is selected.
13. Select A and B. Restart the app → A and B are selected.
14. In task details and the card context menu, `Cmd`+click a project → one project is selected and the menu closes, as before.
15. With several projects selected, open the dock menu → each selected project has a gray checkmark on the right. The button label is readable in the dock. — you check

## Spec

+ project-menu#cmd-multi-select — In the Day dock, Cmd+click selects or deselects a project and keeps the menu open; the last selected project cannot be deselected
  Why: the dock filters tasks. It must show several projects without selecting All projects. An empty filter would show nothing.
  Done: 1, 3, 4, 14
+ project-menu#all-is-every-project — Selecting every project means All projects: every project and All projects have checkmarks
  Why: the same state must look the same, however it was selected. A project created later appears in All projects at once.
  Done: 5, 6
+ project-menu#several-as-all — Several selected projects behave like All projects within that set
  Why: a set needs the same behavior as All projects. New tasks go to No project, as they do with All projects.
  Done: 1, 7, 9, 10
+ project-menu#several-label — For several projects, the dock button shows two names in menu order, "+n", and the layers icon
  Why: the names show what is selected. The layers icon already means "several projects".
  Done: 1, 2
+ project-menu#milestone-one-project — The Milestone frame uses the last project added to the selection; Day restores the full selection
  Why: a milestone always belongs to one project.
  Done: 8
~ menus#same-as-priority — Selection menus follow the priority and status menus: each selected row has a gray checkmark on the right, without a highlight color
  Why: consistent menus are easy to read without learning each one. The priority and status menus set the pattern.
```
