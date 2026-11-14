# Project selection menu

A project list with search. In the dock, it changes the active project. For a task, it sets the task's project.

### order — Show All projects first, where available, then No project, then projects in alphabetical order, ignoring case

Why: All projects shows every task. No project shows tasks without a project, the default from the first launch. User-created projects follow these rows.

- In the Day frame, open the dock menu → All projects is first, then No project, then projects in alphabetical order, ignoring case.
- Open Project in the card context menu → No project is first, then projects in alphabetical order. There is no All projects row.

### create-from-search — Create a project from a name that is not in the search results and select it at once

Why: when search finds no project, the next step is to create one. This avoids a trip to Settings, as tags already do.

- Enter a name that does not exist → a `Create "<name>"` row appears at the bottom. Select it → the menu creates and selects the project, then closes. In the dock, the project becomes active. For a task, it becomes the task's project.

### exact-match-no-create — Hide Create when a project name matches after ignoring case and spaces at the start and end

Why: the field is mainly for search. An exact match means the project was found. Create duplicate names in Settings; IDs keep projects distinct.

- Enter an existing project name with different case or spaces at the start or end → there is no Create row. The matching project appears in the list.

### create-failure-keeps-input — If creation fails, show a toast and keep the menu open with the entered name

Why: the name stays in the field, so creation can be retried.

- Creation from the menu fails → a "Failed to create project" toast appears. The menu stays open and keeps the entered name.

### all-projects-dock-day — Show All projects only in the dock and only in the Day frame

Why: a milestone always belongs to one project, so a milestone across all projects has no meaning. A task belongs to exactly one project.

- In the Milestone frame, open the dock menu → there is no All projects row. Task details and the card context menu never show it, in any frame.

### dock-opens-on-hover — Open the dock menu on hover and the task details menu on click

Why: the dock changes filters quickly, like the day or tag filter. In the editor, selecting a project is a deliberate task change.

- Hover over the project in the dock → the menu opens without a click. Hover over Project in task details → the menu stays closed. Click to open it.

### no-project-row — Show No project as a row in task details and the card context menu; selecting it clears the project

Why: select the empty value from the list, as with No priority. There is no clear button.

- Open Project in the details of a task with a project → the menu has a No project row. Select it → the property shows "No project" in gray. Open the menu again → No project is selected.
- Select No project in the card context menu → the task has no project.

### cmd-multi-select — In the Day dock, Cmd+click selects or deselects a project and keeps the menu open; the last selected project cannot be deselected

Why: the dock filters tasks. It must show several projects without selecting All projects. An empty filter would show nothing.

- In the Day frame, select project A. Hover over the dock menu and `Cmd`+click B → the menu stays open. A and B have checkmarks. Tasks from both projects appear with project labels on their cards. The button shows "A, B" with the layers icon.
- `Cmd`+click B → its checkmark and tasks disappear. If only A is selected, `Cmd`+click A → nothing changes.
- Click B without `Cmd` → only B is selected and the menu closes.
- In task details and the card context menu, `Cmd`+click a project → one project is selected and the menu closes, as before.

### all-is-every-project — Selecting every project means All projects: every project and All projects have checkmarks

Why: the same state must look the same, however it was selected. A project created later appears in All projects at once.

- `Cmd`+click each project to select them all → All projects also gets a checkmark and the button shows "All projects". `Cmd`+click A → every project except A stays selected. All projects loses its checkmark.
- `Cmd`+click All projects → everything is selected and the menu closes. All projects and every project have checkmarks.

### several-as-all — Several selected projects behave like All projects within that set

Why: a set needs the same behavior as All projects. New tasks go to No project, as they do with All projects.

- In the Day frame, select project A. Hover over the dock menu and `Cmd`+click B → the menu stays open. A and B have checkmarks. Tasks from both projects appear with project labels on their cards. The button shows "A, B" with the layers icon.
- Select No project and A → only tasks without a project and tasks from A appear.
- Select A and B, both with a "bug" tag. Select "bug" in the tag dock → tasks with "bug" from both projects appear.
- Select A and B. Create one task with the shortcut and another through Quick Task → both tasks go to No project.

### several-label — For several projects, the dock button shows two names in menu order, "+n", and the layers icon

Why: the names show what is selected. The layers icon already means "several projects".

- In the Day frame, select project A. Hover over the dock menu and `Cmd`+click B → the menu stays open. A and B have checkmarks. Tasks from both projects appear with project labels on their cards. The button shows "A, B" with the layers icon.
- `Cmd`+click C → the button shows "A, B +1".

### milestone-one-project — The Milestone frame uses the last project added to the selection; Day restores the full selection

Why: a milestone always belongs to one project.

- Select A and B, adding B last. Switch to the Milestone frame → only B is selected in the menu and B's milestones appear. Return to Day → A and B are selected again.
