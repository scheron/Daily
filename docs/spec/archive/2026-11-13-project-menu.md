This is history. The current rules are in `docs/spec/`.

# Spec: Project selection menu

## Result

One project menu with search opens in three places. In the dock, it changes the active project. In task details and the card context menu, it sets the task's project. Search also lets the user create a project at once.

## Out of scope

- The Project property in task details: remove the clear button and "Set project". Use a No project row like No priority: gray text, selected by default. This was decided on 2026-11-13 and needs a separate task. That task will extend `project-menu#card-no-project-row` to cover task details.
- A project named "Main" is allowed. `main` keeps its ID and cannot be renamed. Only the name that agents see matches. This is a narrow case with no rule.

## Spec

+ project-menu — Project selection menu
  About: A project list with search. In the dock, it changes the active project. For a task, it sets the task's project.
+ project-menu#order — Show All projects first, where available, then No project, then projects in alphabetical order, ignoring case
  Why: All projects shows every task. No project shows tasks without a project, the default from the first launch. User-created projects follow these rows.
  Done: 1, 2
+ project-menu#create-from-search — Create a project from a name that is not in the search results and select it at once
  Why: when search finds no project, the next step is to create one. This avoids a trip to Settings, as tags already do.
  Done: 3
+ project-menu#exact-match-no-create — Hide Create when a project name matches after ignoring case and spaces at the start and end
  Why: the field is mainly for search. An exact match means the project was found. Create duplicate names in Settings; IDs keep projects distinct.
  Done: 4
+ project-menu#create-failure-keeps-input — If creation fails, show a toast and keep the menu open with the entered name
  Why: the name stays in the field, so creation can be retried.
  Done: 5
+ project-menu#all-projects-dock-day — Show All projects only in the dock and only in the Day frame
  Why: a milestone always belongs to one project, so a milestone across all projects has no meaning. A task belongs to exactly one project.
  Done: 6
+ project-menu#card-no-project-row — Show No project as a row in the card context menu; selecting it clears the project
  Why: the context menu has no clear button for the project.
  Done: 7
+ project-menu#dock-opens-on-hover — Open the dock menu on hover and the task details menu on click
  Why: the dock changes filters quickly, like the day or tag filter. In the editor, selecting a project is a deliberate task change.
  Done: 8
