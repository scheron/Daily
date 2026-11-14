This is history. The current rules are in `docs/spec/`.

# Plan: Use a No project menu row and the same selection mark in every menu

## Result

The Project property in task details has a clear button. The empty property says "Set project". Project menus mark the selection differently from nearby menus. After this plan:

- Clear the project in task details through a No project row, as in the card context menu. A task without a project shows No project in gray, like No priority.
- Every menu for selecting one value (status, priority, project, milestone, or AI model) marks the selected row the same way. It has a gray checkmark on the right, without a highlight color.

Task: DT-wSUVOdYn2ZwHydOD0y6nh. Its comment records the decisions from the design discussion.

## Approach

No project is the `main` project. The project menu already shows it as a "No project" row. Task details stop hiding that row and lose the clear button. Use the selection mark from the priority and status menus in the project, milestone, and AI model menus.

- Without a project, the property shows "No project" in gray with no clear button, like an empty Priority property.
- Selecting No project is a normal project change. It clears the milestone, tags, and links, as the clear button does today.
- Remove the project menu's "hide No project" prop and the property's clear button. Nothing uses them after the fix.
- The selection mark is a gray checkmark on the right. The selected row has no accent color or bold text. Its icon keeps its normal color. Apply this to All projects in the dock too, following the priority and status menus.
- Add a checkmark to Milestone. Keep clearing it when the selected milestone is clicked again. Task DT-T5ZXEjN5BDis7pL1lsi1j decides how to clear it.
- Mark the AI model with a checkmark instead of accent text. Only model selection uses the item label class in the shared menu. The card context menu has its own type.
- If a task's project has not loaded, show No project and leave every menu row unselected. This keeps the current behavior with a new label.

## Out of scope

- How to clear a milestone: click it again or use a No milestone row. See DT-T5ZXEjN5BDis7pL1lsi1j.
- The tag menu (multiple selection with checkboxes) and the "+" actions menu in the dock.
- Menu width, search, and other appearance changes beyond the selection mark.

## Done

1. Open the details of a task with a project → Project shows the project name in normal text, without a clear button. Click it → No project is the first menu row.
2. Open Project in the details of a task with a project → the menu has a No project row. Select it → the property shows "No project" in gray. Open the menu again → No project is selected.
3. For a task with a project and milestone, select No project in task details → the milestone is cleared. Select a project for a task without one → its name appears in normal text.
4. Select No project in the card context menu → the task has no project.
5. Open the project menu in the dock, the card context menu, and task details → the selected project has a gray checkmark on the right. Its name and icon keep their normal color. — you check
6. Open the milestone menu for a task with a milestone → its milestone has a gray checkmark on the right. — you check
7. Open Settings → AI → model selection → the current model has a gray checkmark on the right. Its name keeps its normal color. — you check
8. In the milestone menu, click the selected milestone → the milestone is cleared, as before.

## Spec

+ menus — Selection menus
  About: Lists for selecting one value: status, priority, project, milestone, or AI model.
- project-menu#card-no-project-row
  Why: the rule moves to project-menu#no-project-row, which also covers task details.
+ project-menu#no-project-row — Show No project as a row in task details and the card context menu; selecting it clears the project
  Why: select the empty value from the list, as with No priority. There is no clear button.
  Done: 2, 4
+ menus#same-as-priority — Menus for selecting one value follow the priority and status menus: the selected row has a gray checkmark on the right, without a highlight color
  Why: consistent menus are easy to read without learning each one. The priority and status menus set the pattern.
  Done: 5, 6, 7
